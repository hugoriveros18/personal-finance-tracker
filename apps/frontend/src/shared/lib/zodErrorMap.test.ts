import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import i18n from 'i18next';
import { buildZodErrorMap } from './zodErrorMap';
import es from '@/i18n/locales/es.json';
import en from '@/i18n/locales/en.json';

beforeAll(async () => {
  await i18n.init({
    lng: 'es',
    fallbackLng: 'es',
    resources: { es: { translation: es }, en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  z.setErrorMap(buildZodErrorMap(i18n));
});

afterAll(() => {
  // Restore Zod's built-in error map so other test files aren't affected.
  z.setErrorMap((issue, ctx) => ({ message: ctx.defaultError }));
});

describe('zodErrorMap (es)', () => {
  it('translates empty strings as required fields', () => {
    const r = z.string().min(1).safeParse('');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Este campo es obligatorio');
  });

  it('translates missing required strings', () => {
    const r = z.string().safeParse(undefined);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Este campo es obligatorio');
  });

  it('translates the minimum string length', () => {
    const r = z.string().min(8).safeParse('abc');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Mínimo 8 caracteres');
  });

  it('translates invalid email errors', () => {
    const r = z.string().email().safeParse('not-an-email');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Correo inválido');
  });

  it('preserves custom messages set on the schema', () => {
    const r = z.number().max(100, 'Exceeds available balance').safeParse(200);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Exceeds available balance');
  });
});

describe('zodErrorMap (en)', () => {
  it('switches messages when i18n changes language', async () => {
    await i18n.changeLanguage('en');
    z.setErrorMap(buildZodErrorMap(i18n));
    const r = z.string().min(1).safeParse('');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('This field is required');
    await i18n.changeLanguage('es');
    z.setErrorMap(buildZodErrorMap(i18n));
  });
});
