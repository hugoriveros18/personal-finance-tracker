import axios from 'axios';
import { api, API_BASE_URL } from '@/shared/api/client';
import type { User } from '@/shared/types/domain';
import { useAuthStore } from '@/shared/stores/authStore';

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export async function register(input: {
  nombre: string;
  apellidos: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/register', input);
  useAuthStore.getState().setSession({ accessToken: data.accessToken, user: data.user });
  return data;
}

export async function login(input: { email: string; password: string }): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', input);
  useAuthStore.getState().setSession({ accessToken: data.accessToken, user: data.user });
  return data;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // ignore
  } finally {
    useAuthStore.getState().clear();
  }
}

export async function tryRefreshSession(): Promise<boolean> {
  try {
    const { data } = await axios.post<{ accessToken: string }>(
      `${API_BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    useAuthStore.getState().setAccessToken(data.accessToken);
    const me = await api.get<{ user: User }>('/auth/me');
    useAuthStore.getState().setUser(me.data.user);
    return true;
  } catch {
    useAuthStore.getState().clear();
    return false;
  }
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<{ user: User }>('/auth/me');
  return data.user;
}
