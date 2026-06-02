import type { Language } from '@/shared/stores/preferencesStore';

export function formatDate(d: Date | string, language: Language): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat(language === 'es' ? 'es-CO' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatMonth(yyyymm: string, language: Language): string {
  const [yStr, mStr] = yyyymm.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat(language === 'es' ? 'es-CO' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function todayYYYYMM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse an API date string ("YYYY-MM-DD" or full ISO like
 * "2026-05-30T00:00:00.000Z") as LOCAL midnight, taking only the calendar-day
 * part. This keeps the <DatePickerInput> (which works in local time) showing
 * the same day the backend stored — `new Date(isoString)` would interpret the
 * UTC midnight as the previous day in negative-offset timezones (e.g. UTC-5).
 */
export function parseApiDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
