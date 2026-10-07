import { useEffect } from 'react';
import { Button, Group, SegmentedControl, Select, Stack, Textarea } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { modals } from '@mantine/modals';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MoneyInput } from '@/shared/components/MoneyInput';
import { createTransaction, transactionKeys, updateTransaction } from '../api/transactions';
import { accountKeys, listAccounts } from '@/features/accounts/api/accounts';
import { categoryKeys, listCategories } from '@/features/categories/api/categories';
import { getApiErrorMessage } from '@/shared/api/client';
import type { Transaction, TransactionType } from '@/shared/types/domain';
import { parseApiDate, toISODate } from '@/shared/lib/dates';

const schema = z.object({
  description: z.string().min(1).max(200),
  date: z.date(),
  type: z.enum(['income', 'expense', 'liability']),
  amount: z.coerce.number().int().positive(),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid(),
});

type FormValues = z.infer<typeof schema>;

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

  const accountsQ = useQuery({ queryKey: accountKeys.all, queryFn: listAccounts });
  const categoriesQ = useQuery({ queryKey: categoryKeys.all, queryFn: () => listCategories() });

  const {
    handleSubmit,
    control,
    register,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
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

  const type = watch('type');
  const requiredCategoryType = type === 'income' ? 'income' : 'expense';
  const filteredCategories = (categoriesQ.data ?? []).filter(
    (c) => c.type === requiredCategoryType,
  );

  // If category mismatches new type, clear it
  const currentCategoryId = watch('categoryId');
  useEffect(() => {
    if (!categoriesQ.data || readOnly || !currentCategoryId) return;
    const category = categoriesQ.data.find((item) => item.id === currentCategoryId);
    if (!category || category.type !== requiredCategoryType) setValue('categoryId', '');
  }, [categoriesQ.data, currentCategoryId, requiredCategoryType, readOnly, setValue]);

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
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <SegmentedControl
              fullWidth
              value={field.value}
              onChange={(v) => field.onChange(v)}
              disabled={readOnly}
              data={[
                { value: 'income', label: t('transactions.income') },
                { value: 'expense', label: t('transactions.expense') },
                { value: 'liability', label: t('transactions.liability') },
              ]}
            />
          )}
        />
        <Controller
          control={control}
          name="date"
          render={({ field }) => (
            <DatePickerInput
              label={t('common.date')}
              value={field.value}
              onChange={field.onChange}
              disabled={readOnly}
            />
          )}
        />
        <Controller
          control={control}
          name="amount"
          render={({ field }) => (
            <MoneyInput
              label={t('common.amount')}
              placeholder="$0"
              value={(field.value as number | null) ?? null}
              onChange={(v) => field.onChange(v)}
              error={errors.amount?.message}
              disabled={readOnly}
            />
          )}
        />
        <Controller
          control={control}
          name="accountId"
          render={({ field }) => (
            <Select
              label={t('common.account')}
              value={field.value || null}
              onChange={(v) => field.onChange(v ?? '')}
              data={(accountsQ.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
              searchable
              error={errors.accountId?.message}
              disabled={readOnly}
            />
          )}
        />
        <Controller
          control={control}
          name="categoryId"
          render={({ field }) => (
            <Select
              label={t('common.category')}
              value={field.value || null}
              onChange={(v) => field.onChange(v ?? '')}
              data={filteredCategories.map((c) => ({ value: c.id, label: c.name }))}
              searchable
              error={errors.categoryId?.message}
              disabled={readOnly}
            />
          )}
        />
        <Textarea
          label={t('common.description')}
          rows={2}
          {...register('description')}
          error={errors.description?.message}
          disabled={readOnly}
        />
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
