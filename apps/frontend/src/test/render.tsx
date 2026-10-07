import type { ReactElement, ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import 'dayjs/locale/es';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { theme } from '@/styles/theme';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';

export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/',
    language = 'en',
    ...options
  }: RenderOptions & { route?: string; language?: 'en' | 'es' } = {},
) {
  const i18n = createInstance();
  void i18n.init({
    lng: language,
    fallbackLng: 'es',
    initImmediate: false,
    resources: { en: { translation: en }, es: { translation: es } },
    interpolation: { escapeValue: false },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MantineProvider theme={theme}>
        <QueryClientProvider client={queryClient}>
          <DatesProvider settings={{ locale: language }}>
            <I18nextProvider i18n={i18n}>
              <MemoryRouter
                initialEntries={[route]}
                future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
              >
                {children}
              </MemoryRouter>
            </I18nextProvider>
          </DatesProvider>
        </QueryClientProvider>
      </MantineProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}
