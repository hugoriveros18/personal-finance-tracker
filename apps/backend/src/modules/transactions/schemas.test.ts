import { describe, expect, it } from 'vitest';
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
} from './schemas.js';

const validInput = {
  descripcion: 'Lunch',
  fecha: '2026-04-27',
  tipo: 'egreso',
  valor: 12_000,
  accountId: '11111111-1111-4111-8111-111111111111',
  categoryId: '22222222-2222-4222-8222-222222222222',
};

describe('createTransactionSchema', () => {
  it('accepts a well-shaped egreso', () => {
    const r = createTransactionSchema.parse(validInput);
    expect(r.tipo).toBe('egreso');
    expect(r.fecha).toBeInstanceOf(Date);
  });

  it('rejects valor = 0', () => {
    expect(() =>
      createTransactionSchema.parse({ ...validInput, valor: 0 }),
    ).toThrow();
  });

  it('rejects valor with decimals', () => {
    expect(() =>
      createTransactionSchema.parse({ ...validInput, valor: 12.5 }),
    ).toThrow();
  });

  it('rejects negative valor', () => {
    expect(() =>
      createTransactionSchema.parse({ ...validInput, valor: -100 }),
    ).toThrow();
  });

  it('rejects unknown tipo', () => {
    expect(() =>
      createTransactionSchema.parse({ ...validInput, tipo: 'transfer' }),
    ).toThrow();
  });

  it('trims descripcion', () => {
    const r = createTransactionSchema.parse({ ...validInput, descripcion: '  Lunch  ' });
    expect(r.descripcion).toBe('Lunch');
  });
});

describe('updateTransactionSchema', () => {
  it('rejects unknown extra fields (strict)', () => {
    const r = updateTransactionSchema.safeParse({ tipo: 'ingreso', extra: true });
    expect(r.success).toBe(false);
  });

  it('accepts a partial valid patch', () => {
    const r = updateTransactionSchema.safeParse({ valor: 1_000 });
    expect(r.success).toBe(true);
  });
});

describe('listTransactionsQuerySchema', () => {
  it('defaults page=1, pageSize=25, sort=-fecha', () => {
    const r = listTransactionsQuerySchema.parse({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(25);
    expect(r.sort).toBe('-fecha');
  });

  it('parses CSV filter strings', () => {
    const r = listTransactionsQuerySchema.parse({
      tipos: 'ingreso,egreso',
    });
    expect(r.tipos).toEqual(['ingreso', 'egreso']);
  });

  it('rejects invalid month format', () => {
    const r = listTransactionsQuerySchema.safeParse({ month: '2026/04' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid sort key', () => {
    const r = listTransactionsQuerySchema.safeParse({ sort: 'priority' });
    expect(r.success).toBe(false);
  });
});
