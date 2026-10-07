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
import { createMovement, movementKeys, updateMovement } from '../api/movements';
import { accountKeys, listAccounts } from '@/features/accounts/api/accounts';
import { getApiErrorMessage } from '@/shared/api/client';
import type { Movement, MovementFlow } from '@/shared/types/domain';
import { parseApiDate, toISODate } from '@/shared/lib/dates';

const schema = z.object({
  description: z.string().min(1).max(200),
  date: z.date(),
  flow: z.enum(['INTER_AVAILABLE', 'INTRA_AVAILABLE_TO_SAVINGS', 'INTRA_SAVINGS_TO_AVAILABLE']),
  amount: z.coerce.number().int().positive(),
  sourceAccountId: z.string().uuid(),
  destinationAccountId: z.string().uuid(),
});
type FormValues = z.infer<typeof schema>;

type FormMode = 'view' | 'edit' | 'create';

export function MovementForm({
  initial,
  onClose,
  mode,
}: {
  initial?: Movement;
  onClose: () => void;
  mode: FormMode;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isEdit = mode === 'edit';
  const readOnly = mode === 'view';
  const accountsQ = useQuery({ queryKey: accountKeys.all, queryFn: listAccounts });

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
          flow: initial.flow,
          amount: initial.amount,
          sourceAccountId: initial.sourceAccountId,
          destinationAccountId: initial.destinationAccountId,
        }
      : {
          description: '',
          date: new Date(),
          flow: 'INTER_AVAILABLE' as MovementFlow,
          amount: null as unknown as number,
          sourceAccountId: '',
          destinationAccountId: '',
        },
  });

  const flow = watch('flow');
  const sourceAccountId = watch('sourceAccountId');

  // Force same account on intra
  const destinationAccountId = watch('destinationAccountId');
  useEffect(() => {
    if (
      !readOnly &&
      flow !== 'INTER_AVAILABLE' &&
      sourceAccountId &&
      destinationAccountId !== sourceAccountId
    ) {
      setValue('destinationAccountId', sourceAccountId);
    }
  }, [flow, sourceAccountId, destinationAccountId, readOnly, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const payload = {
        description: values.description,
        date: toISODate(values.date),
        flow: values.flow,
        amount: values.amount,
        sourceAccountId: values.sourceAccountId,
        destinationAccountId:
          values.flow === 'INTER_AVAILABLE' ? values.destinationAccountId : values.sourceAccountId,
      };
      if (isEdit) {
        await updateMovement(initial!.id, payload);
        notifications.show({ color: 'teal', message: t('common.saved') });
      } else {
        await createMovement(payload);
        notifications.show({ color: 'teal', message: t('common.created') });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: movementKeys.all }),
        qc.invalidateQueries({ queryKey: accountKeys.all }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      onClose();
    } catch (err) {
      notifications.show({ color: 'red', message: getApiErrorMessage(err) });
    }
  });

  const accountOptions = (accountsQ.data ?? []).map((a) => ({ value: a.id, label: a.name }));

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <Controller
          control={control}
          name="flow"
          render={({ field }) => (
            <SegmentedControl
              fullWidth
              value={field.value}
              onChange={(v) => field.onChange(v)}
              disabled={readOnly}
              data={[
                { value: 'INTER_AVAILABLE', label: t('movements.flow.INTER_AVAILABLE') },
                {
                  value: 'INTRA_AVAILABLE_TO_SAVINGS',
                  label: t('movements.flow.INTRA_AVAILABLE_TO_SAVINGS'),
                },
                {
                  value: 'INTRA_SAVINGS_TO_AVAILABLE',
                  label: t('movements.flow.INTRA_SAVINGS_TO_AVAILABLE'),
                },
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
          name="sourceAccountId"
          render={({ field }) => (
            <Select
              label={flow === 'INTER_AVAILABLE' ? t('movements.from') : t('common.account')}
              value={field.value || null}
              onChange={(v) => field.onChange(v ?? '')}
              data={accountOptions}
              searchable
              error={errors.sourceAccountId?.message}
              disabled={readOnly}
            />
          )}
        />
        {flow === 'INTER_AVAILABLE' && (
          <Controller
            control={control}
            name="destinationAccountId"
            render={({ field }) => (
              <Select
                label={t('movements.to')}
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
                data={accountOptions.filter((o) => o.value !== sourceAccountId)}
                searchable
                error={errors.destinationAccountId?.message}
                disabled={readOnly}
              />
            )}
          />
        )}
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

export function openMovementFormModal(
  t: (k: string) => string,
  initial?: Movement,
  mode: FormMode = initial ? 'edit' : 'create',
) {
  const id = `mov-${Math.random()}`;
  const title =
    mode === 'view' ? t('common.view') : initial ? t('common.edit') : t('movements.newMovement');
  modals.open({
    modalId: id,
    title,
    size: 'lg',
    children: <MovementForm initial={initial} mode={mode} onClose={() => modals.close(id)} />,
  });
}
