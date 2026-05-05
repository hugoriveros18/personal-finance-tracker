import { Card, Group, MultiSelect, Stack } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useUrlFilters } from '@/shared/hooks/useUrlFilters';
import { Page } from '@/shared/components/Page';
import { accountKeys, listAccounts } from '@/features/accounts/api/accounts';
import { LiabilityPaymentsTable } from '../components/LiabilityPaymentsTable';
import { MoneyInput } from '@/shared/components/MoneyInput';

const schema = z.object({
  month: z.string().optional(),
  accountIds: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : [])),
  valorMin: z.coerce.number().int().nonnegative().optional(),
  valorMax: z.coerce.number().int().nonnegative().optional(),
});

export default function LiabilityPaymentsPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useUrlFilters(schema);
  const accountsQ = useQuery({ queryKey: accountKeys.all, queryFn: listAccounts });

  return (
    <Page title={t('liabilityPayments.title')} description={t('liabilityPayments.subtitle')}>
      <Card withBorder p="md">
        <Stack>
          <Group wrap="wrap">
            <MultiSelect
              placeholder={t('common.account')}
              data={(accountsQ.data ?? []).map((a) => ({ value: a.id, label: a.nombre }))}
              value={filters.accountIds}
              onChange={(v) => setFilters({ accountIds: v.join(',') as never })}
              searchable
              clearable
              w={240}
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
          </Group>
        </Stack>
      </Card>
      <LiabilityPaymentsTable
        filterAccountIds={filters.accountIds}
        filterMonth={filters.month}
      />
    </Page>
  );
}
