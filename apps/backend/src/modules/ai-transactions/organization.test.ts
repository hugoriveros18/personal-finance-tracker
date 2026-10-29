import { describe, expect, it } from 'vitest';
import { validateOrganization, scopedMessage, canUseSingleFlow } from './organization.js';
import { resolveDate, resolveMessageDate } from './dates.js';
import type { OrganizationContext } from './schemas.js';

const empty: OrganizationContext = {
  dateText: null,
  accountText: null,
  categoryText: null,
  paymentText: null,
  uncertainFields: [],
};
const operation = (text: string, context = empty) => ({ text, kind: 'transaction', context });
const accounts = [{ name: 'Nu' }, { name: 'Bancolombia' }];
const categories = [{ name: 'Transporte' }, { name: 'Mercado' }];

describe('Free-form organization and source grounding', () => {
  it('keeps shared dates, accounts and categories across grouped operations', () => {
    const message = 'Hoy, todo con Nu:\nTransporte:\nUber 15k\nBus 3200';
    const context = {
      ...empty,
      dateText: 'Hoy',
      accountText: 'todo con Nu',
      categoryText: 'Transporte',
    };
    const result = validateOrganization(message, {
      items: [operation('Uber 15k', context), operation('Bus 3200', context)],
      notes: [],
    });
    expect(result.items).toHaveLength(2);
    expect(
      scopedMessage(
        result.items[1]!.text,
        result.items[1]!.context,
        accounts,
        categories,
        '2026-10-28',
      ),
    ).toBe('Hoy\ntodo con Nu\nTransporte\nBus 3200');
  });
  it('supports several operations in prose without a line delimiter', () => {
    expect(
      validateOrganization('Gasté 15k en Uber y 7500 en un café', {
        items: [operation('Gasté 15k en Uber'), operation('7500 en un café')],
        notes: [],
      }).items,
    ).toHaveLength(2);
  });
  it('preserves repeated real purchases as distinct occurrences', () => {
    const items = [operation('Uber 15k'), operation('Uber 15k')];
    expect(validateOrganization('Uber 15k; Uber 15k', { items, notes: [] }).items).toHaveLength(2);
    expect(() => validateOrganization('Uber 15k', { items, notes: [] })).toThrow();
  });
  it.each([
    { items: [operation('Uber 35000')], notes: [] },
    { items: [operation('Uber 35k', { ...empty, accountText: 'Nu' })], notes: [] },
    { items: [operation('Uber 35k')], notes: ['invented note'] },
    { items: [] },
  ])('rejects fabricated text or context and invalid schemas', (value) => {
    expect(() => validateOrganization('Uber 35k', value)).toThrow();
  });
  it('retains uncovered monetary information as a record needing clarification', () => {
    const result = validateOrganization('Uber 15k\nCafé 7500', {
      items: [operation('Uber 15k')],
      notes: [],
    });
    expect(result.items[1]).toMatchObject({ text: 'Café 7500', kind: 'unclear' });
  });
  it('does not turn totals into additional financial records', () => {
    expect(
      validateOrganization('Uber 15k. Total 15k', {
        items: [operation('Uber 15k')],
        notes: ['Total 15k'],
      }).items,
    ).toHaveLength(1);
  });
  it('keeps UTF-16 source offsets consistent when a message includes emoji', () => {
    expect(
      validateOrganization('☕🚕 Uber 15k', { items: [operation('Uber 15k')], notes: [] }).items,
    ).toHaveLength(1);
  });
  it('uses local explicit values over shared date, category, payment and account context', () => {
    const source = 'Ayer compré Mercado 35k de contado desde Bancolombia';
    expect(
      scopedMessage(
        source,
        {
          ...empty,
          dateText: 'Hoy',
          accountText: 'Todo con Nu',
          categoryText: 'Transporte',
          paymentText: 'con tarjeta de crédito',
        },
        accounts,
        categories,
        '2026-10-28',
      ),
    ).toBe(source);
  });
  it('keeps a mentioned but unresolved date instead of defaulting it to today', () => {
    const scoped = scopedMessage(
      'Uber 15k el martes',
      { ...empty, dateText: 'Hoy' },
      accounts,
      categories,
      '2026-10-28',
    );
    expect(resolveMessageDate(scoped, null, '2026-10-28')).toEqual({
      date: null,
      dateSource: 'missing',
    });
  });
});

describe('Calendar dates in freely grouped messages', () => {
  it.each([
    ['20/10/2026', '2026-10-20'],
    ['1-2-2026', '2026-02-01'],
    ['29/02/2028', '2028-02-29'],
    ['31/02/2026', null],
    ['hace 10 días', '2026-10-18'],
    ['hace 2 semanas', '2026-10-14'],
    ['el viernes pasado', '2026-10-23'],
  ])('resolves %s deterministically', (text, expected) => {
    expect(resolveDate(text, '2026-10-28')).toBe(expected);
    expect(resolveMessageDate(`Gasté 35k ${text}`, null, '2026-10-28').date).toBe(expected);
  });
});

it('rejects source spans that drop a negative sign before an amount', () => {
  expect(() =>
    validateOrganization('Gasté -35k en comida', {
      items: [operation('35k en comida')],
      notes: [],
    }),
  ).toThrow();
});

it('keeps simple single messages fast without imposing a layout on other messages', () => {
  expect(canUseSingleFlow('Gasté 35k en un almuerzo con Nu')).toBe(true);
  expect(canUseSingleFlow('Recibí un salario por 1000000')).toBe(true);
  for (const message of [
    'Hoy:\nUber 15k',
    'Gasté 15k en Uber y 7500 en un café',
    'Transporte: bus 3200',
    'Gasté 15k; recibí un salario',
    'Compré dos cafés por 7500 cada uno',
  ])
    expect(canUseSingleFlow(message)).toBe(false);
});
