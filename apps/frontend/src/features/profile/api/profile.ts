import { api } from '@/shared/api/client';
import type { User } from '@/shared/types/domain';

export async function patchProfile(input: {
  nombre?: string;
  apellidos?: string;
  email?: string;
  preferredLanguage?: 'es' | 'en';
  preferredTheme?: 'light' | 'dark';
}): Promise<User> {
  const { data } = await api.patch<{ user: User }>('/me', input);
  return data.user;
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await api.post('/me/password', input);
}

export async function uploadAvatar(file: Blob): Promise<{ avatarPath: string; user: User }> {
  const fd = new FormData();
  fd.append('file', file, 'avatar');
  const { data } = await api.post<{ avatarPath: string; user: User }>('/me/avatar', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteAvatar(): Promise<void> {
  await api.delete('/me/avatar');
}
