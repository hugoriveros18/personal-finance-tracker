import { useState } from 'react';
import {
  Card,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Skeleton,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Page } from '@/shared/components/Page';
import { MoneyDisplay } from '@/shared/components/MoneyDisplay';
import { ChartShell } from '@/shared/components/ChartShell';
import { chartTooltipProps } from '@/shared/components/chartTooltip';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { dashboardKeys, fetchDashboard } from '../api/dashboard';
import { todayYYYYMM } from '@/shared/lib/dates';
import { colorAt } from '@/shared/lib/chartColors';

export default function DashboardPage() {
  const { t } = useTranslation();
  const f = useFormatters();
  const [monthDate, setMonthDate] = useState<Date>(new Date());
  const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const { data, isLoading } = useQuery({
    queryKey: dashboardKeys.byMonth(`${monthStr}_${year}`),
    queryFn: () => fetchDashboard({ month: monthStr, year }),
  });

  const totalExpenses = (data?.monthSummary.egresos ?? 0) + (data?.monthSummary.pasivosNuevos ?? 0);
  // Balance shown on the card must match the visible "Egresos" figure, which
  // includes new liabilities — so subtract totalExpenses, not monthSummary.flow
  // (which only nets income against pure egresos).
  const balance = data ? (data.monthSummary.ingresos ?? 0) - totalExpenses : undefined;
  const incomeBars = (data?.trendYear.months ?? []).map((m, i) => ({
    month: m.split('-')[1],
    valor: data?.trendYear.ingresos[i] ?? 0,
  }));
  const expensesBars = (data?.trendYear.months ?? []).map((m, i) => ({
    month: m.split('-')[1],
    valor: (data?.trendYear.egresos[i] ?? 0) + (data?.trendYear.pasivosNuevos[i] ?? 0),
  }));
  const savingsBars = (data?.trendYear.months ?? []).map((m, i) => ({
    month: m.split('-')[1],
    valor: data?.trendYear.ahorroDelta[i] ?? 0,
  }));
  const topMonth = data?.topCategoriesMonth.egreso ?? [];
  const topYear = data?.topCategoriesYear.egreso ?? [];

  const chartTooltip = chartTooltipProps;

  return (
    <Page
      title={t('dashboard.title')}
      description={t('dashboard.subtitle')}
      actions={
        <Group>
          <MonthPickerInput
            value={monthDate}
            onChange={(v) => v && setMonthDate(v)}
            valueFormat="MMM YYYY"
          />
          <NumberInput
            value={year}
            onChange={(v) =>
              setYear(typeof v === 'number' ? v : Number(v) || new Date().getFullYear())
            }
            min={1900}
            max={3000}
            hideControls
            w={100}
          />
        </Group>
      }
    >
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder p="lg">
          <Stack gap={6}>
            <Title order={5}>{t('dashboard.monthlySummary')}</Title>
            <Text c="dimmed" size="xs">
              {f.month(monthStr)}
            </Text>
            <SimpleGrid cols={2} spacing="xs" mt="sm">
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  {t('dashboard.income')}
                </Text>
                <Skeleton visible={isLoading}>
                  <MoneyDisplay value={data?.monthSummary.ingresos} fw={700} fz="lg" c="teal.7" />
                </Skeleton>
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  {t('dashboard.expenses')}
                </Text>
                <Skeleton visible={isLoading}>
                  <MoneyDisplay value={totalExpenses} fw={700} fz="lg" c="red.7" />
                </Skeleton>
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  {t('dashboard.balance')}
                </Text>
                <Skeleton visible={isLoading}>
                  <MoneyDisplay value={balance} signed fw={600} />
                </Skeleton>
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  {t('dashboard.ahorroVariacion')}
                </Text>
                <Skeleton visible={isLoading}>
                  <MoneyDisplay value={data?.monthSummary.ahorroDelta} signed fw={700} fz="lg" />
                </Skeleton>
              </Stack>
            </SimpleGrid>
          </Stack>
        </Card>

        <Card withBorder p="lg">
          <Stack gap={6}>
            <Title order={5}>{t('dashboard.globalSnapshot')}</Title>
            <Text c="dimmed" size="xs">
              {f.date(new Date())}
            </Text>
            <SimpleGrid cols={2} spacing="xs" mt="sm">
              <Stack gap={0}>
                <Text size="xs" c="dimmed">{t('dashboard.disponible')}</Text>
                <Skeleton visible={isLoading}>
                  <MoneyDisplay value={data?.totals.disponibleTotal} fw={700} fz="lg" />
                </Skeleton>
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">{t('dashboard.ahorro')}</Text>
                <Skeleton visible={isLoading}>
                  <MoneyDisplay value={data?.totals.ahorroTotal} fw={700} fz="lg" />
                </Skeleton>
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">{t('dashboard.pasivos')}</Text>
                <Skeleton visible={isLoading}>
                  <MoneyDisplay value={data?.totals.pasivosTotal} fw={700} fz="lg" c="red.7" />
                </Skeleton>
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">{t('dashboard.netWorth')}</Text>
                <Skeleton visible={isLoading}>
                  <MoneyDisplay value={data?.totals.netWorth} fw={700} fz="lg" c="teal.7" />
                </Skeleton>
              </Stack>
            </SimpleGrid>
          </Stack>
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <ChartShell title={t('dashboard.incomeMonths')} subtitle={String(year)}>
          <BarChart data={incomeBars}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-default-border)" />
            <XAxis dataKey="month" stroke="currentColor" fontSize={11} />
            <YAxis stroke="currentColor" fontSize={11} tickFormatter={(v: number) => f.money(v)} width={80} />
            <Tooltip {...chartTooltip} formatter={(v: number) => f.money(v)} />
            <Bar dataKey="valor" fill="var(--mantine-color-teal-6)" />
          </BarChart>
        </ChartShell>
        <ChartShell title={t('dashboard.expensesMonths')} subtitle={String(year)}>
          <BarChart data={expensesBars}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-default-border)" />
            <XAxis dataKey="month" stroke="currentColor" fontSize={11} />
            <YAxis stroke="currentColor" fontSize={11} tickFormatter={(v: number) => f.money(v)} width={80} />
            <Tooltip {...chartTooltip} formatter={(v: number) => f.money(v)} />
            <Bar dataKey="valor" fill="var(--mantine-color-orange-6)" />
          </BarChart>
        </ChartShell>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <ChartShell title={t('dashboard.ahorroVariacionMonths')} subtitle={String(year)}>
          <LineChart data={savingsBars}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-default-border)" />
            <XAxis dataKey="month" stroke="currentColor" fontSize={11} />
            <YAxis stroke="currentColor" fontSize={11} tickFormatter={(v: number) => f.money(v)} width={80} />
            <Tooltip {...chartTooltip} formatter={(v: number) => f.money(v)} />
            <Line type="monotone" dataKey="valor" stroke="var(--mantine-color-cyan-6)" strokeWidth={2} dot />
          </LineChart>
        </ChartShell>
        <ChartShell
          title={t('dashboard.topCategoriesMonth')}
          subtitle={f.month(monthStr)}
          empty={topMonth.length === 0}
          emptyText={t('dashboard.noCategoryData')}
        >
          <PieChart>
            <Pie
              data={topMonth}
              dataKey="total"
              nameKey="nombre"
              innerRadius="40%"
              outerRadius="70%"
              paddingAngle={2}
            >
              {topMonth.map((_, i) => (
                <Cell key={i} fill={colorAt(i)} />
              ))}
            </Pie>
            <Legend />
            <Tooltip {...chartTooltip} formatter={(v: number, n: string) => [f.money(v), n]} />
          </PieChart>
        </ChartShell>
      </SimpleGrid>

      <ChartShell
        title={t('dashboard.topCategoriesYear')}
        subtitle={String(year)}
        height={280}
        empty={topYear.length === 0}
        emptyText={t('dashboard.noCategoryData')}
      >
        <BarChart data={topYear} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-default-border)" />
          <XAxis type="number" stroke="currentColor" fontSize={11} tickFormatter={(v: number) => f.money(v)} />
          <YAxis type="category" dataKey="nombre" stroke="currentColor" fontSize={11} width={140} />
          <Tooltip {...chartTooltip} formatter={(v: number) => f.money(v)} />
          <Bar dataKey="total" fill="var(--mantine-color-orange-6)" />
        </BarChart>
      </ChartShell>
    </Page>
  );
}
