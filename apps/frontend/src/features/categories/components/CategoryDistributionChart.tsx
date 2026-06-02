import { useState } from 'react';
import { Box, Group, SegmentedControl, Table, Text } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChartShell } from '@/shared/components/ChartShell';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { dashboardKeys, fetchDashboard } from '@/features/dashboard/api/dashboard';
import { categoryKeys, listCategories } from '@/features/categories/api/categories';
import { colorAt } from '@/shared/lib/chartColors';

export function CategoryDistributionChart() {
  const { t } = useTranslation();
  const f = useFormatters();
  const [monthDate, setMonthDate] = useState<Date>(new Date());
  const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
  const [view, setView] = useState<'egreso' | 'ingreso'>('egreso');
  const { data } = useQuery({
    queryKey: dashboardKeys.byMonth(month),
    queryFn: () => fetchDashboard({ month, year: Number(month.split('-')[0]) }),
  });
  const categoriesQ = useQuery({ queryKey: categoryKeys.all, queryFn: () => listCategories() });

  const monthByCat = view === 'egreso' ? data?.byCategoryMonth.egreso : data?.byCategoryMonth.ingreso;
  // Show EVERY category of the selected tipo — including those with no activity
  // this month (total 0) — not just the ones that had transactions.
  const totalsById = new Map((monthByCat ?? []).map((s) => [s.categoryId, s.total] as const));
  const rows = (categoriesQ.data ?? [])
    .filter((c) => c.tipo === view)
    .map((c) => ({ categoryId: c.id, nombre: c.nombre, total: totalsById.get(c.id) ?? 0 }))
    .sort((a, b) => b.total - a.total);
  const total = rows.reduce((acc, s) => acc + s.total, 0);
  const empty = rows.length === 0;

  return (
    <ChartShell
      raw
      title={t('dashboard.topCategoriesMonth')}
      subtitle={f.month(month)}
      empty={empty}
      emptyText={t('dashboard.noCategoryData')}
      footer={
        <Group mt="xs" gap="xs" wrap="nowrap">
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(v) => setView(v as 'egreso' | 'ingreso')}
            data={[
              { value: 'egreso', label: t('categories.tipoEgreso') },
              { value: 'ingreso', label: t('categories.tipoIngreso') },
            ]}
          />
          <MonthPickerInput
            size="xs"
            value={monthDate}
            onChange={(v) => v && setMonthDate(v)}
            maw={160}
            clearable={false}
          />
        </Group>
      }
    >
      <Table highlightOnHover verticalSpacing="xs" stickyHeader>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('common.category')}</Table.Th>
            <Table.Th ta="right">{t('common.amount')}</Table.Th>
            <Table.Th ta="right">%</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((s, i) => (
            <Table.Tr key={s.categoryId}>
              <Table.Td>
                <Group gap="xs" wrap="nowrap">
                  <Box
                    w={10}
                    h={10}
                    style={{ borderRadius: 2, background: colorAt(i), flexShrink: 0 }}
                  />
                  <Text size="sm">{s.nombre}</Text>
                </Group>
              </Table.Td>
              <Table.Td ta="right">{f.money(s.total)}</Table.Td>
              <Table.Td ta="right">
                {total ? ((s.total / total) * 100).toFixed(1) : '0.0'}%
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ChartShell>
  );
}

export function CategoryDistributionChartHeader() {
  const { t } = useTranslation();
  return (
    <Group justify="flex-end">
      <Text size="xs">{t('dashboard.topCategoriesMonth')}</Text>
    </Group>
  );
}
