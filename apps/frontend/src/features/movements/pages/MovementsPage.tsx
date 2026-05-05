import { Button, Card, Group, MultiSelect, Stack } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useUrlFilters } from '@/shared/hooks/useUrlFilters';
import { Page } from '@/shared/components/Page';
import { MovementsTable } from '../components/MovementsTable';
import { openMovementFormModal } from '../components/MovementFormModal';
import { accountKeys, listAccounts } from '@/features/accounts/api/accounts';
import { MoneyInput } from '@/shared/components/MoneyInput';
import type { MovementFlujo } from '@/shared/types/domain';

const schema = z.object({
  month: z.string().optional(),
  emisoraIds: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : [])),
  receptoraIds: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : [])),
  flujos: z
    .string()
    .optional()
    .transform((s) => (s ? (s.split(',').filter(Boolean) as MovementFlujo[]) : [])),
  valorMin: z.coerce.number().int().nonnegative().optional(),
  valorMax: z.coerce.number().int().nonnegative().optional(),
});

export default function MovementsPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useUrlFilters(schema);
  const accountsQ = useQuery({ queryKey: accountKeys.all, queryFn: listAccounts });

  return (
    <Page
      title={t('movements.title')}
      description={t('movements.subtitle')}
      actions={
        <Button leftSection={<IconPlus size={16} />} onClick={() => openMovementFormModal(t)}>
          {t('movements.newMovement')}
        </Button>
      }
    >
      <Card withBorder p="md">
        <Stack>
          <Group wrap="wrap">
            <MultiSelect
              placeholder={t('movements.from')}
              data={(accountsQ.data ?? []).map((a) => ({ value: a.id, label: a.nombre }))}
              value={filters.emisoraIds}
              onChange={(v) => setFilters({ emisoraIds: v.join(',') as never })}
              searchable
              clearable
              w={200}
            />
            <MultiSelect
              placeholder={t('movements.to')}
              data={(accountsQ.data ?? []).map((a) => ({ value: a.id, label: a.nombre }))}
              value={filters.receptoraIds}
              onChange={(v) => setFilters({ receptoraIds: v.join(',') as never })}
              searchable
              clearable
              w={200}
            />
            <MultiSelect
              placeholder={t('common.type')}
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
              value={filters.flujos}
              onChange={(v) => setFilters({ flujos: v.join(',') as never })}
              clearable
              w={220}
            />
            <MoneyInput
              placeholder={t('common.min')}
              value={filters.valorMin ?? null}
              onChange={(v) => setFilters({ valorMin: v ?? undefined })}
              w={130}
            />
            <MoneyInput
              placeholder={t('common.max')}
              value={filters.valorMax ?? null}
              onChange={(v) => setFilters({ valorMax: v ?? undefined })}
              w={130}
            />
            <Button
              variant="subtle"
              onClick={() =>
                setFilters({
                  emisoraIds: '' as never,
                  receptoraIds: '' as never,
                  flujos: '' as never,
                  valorMin: undefined,
                  valorMax: undefined,
                  month: undefined,
                })
              }
            >
              {t('common.clearFilters')}
            </Button>
          </Group>
        </Stack>
      </Card>
      <MovementsTable
        filterEmisoraIds={filters.emisoraIds}
        filterReceptoraIds={filters.receptoraIds}
        filterFlujos={filters.flujos}
        filterValorMin={filters.valorMin}
        filterValorMax={filters.valorMax}
        filterMonth={filters.month}
      />
    </Page>
  );
}
