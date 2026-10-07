import { Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { modals } from '@mantine/modals';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MoneyInput } from '@/shared/components/MoneyInput';
import { MoneyDisplay } from '@/shared/components/MoneyDisplay';
import { createLiabilityPayment, liabilityPaymentKeys } from '../api/liabilityPayments';
import { accountKeys } from '@/features/accounts/api/accounts';
import { getApiErrorMessage } from '@/shared/api/client';
import { toISODate } from '@/shared/lib/dates';
import type { Account } from '@/shared/types/domain';

const buildSchema = (
  maxAvailableBalance: number,
  maxLiabilitiesBalance: number,
  t: (key: string) => string,
) =>
  z.object({
    description: z.string().min(1).max(200),
    date: z.date(),
    amount: z.coerce
      .number()
      .int()
      .positive()
      .max(maxAvailableBalance, t('validation.exceedsAvailableBalance'))
      .max(maxLiabilitiesBalance, t('validation.exceedsLiabilitiesBalance')),
  });

interface Props {
  account: Account;
  onClose: () => void;
}

export function LiabilityPaymentForm({ account, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const max = Math.min(account.availableBalance, account.liabilitiesBalance);
  const schema = buildSchema(account.availableBalance, account.liabilitiesBalance, t);
  type V = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { description: '', date: new Date(), amount: null as unknown as number },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createLiabilityPayment({
        accountId: account.id,
        description: values.description,
        date: toISODate(values.date),
        amount: values.amount,
      });
      notifications.show({ color: 'teal', message: t('common.created') });
      await Promise.all([
        qc.invalidateQueries({ queryKey: liabilityPaymentKeys.all }),
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
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {t('dashboard.availableBalance')}
          </Text>
          <MoneyDisplay value={account.availableBalance} fw={600} />
        </Group>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {t('dashboard.liabilitiesBalance')}
          </Text>
          <MoneyDisplay value={account.liabilitiesBalance} fw={600} />
        </Group>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {t('common.max')}
          </Text>
          <Group gap="xs">
            <MoneyDisplay value={max} fw={600} c="teal.7" />
            <Button
              size="compact-xs"
              variant="light"
              color="teal"
              disabled={max <= 0}
              onClick={() => setValue('amount', max, { shouldValidate: true, shouldDirty: true })}
            >
              {t('liabilityPayments.payAll')}
            </Button>
          </Group>
        </Group>
        <Controller
          control={control}
          name="date"
          render={({ field }) => (
            <DatePickerInput
              label={t('common.date')}
              value={field.value}
              onChange={field.onChange}
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
              max={max}
            />
          )}
        />
        <Textarea
          label={t('common.description')}
          rows={2}
          {...register('description')}
          error={errors.description?.message}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={isSubmitting} disabled={max <= 0}>
            {t('liabilityPayments.newPayment')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function openLiabilityPaymentModal(account: Account, t: (k: string) => string) {
  const id = `lp-${account.id}-${Math.random()}`;
  modals.open({
    modalId: id,
    title: `${t('accounts.payLiability')} — ${account.name}`,
    size: 'sm',
    children: <LiabilityPaymentForm account={account} onClose={() => modals.close(id)} />,
  });
}
