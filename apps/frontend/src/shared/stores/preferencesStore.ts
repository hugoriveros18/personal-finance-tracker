import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark';
export type Language = 'es' | 'en';

interface PreferencesState {
  theme: ThemeMode;
  language: Language;
  setTheme: (t: ThemeMode) => void;
  setLanguage: (l: Language) => void;
}

const detectInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-mantine-color-scheme');
  if (attr === 'dark' || attr === 'light') return attr;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: detectInitialTheme(),
      language: 'es',
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
    }),
    { name: 'pft.preferences' },
  ),
);
