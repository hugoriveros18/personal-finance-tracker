import { useEffect } from 'react';
import { SegmentedControl, Select, Textarea } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { MoneyInput } from '@/shared/components/MoneyInput';
import { accountKeys, listAccounts } from '@/features/accounts/api/accounts';
import { categoryKeys, listCategories } from '@/features/categories/api/categories';

export const transactionFormSchema = z.object({
  description: z.string().trim().min(1).max(200),
  date: z.date(),
  type: z.enum(['income', 'expense', 'liability']),
  amount: z.coerce.number().int().positive().max(999_999_999_999),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid(),
});
export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export function TransactionFields({
  form,
  readOnly = false,
  assistantMode = false,
}: {
  form: UseFormReturn<TransactionFormValues>;
  readOnly?: boolean;
  assistantMode?: boolean;
}) {
  const { t } = useTranslation();
  const {
    control,
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const accountsQ = useQuery({ queryKey: accountKeys.all, queryFn: listAccounts });
  const categoriesQ = useQuery({ queryKey: categoryKeys.all, queryFn: () => listCategories() });

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

  return (
    <>
      <Controller
        control={control}
        name="type"
        render={({ field }) =>
          assistantMode ? (
            <Select
              ref={field.ref}
              label={t('common.type')}
              placeholder={t('ai.chooseType')}
              description={type === 'liability' ? t('ai.liabilityHint') : undefined}
              value={field.value || null}
              onChange={(value) => field.onChange(value)}
              data={[
                { value: 'income', label: t('transactions.income') },
                { value: 'expense', label: t('transactions.expense') },
                { value: 'liability', label: t('transactions.liability') },
              ]}
              error={assistantMode && errors.type ? t('ai.chooseType') : errors.type?.message}
              disabled={readOnly}
            />
          ) : (
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
          )
        }
      />
      <Controller
        control={control}
        name="date"
        render={({ field }) => (
          <DatePickerInput
            ref={field.ref}
            label={t('common.date')}
            value={field.value}
            onChange={field.onChange}
            error={errors.date?.message}
            disabled={readOnly}
          />
        )}
      />
      <Controller
        control={control}
        name="amount"
        render={({ field }) => (
          <MoneyInput
            ref={field.ref}
            label={t('common.amount')}
            placeholder="$0"
            value={(field.value as number | null) ?? null}
            onChange={(v) => field.onChange(v)}
            error={
              assistantMode && errors.amount && !field.value
                ? t('ai.enterAmount')
                : errors.amount?.message
            }
            disabled={readOnly}
          />
        )}
      />
      <Controller
        control={control}
        name="accountId"
        render={({ field }) => (
          <Select
            ref={field.ref}
            label={t('common.account')}
            placeholder={assistantMode ? t('ai.chooseAccount') : undefined}
            value={field.value || null}
            onChange={(v) => field.onChange(v ?? '')}
            data={(accountsQ.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
            searchable
            error={
              assistantMode && errors.accountId && !field.value
                ? t('ai.chooseAccount')
                : errors.accountId?.message
            }
            disabled={readOnly}
          />
        )}
      />
      <Controller
        control={control}
        name="categoryId"
        render={({ field }) => (
          <Select
            ref={field.ref}
            label={t('common.category')}
            placeholder={assistantMode ? t('ai.chooseCategory') : undefined}
            value={field.value || null}
            onChange={(v) => field.onChange(v ?? '')}
            data={filteredCategories.map((c) => ({ value: c.id, label: c.name }))}
            searchable
            error={
              assistantMode && errors.categoryId && !field.value
                ? t('ai.chooseCategory')
                : errors.categoryId?.message
            }
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
    </>
  );
}
