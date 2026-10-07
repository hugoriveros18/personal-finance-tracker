import { describe, expect, it } from 'vitest';
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
} from './schemas.js';

const validInput = {
  description: 'Lunch',
  date: '2026-04-27',
  type: 'expense',
  amount: 12_000,
  accountId: '11111111-1111-4111-8111-111111111111',
  categoryId: '22222222-2222-4222-8222-222222222222',
};

describe('createTransactionSchema', () => {
  it('accepts a well-shaped expense', () => {
    const r = createTransactionSchema.parse(validInput);
    expect(r.type).toBe('expense');
    expect(r.date).toBeInstanceOf(Date);
  });

  it('rejects amount = 0', () => {
    expect(() => createTransactionSchema.parse({ ...validInput, amount: 0 })).toThrow();
  });

  it('rejects amount with decimals', () => {
    expect(() => createTransactionSchema.parse({ ...validInput, amount: 12.5 })).toThrow();
  });

  it('rejects negative amount', () => {
    expect(() => createTransactionSchema.parse({ ...validInput, amount: -100 })).toThrow();
  });

  it('rejects unknown type', () => {
    expect(() => createTransactionSchema.parse({ ...validInput, type: 'transfer' })).toThrow();
  });

  it('trims description', () => {
    const r = createTransactionSchema.parse({ ...validInput, description: '  Lunch  ' });
    expect(r.description).toBe('Lunch');
  });
});

describe('updateTransactionSchema', () => {
  it('rejects unknown extra fields (strict)', () => {
    const r = updateTransactionSchema.safeParse({ type: 'income', extra: true });
    expect(r.success).toBe(false);
  });

  it('accepts a partial valid patch', () => {
    const r = updateTransactionSchema.safeParse({ amount: 1_000 });
    expect(r.success).toBe(true);
  });
});

describe('listTransactionsQuerySchema', () => {
  it('defaults page=1, pageSize=25, sort=-date', () => {
    const r = listTransactionsQuerySchema.parse({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(25);
    expect(r.sort).toBe('-date');
  });

  it('parses CSV filter strings', () => {
    const r = listTransactionsQuerySchema.parse({
      types: 'income,expense',
    });
    expect(r.types).toEqual(['income', 'expense']);
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
