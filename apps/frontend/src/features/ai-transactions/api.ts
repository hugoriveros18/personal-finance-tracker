import { api } from '@/shared/api/client';
import type { Transaction } from '@/shared/types/domain';

export interface Proposal {
  type: 'income' | 'expense' | 'liability' | null;
  amount: number | null;
  description: string;
  date: string | null;
  accountId: string | null;
  categoryId: string | null;
  accountSource: 'mentioned' | 'default' | 'only' | 'missing';
  dateSource: 'mentioned' | 'today' | 'missing';
}
export interface Draft {
  id: string;
  proposal: Proposal;
  expiresAt: string;
  result?: Transaction;
}
export interface Confirmation {
  type: 'income' | 'expense' | 'liability';
  amount: number;
  description: string;
  date: string;
  accountId: string;
  categoryId: string;
}

export async function getAiCapabilities(): Promise<{
  enabled: boolean;
  maxMessageLength?: number;
}> {
  return (await api.get('/ai-transactions/capabilities')).data;
}
export interface BatchContext {
  dateText: string | null;
  accountText: string | null;
  categoryText: string | null;
  paymentText: string | null;
}
export interface OrganizedBatch {
  id: string;
  message: string;
  referenceDate: string;
  notes: string[];
  items: { id: string; sourceText: string; context: BatchContext; kind: string }[];
}
export async function interpretTransaction(
  message: string,
  signal?: AbortSignal,
  requestId: string = crypto.randomUUID(),
): Promise<Draft | OrganizedBatch> {
  const { data } = await api.post<{ draft?: Draft; batch?: OrganizedBatch; result?: Transaction }>(
    '/ai-transactions/interpret',
    { message, requestId },
    { signal },
  );
  return data.batch ?? { ...data.draft!, ...(data.result ? { result: data.result } : {}) };
}
export async function prepareBatchItem(
  batchId: string,
  itemId: string,
  signal?: AbortSignal,
): Promise<{ draft: Draft; result: Transaction | null }> {
  return (
    await api.post(`/ai-transactions/batches/${batchId}/items/${itemId}/interpret`, {}, { signal })
  ).data;
}
export async function cancelBatchItem(batchId: string, itemId: string): Promise<void> {
  await api.post(`/ai-transactions/batches/${batchId}/items/${itemId}/cancel`);
}
export async function confirmTransaction(id: string, input: Confirmation): Promise<Transaction> {
  return (await api.post<{ item: Transaction }>(`/ai-transactions/${id}/confirm`, input)).data.item;
}
export async function cancelDraft(id: string): Promise<void> {
  await api.post(`/ai-transactions/${id}/cancel`);
}
