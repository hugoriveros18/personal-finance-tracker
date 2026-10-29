import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Progress,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconCheck, IconX } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { accountKeys, listAccounts } from '@/features/accounts/api/accounts';
import { categoryKeys, listCategories } from '@/features/categories/api/categories';
import { formatCop } from '@/shared/lib/money';
import { formatDate, toISODate } from '@/shared/lib/dates';
import { getApiErrorCode } from '@/shared/api/client';
import { useAuthStore } from '@/shared/stores/authStore';
import type { Transaction } from '@/shared/types/domain';
import { entryConfirmation, entryValues, registerEntry } from '../actions';
import { cancelBatchItem } from '../api';
import { useAiChatStore, type ChatEntry } from '../store';
import { aiErrorKeys } from '../errors';
import { TransactionProposal } from './TransactionProposal';
import { SourceDetails } from './SourceMessage';

export function BatchReview({
  entries,
  footerTarget,
  preparing,
  onPrepare,
  onStop,
  onView,
  onAction,
  onClose,
}: {
  entries: ChatEntry[];
  footerTarget: HTMLElement | null;
  preparing: boolean;
  onPrepare: (id: string) => void;
  onStop: () => void;
  onView: (item: Transaction) => void;
  onAction: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { update } = useAiChatStore();
  const accounts = useQuery({ queryKey: accountKeys.all, queryFn: listAccounts });
  const categories = useQuery({ queryKey: categoryKeys.all, queryFn: () => listCategories() });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<string>('date');
  const [onlyPending, setOnlyPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const stopped = useRef(false);
  const running = useRef(false);
  useEffect(
    () => () => {
      stopped.current = true;
    },
    [],
  );
  const batch = entries[0]!.batch!;
  const language = i18n.language.startsWith('es') ? 'es' : 'en';
  const selected = entries.filter((entry) => entry.selected && entryConfirmation(entry));
  const unresolved = entries.filter(
    (entry) => entry.status !== 'confirmed' && entry.status !== 'cancelled',
  );
  const ready = unresolved.filter((entry) => entryConfirmation(entry) && !entry.saveErrorCode);
  const queueable = unresolved.some(
    (entry) =>
      entry.status === 'queued' ||
      (entry.status === 'error' &&
        !entry.draft &&
        !['AI_UNSUPPORTED', 'AI_NEEDS_CLARIFICATION', 'AI_DRAFT_INACTIVE'].includes(
          entry.errorCode ?? '',
        )),
  );
  const lock =
    saving ||
    discarding ||
    entries.some((entry) => entry.confirmation?.state === 'saving' || entry.cancelling);
  const uncertain = entries.some((entry) => entry.confirmation?.state === 'uncertain');
  const visible =
    onlyPending && unresolved.length > 0
      ? unresolved.filter((entry) => !entryConfirmation(entry) || entry.saveErrorCode)
      : entries;
  const preparedCount = entries.filter(
    (entry) => entry.status !== 'queued' && entry.status !== 'interpreting',
  ).length;
  const activeIndex = entries.findIndex((entry) => entry.status === 'interpreting');
  const names = (entry: ChatEntry) => {
    const values = entry.result ?? entryValues(entry);
    return {
      account:
        entry.receipt?.accountName ??
        accounts.data?.find((item) => item.id === values.accountId)?.name ??
        t('ai.chooseAccount'),
      category:
        entry.receipt?.categoryName ??
        categories.data?.find((item) => item.id === values.categoryId)?.name ??
        t('ai.chooseCategory'),
    };
  };
  const groups = new Map<string, ChatEntry[]>();
  for (const entry of visible) {
    const values = entryValues(entry);
    const label =
      groupBy === 'date'
        ? entry.result?.date
          ? formatDate(entry.result.date, language)
          : values.date
            ? formatDate(toISODate(values.date), language)
            : t('ai.batch.datePending')
        : names(entry)[groupBy === 'account' ? 'account' : 'category'];
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }
  const totals = { income: 0, expense: 0, liability: 0 };
  for (const entry of selected) {
    const input = entryConfirmation(entry)!;
    totals[input.type] += input.amount;
  }
  const saveSelected = async () => {
    if (running.current || lock || uncertain) return;
    const owner = useAuthStore.getState().user?.id;
    const approved = selected.map((entry) => ({ id: entry.id, input: entryConfirmation(entry)! }));
    running.current = true;
    stopped.current = false;
    setSaving(true);
    onAction();
    try {
      // Source order is stable even when the user changes visual grouping.
      for (const item of approved) {
        if (stopped.current || useAuthStore.getState().user?.id !== owner) break;
        const result = await registerEntry(item.id, item.input, qc);
        if (result === 'uncertain') {
          setExpanded(item.id);
          break;
        }
      }
    } finally {
      running.current = false;
      setSaving(false);
    }
  };
  const discard = async (items: ChatEntry[]) => {
    if (lock || running.current) return;
    const owner = useAuthStore.getState().user?.id;
    onStop();
    setDiscarding(true);
    try {
      for (const item of items) {
        if (useAuthStore.getState().user?.id !== owner || item.confirmation) continue;
        try {
          await cancelBatchItem(batch.id, item.id);
          if (useAuthStore.getState().user?.id !== owner) break;
          update(item.id, {
            status: 'cancelled',
            selected: false,
            errorCode: undefined,
            saveErrorCode: undefined,
          });
        } catch (error) {
          update(item.id, { saveErrorCode: getApiErrorCode(error) ?? 'UNKNOWN' });
        }
      }
    } finally {
      setDiscarding(false);
    }
  };
  const actions = (
    <Card withBorder radius="md" style={{ flexShrink: 0 }}>
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          {t('ai.batch.selected', { count: selected.length })}
        </Text>
        <Group gap="md">
          {(['income', 'expense', 'liability'] as const).map((type) => (
            <Text key={type} size="xs">
              {t(`transactions.${type}`)}: {formatCop(totals[type])}
            </Text>
          ))}
        </Group>
        <Text size="xs" c="dimmed">
          {t('ai.batch.partialHint')}
        </Text>
        <Group justify="space-between" gap="xs">
          <Button
            variant="subtle"
            color="red"
            w={{ base: '100%', sm: 'auto' }}
            h="auto"
            mih={36}
            styles={{ label: { whiteSpace: 'normal', paddingBlock: 4 } }}
            disabled={lock || preparing || unresolved.every((entry) => entry.confirmation)}
            onClick={() => void discard(unresolved)}
          >
            {t('ai.batch.discardPending')}
          </Button>
          {saving ? (
            <Button
              variant="default"
              w={{ base: '100%', sm: 'auto' }}
              onClick={() => {
                stopped.current = true;
              }}
            >
              {t('ai.batch.stopSaving')}
            </Button>
          ) : (
            <Button
              w={{ base: '100%', sm: 'auto' }}
              disabled={lock || preparing || uncertain || !selected.length}
              onClick={() => void saveSelected()}
            >
              {t('ai.batch.registerSelected', { count: selected.length })}
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
  return (
    <Stack gap="md" data-batch-review>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Text component="h3" m={0} fw={700}>
            {t('ai.batch.title')}
          </Text>
          <Text size="sm" role="status">
            {t('ai.batch.summary', {
              ready: ready.length,
              pending: unresolved.length - ready.length,
              saved: entries.filter((entry) => entry.status === 'confirmed').length,
            })}
          </Text>
        </Stack>
        <Select
          label={t('ai.batch.groupBy')}
          value={groupBy}
          onChange={(value) => setGroupBy(value ?? 'date')}
          data={[
            { value: 'date', label: t('common.date') },
            { value: 'account', label: t('common.account') },
            { value: 'category', label: t('common.category') },
          ]}
          w={170}
        />
      </Group>
      <SourceDetails label={t('ai.you')} text={batch.sourceMessage} />
      {batch.notes.length > 0 && (
        <SourceDetails label={t('ai.batch.notes')} text={batch.notes.join('\n')} />
      )}
      <Group gap="xs">
        {unresolved.length > 0 && (
          <Checkbox
            label={t('ai.batch.onlyPending')}
            checked={onlyPending}
            onChange={(event) => setOnlyPending(event.currentTarget.checked)}
          />
        )}
        {preparing && (
          <Group gap="xs" role="status">
            <Loader size="xs" />
            <Text size="sm">
              {t('ai.batch.preparing', {
                done: preparedCount,
                total: entries.length,
              })}
            </Text>
            <Button size="compact-xs" variant="subtle" onClick={onStop}>
              {t('ai.batch.pause')}
            </Button>
          </Group>
        )}
        {!preparing && queueable && (
          <Button size="xs" variant="light" disabled={lock} onClick={() => onPrepare(batch.id)}>
            {t('ai.batch.resume')}
          </Button>
        )}
      </Group>
      {unresolved.length > 0 && (
        <Group gap="xs">
          <Button
            variant="subtle"
            size="xs"
            disabled={lock}
            onClick={() => ready.forEach((entry) => update(entry.id, { selected: true }))}
          >
            {t('ai.batch.selectReady')}
          </Button>
          <Button
            variant="subtle"
            size="xs"
            disabled={lock}
            onClick={() => entries.forEach((entry) => update(entry.id, { selected: false }))}
          >
            {t('ai.batch.clearSelection')}
          </Button>
        </Group>
      )}
      {preparing && (
        <Stack gap={4} role="status">
          <Progress
            value={entries.length ? (preparedCount / entries.length) * 100 : 0}
            aria-label={t('ai.batch.progressLabel')}
          />
          {activeIndex >= 0 && (
            <Text size="xs" c="dimmed">
              {t('ai.batch.currentRecord', { current: activeIndex + 1, total: entries.length })}
            </Text>
          )}
        </Stack>
      )}
      {unresolved.some(
        (entry) =>
          entry.status === 'pending' && !entryValues(entry).accountId && !entry.confirmation,
      ) && (
        <Select
          label={t('ai.batch.accountForMissing')}
          placeholder={t('ai.chooseAccount')}
          value={null}
          searchable
          disabled={lock}
          data={(accounts.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
          onChange={(accountId) => {
            if (!accountId) return;
            unresolved
              .filter(
                (entry) =>
                  entry.status === 'pending' &&
                  !entryValues(entry).accountId &&
                  !entry.confirmation,
              )
              .forEach((entry) => update(entry.id, { values: { ...entry.values, accountId } }));
          }}
        />
      )}
      {[...groups].map(([label, rows]) => (
        <Stack key={label} gap="xs">
          <Text component="h4" m={0} size="sm" fw={700}>
            {label} · {rows.length}
          </Text>
          {rows.map((entry) => {
            const values = entry.result ?? entryValues(entry);
            const complete = Boolean(entryConfirmation(entry)) && !entry.saveErrorCode;
            const isOpen = expanded === entry.id;
            return (
              <Card key={entry.id} withBorder radius="md" padding="sm" data-batch-row={entry.id}>
                <Group wrap="nowrap" align="flex-start" gap="sm">
                  {entry.status === 'confirmed' || entry.status === 'cancelled' ? (
                    <ThemeIcon
                      mt={4}
                      size={20}
                      radius="sm"
                      variant="light"
                      color={entry.status === 'confirmed' ? 'teal' : 'red'}
                      aria-hidden
                    >
                      {entry.status === 'confirmed' ? <IconCheck size={14} /> : <IconX size={14} />}
                    </ThemeIcon>
                  ) : (
                    <Checkbox
                      aria-label={t('ai.batch.selectRecord', {
                        description: values.description || entry.message,
                      })}
                      checked={Boolean(entry.selected) && complete}
                      disabled={lock || !complete}
                      onChange={(event) =>
                        update(entry.id, { selected: event.currentTarget.checked })
                      }
                      mt={4}
                    />
                  )}
                  <Stack gap={5} style={{ flex: 1, minWidth: 0 }}>
                    <Group justify="space-between" gap="xs">
                      <Text
                        data-record-title
                        fw={600}
                        style={{ overflowWrap: 'anywhere', flex: 1 }}
                      >
                        {values.description || entry.message}
                      </Text>
                      <Text fw={700}>
                        {typeof values.amount === 'number'
                          ? formatCop(values.amount)
                          : t('ai.batch.amountPending')}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {values.type ? t(`transactions.${values.type}`) : t('ai.chooseType')} ·{' '}
                      {names(entry).account} · {names(entry).category}
                    </Text>
                    {entry.status === 'pending' &&
                      !entry.confirmation &&
                      (!values.accountId || !values.categoryId) && (
                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                          {!values.accountId && (
                            <Select
                              size="xs"
                              searchable
                              label={t('common.account')}
                              placeholder={t('ai.chooseAccount')}
                              value={null}
                              disabled={lock}
                              data={(accounts.data ?? []).map((item) => ({
                                value: item.id,
                                label: item.name,
                              }))}
                              onChange={(accountId) =>
                                update(entry.id, {
                                  values: { ...entry.values, accountId: accountId ?? '' },
                                  saveErrorCode: undefined,
                                })
                              }
                            />
                          )}
                          {!values.categoryId && (
                            <Select
                              size="xs"
                              searchable
                              label={t('common.category')}
                              placeholder={t('ai.chooseCategory')}
                              value={null}
                              disabled={lock}
                              data={(categories.data ?? [])
                                .filter(
                                  (item) =>
                                    item.type === (values.type === 'income' ? 'income' : 'expense'),
                                )
                                .map((item) => ({ value: item.id, label: item.name }))}
                              onChange={(categoryId) =>
                                update(entry.id, {
                                  values: { ...entry.values, categoryId: categoryId ?? '' },
                                  saveErrorCode: undefined,
                                })
                              }
                            />
                          )}
                        </SimpleGrid>
                      )}
                    {entry.saveErrorCode && (
                      <Text size="xs" c="red">
                        {t(aiErrorKeys[entry.saveErrorCode] ?? 'ai.errors.generic')}
                      </Text>
                    )}
                    <Group gap="xs">
                      <Badge
                        variant="light"
                        radius="sm"
                        color={
                          entry.status === 'confirmed'
                            ? 'teal'
                            : entry.status === 'cancelled'
                              ? 'red'
                              : complete
                                ? 'blue'
                                : 'yellow'
                        }
                      >
                        {t(
                          entry.status === 'confirmed'
                            ? 'ai.batch.saved'
                            : entry.status === 'cancelled'
                              ? 'ai.batch.discarded'
                              : entry.status === 'interpreting'
                                ? 'ai.batch.processing'
                                : entry.status === 'queued'
                                  ? 'ai.batch.waiting'
                                  : complete
                                    ? 'ai.batch.ready'
                                    : 'ai.batch.incomplete',
                        )}
                      </Badge>
                      {entry.confirmation?.state === 'uncertain' && (
                        <Text size="xs" c="orange">
                          {t('ai.batch.uncertain')}
                        </Text>
                      )}
                    </Group>
                  </Stack>
                  <ActionIcon
                    variant="subtle"
                    aria-label={t('ai.batch.editRecord', {
                      description: values.description || entry.message,
                    })}
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                    disabled={lock}
                  >
                    {isOpen ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
                  </ActionIcon>
                </Group>
                <Collapse in={isOpen}>
                  {isOpen && (
                    <Stack mt="md" gap="sm" pl="calc(1.25rem + var(--mantine-spacing-sm))">
                      <SourceDetails
                        label={t('ai.batch.source')}
                        text={entry.message}
                        alignLabel
                        context={[
                          entry.batch!.context.dateText,
                          entry.batch!.context.accountText,
                          entry.batch!.context.categoryText,
                          entry.batch!.context.paymentText,
                        ]}
                      />
                      {entry.status === 'pending' && (
                        <TransactionProposal
                          key={entry.id}
                          entry={entry}
                          onAction={onAction}
                          onClose={onClose}
                          autoFocus={false}
                          disabled={saving || discarding}
                        />
                      )}
                      {entry.status === 'error' && (
                        <Alert color="yellow">
                          {t(aiErrorKeys[entry.errorCode ?? ''] ?? 'ai.errors.generic')}
                        </Alert>
                      )}
                      {entry.saveErrorCode && entry.status !== 'pending' && (
                        <Alert color="red">
                          {t(aiErrorKeys[entry.saveErrorCode] ?? 'ai.errors.generic')}
                        </Alert>
                      )}
                      {entry.status === 'confirmed' && (
                        <Anchor
                          component="button"
                          style={{ alignSelf: 'center' }}
                          underline="hover"
                          onClick={() => onView(entry.result!)}
                        >
                          {t('common.view')}
                        </Anchor>
                      )}
                      {entry.status === 'cancelled' && (
                        <Text size="sm" c="red">
                          {t('ai.cancelled')}
                        </Text>
                      )}
                      {entry.status !== 'pending' &&
                        entry.status !== 'confirmed' &&
                        entry.status !== 'cancelled' && (
                          <Button
                            variant="subtle"
                            color="red"
                            size="xs"
                            disabled={lock}
                            onClick={() => void discard([entry])}
                          >
                            {t('ai.batch.discard')}
                          </Button>
                        )}
                    </Stack>
                  )}
                </Collapse>
              </Card>
            );
          })}
        </Stack>
      ))}
      {uncertain && <Alert color="yellow">{t('ai.batch.uncertainHint')}</Alert>}
      {unresolved.length > 0 && (footerTarget ? createPortal(actions, footerTarget) : actions)}
    </Stack>
  );
}
