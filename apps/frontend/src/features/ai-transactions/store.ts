import { create } from 'zustand';
import { useAuthStore } from '@/shared/stores/authStore';
import type { TransactionFormValues } from '@/features/transactions/components/TransactionFields';
import type { Transaction } from '@/shared/types/domain';
import type { BatchContext, Confirmation, Draft } from './api';
import { AI_CHAT_SESSION_KEY, decodeSession, encodeSession } from './session';

export interface ChatEntry {
  id: string;
  message: string;
  status: 'queued' | 'interpreting' | 'pending' | 'confirmed' | 'cancelled' | 'error';
  batch?: {
    id: string;
    sourceMessage: string;
    referenceDate: string;
    notes: string[];
    context: BatchContext;
  };
  selected?: boolean;
  draft?: Draft;
  values?: Partial<TransactionFormValues>;
  result?: Transaction;
  errorCode?: string;
  confirmation?: { input: Confirmation; state: 'saving' | 'uncertain' };
  saveErrorCode?: string;
  cancelling?: boolean;
  receipt?: { accountName?: string; categoryName?: string };
}
interface ChatState {
  entries: ChatEntry[];
  input: string;
  storageAvailable: boolean;
  setInput: (input: string) => void;
  add: (entry: ChatEntry) => void;
  update: (id: string, patch: Partial<ChatEntry>) => void;
  replace: (id: string, entries: ChatEntry[]) => void;
  reset: () => void;
}
let ownerId: string | null = null;
let restoring = false;
let inputTimer: ReturnType<typeof setTimeout> | undefined;
const stopTimer = () => {
  clearTimeout(inputTimer);
  inputTimer = undefined;
};
const removeSession = () => {
  try {
    window.sessionStorage.removeItem(AI_CHAT_SESSION_KEY);
  } catch {
    /* Memory remains usable. */
  }
};

export const useAiChatStore = create<ChatState>((set) => ({
  entries: [],
  input: '',
  storageAvailable: true,
  setInput: (input) => set({ input }),
  add: (entry) => set((state) => ({ entries: [...state.entries, entry], input: '' })),
  update: (id, patch) =>
    set((state) => ({
      entries: state.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    })),
  replace: (id, entries) =>
    set((state) => ({
      entries: state.entries.flatMap((entry) => (entry.id === id ? entries : [entry])),
    })),
  reset: () => {
    stopTimer();
    set({ entries: [], input: '', storageAvailable: true });
    removeSession();
  },
}));

function persistSession() {
  stopTimer();
  if (!ownerId || restoring) return;
  const { entries, input } = useAiChatStore.getState();
  try {
    window.sessionStorage.setItem(AI_CHAT_SESSION_KEY, encodeSession(ownerId, entries, input));
    if (!useAiChatStore.getState().storageAvailable)
      useAiChatStore.setState({ storageAvailable: true });
  } catch {
    // Never leave an older editable snapshot behind after a failed confirmation-state write.
    removeSession();
    useAiChatStore.setState({ storageAvailable: false });
  }
}

const unsubscribeChat = useAiChatStore.subscribe((state, previous) => {
  if (restoring || !ownerId) return;
  if (state.entries !== previous.entries)
    persistSession(); // Save financial recovery states synchronously.
  else if (state.input !== previous.input) {
    stopTimer();
    inputTimer = setTimeout(persistSession, 150);
  }
});

function restoreForUser(userId: string) {
  if (ownerId === userId) return;
  stopTimer();
  ownerId = userId;
  restoring = true;
  let recovered: Pick<ChatState, 'entries' | 'input'> = { entries: [], input: '' };
  let storageAvailable = true;
  try {
    const text = window.sessionStorage.getItem(AI_CHAT_SESSION_KEY);
    if (text) {
      try {
        recovered = decodeSession(text, userId);
      } catch {
        removeSession();
      }
    }
  } catch {
    storageAvailable = false;
  }
  useAiChatStore.setState({ ...recovered, storageAvailable });
  restoring = false;
  if (storageAvailable) persistSession();
}

const unsubscribeAuth = useAuthStore.subscribe((state) => {
  if (state.accessToken && state.user) restoreForUser(state.user.id);
  else if (!state.accessToken || ownerId) {
    ownerId = null;
    useAiChatStore.getState().reset();
  }
  // An initial access token without /auth/me is bootstrap, not a verified chat owner.
});
const authenticated = useAuthStore.getState();
if (authenticated.accessToken && authenticated.user) restoreForUser(authenticated.user.id);

// Flush debounced composer edits on navigation/reload, without retaining a beforeunload handler.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persistSession);
}
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    persistSession();
    unsubscribeChat();
    unsubscribeAuth();
    window.removeEventListener('pagehide', persistSession);
  });
}
