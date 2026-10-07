// Money is exchanged with the backend as INTEGER CENTS (BIGINT in the DB).
// 1 COP = 100 cents. Display rule (option B): show 2 decimals only when
// the value isn't a whole peso, so "$1.250.000" stays terse for round numbers
// and "$1.250.000,50" shows the cents when present.

const fmtWithDecimals = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtNoDecimals = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function stripNbsp(parts: Intl.NumberFormatPart[]): string {
  return parts
    .filter((p) => !(p.type === 'literal' && p.value.trim() === ''))
    .map((p) => p.value)
    .join('');
}

export function formatCop(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '$0';
  const pesos = cents / 100;
  const fmt = cents % 100 === 0 ? fmtNoDecimals : fmtWithDecimals;
  return stripNbsp(fmt.formatToParts(pesos));
}

export function parseCop(input: string): number | null {
  if (!input) return null;
  // Keep only digits, comma (decimal) and minus. Dots are thousands separators
  // and must be discarded before parsing.
  const sanitized = input.replace(/[^\d,-]/g, '').replace(',', '.');
  if (!sanitized || sanitized === '-' || sanitized === '.') return null;
  const n = Number(sanitized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
