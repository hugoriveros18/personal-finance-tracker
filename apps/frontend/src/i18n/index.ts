import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { z } from 'zod';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { buildZodErrorMap } from '@/shared/lib/zodErrorMap';
import es from './locales/es.json';
import en from './locales/en.json';

const language = usePreferencesStore.getState().language;

void i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: language,
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
  returnNull: false,
});

z.setErrorMap(buildZodErrorMap(i18n));
i18n.on('languageChanged', () => {
  z.setErrorMap(buildZodErrorMap(i18n));
});

usePreferencesStore.subscribe((state, prev) => {
  if (state.language !== prev.language) {
    void i18n.changeLanguage(state.language);
  }
});

export default i18n;
