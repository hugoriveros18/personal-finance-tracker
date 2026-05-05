import { describe, expect, it } from 'vitest';
import { createAccountSchema, updateAccountSchema } from './schemas.js';

describe('createAccountSchema', () => {
  it('accepts only a name and zeroes the balances', () => {
    const r = createAccountSchema.parse({ nombre: 'Bancolombia' });
    expect(r).toEqual({ nombre: 'Bancolombia', disponible: 0, ahorro: 0, pasivos: 0 });
  });

  it('accepts initial balances', () => {
    const r = createAccountSchema.parse({
      nombre: 'Card',
      disponible: 100_000,
      ahorro: 50_000,
      pasivos: 25_000,
    });
    expect(r.disponible).toBe(100_000);
  });

  it('rejects negative initial balances', () => {
    expect(() =>
      createAccountSchema.parse({ nombre: 'X', disponible: -1 }),
    ).toThrow();
  });
});

describe('updateAccountSchema', () => {
  it('accepts only nombre updates', () => {
    const r = updateAccountSchema.parse({ nombre: 'Renamed' });
    expect(r).toEqual({ nombre: 'Renamed' });
  });

  it('rejects balance updates (initial balances are immutable)', () => {
    const r = updateAccountSchema.safeParse({ disponible: 9_999 });
    expect(r.success).toBe(false);
  });
});
