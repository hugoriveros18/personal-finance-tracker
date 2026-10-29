import { describe, expect, it } from 'vitest';
import { calendarToday, isCalendarDate, resolveDate, resolveMessageDate } from './dates.js';
import { parseAmountText, resolveAmount } from './money.js';
import { resolveProposal, unsupportedMessage } from './resolution.js';
import { confirmSchema, type Extraction } from './schemas.js';

const accounts = [
  { id: 'a', name: 'Bancolombia' },
  { id: 'b', name: 'Efectivo' },
];
const categories = [
  { id: 'food', name: 'Alimentación', type: 'expense' as const },
  { id: 'salary', name: 'Salario', type: 'income' as const },
];
const extraction: Extraction = {
  intent: 'transaction',
  type: 'expense',
  amountText: '35 mil',
  description: 'Almuerzo',
  dateText: 'ayer',
  accountMentioned: true,
  accountName: 'bancolombia',
  categoryName: 'Alimentación',
};
const resolve = (
  patch: Partial<Extraction> = {},
  message = 'Gasté 35 mil ayer desde Bancolombia',
) => resolveProposal({ ...extraction, ...patch }, message, accounts, categories, 'b', '2026-10-27');

describe('COP interpretation boundary', () => {
  it.each([
    ['35 mil', 3_500_000],
    ['35k', 3_500_000],
    ['$35K', 3_500_000],
    ['2,5 k', 250_000],
    ['$35.000', 3_500_000],
    ['35000 pesos', 3_500_000],
    ['2,5 millones', 250_000_000],
    ['$7.500,50', 750_050],
    ['0,01 COP', 1],
    ['9999999999,99', 999_999_999_999],
  ])('converts %s to integer cents', (text, cents) => expect(parseAmountText(text)).toBe(cents));
  it.each(['-35000', '0', '1.25', '1,234', '10000000000', 'NaN', '1e6', '$35.000 y $7.000'])(
    'rejects %s',
    (text) => {
      expect(parseAmountText(text)).toBeNull();
    },
  );
  it('resolves a real expense account and category by normalized name', () => {
    expect(resolve()).toMatchObject({
      amount: 3_500_000,
      type: 'expense',
      accountId: 'a',
      categoryId: 'food',
      date: '2026-10-26',
    });
  });
  it('resolves an income category', () => {
    expect(
      resolve(
        { type: 'income', categoryName: 'Salario', amountText: '2500000', dateText: null },
        'Recibí 2500000 de salario',
      ),
    ).toMatchObject({ amount: 250_000_000, categoryId: 'salary', date: '2026-10-27' });
  });
  it('uses the default only when no account was mentioned', () => {
    expect(
      resolve({ accountMentioned: false, accountName: null }, 'Gasté 35 mil ayer'),
    ).toMatchObject({ accountId: 'b', accountSource: 'default' });
    expect(resolve({ accountName: 'Unknown' }, 'Gasté 35 mil desde Unknown')).toMatchObject({
      accountId: null,
      accountSource: 'missing',
    });
    expect(
      resolve(
        { accountMentioned: true, accountName: null },
        'Gasté 35 mil desde una cuenta desconocida',
      ).accountId,
    ).toBeNull();
  });
  it('selects a single account but leaves several accounts unresolved without a default', () => {
    const data = { ...extraction, accountMentioned: false, accountName: null };
    expect(
      resolveProposal(data, '35 mil ayer', accounts.slice(0, 1), categories, null, '2026-10-27')
        .accountSource,
    ).toBe('only');
    expect(
      resolveProposal(data, '35 mil ayer', accounts, categories, null, '2026-10-27').accountId,
    ).toBeNull();
  });
  it('leaves missing, invented and incompatible values unresolved', () => {
    expect(resolve({ amountText: null, categoryName: 'Unknown', type: null })).toMatchObject({
      amount: null,
      categoryId: null,
      type: null,
    });
    expect(resolve({ categoryName: 'Salario' }).categoryId).toBeNull();
    expect(resolve({ amountText: '99999' }).amount).toBeNull();
    expect(resolve({ dateText: '2026-10-01' }).date).toBe('2026-10-26');
  });
  it('does not accept partial numbers, stripped negatives or invented named accounts', () => {
    expect(resolve({ amountText: '35000' }, 'Gasté -35000 pesos').amount).toBeNull();
    expect(resolve({ amountText: '35000' }, 'Gasté menos 35000 pesos').amount).toBeNull();
    expect(resolve({ amountText: '35000' }, 'Gasté 350000 pesos').amount).toBeNull();
    expect(resolve({ amountText: '35' }, 'Gasté 35 mil').amount).toBeNull();
    expect(resolve({}, 'Gasté 35 mil').accountId).toBe('b');
    expect(resolve({ dateText: '2026-10-27' }, 'Gasté 35 mil').date).toBe('2026-10-27');
    expect(resolve({ dateText: null }, 'Gasté 35 mil el lunes').date).toBeNull();
  });
  it('requires selection for names that become ambiguous after normalization', () => {
    expect(
      resolveProposal(
        extraction,
        '35 mil ayer desde Bancolombia',
        [...accounts, { id: 'c', name: 'BANCOLOMBIA' }],
        categories,
        'b',
        '2026-10-27',
      ).accountId,
    ).toBeNull();
  });
  it.each([
    'Transferí 35 mil',
    'Ahorré 10000',
    'Pagué mi deuda',
    'Pagué mi tarjeta de crédito',
    'Aboné 100000 a mi pasivo',
    'Recibí un reembolso en mi tarjeta de crédito',
    'Borra el gasto',
    'Gasté 100 y pagué 200',
  ])('guards excluded intent: %s', (message) => {
    expect(unsupportedMessage(message)).toBe(true);
  });
  it('recovers compact amounts from source text without accepting stripped negatives or ambiguity', () => {
    expect(resolveAmount('Gaste 35k en un almuerzo', '35000')).toBe(3_500_000);
    expect(resolveAmount('Gaste 35k en un almuerzo', null)).toBe(3_500_000);
    for (const message of [
      'Gaste -35k',
      'Gaste menos 35k',
      'Gaste 35k y 20k',
      'Gaste 35k y 1000',
      'Recorri 35km',
    ]) {
      expect(resolveAmount(message, null)).toBeNull();
    }
    expect(resolveAmount('Gaste 35k', '99999')).toBeNull();
    expect(resolveAmount('Gaste 35k', '35')).toBeNull();
  });
  it.each([
    'Compré comida por 35 mil con tarjeta de crédito',
    'Pagué 35 mil con mi tarjeta de crédito',
    'Registra un pasivo de 35 mil',
    'Compré comida a crédito por 35 mil',
  ])('resolves credit purchases with an existing expense category: %s', (message) => {
    expect(unsupportedMessage(message)).toBe(false);
    expect(resolve({}, message)).toMatchObject({
      type: 'liability',
      categoryId: 'food',
      amount: 3_500_000,
    });
  });
  it('defaults ordinary purchases to expense even if the model invents credit', () => {
    expect(resolve({ type: 'liability' }, 'Gasté 35 mil en almuerzo')).toMatchObject({
      type: 'expense',
      categoryId: 'food',
    });
    expect(
      resolve({ type: 'liability' }, 'Gasté 35 mil; no fue con tarjeta de crédito'),
    ).toMatchObject({ type: 'expense' });
  });
  it('never leaves a sparse message description empty', () => {
    expect(
      resolve(
        { type: 'income', description: null, categoryName: 'Salario', amountText: '1000000' },
        'Recibi un salario por 1000000',
      ).description,
    ).toBe('Salario');
    expect(resolve({ description: ' ', categoryName: null }, 'Gasté 35 mil').description).toBe(
      'Gasté 35 mil',
    );
    expect(resolve({ description: null }).description).toBe('Alimentación');
  });
});

