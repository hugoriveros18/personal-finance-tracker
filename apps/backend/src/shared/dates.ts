/**
 * Convert YYYY-MM string to [from, to] inclusive Date objects (UTC).
 */
export function monthRange(yyyymm: string): { from: Date; to: Date } {
  const [yStr, mStr] = yyyymm.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`Invalid month: ${yyyymm}`);
  }
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  return { from, to };
}

export function yearRange(year: number): { from: Date; to: Date } {
  if (!Number.isInteger(year)) {
    throw new Error(`Invalid year: ${year}`);
  }
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31));
  return { from, to };
}

export function formatYYYYMM(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
