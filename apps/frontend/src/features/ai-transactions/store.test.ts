import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/shared/stores/authStore';
import { AI_CHAT_SESSION_KEY, encodeSession } from './session';
import { useAiChatStore } from './store';

const user = {
  id: 'user-one',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  avatarPath: null,
  preferredLanguage: 'es' as const,
  preferredTheme: 'light' as const,
};
const record = { id: 'message', message: 'Gasté 35 mil', status: 'cancelled' as const };
const signIn = (id = user.id) =>
  useAuthStore.getState().setSession({ accessToken: 'private-token', user: { ...user, id } });
beforeEach(() => {
  vi.useFakeTimers();
  useAuthStore.getState().clear();
  useAiChatStore.getState().reset();
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().clear();
  vi.useRealTimers();
});

describe('Authenticated tab-scoped chat storage', () => {
  it('waits for verified identity across the token and user bootstrap steps', () => {
    sessionStorage.setItem(AI_CHAT_SESSION_KEY, encodeSession(user.id, [record], 'Unsent'));
    useAuthStore.getState().setAccessToken('private-token');
    expect(useAiChatStore.getState().entries).toEqual([]);
    expect(sessionStorage.getItem(AI_CHAT_SESSION_KEY)).not.toBeNull();
    useAuthStore.getState().setUser(user);
    expect(useAiChatStore.getState().entries).toMatchObject([record]);
    expect(useAiChatStore.getState().input).toBe('Unsent');
  });
  it('immediately saves entry transitions without persisting authentication credentials', () => {
    signIn();
    useAiChatStore.getState().add(record);
    const text = sessionStorage.getItem(AI_CHAT_SESSION_KEY)!;
    expect(JSON.parse(text).entries).toMatchObject([record]);
    expect(text).not.toContain('private-token');
    expect(text).not.toContain(user.email);
  });
  it('coalesces typing and flushes the latest composer value on reload/navigation', () => {
    signIn();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    useAiChatStore.getState().setInput('A');
    useAiChatStore.getState().setInput('Almuerzo');
    expect(write).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(sessionStorage.getItem(AI_CHAT_SESSION_KEY)!).input).toBe('Almuerzo');
    expect(write).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it('keeps chat on access token rotation but removes it and pending writes on logout', () => {
    signIn();
    useAiChatStore.getState().add(record);
    useAuthStore.getState().setAccessToken('rotated-token');
    expect(useAiChatStore.getState().entries).toHaveLength(1);
    useAiChatStore.getState().setInput('Pending typing');
    useAuthStore.getState().clear();
    vi.advanceTimersByTime(200);
    expect(useAiChatStore.getState().entries).toEqual([]);
    expect(sessionStorage.getItem(AI_CHAT_SESSION_KEY)).toBeNull();
  });
  it('never exposes the previous user history after an account switch', () => {
    signIn();
    useAiChatStore.getState().add(record);
    signIn('user-two');
    expect(useAiChatStore.getState().entries).toEqual([]);
    expect(JSON.parse(sessionStorage.getItem(AI_CHAT_SESSION_KEY)!).userId).toBe('user-two');
    expect(sessionStorage.getItem(AI_CHAT_SESSION_KEY)).not.toContain('Gasté');
  });
  it('discards a corrupt snapshot without breaking the chat', () => {
    sessionStorage.setItem(AI_CHAT_SESSION_KEY, 'not JSON');
    signIn();
    expect(useAiChatStore.getState().entries).toEqual([]);
    expect(useAiChatStore.getState().storageAvailable).toBe(true);
  });
  it('falls back to memory and discards stale storage if the browser rejects a write', () => {
    signIn();
    useAiChatStore.getState().add(record);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    useAiChatStore.getState().update(record.id, { status: 'error', errorCode: 'AI_INTERRUPTED' });
    expect(useAiChatStore.getState().storageAvailable).toBe(false);
    expect(useAiChatStore.getState().entries[0]?.status).toBe('error');
    expect(sessionStorage.getItem(AI_CHAT_SESSION_KEY)).toBeNull();
  });
});
