import { useMemo } from 'react';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { formatCop } from '@/shared/lib/money';
import { formatDate, formatMonth } from '@/shared/lib/dates';

export function useFormatters() {
  const language = usePreferencesStore((s) => s.language);
  return useMemo(
    () => ({
      money: (n: number | null | undefined) => formatCop(n),
      date: (d: Date | string) => formatDate(d, language),
      month: (yyyymm: string) => formatMonth(yyyymm, language),
      percent: (n: number, decimals = 1) => `${(n * 100).toFixed(decimals)}%`,
    }),
    [language],
  );
}
