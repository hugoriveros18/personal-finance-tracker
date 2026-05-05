import { describe, expect, it } from 'vitest';
import { formatCop, parseCop } from './money';

describe('formatCop (centavos input)', () => {
  it('formats a whole peso amount with no decimals', () => {
    // 1.250.000 pesos = 125_000_000 centavos
    expect(formatCop(125_000_000)).toBe('$1.250.000');
  });

  it('formats a fractional amount with 2 decimals (option B)', () => {
    // 1.250.000,50 pesos = 125_000_050 centavos
    expect(formatCop(125_000_050)).toBe('$1.250.000,50');
  });

  it('shows leading-zero centavo correctly (5 cents)', () => {
    // 0,05 pesos = 5 centavos
    expect(formatCop(5)).toBe('$0,05');
  });

  it('formats zero as $0 with no decimals', () => {
    expect(formatCop(0)).toBe('$0');
  });

  it('formats negatives with -$ prefix', () => {
    // -50.000 pesos = -5_000_000 centavos
    expect(formatCop(-5_000_000)).toBe('-$50.000');
    // -50.000,25 pesos
    expect(formatCop(-5_000_025)).toBe('-$50.000,25');
  });

  it('returns $0 for null/undefined/NaN', () => {
    expect(formatCop(null)).toBe('$0');
    expect(formatCop(undefined)).toBe('$0');
    expect(formatCop(Number.NaN)).toBe('$0');
  });

  it('strips the NBSP literal that es-CO formatter inserts', () => {
    expect(formatCop(100_000)).not.toMatch(/\s/); // 1.000 pesos = 100_000 centavos
  });
});

describe('parseCop (returns centavos)', () => {
  it('parses a whole-peso formatted string', () => {
    expect(parseCop('$1.250.000')).toBe(125_000_000);
  });

  it('parses a string with decimals', () => {
    expect(parseCop('$1.250.000,50')).toBe(125_000_050);
  });

  it('parses a string with only centavos', () => {
    expect(parseCop('$0,05')).toBe(5);
  });

  it('handles negatives', () => {
    expect(parseCop('-$50.000')).toBe(-5_000_000);
    expect(parseCop('-$50.000,25')).toBe(-5_000_025);
  });

  it('returns null for empty input', () => {
    expect(parseCop('')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseCop('abc')).toBeNull();
  });

  it('returns null for a lone minus sign', () => {
    expect(parseCop('-')).toBeNull();
  });

  it('round-trips with formatCop for whole pesos', () => {
    const formatted = formatCop(98_765_400);
    expect(parseCop(formatted)).toBe(98_765_400);
  });

  it('round-trips with formatCop for fractional amounts', () => {
    const formatted = formatCop(98_765_433);
    expect(parseCop(formatted)).toBe(98_765_433);
  });
});
