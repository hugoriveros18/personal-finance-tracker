import axios from 'axios';
import type { QueryClient } from '@tanstack/react-query';
import { accountKeys } from '@/features/accounts/api/accounts';
import { categoryKeys } from '@/features/categories/api/categories';
import { transactionKeys } from '@/features/transactions/api/transactions';
import {
  transactionFormSchema,
  type TransactionFormValues,
} from '@/features/transactions/components/TransactionFields';
import { getApiErrorCode } from '@/shared/api/client';
import { parseApiDate, toISODate } from '@/shared/lib/dates';
import { useAuthStore } from '@/shared/stores/authStore';
import type { Account, Category } from '@/shared/types/domain';
import { confirmTransaction, prepareBatchItem, type Confirmation } from './api';
import { useAiChatStore, type ChatEntry } from './store';

export function entryValues(entry: ChatEntry): Partial<TransactionFormValues> {
  const proposal = entry.draft?.proposal;
  return {
    ...(proposal && {
      ...proposal,
      type: proposal.type ?? undefined,
      amount: proposal.amount ?? undefined,
      date: proposal.date ? parseApiDate(proposal.date) : undefined,
      accountId: proposal.accountId ?? '',
      categoryId: proposal.categoryId ?? '',
    }),
    ...entry.values,
    ...(entry.confirmation && {
      ...entry.confirmation.input,
      date: parseApiDate(entry.confirmation.input.date),
    }),
  };
}
export function entryConfirmation(entry: ChatEntry): Confirmation | null {
  if (entry.status !== 'pending' || entry.confirmation || entry.cancelling) return null;
  const parsed = transactionFormSchema.safeParse(entryValues(entry));
  return parsed.success ? { ...parsed.data, date: toISODate(parsed.data.date) } : null;
}

/** Both individual and collection confirmation use the same persisted recovery snapshot. */
export async function registerEntry(id: string, input: Confirmation, qc: QueryClient) {
  const store = useAiChatStore.getState();
  const entry = store.entries.find((item) => item.id === id);
  if (
    !entry?.draft ||
    entry.status !== 'pending' ||
    entry.confirmation?.state === 'saving' ||
    entry.cancelling
  )
    return 'skipped';
  const owner = useAuthStore.getState().user?.id;
  store.update(id, {
    confirmation: { input: { ...input }, state: 'saving' },
    saveErrorCode: undefined,
  });
  const stillOwned = () =>
    useAuthStore.getState().user?.id === owner &&
    useAiChatStore.getState().entries.some((item) => item.id === id);
  try {
    const result = await confirmTransaction(entry.draft.id, input);
    if (!stillOwned()) return 'skipped';
    const accountName = qc
      .getQueryData<Account[]>(accountKeys.all)
      ?.find((item) => item.id === input.accountId)?.name;
    const categoryName = qc
      .getQueryData<Category[]>(categoryKeys.all)
      ?.find((item) => item.id === input.categoryId)?.name;
    store.update(id, {
      status: 'confirmed',
      result,
      confirmation: undefined,
      selected: false,
      receipt: { accountName, categoryName },
    });
    await Promise.allSettled([
      qc.invalidateQueries({ queryKey: transactionKeys.all }),
      qc.invalidateQueries({ queryKey: accountKeys.all }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
    return 'confirmed';
  } catch (error) {
    if (!stillOwned()) return 'skipped';
    const code = getApiErrorCode(error) ?? 'UNKNOWN';
    if (['AI_DRAFT_CONSUMED', 'AI_DRAFT_CONFLICT', 'AI_DRAFT_INACTIVE'].includes(code)) {
      store.update(id, {
        status: 'error',
        errorCode: code,
        confirmation: undefined,
        selected: false,
      });
    } else if (axios.isAxiosError(error) && error.response && error.response.status < 500) {
      store.update(id, { confirmation: undefined, saveErrorCode: code, selected: false });
    } else {
      store.update(id, { confirmation: { input: { ...input }, state: 'uncertain' } });
      return 'uncertain';
    }
    return 'error';
  }
}

export async function prepareBatch(batchId: string, signal: AbortSignal) {
  const owner = useAuthStore.getState().user?.id;
  const ids = useAiChatStore
    .getState()
    .entries.filter(
      (entry) =>
        entry.batch?.id === batchId &&
        (entry.status === 'queued' ||
          (entry.status === 'error' &&
            !entry.draft &&
            entry.errorCode !== 'AI_UNSUPPORTED' &&
            entry.errorCode !== 'AI_NEEDS_CLARIFICATION')),
    )
    .map((entry) => entry.id);
  for (const id of ids) {
    if (signal.aborted || useAuthStore.getState().user?.id !== owner) break;
    const { update, entries } = useAiChatStore.getState();
    const current = entries.find((entry) => entry.id === id);
    if (!current || current.status === 'cancelled') continue;
    update(id, { status: 'interpreting', errorCode: undefined });
    try {
      const { draft, result } = await prepareBatchItem(batchId, id, signal);
      if (signal.aborted || useAuthStore.getState().user?.id !== owner) break;
      const proposed = { ...current, draft, status: 'pending' as const };
      update(
        id,
        result
          ? { status: 'confirmed', draft, result, selected: false }
          : { status: 'pending', draft, selected: Boolean(entryConfirmation(proposed)) },
      );
    } catch (error) {
      if (useAuthStore.getState().user?.id !== owner) break;
      update(id, {
        status: 'error',
        errorCode: signal.aborted ? 'AI_INTERRUPTED' : (getApiErrorCode(error) ?? 'UNKNOWN'),
        selected: false,
      });
      if (signal.aborted) break;
    } finally {
      const latest = useAiChatStore.getState().entries.find((entry) => entry.id === id);
      if (signal.aborted && latest?.status === 'interpreting')
        update(id, { status: 'error', errorCode: 'AI_INTERRUPTED' });
    }
  }
}
