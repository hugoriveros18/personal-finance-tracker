import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import i18n from 'i18next';
import { buildZodErrorMap } from './zodErrorMap';

beforeAll(async () => {
  await i18n.init({
    lng: 'es',
    fallbackLng: 'es',
    resources: {
      es: {
        translation: {
          validation: {
            required: 'Este campo es obligatorio',
            stringMin: 'Mínimo {{min}} caracteres',
            stringMax: 'Máximo {{max}} caracteres',
            numberMin: 'El valor mínimo es {{min}}',
            numberMax: 'El valor máximo es {{max}}',
            email: 'Correo inválido',
            invalid: 'Valor inválido',
          },
        },
      },
      en: {
        translation: {
          validation: {
            required: 'This field is required',
            stringMin: 'At least {{min}} characters',
            email: 'Invalid email',
          },
        },
      },
    },
    interpolation: { escapeValue: false },
  });
  z.setErrorMap(buildZodErrorMap(i18n));
});

afterAll(() => {
  // Restore Zod's built-in error map so other test files aren't affected.
  z.setErrorMap((issue, ctx) => ({ message: ctx.defaultError }));
});

describe('zodErrorMap (es)', () => {
  it('maps "" to "Este campo es obligatorio" via min(1) on string', () => {
    const r = z.string().min(1).safeParse('');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Este campo es obligatorio');
  });

  it('maps undefined required string to "Este campo es obligatorio"', () => {
    const r = z.string().safeParse(undefined);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Este campo es obligatorio');
  });

  it('maps min(N) for N>1 to "Mínimo N caracteres"', () => {
    const r = z.string().min(8).safeParse('abc');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Mínimo 8 caracteres');
  });

  it('maps invalid email to "Correo inválido"', () => {
    const r = z.string().email().safeParse('not-an-email');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Correo inválido');
  });

  it('preserves custom messages set on the schema', () => {
    const r = z.number().max(100, 'Excede el disponible').safeParse(200);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Excede el disponible');
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
