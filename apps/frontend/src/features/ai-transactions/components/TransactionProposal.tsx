import { useEffect, useRef } from 'react';
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  TransactionFields,
  transactionFormSchema,
  type TransactionFormValues,
} from '@/features/transactions/components/TransactionFields';
import { parseApiDate, toISODate } from '@/shared/lib/dates';
import { getApiErrorCode } from '@/shared/api/client';
import { cancelDraft, type Confirmation } from '../api';
import { useAiChatStore, type ChatEntry } from '../store';
import { aiErrorKeys } from '../errors';
import { registerEntry } from '../actions';

const schema = transactionFormSchema;

export function TransactionProposal({
  entry,
  onAction,
  onClose,
  autoFocus,
  disabled = false,
}: {
  entry: ChatEntry;
  onAction: () => void;
  onClose: () => void;
  autoFocus: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const proposal = entry.draft!.proposal;
  const update = useAiChatStore((state) => state.update);
  const heading = useRef<HTMLHeadingElement>(null);
  const focused = useRef(false);
  const locked = Boolean(entry.confirmation) || entry.cancelling || disabled;
  const saving = entry.confirmation?.state === 'saving';
  const uncertain = entry.confirmation?.state === 'uncertain';
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      type: proposal.type ?? undefined,
      amount: proposal.amount ?? undefined,
      description: proposal.description,
      date: proposal.date ? parseApiDate(proposal.date) : undefined,
      accountId: proposal.accountId ?? '',
      categoryId: proposal.categoryId ?? '',
      ...entry.values,
      ...(entry.confirmation
        ? {
            ...entry.confirmation.input,
            date: parseApiDate(entry.confirmation.input.date),
          }
        : {}),
    },
  });
  const {
    watch,
    trigger,
    setFocus,
    formState: { isValid },
  } = form;
  useEffect(() => {
    void trigger();
  }, [trigger]);
  useEffect(() => {
    const subscription = watch((values) => update(entry.id, { values, saveErrorCode: undefined }));
    return () => subscription.unsubscribe();
  }, [watch, update, entry.id]);
  useEffect(() => {
    if (focused.current) return;
    focused.current = true;
    if (!autoFocus || locked) return;
    const values = form.getValues();
    const first = (
      ['type', 'amount', 'accountId', 'categoryId', 'date', 'description'] as const
    ).find((name) => !values[name]);
    if (first) setFocus(first);
    else heading.current?.focus({ preventScroll: true });
  }, [autoFocus, locked, form, setFocus]);

  const save = async (input: Confirmation) => {
    if (disabled) return;
    onAction();
    await registerEntry(entry.id, input, qc);
  };
  useEffect(() => {
    for (const key of ['accountId', 'categoryId'] as const) {
      const value = entry.values?.[key];
      if (value !== undefined && value !== form.getValues(key))
        form.setValue(key, value, { shouldValidate: true });
    }
  }, [entry.values, form]);
  const submit = form.handleSubmit((values) =>
    save({
      ...values,
      type: values.type,
      date: toISODate(values.date),
    }),
  );
  const cancel = async () => {
    const current = useAiChatStore.getState().entries.find((item) => item.id === entry.id);
    if (!current || current.confirmation || current.cancelling) return;
    onAction();
    update(entry.id, { cancelling: true, saveErrorCode: undefined });
    try {
      await cancelDraft(entry.draft!.id);
      update(entry.id, { status: 'cancelled' });
    } catch (error) {
      const code = getApiErrorCode(error) ?? 'UNKNOWN';
      if (code === 'AI_DRAFT_CONSUMED') update(entry.id, { status: 'error', errorCode: code });
      else update(entry.id, { saveErrorCode: code });
    } finally {
      update(entry.id, { cancelling: false });
    }
  };

  return (
    <form onSubmit={submit} aria-label={t('ai.proposal')}>
      <Stack gap="sm">
        <Text
          component="h3"
          m={0}
          size="md"
          ref={heading}
          data-proposal-heading
          tabIndex={-1}
          fw={600}
        >
          {t('ai.proposal')}
        </Text>
        <Text size="sm" c="dimmed">
          {t('ai.review')}
        </Text>
        {!isValid && !locked && <Text size="sm">{t('ai.selectMissing')}</Text>}
        <TransactionFields form={form} assistantMode readOnly={locked} />
        {entry.saveErrorCode && (
          <Alert color="red" role="alert">
            {t(aiErrorKeys[entry.saveErrorCode] ?? 'ai.errors.generic')}
          </Alert>
        )}
        {uncertain && (
          <Alert color="yellow" role="alert">
            {t('ai.saveUncertain')}
          </Alert>
        )}
        {saving && (
          <Text role="status" size="sm">
            {t('ai.saving')}
          </Text>
        )}
        <Group justify="flex-end" wrap="wrap">
          {uncertain ? (
            <>
              <Button variant="default" onClick={onClose}>
                {t('common.close')}
              </Button>
              <Button disabled={disabled} onClick={() => void save(entry.confirmation!.input)}>
                {t('ai.retrySave')}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="default"
                onClick={() => void cancel()}
                loading={entry.cancelling}
                disabled={saving || disabled}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                loading={saving}
                disabled={!isValid || entry.cancelling || disabled}
              >
                {t('ai.confirm')}
              </Button>
            </>
          )}
        </Group>
      </Stack>
    </form>
  );
}
