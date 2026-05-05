import { describe, expect, it } from 'vitest';
import {
  csvSchema,
  dateOnlySchema,
  monthSchema,
  moneyIntSchema,
  moneyPositiveIntSchema,
  uuidSchema,
} from './zod.js';
import { z } from 'zod';

describe('uuidSchema', () => {
  it('accepts valid UUID', () => {
    expect(() =>
      uuidSchema.parse('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'),
    ).not.toThrow();
  });

  it('rejects non-UUID strings', () => {
    expect(() => uuidSchema.parse('not-a-uuid')).toThrow();
  });
});

describe('monthSchema', () => {
  it.each(['2026-01', '2026-12', '1999-06'])('accepts %s', (v) => {
    expect(monthSchema.parse(v)).toBe(v);
  });

  it.each(['2026-13', '2026-00', '26-01', '2026/01'])('rejects %s', (v) => {
    expect(() => monthSchema.parse(v)).toThrow();
  });
});

describe('moneyIntSchema', () => {
  it('accepts zero', () => {
    expect(moneyIntSchema.parse(0)).toBe(0);
  });

  it('accepts large pesos', () => {
    expect(moneyIntSchema.parse(999_999_999_999)).toBe(999_999_999_999);
  });

  it('rejects negative amounts', () => {
    expect(() => moneyIntSchema.parse(-1)).toThrow();
  });

  it('rejects floats', () => {
    expect(() => moneyIntSchema.parse(1.5)).toThrow();
  });

  it('rejects amounts beyond max', () => {
    expect(() => moneyIntSchema.parse(1_000_000_000_000)).toThrow();
  });
});

describe('moneyPositiveIntSchema', () => {
  it('rejects zero', () => {
    expect(() => moneyPositiveIntSchema.parse(0)).toThrow();
  });

  it('accepts positive amount', () => {
    expect(moneyPositiveIntSchema.parse(100)).toBe(100);
  });
});

describe('dateOnlySchema', () => {
  it('parses YYYY-MM-DD into UTC midnight Date', () => {
    const result = dateOnlySchema.parse('2026-04-27');
    expect(result.toISOString()).toBe('2026-04-27T00:00:00.000Z');
  });

  it('rejects malformed dates', () => {
    expect(() => dateOnlySchema.parse('27/04/2026')).toThrow();
  });
});

describe('csvSchema', () => {
  const schema = csvSchema(z.string().min(1));

  it('returns undefined for missing input', () => {
    expect(schema.parse(undefined)).toBeUndefined();
  });

  it('splits and trims values', () => {
    expect(schema.parse('a, b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('strips empty values', () => {
    expect(schema.parse('a,,b')).toEqual(['a', 'b']);
  });
});
