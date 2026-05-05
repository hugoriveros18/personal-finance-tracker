import { api } from '@/shared/api/client';
import type { Account } from '@/shared/types/domain';

export const accountKeys = {
  all: ['accounts'] as const,
  one: (id: string) => ['accounts', id] as const,
};

export async function listAccounts(): Promise<Account[]> {
  const { data } = await api.get<{ items: Account[] }>('/accounts');
  return data.items;
}

export async function getAccount(id: string): Promise<Account> {
  const { data } = await api.get<{ item: Account }>(`/accounts/${id}`);
  return data.item;
}

export async function createAccount(input: {
  nombre: string;
  disponible: number;
  ahorro: number;
  pasivos: number;
}): Promise<Account> {
  const { data } = await api.post<{ item: Account }>('/accounts', input);
  return data.item;
}

export async function updateAccount(id: string, input: { nombre: string }): Promise<Account> {
  const { data } = await api.patch<{ item: Account }>(`/accounts/${id}`, input);
  return data.item;
}

export async function deleteAccount(id: string): Promise<void> {
  await api.delete(`/accounts/${id}`);
}
