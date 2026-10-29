import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Drawer,
  Group,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
} from '@mantine/core';
import { IconSparkles, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { openTransactionFormModal } from '@/features/transactions/components/TransactionFormModal';
import { accountKeys, listAccounts } from '@/features/accounts/api/accounts';
import { formatCop } from '@/shared/lib/money';
import { formatDate } from '@/shared/lib/dates';
import { getApiErrorCode } from '@/shared/api/client';
import { useAuthStore } from '@/shared/stores/authStore';
import { getAiCapabilities, interpretTransaction } from '../api';
import { useAiChatStore, type ChatEntry } from '../store';
import { aiErrorKeys } from '../errors';
import { TransactionProposal } from './TransactionProposal';
import { BatchReview } from './BatchReview';
import { prepareBatch } from '../actions';
import { WaitingMessage } from './WaitingMessage';
import { SourceText } from './SourceMessage';

export function AiTransactionChat({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const userId = useAuthStore((state) => state.user?.id);
  const { entries, input, storageAvailable, setInput, add, update, replace } = useAiChatStore();
  const capabilities = useQuery({
    queryKey: ['ai-capabilities', userId],
    queryFn: getAiCapabilities,
  });
  const messageLimit = capabilities.data?.maxMessageLength ?? 2000;
  const tooLong = input.length > messageLimit;
  const formatCount = (value: number) =>
    value.toLocaleString(i18n.language.startsWith('es') ? 'es-CO' : 'en-US');
  const accounts = useQuery({ queryKey: accountKeys.all, queryFn: listAccounts, enabled: opened });
  const busy = entries.some(
    (entry) =>
      entry.status === 'pending' || entry.status === 'interpreting' || entry.status === 'queued',
  );
  const interpreting = entries.some((entry) => entry.status === 'interpreting');
  const pending = entries.some((entry) => entry.status === 'pending' || entry.status === 'queued');
  const activeRequest = useRef<{ id: string; controller: AbortController } | null>(null);
  const [footerTarget, setFooterTarget] = useState<HTMLDivElement | null>(null);
  const activeBatchId = [...entries]
    .reverse()
    .find((entry) => entry.batch && entry.status !== 'confirmed' && entry.status !== 'cancelled')
    ?.batch?.id;
  const [preparingBatchId, setPreparingBatchId] = useState<string | null>(null);
  useEffect(
    () => () => {
      const active = activeRequest.current;
      if (!active) return;
      active.controller.abort();
      useAiChatStore.getState().update(active.id, { status: 'error', errorCode: 'AI_INTERRUPTED' });
    },
    [],
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const lastCard = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const programmaticScroll = useRef(false);
  const [unseen, setUnseen] = useState(false);
  const afterClose = useRef<(() => void) | null>(null);
  const lastStatus = entries[entries.length - 1]?.status;
  const previousStatus = useRef(lastStatus);
  const language = i18n.language.startsWith('es') ? 'es' : 'en';
  const scrollToLatest = useCallback(() => {
    const container = viewport.current;
    const card = lastCard.current;
    if (!container) return;
    programmaticScroll.current = true;
    const top = card
      ? card.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop
      : container.scrollHeight;
    // Scroll only the history viewport; never the drawer header or the page behind it.
    container.scrollTop = Math.max(0, top);
    follow.current = true;
    setUnseen(false);
    requestAnimationFrame(() => {
      programmaticScroll.current = false;
    });
  }, []);
  const onAction = () => {
    follow.current = true;
  };
  useEffect(() => {
    if (opened) {
      if (follow.current) scrollToLatest();
      else setUnseen(true);
      if (
        previousStatus.current === 'pending' &&
        (lastStatus === 'confirmed' || lastStatus === 'cancelled') &&
        follow.current
      ) {
        inputRef.current?.focus({ preventScroll: true });
      }
    }
    previousStatus.current = lastStatus;
  }, [opened, entries.length, lastStatus, scrollToLatest]);

  const interpret = async (message: string, existingId?: string) => {
    if (
      activeRequest.current ||
      busy ||
      !message.trim() ||
      message.length > messageLimit ||
      !capabilities.data?.enabled
    )
      return;
    follow.current = true;
    const id = existingId ?? crypto.randomUUID();
    const controller = new AbortController();
    activeRequest.current = { id, controller };
    if (existingId) update(id, { status: 'interpreting', errorCode: undefined });
    else add({ id, message: message.trim(), status: 'interpreting' });
    try {
      const result = await interpretTransaction(message.trim(), controller.signal, id);
      if (!controller.signal.aborted && useAuthStore.getState().user?.id === userId) {
        if ('items' in result) {
          replace(
            id,
            result.items.map((item) => ({
              id: item.id,
              message: item.sourceText,
              status: item.kind !== 'unsupported' && item.kind !== 'cancelled' ? 'queued' : 'error',
              errorCode:
                item.kind === 'unsupported'
                  ? 'AI_UNSUPPORTED'
                  : item.kind === 'cancelled'
                    ? 'AI_DRAFT_INACTIVE'
                    : undefined,
              batch: {
                id: result.id,
                sourceMessage: message.trim(),
                referenceDate: result.referenceDate,
                notes: result.notes,
                context: item.context,
              },
            })),
          );
          setPreparingBatchId(result.id);
          await prepareBatch(result.id, controller.signal);
        } else
          update(
            id,
            result.result
              ? { status: 'confirmed', draft: result, result: result.result }
              : { status: 'pending', draft: result },
          );
      }
    } catch (error) {
      if (!controller.signal.aborted)
        update(id, { status: 'error', errorCode: getApiErrorCode(error) ?? 'UNKNOWN' });
    } finally {
      if (activeRequest.current?.controller === controller) {
        activeRequest.current = null;
        setPreparingBatchId(null);
      }
    }
  };
  const stopPreparation = () => {
    activeRequest.current?.controller.abort();
    activeRequest.current = null;
    setPreparingBatchId(null);
  };
  const resumePreparation = async (batchId: string) => {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = { id: batchId, controller };
    setPreparingBatchId(batchId);
    try {
      await prepareBatch(batchId, controller.signal);
    } finally {
      if (activeRequest.current?.controller === controller) {
        activeRequest.current = null;
        setPreparingBatchId(null);
      }
    }
  };
  const editMessage = (entry: ChatEntry) => {
    if (busy) return;
    setInput(entry.message);
    inputRef.current?.focus();
  };
  const openModal = (action: () => void) => {
    afterClose.current = action;
    onClose();
  };
  const manual = () => {
    if (activeRequest.current) {
      const { id, controller } = activeRequest.current;
      controller.abort();
      activeRequest.current = null;
      update(id, { status: 'cancelled' });
    }
    openModal(() => openTransactionFormModal(t));
  };
  const focusContent = () => {
    if (!busy) inputRef.current?.focus({ preventScroll: true });
    else
      viewport.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"], [data-proposal-heading]')
        ?.focus({ preventScroll: true });
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon variant="light" radius="md" size={40} aria-hidden>
            <IconSparkles size={23} />
          </ThemeIcon>
          <Text component="span" size="lg" fw={700}>
            {t(entries[entries.length - 1]?.batch ? 'ai.batch.header' : 'ai.title')}
          </Text>
        </Group>
      }
      position="right"
      size={entries.some((entry) => entry.batch) ? 'min(100vw, 54rem)' : 'min(100vw, 42rem)'}
      keepMounted
      closeButtonProps={{ 'aria-label': t('common.close') }}
      onEnterTransitionEnd={focusContent}
      onExitTransitionEnd={() => {
        const action = afterClose.current;
        afterClose.current = null;
        action?.();
      }}
      styles={{
        content: {
          display: 'flex',
          flexDirection: 'column',
          height: '100dvh',
          maxHeight: '100dvh',
          overflow: 'hidden',
        },
        header: { flexShrink: 0 },
        body: {
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          padding: 0,
          overflow: 'hidden',
        },
      }}
    >
      <ScrollArea
        viewportRef={viewport}
        style={{ flex: 1, minHeight: 0 }}
        type="auto"
        onScrollPositionChange={() => {
          const container = viewport.current;
          if (container && !programmaticScroll.current) {
            follow.current =
              container.scrollHeight - container.clientHeight - container.scrollTop < 80;
            if (follow.current) setUnseen(false);
          }
        }}
      >
        <Stack p="md" gap="md" role="log" aria-label={t('ai.history')}>
          {entries.length === 0 && (
            <Stack gap="sm">
              <Text fw={600}>{t('ai.welcome')}</Text>
              <Text size="sm" c="dimmed">
                {t('ai.intro')}
              </Text>
              <Text size="sm">{t('ai.tryExample')}</Text>
              <Group gap="xs">
                {(['ai.exampleExpense', 'ai.exampleIncome'] as const).map((key) => (
                  <Button
                    key={key}
                    variant="light"
                    size="xs"
                    style={{ height: 'auto', minHeight: 36 }}
                    styles={{ label: { whiteSpace: 'normal', paddingBlock: 6 } }}
                    onClick={() => {
                      setInput(t(key));
                      inputRef.current?.focus();
                    }}
                  >
                    {t(key)}
                  </Button>
                ))}
              </Group>
              <Text size="xs" c="dimmed">
                {t('ai.historyHint')}
              </Text>
            </Stack>
          )}
          {entries.map((entry, index) =>
            entry.batch &&
            entries.findIndex((item) => item.batch?.id === entry.batch!.id) !== index ? null : (
              <Card
                withBorder
                key={entry.id}
                ref={
                  index === entries.length - 1 ||
                  (entry.batch && entries[entries.length - 1]?.batch?.id === entry.batch.id)
                    ? lastCard
                    : undefined
                }
              >
                {entry.batch ? (
                  <BatchReview
                    entries={entries.filter((item) => item.batch?.id === entry.batch!.id)}
                    footerTarget={entry.batch.id === activeBatchId ? footerTarget : null}
                    preparing={preparingBatchId === entry.batch.id}
                    onPrepare={(batchId) => void resumePreparation(batchId)}
                    onStop={stopPreparation}
                    onView={(item) => openModal(() => openTransactionFormModal(t, item, 'view'))}
                    onAction={onAction}
                    onClose={onClose}
                  />
                ) : (
                  <Stack gap="sm">
                    <Text component="h3" size="md" m={0} fw={600}>
                      {t('ai.you')}
                    </Text>
                    <SourceText>{entry.message}</SourceText>
                    {entry.status === 'interpreting' && <WaitingMessage />}
                    {entry.status === 'pending' && (
                      <TransactionProposal
                        entry={entry}
                        onAction={onAction}
                        onClose={onClose}
                        autoFocus={follow.current}
                      />
                    )}
                    {entry.status === 'confirmed' && (
                      <>
                        <Alert color="teal" title={t('ai.success')} role="status">
                          <Stack gap={4}>
                            <Group gap="xs">
                              <Badge variant="light">
                                {t(`transactions.${entry.result!.type}`)}
                              </Badge>
                              <Text fw={600}>{formatCop(entry.result!.amount)}</Text>
                            </Group>
                            <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                              {entry.result!.description}
                            </Text>
                            <Text size="sm">
                              {entry.receipt?.accountName ??
                                accounts.data?.find((item) => item.id === entry.result!.accountId)
                                  ?.name ??
                                t('ai.accountUnavailable')}{' '}
                              · {formatDate(entry.result!.date, language)}
                            </Text>
                            {entry.receipt?.categoryName && (
                              <Text size="sm">{entry.receipt.categoryName}</Text>
                            )}
                          </Stack>
                        </Alert>
                        <Anchor
                          component="button"
                          type="button"
                          underline="hover"
                          size="sm"
                          style={{ alignSelf: 'center' }}
                          onClick={() =>
                            openModal(() => openTransactionFormModal(t, entry.result, 'view'))
                          }
                        >
                          {t('common.view')}
                        </Anchor>
                      </>
                    )}
                    {entry.status === 'cancelled' && (
                      <Alert
                        color="red"
                        variant="light"
                        icon={<IconX size={16} aria-hidden />}
                        role="status"
                      >
                        {t('ai.cancelled')}
                      </Alert>
                    )}
                    {entry.status === 'error' && (
                      <>
                        <Alert color="red" role="alert">
                          {t(aiErrorKeys[entry.errorCode!] ?? 'ai.errors.generic')}
                        </Alert>
                        {!entry.draft && (
                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant="light"
                              disabled={
                                busy ||
                                !capabilities.data?.enabled ||
                                entry.message.length > messageLimit
                              }
                              onClick={() => void interpret(entry.message, entry.id)}
                            >
                              {t('ai.retryInterpret')}
                            </Button>
                            <Button
                              size="xs"
                              variant="subtle"
                              disabled={busy}
                              onClick={() => editMessage(entry)}
                            >
                              {t('ai.editMessage')}
                            </Button>
                          </Group>
                        )}
                      </>
                    )}
                  </Stack>
                )}
              </Card>
            ),
          )}
        </Stack>
      </ScrollArea>
      <Box
        p="md"
        style={{ flexShrink: 0, borderTop: '1px solid var(--mantine-color-default-border)' }}
      >
        <Stack gap="xs">
          <div ref={setFooterTarget} />
          {!storageAvailable && (
            <Alert color="yellow" role="status">
              {t('ai.storageUnavailable')}
            </Alert>
          )}
          {unseen && (
            <Button variant="subtle" size="xs" onClick={scrollToLatest}>
              {t('ai.latest')}
            </Button>
          )}
          {pending && activeBatchId ? null : pending ? (
            <Text size="sm" role="status">
              {t(
                entries.some((entry) => entry.confirmation?.state === 'uncertain')
                  ? 'ai.pendingUncertainHint'
                  : 'ai.pendingHint',
              )}
            </Text>
          ) : (
            <>
              {!capabilities.isPending && !capabilities.data?.enabled && (
                <Alert color="yellow">{t('ai.errors.disabled')}</Alert>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void interpret(input);
                }}
              >
                <Stack gap="xs">
                  <Textarea
                    ref={inputRef}
                    label={t('ai.message')}
                    placeholder={t('ai.example')}
                    value={input}
                    onChange={(event) => setInput(event.currentTarget.value)}
                    description={t('ai.characterCount', {
                      current: formatCount(input.length),
                      limit: formatCount(messageLimit),
                    })}
                    inputWrapperOrder={['label', 'input', 'description', 'error']}
                    error={
                      tooLong
                        ? t('ai.messageTooLong', { limit: formatCount(messageLimit) })
                        : undefined
                    }
                    styles={{
                      description: {
                        textAlign: 'right',
                        color: tooLong ? 'var(--mantine-color-red-text)' : undefined,
                      },
                    }}
                    autosize
                    minRows={2}
                    maxRows={4}
                    disabled={interpreting || !capabilities.data?.enabled}
                  />
                  <Group justify="space-between" wrap="wrap">
                    <Button variant="subtle" onClick={manual}>
                      {t('ai.manual')}
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        interpreting || tooLong || !input.trim() || !capabilities.data?.enabled
                      }
                    >
                      {t('ai.send')}
                    </Button>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {t('ai.scopeHint')}
                  </Text>
                </Stack>
              </form>
            </>
          )}
        </Stack>
      </Box>
    </Drawer>
  );
}
