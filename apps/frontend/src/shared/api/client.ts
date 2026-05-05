import axios, { AxiosError, type AxiosInstance } from 'axios';
import { useAuthStore } from '@/shared/stores/authStore';

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refresh(): Promise<string | null> {
  try {
    const { data } = await axios.post<{ accessToken: string }>(
      `${API_BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    useAuthStore.getState().setAccessToken(data.accessToken);
    return data.accessToken;
  } catch {
    useAuthStore.getState().clear();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { __retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original.__retry) {
      original.__retry = true;
      refreshing ??= refresh();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        original.headers!.Authorization = `Bearer ${token}`;
        return api.request(original);
      }
    }
    return Promise.reject(error);
  },
);

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function getApiErrorMessage(err: unknown, fallback = 'Unexpected error'): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    return body?.error?.message ?? err.message ?? fallback;
  }
  return fallback;
}

export function getApiErrorCode(err: unknown): string | null {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    return body?.error?.code ?? null;
  }
  return null;
}
