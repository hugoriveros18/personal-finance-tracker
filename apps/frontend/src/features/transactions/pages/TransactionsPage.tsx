import { Button, Card, Group, MultiSelect, Stack, TextInput } from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useUrlFilters } from '@/shared/hooks/useUrlFilters';
import { z } from 'zod';
import { Page } from '@/shared/components/Page';
import { TransactionsTable } from '../components/TransactionsTable';
import { openTransactionFormModal } from '../components/TransactionFormModal';
import { accountKeys, listAccounts } from '@/features/accounts/api/accounts';
import { categoryKeys, listCategories } from '@/features/categories/api/categories';
import { MoneyInput } from '@/shared/components/MoneyInput';
import type { TransactionTipo } from '@/shared/types/domain';

const filtersSchema = z.object({
  month: z.string().optional(),
  accountIds: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : [])),
  categoryIds: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : [])),
  tipos: z
    .string()
    .optional()
    .transform((s) => (s ? (s.split(',').filter(Boolean) as TransactionTipo[]) : [])),
  valorMin: z.coerce.number().int().nonnegative().optional(),
  valorMax: z.coerce.number().int().nonnegative().optional(),
  q: z.string().optional(),
});

export default function TransactionsPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useUrlFilters(filtersSchema);
  const accountsQ = useQuery({ queryKey: accountKeys.all, queryFn: listAccounts });
  const categoriesQ = useQuery({ queryKey: categoryKeys.all, queryFn: () => listCategories() });

  return (
    <Page
      title={t('transactions.title')}
      description={t('transactions.subtitle')}
      actions={
        <Button leftSection={<IconPlus size={16} />} onClick={() => openTransactionFormModal(t)}>
          {t('transactions.newTransaction')}
        </Button>
      }
    >
      <Card withBorder p="md">
        <Stack>
          <Group wrap="wrap">
            <MultiSelect
              placeholder={t('transactions.filters.byCategory')}
              data={(categoriesQ.data ?? []).map((c) => ({ value: c.id, label: c.nombre }))}
              value={filters.categoryIds}
              onChange={(v) => setFilters({ categoryIds: v.join(',') as never })}
              searchable
              clearable
              w={200}
            />
            <MultiSelect
              placeholder={t('transactions.filters.byAccount')}
              data={(accountsQ.data ?? []).map((a) => ({ value: a.id, label: a.nombre }))}
              value={filters.accountIds}
              onChange={(v) => setFilters({ accountIds: v.join(',') as never })}
              searchable
              clearable
              w={200}
            />
            <MultiSelect
              placeholder={t('transactions.filters.byType')}
              data={[
                { value: 'ingreso', label: t('transactions.tipoIngreso') },
                { value: 'egreso', label: t('transactions.tipoEgreso') },
                { value: 'pasivo', label: t('transactions.tipoPasivo') },
              ]}
              value={filters.tipos}
              onChange={(v) => setFilters({ tipos: v.join(',') as never })}
              clearable
              w={180}
            />
            <MoneyInput
              placeholder={t('transactions.filters.minAmount')}
              value={filters.valorMin ?? null}
              onChange={(v) => setFilters({ valorMin: v ?? undefined })}
              w={130}
            />
            <MoneyInput
              placeholder={t('transactions.filters.maxAmount')}
              value={filters.valorMax ?? null}
              onChange={(v) => setFilters({ valorMax: v ?? undefined })}
              w={130}
            />
            <TextInput
              placeholder={t('common.search')}
              leftSection={<IconSearch size={14} />}
              value={filters.q ?? ''}
              onChange={(e) => setFilters({ q: e.currentTarget.value || undefined })}
              w={200}
            />
            <Button
              variant="subtle"
              onClick={() =>
                setFilters({
                  accountIds: '' as never,
                  categoryIds: '' as never,
                  tipos: '' as never,
                  valorMin: undefined,
                  valorMax: undefined,
                  q: undefined,
                  month: undefined,
                })
              }
            >
              {t('common.clearFilters')}
            </Button>
          </Group>
        </Stack>
      </Card>

      <TransactionsTable
        filterAccountIds={filters.accountIds}
        filterCategoryIds={filters.categoryIds}
        filterTipos={filters.tipos}
        filterValorMin={filters.valorMin}
        filterValorMax={filters.valorMax}
        search={filters.q}
        filterMonth={filters.month}
      />
    </Page>
  );
}
