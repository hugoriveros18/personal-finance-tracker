import { useMemo, useState } from 'react';
import { Group, NumberInput, Select, Stack } from '@mantine/core';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChartShell } from '@/shared/components/ChartShell';
import { chartTooltipProps } from '@/shared/components/chartTooltip';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { categoryKeys, getCategoryTrend } from '../api/categories';
import type { Category } from '@/shared/types/domain';

interface Props {
  categories: Category[];
}

export function CategoryTrendChart({ categories }: Props) {
  const { t } = useTranslation();
  const f = useFormatters();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [categoryId, setCategoryId] = useState<string | null>(categories[0]?.id ?? null);

  const { data } = useQuery({
    queryKey: categoryId ? categoryKeys.trend(categoryId, year) : ['noop'],
    queryFn: () => getCategoryTrend(categoryId!, year),
    enabled: !!categoryId,
  });

  const points = useMemo(() => {
    if (!data) return [];
    return data.months.map((m, i) => ({ month: m.split('-')[1], total: data.totals[i] }));
  }, [data]);
  const empty = !data || data.totals.every((v) => v === 0);
  const selectedCategoryName = categories.find((c) => c.id === categoryId)?.nombre;
  const subtitle = selectedCategoryName
    ? `${selectedCategoryName} · ${year}`
    : year.toString();

  return (
    <ChartShell
      title={t('categories.categoryTrend')}
      subtitle={subtitle}
      empty={empty}
      emptyText={t('dashboard.noCategoryData')}
      footer={
        <Group mt="xs" gap="xs" wrap="nowrap">
          <Select
            size="xs"
            placeholder={t('common.category')}
            value={categoryId}
            onChange={setCategoryId}
            data={categories.map((c) => ({ value: c.id, label: c.nombre }))}
            searchable
            clearable
          />
          <NumberInput
            size="xs"
            value={year}
            onChange={(v) => setYear(typeof v === 'number' ? v : Number(v) || new Date().getFullYear())}
            min={1900}
            max={3000}
            hideControls
            maw={90}
          />
        </Group>
      }
    >
      <LineChart data={points} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-default-border)" />
        <XAxis dataKey="month" stroke="currentColor" fontSize={11} />
        <YAxis stroke="currentColor" fontSize={11} tickFormatter={(v: number) => f.money(v)} width={80} />
        <Tooltip {...chartTooltipProps} formatter={(v: number) => f.money(v)} />
        <Line type="monotone" dataKey="total" stroke="var(--mantine-color-teal-6)" strokeWidth={2} dot />
      </LineChart>
    </ChartShell>
  );
}
