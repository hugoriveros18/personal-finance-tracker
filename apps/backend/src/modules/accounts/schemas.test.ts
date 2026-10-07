import { describe, expect, it } from 'vitest';
import { createAccountSchema, updateAccountSchema } from './schemas.js';

describe('createAccountSchema', () => {
  it('accepts only a name and zeroes the balances', () => {
    const r = createAccountSchema.parse({ name: 'Bancolombia' });
    expect(r).toEqual({
      name: 'Bancolombia',
      availableBalance: 0,
      savingsBalance: 0,
      liabilitiesBalance: 0,
    });
  });

  it('accepts initial balances', () => {
    const r = createAccountSchema.parse({
      name: 'Card',
      availableBalance: 100_000,
      savingsBalance: 50_000,
      liabilitiesBalance: 25_000,
    });
    expect(r.availableBalance).toBe(100_000);
  });

  it('rejects negative initial balances', () => {
    expect(() => createAccountSchema.parse({ name: 'X', availableBalance: -1 })).toThrow();
  });
});

describe('updateAccountSchema', () => {
  it('accepts only name updates', () => {
    const r = updateAccountSchema.parse({ name: 'Renamed' });
    expect(r).toEqual({ name: 'Renamed' });
  });

  it('rejects balance updates (initial balances are immutable)', () => {
    const r = updateAccountSchema.safeParse({ availableBalance: 9_999 });
    expect(r.success).toBe(false);
  });
});
