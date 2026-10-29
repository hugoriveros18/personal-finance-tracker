import { Button, Group, Stack } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createTransaction, transactionKeys, updateTransaction } from '../api/transactions';
import { accountKeys } from '@/features/accounts/api/accounts';
import { getApiErrorMessage } from '@/shared/api/client';
import type { Transaction, TransactionType } from '@/shared/types/domain';
import { parseApiDate, toISODate } from '@/shared/lib/dates';

import {
  TransactionFields,
  transactionFormSchema,
  type TransactionFormValues,
} from './TransactionFields';

type FormMode = 'view' | 'edit' | 'create';

export function TransactionForm({
  initial,
  onClose,
  mode,
}: {
  initial?: Transaction;
  onClose: () => void;
  mode: FormMode;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isEdit = mode === 'edit';
  const readOnly = mode === 'view';

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: initial
      ? {
          description: initial.description,
          date: parseApiDate(initial.date),
          type: initial.type,
          amount: initial.amount,
          accountId: initial.accountId,
          categoryId: initial.categoryId,
        }
      : {
          description: '',
          date: new Date(),
          type: 'expense' as TransactionType,
          amount: null as unknown as number,
          accountId: '',
          categoryId: '',
        },
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await updateTransaction(initial!.id, {
          description: values.description,
          date: toISODate(values.date),
          type: values.type,
          amount: values.amount,
          accountId: values.accountId,
          categoryId: values.categoryId,
        });
        notifications.show({ color: 'teal', message: t('common.saved') });
      } else {
        await createTransaction({
          description: values.description,
          date: toISODate(values.date),
          type: values.type,
          amount: values.amount,
          accountId: values.accountId,
          categoryId: values.categoryId,
        });
        notifications.show({ color: 'teal', message: t('common.created') });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: transactionKeys.all }),
        qc.invalidateQueries({ queryKey: accountKeys.all }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      onClose();
    } catch (err) {
      notifications.show({ color: 'red', message: getApiErrorMessage(err) });
    }
  });

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TransactionFields form={form} readOnly={readOnly} />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            {readOnly ? t('common.close') : t('common.cancel')}
          </Button>
          {!readOnly && (
            <Button type="submit" loading={isSubmitting}>
              {t('common.save')}
            </Button>
          )}
        </Group>
      </Stack>
    </form>
  );
}

export function openTransactionFormModal(
  t: (k: string) => string,
  initial?: Transaction,
  mode: FormMode = initial ? 'edit' : 'create',
) {
  const id = `tx-${Math.random()}`;
  const title =
    mode === 'view'
      ? t('common.view')
      : initial
        ? t('common.edit')
        : t('transactions.newTransaction');
  modals.open({
    modalId: id,
    title,
    size: 'lg',
    children: <TransactionForm initial={initial} mode={mode} onClose={() => modals.close(id)} />,
  });
}