describe('Calendar date interpretation', () => {
  it('uses Bogota today at the UTC day boundary', () => {
    expect(calendarToday(new Date('2026-10-28T02:00:00Z'), 'America/Bogota')).toBe('2026-10-27');
  });
  it('handles month/year boundaries and leap days', () => {
    expect(resolveDate('ayer', '2026-01-01')).toBe('2025-12-31');
    expect(resolveDate('ayer', '2024-03-01')).toBe('2024-02-29');
    expect(resolveDate(null, '2026-10-27')).toBe('2026-10-27');
    expect(resolveDate('hoy', '2026-10-27')).toBe('2026-10-27');
    expect(resolveDate('2026-10-01', '2026-10-27')).toBe('2026-10-01');
  });
  it.each([
    ['el viernes pasado', '2026-10-27', '2026-10-23'],
    ['el viernes pasado', '2026-10-30', '2026-10-23'],
    ['el último miércoles', '2026-10-27', '2026-10-21'],
    ['el pasado domingo', '2026-01-01', '2025-12-28'],
    ['jueves anterior', '2024-03-01', '2024-02-29'],
    ['viernes de la semana pasada', '2026-11-01', '2026-10-23'],
    ['anteayer', '2026-01-01', '2025-12-30'],
  ])('resolves %s relative to %s', (expression, today, expected) => {
    expect(resolveDate(expression, today)).toBe(expected);
    expect(resolveMessageDate(`Pagué 15000 ${expression}`, null, today).date).toBe(expected);
  });
  it('rejects conflicting or ambiguous dates even if the model chooses one', () => {
    for (const message of [
      'Pagué ayer o el viernes pasado',
      'Pagué hoy o el lunes',
      'Pagué el viernes',
      'Pagué el mes pasado',
    ]) {
      expect(resolveMessageDate(message, 'hoy', '2026-10-27')).toEqual({
        date: null,
        dateSource: 'missing',
      });
    }
  });
  it.each(['2026-02-30', '2026-13-01', '2026-00-01', 'tomorrow'])(
    'rejects invalid calendar dates: %s',
    (value) => {
      expect(isCalendarDate(value)).toBe(false);
    },
  );
  it('rejects invalid and out-of-scope confirmation payloads', () => {
    expect(confirmSchema.safeParse({ type: 'liability' }).success).toBe(false);
    expect(
      confirmSchema.safeParse({ description: ' ', date: '2026-02-30', amount: -1 }).success,
    ).toBe(false);
  });
});
