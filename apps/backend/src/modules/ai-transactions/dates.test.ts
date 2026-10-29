import { describe, expect, it } from 'vitest';
import { resolveDate, resolveMessageDate, calendarToday } from './dates.js';

describe('Named Spanish calendar dates', () => {
  it.each([
    ['26 de Octubre', '2026-10-26'],
    ['el 26 de octubre', '2026-10-26'],
    ['26 octubre', '2026-10-26'],
    ['26 de octubre de 2025', '2025-10-26'],
    ['26 de octubre del año 2025', '2025-10-26'],
    ['1 de enero', '2026-01-01'],
    ['31 de diciembre', '2026-12-31'],
    ['30 de setiembre', '2026-09-30'],
    ['29 de febrero', null],
    ['31 de abril', null],
    ['26 de octubre de 20', null],
  ])('resolves %s without relying on a model-generated ISO date', (phrase, expected) => {
    expect(resolveDate(phrase, '2026-10-28')).toBe(expected);
    expect(resolveMessageDate(`Gasté 215000 ${phrase}`, null, '2026-10-28').date).toBe(expected);
  });
  it('uses the reference year even when the named day has not happened yet', () => {
    expect(resolveDate('26 de octubre', '2026-01-02')).toBe('2026-10-26');
    expect(resolveDate('29 de febrero', '2028-01-01')).toBe('2028-02-29');
  });
  it('keeps conflicting or incomplete dates unresolved', () => {
    expect(
      resolveMessageDate('Gasté 35000 el 26 de octubre o ayer', null, '2026-10-28').date,
    ).toBeNull();
    expect(resolveMessageDate('Gasté 35000 en octubre', null, '2026-10-28').date).toBeNull();
    expect(
      resolveMessageDate('Gasté 35000 el 26 de octubre del año pasado', null, '2026-10-28').date,
    ).toBeNull();
  });
  it('uses the configured calendar year at the timezone boundary', () => {
    const today = calendarToday(new Date('2027-01-01T02:00:00Z'), 'America/Bogota');
    expect(today).toBe('2026-12-31');
    expect(resolveDate('26 de Octubre', today)).toBe('2026-10-26');
  });
});
