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
import type { MovementFlow } from '@/shared/types/domain';

const schema = z.object({
  month: z.string().optional(),
  sourceAccountIds: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : [])),
  destinationAccountIds: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : [])),
  flows: z
    .string()
    .optional()
    .transform((s) => (s ? (s.split(',').filter(Boolean) as MovementFlow[]) : [])),
  amountMin: z.coerce.number().int().nonnegative().optional(),
  amountMax: z.coerce.number().int().nonnegative().optional(),
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
              data={(accountsQ.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
              value={filters.sourceAccountIds}
              onChange={(v) => setFilters({ sourceAccountIds: v.join(',') as never })}
              searchable
              clearable
              w={200}
            />
            <MultiSelect
              placeholder={t('movements.to')}
              data={(accountsQ.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
              value={filters.destinationAccountIds}
              onChange={(v) => setFilters({ destinationAccountIds: v.join(',') as never })}
              searchable
              clearable
              w={200}
            />
            <MultiSelect
              placeholder={t('common.type')}
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
              value={filters.flows}
              onChange={(v) => setFilters({ flows: v.join(',') as never })}
              clearable
              w={220}
            />
            <MoneyInput
              placeholder={t('common.min')}
              value={filters.amountMin ?? null}
              onChange={(v) => setFilters({ amountMin: v ?? undefined })}
              w={130}
            />
            <MoneyInput
              placeholder={t('common.max')}
              value={filters.amountMax ?? null}
              onChange={(v) => setFilters({ amountMax: v ?? undefined })}
              w={130}
            />
            <Button
              variant="subtle"
              onClick={() =>
                setFilters({
                  sourceAccountIds: '' as never,
                  destinationAccountIds: '' as never,
                  flows: '' as never,
                  amountMin: undefined,
                  amountMax: undefined,
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
        filterSourceAccountIds={filters.sourceAccountIds}
        filterDestinationAccountIds={filters.destinationAccountIds}
        filterFlows={filters.flows}
        filterAmountMin={filters.amountMin}
        filterAmountMax={filters.amountMax}
        filterMonth={filters.month}
      />
    </Page>
  );
}
