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
import type { TransactionType } from '@/shared/types/domain';

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
  types: z
    .string()
    .optional()
    .transform((s) => (s ? (s.split(',').filter(Boolean) as TransactionType[]) : [])),
  amountMin: z.coerce.number().int().nonnegative().optional(),
  amountMax: z.coerce.number().int().nonnegative().optional(),
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
              data={(categoriesQ.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
              value={filters.categoryIds}
              onChange={(v) => setFilters({ categoryIds: v.join(',') as never })}
              searchable
              clearable
              w={200}
            />
            <MultiSelect
              placeholder={t('transactions.filters.byAccount')}
              data={(accountsQ.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
              value={filters.accountIds}
              onChange={(v) => setFilters({ accountIds: v.join(',') as never })}
              searchable
              clearable
              w={200}
            />
            <MultiSelect
              placeholder={t('transactions.filters.byType')}
              data={[
                { value: 'income', label: t('transactions.income') },
                { value: 'expense', label: t('transactions.expense') },
                { value: 'liability', label: t('transactions.liability') },
              ]}
              value={filters.types}
              onChange={(v) => setFilters({ types: v.join(',') as never })}
              clearable
              w={180}
            />
            <MoneyInput
              placeholder={t('transactions.filters.minAmount')}
              value={filters.amountMin ?? null}
              onChange={(v) => setFilters({ amountMin: v ?? undefined })}
              w={130}
            />
            <MoneyInput
              placeholder={t('transactions.filters.maxAmount')}
              value={filters.amountMax ?? null}
              onChange={(v) => setFilters({ amountMax: v ?? undefined })}
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
                  types: '' as never,
                  amountMin: undefined,
                  amountMax: undefined,
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
        filterTypes={filters.types}
        filterAmountMin={filters.amountMin}
        filterAmountMax={filters.amountMax}
        search={filters.q}
        filterMonth={filters.month}
      />
    </Page>
  );
}
