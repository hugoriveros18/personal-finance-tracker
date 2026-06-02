import { describe, expect, it } from 'vitest';
import { formatDate, formatMonth, parseApiDate, toISODate } from './dates';

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

describe('parseApiDate', () => {
  it('parses a full ISO UTC-midnight string to the same local calendar day', () => {
    // Regression: new Date("2026-05-30T00:00:00.000Z") shifts to May 29 in UTC-5.
    const d = parseApiDate('2026-05-30T00:00:00.000Z');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // May (0-indexed)
    expect(d.getDate()).toBe(30);
  });

  it('parses a plain YYYY-MM-DD string', () => {
    const d = parseApiDate('2026-01-05');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(5);
  });

  it('round-trips with toISODate (the edit-modal path)', () => {
    expect(toISODate(parseApiDate('2026-05-30T00:00:00.000Z'))).toBe('2026-05-30');
  });
});
