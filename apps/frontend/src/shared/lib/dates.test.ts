import { describe, expect, it } from 'vitest';
import { formatDate, formatMonth, toISODate } from './dates';

describe('formatDate', () => {
  it('formats DD/MM/YYYY for Spanish', () => {
    const result = formatDate('2026-04-27', 'es');
    expect(result).toBe('27/04/2026');
  });

  it('formats MM/DD/YYYY for English', () => {
    const result = formatDate('2026-04-27', 'en');
    expect(result).toBe('04/27/2026');
  });

  it('uses UTC, not local time, to avoid date-shift bugs', () => {
    expect(formatDate('2026-04-27', 'es')).toBe('27/04/2026');
  });

  it('accepts a Date instance', () => {
    expect(formatDate(new Date('2026-04-27T00:00:00Z'), 'es')).toBe('27/04/2026');
  });
});

describe('formatMonth', () => {
  it('formats month long-name + year', () => {
    const result = formatMonth('2026-04', 'es');
    expect(result.toLowerCase()).toContain('abril');
    expect(result).toContain('2026');
  });

  it('formats month in English', () => {
    const result = formatMonth('2026-04', 'en');
    expect(result).toContain('April');
  });
});

describe('toISODate', () => {
  it('zero-pads month and day', () => {
    const d = new Date(2026, 0, 5);
    expect(toISODate(d)).toBe('2026-01-05');
  });
});
