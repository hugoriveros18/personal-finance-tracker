import { useEffect, useMemo } from 'react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { theme } from '@/styles/theme';
import { routes } from './routes';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createBrowserRouter(routes);

export function App() {
  const language = usePreferencesStore((s) => s.language);
  const themeMode = usePreferencesStore((s) => s.theme);

  // Keep <html> dir/lang in sync
  useEffect(() => {
    document.documentElement.setAttribute('lang', language);
  }, [language]);

  // Keep Mantine color scheme in sync with the store
  useEffect(() => {
    document.documentElement.setAttribute('data-mantine-color-scheme', themeMode);
  }, [themeMode]);

  const colorScheme = useMemo(() => themeMode, [themeMode]);

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} defaultColorScheme={colorScheme} forceColorScheme={colorScheme}>
        <ModalsProvider>
          <Notifications position="top-right" />
          <RouterProvider router={router} />
        </ModalsProvider>
      </MantineProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
