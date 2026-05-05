import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MoneyInput } from '@/shared/components/MoneyInput';
import { accountKeys, createAccount, updateAccount } from '../api/accounts';
import type { Account } from '@/shared/types/domain';
import { getApiErrorMessage } from '@/shared/api/client';

// Empty money fields are treated as 0 (saldo inicial implícito).
const moneyOrZero = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? 0 : v),
  z.number().int().nonnegative(),
);

const createSchema = z.object({
  nombre: z.string().min(1).max(80),
  disponible: moneyOrZero,
  ahorro: moneyOrZero,
  pasivos: moneyOrZero,
});

const editSchema = z.object({
  nombre: z.string().min(1).max(80),
});

interface FormProps {
  initial?: Account;
  onClose: () => void;
}

function FormBody({ initial, onClose }: FormProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isEdit = !!initial;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: isEdit
      ? { nombre: initial!.nombre }
      : ({
          nombre: '',
          disponible: null,
          ahorro: null,
          pasivos: null,
        } as unknown as z.infer<typeof createSchema>),
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await updateAccount(initial!.id, { nombre: (values as { nombre: string }).nombre });
        notifications.show({ color: 'teal', message: t('common.saved') });
      } else {
        await createAccount(values as z.infer<typeof createSchema>);
        notifications.show({ color: 'teal', message: t('common.created') });
      }
      await qc.invalidateQueries({ queryKey: accountKeys.all });
      onClose();
    } catch (err) {
      notifications.show({ color: 'red', message: getApiErrorMessage(err) });
    }
  });

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TextInput
          label={t('common.name')}
          {...register('nombre')}
          error={(errors as Record<string, { message?: string }>).nombre?.message}
          autoFocus
        />
        {!isEdit && (
          <>
            <Text size="sm" c="dimmed">
              {t('accounts.initialBalances')} — {t('accounts.initialBalancesHint')}
            </Text>
            <Controller
              control={control}
              name={'disponible' as never}
              render={({ field }) => (
                <MoneyInput
                  label={t('dashboard.disponible')}
                  placeholder="$0"
                  value={(field.value as number | null) ?? null}
                  onChange={(v) => field.onChange(v)}
                />
              )}
            />
            <Controller
              control={control}
              name={'ahorro' as never}
              render={({ field }) => (
                <MoneyInput
                  label={t('dashboard.ahorro')}
                  placeholder="$0"
                  value={(field.value as number | null) ?? null}
                  onChange={(v) => field.onChange(v)}
                />
              )}
            />
            <Controller
              control={control}
              name={'pasivos' as never}
              render={({ field }) => (
                <MoneyInput
                  label={t('dashboard.pasivos')}
                  placeholder="$0"
                  value={(field.value as number | null) ?? null}
                  onChange={(v) => field.onChange(v)}
                />
              )}
            />
          </>
        )}
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {t('common.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function openAccountFormModal(initial?: Account, t?: (k: string) => string) {
  const id = `account-form-${Math.random()}`;
  const title = initial
    ? t?.('common.edit') ?? 'Edit account'
    : t?.('accounts.newAccount') ?? 'New account';
  modals.open({
    modalId: id,
    title,
    size: 'md',
    children: <FormBody initial={initial} onClose={() => modals.close(id)} />,
  });
}
