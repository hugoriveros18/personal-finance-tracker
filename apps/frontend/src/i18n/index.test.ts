import { afterEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { z } from 'zod';
import i18n from './index';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';

afterEach(async () => {
  usePreferencesStore.getState().setLanguage('es');
  await i18n.changeLanguage('es');
});

describe('Application language preferences', () => {
  it('keeps Spanish as the initial language', () => {
    expect(usePreferencesStore.getState().language).toBe('es');
    expect(i18n.t('auth.firstName')).toBe('Nombre');
  });
  it('switches displayed copy and validation while preserving English keys', async () => {
    usePreferencesStore.getState().setLanguage('en');
    await waitFor(() => expect(i18n.language).toBe('en'));
    expect(i18n.t('auth.firstName')).toBe('First name');
    let result = z.string().min(1).safeParse('');
    if (result.success) throw new Error('Empty names must be rejected');
    expect(result.error.issues[0]?.message).toBe('This field is required');
    usePreferencesStore.getState().setLanguage('es');
    await waitFor(() => expect(i18n.language).toBe('es'));
    expect(i18n.t('movements.flow.INTER_AVAILABLE')).toBe('Entre cuentas');
    result = z.string().min(1).safeParse('');
    if (result.success) throw new Error('Empty names must be rejected');
    expect(result.error.issues[0]?.message).toBe('Este campo es obligatorio');
  });
});
