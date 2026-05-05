import { api } from '@/shared/api/client';
import type { Paginated, Transaction, TransactionTipo } from '@/shared/types/domain';

export interface TransactionsListResponse extends Paginated<Transaction> {
  totals: { ingreso: number; egreso: number; pasivo: number };
}

export const transactionKeys = {
  all: ['transactions'] as const,
  list: (params: Record<string, unknown>) => ['transactions', 'list', params] as const,
};

export async function listTransactions(
  params: Record<string, string | number | undefined>,
): Promise<TransactionsListResponse> {
  const { data } = await api.get<TransactionsListResponse>('/transactions', { params });
  return data;
}

export async function createTransaction(input: {
  descripcion: string;
  fecha: string;
  tipo: TransactionTipo;
  valor: number;
  accountId: string;
  categoryId: string;
}): Promise<Transaction> {
  const { data } = await api.post<{ item: Transaction }>('/transactions', input);
  return data.item;
}

export async function updateTransaction(
  id: string,
  input: Partial<{
    descripcion: string;
    fecha: string;
    tipo: TransactionTipo;
    valor: number;
    accountId: string;
    categoryId: string;
  }>,
): Promise<Transaction> {
  const { data } = await api.patch<{ item: Transaction }>(`/transactions/${id}`, input);
  return data.item;
}

export async function deleteTransaction(id: string): Promise<void> {
  await api.delete(`/transactions/${id}`);
}
