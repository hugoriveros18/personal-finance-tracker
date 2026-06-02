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
import type { Movement, MovementFlujo } from '@/shared/types/domain';
import { parseApiDate, toISODate } from '@/shared/lib/dates';

const schema = z.object({
  descripcion: z.string().min(1).max(200),
  fecha: z.date(),
  flujo: z.enum(['INTER_DISPONIBLE', 'INTRA_DISPONIBLE_TO_AHORRO', 'INTRA_AHORRO_TO_DISPONIBLE']),
  valor: z.coerce.number().int().positive(),
  cuentaEmisoraId: z.string().uuid(),
  cuentaReceptoraId: z.string().uuid(),
});
type FormValues = z.infer<typeof schema>;

type FormMode = 'view' | 'edit' | 'create';

function FormBody({
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
          descripcion: initial.descripcion,
          fecha: parseApiDate(initial.fecha),
          flujo: initial.flujo,
          valor: initial.valor,
          cuentaEmisoraId: initial.cuentaEmisoraId,
          cuentaReceptoraId: initial.cuentaReceptoraId,
        }
      : {
          descripcion: '',
          fecha: new Date(),
          flujo: 'INTER_DISPONIBLE' as MovementFlujo,
          valor: null as unknown as number,
          cuentaEmisoraId: '',
          cuentaReceptoraId: '',
        },
  });

  const flujo = watch('flujo');
  const emisoraId = watch('cuentaEmisoraId');

  // Force same account on intra
  if (flujo !== 'INTER_DISPONIBLE' && emisoraId && watch('cuentaReceptoraId') !== emisoraId) {
    setValue('cuentaReceptoraId', emisoraId);
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      const payload = {
        descripcion: values.descripcion,
        fecha: toISODate(values.fecha),
        flujo: values.flujo,
        valor: values.valor,
        cuentaEmisoraId: values.cuentaEmisoraId,
        cuentaReceptoraId:
          values.flujo === 'INTER_DISPONIBLE' ? values.cuentaReceptoraId : values.cuentaEmisoraId,
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

  const accountOptions = (accountsQ.data ?? []).map((a) => ({ value: a.id, label: a.nombre }));

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <Controller
          control={control}
          name="flujo"
          render={({ field }) => (
            <SegmentedControl
              fullWidth
              value={field.value}
              onChange={(v) => field.onChange(v)}
              disabled={readOnly}
              data={[
                { value: 'INTER_DISPONIBLE', label: t('movements.flujo.INTER_DISPONIBLE') },
                {
                  value: 'INTRA_DISPONIBLE_TO_AHORRO',
                  label: t('movements.flujo.INTRA_DISPONIBLE_TO_AHORRO'),
                },
                {
                  value: 'INTRA_AHORRO_TO_DISPONIBLE',
                  label: t('movements.flujo.INTRA_AHORRO_TO_DISPONIBLE'),
                },
              ]}
            />
          )}
        />
        <Controller
          control={control}
          name="fecha"
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
          name="valor"
          render={({ field }) => (
            <MoneyInput
              label={t('common.amount')}
              placeholder="$0"
              value={(field.value as number | null) ?? null}
              onChange={(v) => field.onChange(v)}
              error={errors.valor?.message}
              disabled={readOnly}
            />
          )}
        />
        <Controller
          control={control}
          name="cuentaEmisoraId"
          render={({ field }) => (
            <Select
              label={flujo === 'INTER_DISPONIBLE' ? t('movements.from') : t('common.account')}
              value={field.value || null}
              onChange={(v) => field.onChange(v ?? '')}
              data={accountOptions}
              searchable
              error={errors.cuentaEmisoraId?.message}
              disabled={readOnly}
            />
          )}
        />
        {flujo === 'INTER_DISPONIBLE' && (
          <Controller
            control={control}
            name="cuentaReceptoraId"
            render={({ field }) => (
              <Select
                label={t('movements.to')}
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
                data={accountOptions.filter((o) => o.value !== emisoraId)}
                searchable
                error={errors.cuentaReceptoraId?.message}
                disabled={readOnly}
              />
            )}
          />
        )}
        <Textarea
          label={t('common.description')}
          rows={2}
          {...register('descripcion')}
          error={errors.descripcion?.message}
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
    children: <FormBody initial={initial} mode={mode} onClose={() => modals.close(id)} />,
  });
}
