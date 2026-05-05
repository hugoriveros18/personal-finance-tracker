import { describe, expect, it } from 'vitest';
import { formatYYYYMM, monthRange, yearRange } from './dates.js';

describe('monthRange', () => {
  it('returns the inclusive UTC bounds of a month', () => {
    const { from, to } = monthRange('2026-04');
    expect(from.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-04-30T00:00:00.000Z');
  });

  it('handles February in a non-leap year', () => {
    const { to } = monthRange('2025-02');
    expect(to.toISOString()).toBe('2025-02-28T00:00:00.000Z');
  });

  it('handles February in a leap year', () => {
    const { to } = monthRange('2024-02');
    expect(to.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  it('rejects malformed input', () => {
    expect(() => monthRange('2026-13')).toThrow();
    expect(() => monthRange('not-a-date')).toThrow();
  });
});

describe('yearRange', () => {
  it('returns Jan 1 to Dec 31 in UTC', () => {
    const { from, to } = yearRange(2026);
    expect(from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });

  it('rejects non-integer year', () => {
    expect(() => yearRange(NaN)).toThrow();
  });
});

describe('formatYYYYMM', () => {
  it('zero-pads single-digit months', () => {
    expect(formatYYYYMM(new Date('2026-03-15T12:00:00Z'))).toBe('2026-03');
  });

  it('uses UTC, not local time', () => {
    expect(formatYYYYMM(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });
});
