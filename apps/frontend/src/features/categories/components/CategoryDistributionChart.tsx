import { useState } from 'react';
import { Group, SegmentedControl, Text } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { Cell, Legend, Pie, PieChart, Tooltip } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChartShell } from '@/shared/components/ChartShell';
import { chartTooltipProps } from '@/shared/components/chartTooltip';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { dashboardKeys, fetchDashboard } from '@/features/dashboard/api/dashboard';
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

  const slices = (view === 'egreso' ? data?.byCategoryMonth.egreso : data?.byCategoryMonth.ingreso) ?? [];
  const total = slices.reduce((acc, s) => acc + s.total, 0);
  const empty = slices.length === 0;

  return (
    <ChartShell
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
      <PieChart>
        <Pie
          data={slices}
          dataKey="total"
          nameKey="nombre"
          innerRadius="50%"
          outerRadius="75%"
          paddingAngle={2}
        >
          {slices.map((_, i) => (
            <Cell key={i} fill={colorAt(i)} />
          ))}
        </Pie>
        <Tooltip
          {...chartTooltipProps}
          formatter={(v: number, n: string) => [
            `${f.money(v)} (${total ? ((v / total) * 100).toFixed(1) : 0}%)`,
            n,
          ]}
        />
        <Legend
          verticalAlign="bottom"
          iconType="square"
          wrapperStyle={{ paddingTop: 8, fontSize: 12 }}
        />
      </PieChart>
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
