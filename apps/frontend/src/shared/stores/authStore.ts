import { create } from 'zustand';
import type { User } from '@/shared/types/domain';

interface AuthState {
  accessToken: string | null;
  user: User | null;
  setSession: (input: { accessToken: string; user: User }) => void;
  setAccessToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setSession: ({ accessToken, user }) => set({ accessToken, user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  clear: () => set({ accessToken: null, user: null }),
}));
