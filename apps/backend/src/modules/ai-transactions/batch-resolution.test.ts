import { describe, expect, it } from 'vitest';
import { resolveBatchProposal } from './batch-resolution.js';
import type { Extraction, OrganizationContext } from './schemas.js';
const accounts = [
  { id: 'nu', name: 'Nu' },
  { id: 'bank', name: 'Bancolombia' },
];
const categories = [{ id: 'food', name: 'Alimentación', type: 'expense' as const }];
const context: OrganizationContext = {
  dateText: null,
  accountText: null,
  categoryText: null,
  paymentText: null,
  uncertainFields: [],
};
const extraction: Extraction = {
  intent: 'transaction',
  type: 'expense',
  amountText: '35000',
  description: 'Almuerzo',
  dateText: null,
  accountMentioned: false,
  accountName: null,
  categoryName: 'Alimentación',
};
const resolve = (source: string, inherited = context, output = extraction) =>
  resolveBatchProposal(output, source, inherited, accounts, categories, 'bank', '2026-10-28');
describe('Collection field resolution', () => {
  it('recovers compact amounts expanded by the model using only the local operation', () => {
    expect(resolve('Almuerzo 35k').amount).toBe(3500000);
    expect(resolve('Almuerzo', { ...context, accountText: 'Cuenta 35000' }).amount).toBeNull();
  });
  it('never replaces an unknown shared account with a default account', () => {
    expect(
      resolve('Almuerzo 35000', { ...context, accountText: 'Cuenta desconocida' }).accountId,
    ).toBeNull();
    expect(resolve('Almuerzo 35000', { ...context, accountText: 'Todo con Nu' }).accountId).toBe(
      'nu',
    );
  });
  it('uses explicit local account and date over inherited fields', () => {
    const result = resolve('Ayer almorcé por 35000 desde Bancolombia', {
      ...context,
      accountText: 'Todo con Nu',
      dateText: 'Hoy',
    });
    expect(result).toMatchObject({ accountId: 'bank', date: '2026-10-27' });
  });
  it('keeps uncertain fields empty and never creates category identifiers', () => {
    expect(
      resolve('Almuerzo 35000', { ...context, uncertainFields: ['date', 'account', 'amount'] }),
    ).toMatchObject({ date: null, accountId: null, amount: null });
    expect(
      resolve('Almuerzo 35000', { ...context, categoryText: 'Categoría desconocida' }).categoryId,
    ).toBeNull();
  });
});
