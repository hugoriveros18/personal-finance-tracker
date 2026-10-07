import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import es from './locales/es.json';

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof item === 'string'
        ? [[path, item]]
        : Object.entries(flatten(item as Record<string, unknown>, path));
    }),
  );
}
const english = flatten(en);
const spanish = flatten(es);

describe('Locale contracts', () => {
  it('provides the same English keys and interpolation parameters in both languages', () => {
    expect(Object.keys(english).sort()).toEqual(Object.keys(spanish).sort());
    for (const key of Object.keys(english)) {
      expect(english[key]?.trim(), key).not.toBe('');
      expect(spanish[key]?.trim(), key).not.toBe('');
      expect(english[key]?.match(/{{\w+}}/g) ?? [], key).toEqual(
        spanish[key]?.match(/{{\w+}}/g) ?? [],
      );
      expect(key).not.toMatch(
        /nombre|apellido|tipo|valor|fecha|descripcion|disponible|ahorro|pasivo|ingreso|egreso|flujo|patrimonio/i,
      );
    }
  });
  it('resolves every static translation key used by the application', () => {
    const sources = import.meta.glob('../**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    for (const [file, source] of Object.entries(sources)) {
      if (file.includes('.test.') || file.includes('/test/')) continue;
      for (const match of source.matchAll(/\bt\(['"]([\w.]+)['"]/g)) {
        expect(english[match[1]!], `${file}: ${match[1]}`).toBeDefined();
      }
    }
  });
});
