import { describe, expect, it } from 'vitest';
import { decodeSession, encodeSession, MAX_SESSION_LENGTH } from './session';
import type { ChatEntry } from './store';

const userId = 'user-one';
const input = {
  type: 'expense' as const,
  amount: 3_500_000,
  description: 'Almuerzo',
  date: '2026-10-27',
  accountId: 'account',
  categoryId: 'category',
};
const pending: ChatEntry = {
  id: 'message',
  message: 'Gasté 35 mil',
  status: 'pending',
  draft: {
    id: 'draft',
    expiresAt: '2026-10-27T20:30:00Z',
    proposal: { ...input, accountSource: 'default', dateSource: 'today' },
  },
};
const now = Date.parse('2026-10-27T20:00:00Z');
const restore = (entries: ChatEntry[], at = now) =>
  decodeSession(encodeSession(userId, entries, 'Next message'), userId, at);

describe('Chat session serialization and safe recovery', () => {
  it('preserves receipts, unfinished input and COP cents', () => {
    const confirmed: ChatEntry = {
      ...pending,
      status: 'confirmed',
      result: { ...input, id: 'saved', categoryType: 'expense', createdAt: '', updatedAt: '' },
      receipt: { accountName: 'Bancolombia', categoryName: 'Alimentación' },
    };
    const saved = restore([confirmed]);
    expect(saved.input).toBe('Next message');
    expect(saved.entries[0]).toMatchObject({
      status: 'confirmed',
      result: { amount: 3_500_000 },
      receipt: confirmed.receipt,
    });
  });
  it('serializes edited dates as calendar days and restores Date objects', () => {
    const values = { ...input, date: new Date(2026, 9, 23) };
    const text = encodeSession(userId, [{ ...pending, values }], '');
    expect(JSON.parse(text).entries[0].values.date).toBe('2026-10-23');
    const date = decodeSession(text, userId, now).entries[0]!.values!.date!;
    expect(date).toBeInstanceOf(Date);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 23]);
  });
  it('preserves intentionally cleared fields without replacing untouched fields', () => {
    const recovered = restore([
      { ...pending, values: { date: undefined, amount: undefined, categoryId: '' } },
    ]).entries[0]!;
    expect(recovered.values).toEqual({ date: undefined, amount: undefined, categoryId: '' });
    expect(Object.hasOwn(recovered.values!, 'description')).toBe(false);
  });
  it('converts interrupted interpretation into a retryable error without another request', () => {
    expect(
      restore([{ id: 'message', message: 'Gasté 35 mil', status: 'interpreting' }]).entries[0],
    ).toMatchObject({ status: 'error', errorCode: 'AI_INTERRUPTED' });
  });
  it.each(['saving', 'uncertain'] as const)(
    'freezes a %s confirmation with its exact payload even after expiry',
    (state) => {
      const recovered = restore([{ ...pending, confirmation: { input, state } }], now + 86_400_000)
        .entries[0]!;
      expect(recovered.status).toBe('pending');
      expect(recovered.confirmation).toEqual({ input, state: 'uncertain' });
    },
  );
  it('expires an unsubmitted draft without allowing registration from a stale form', () => {
    expect(restore([pending], now + 86_400_000).entries[0]).toMatchObject({
      status: 'error',
      errorCode: 'AI_DRAFT_INACTIVE',
    });
  });
  it('unlocks interrupted cancellation for an explicit retry only', () => {
    expect(restore([{ ...pending, cancelling: true }]).entries[0]).toMatchObject({
      status: 'pending',
      cancelling: false,
      saveErrorCode: 'AI_INTERRUPTED',
    });
  });
  it('rejects another user, unsupported versions, invalid dates and malformed recovery state', () => {
    const text = encodeSession(userId, [pending], '');
    expect(() => decodeSession(text, 'user-two', now)).toThrow();
    for (const patch of [
      { version: 2 },
      { entries: [{ id: 'a', message: '', status: 'confirmed' }] },
      {
        entries: [
          {
            ...pending,
            draft: {
              ...pending.draft,
              proposal: { ...pending.draft!.proposal, date: '2026-02-30' },
            },
          },
        ],
      },
    ]) {
      expect(() =>
        decodeSession(JSON.stringify({ ...JSON.parse(text), ...patch }), userId, now),
      ).toThrow();
    }
    expect(() => decodeSession('not JSON', userId, now)).toThrow();
    expect(() => decodeSession(' '.repeat(MAX_SESSION_LENGTH + 1), userId, now)).toThrow();
  });
  it('persists only the explicit data schema, excluding tokens and arbitrary properties', () => {
    const text = encodeSession(
      userId,
      [{ ...pending, accessToken: 'never-store' } as ChatEntry],
      '',
    );
    expect(text).not.toContain('never-store');
    expect(text).not.toContain('accessToken');
  });
});

it('preserves collection grouping, incomplete rows and individual confirmation recovery', () => {
  const batch = {
    id: 'batch',
    sourceMessage: 'Hoy: café y bus',
    referenceDate: '2026-10-27',
    notes: ['Total 35000'],
    context: { dateText: 'Hoy', accountText: null, categoryText: null, paymentText: null },
  };
  const entries: ChatEntry[] = [
    { ...pending, id: 'one', batch, confirmation: { input, state: 'saving' } },
    { id: 'two', message: 'bus', status: 'queued', batch },
    { ...pending, id: 'three', batch, selected: true },
  ];
  const recovered = restore(entries).entries;
  expect(recovered.map((entry) => entry.batch)).toEqual([batch, batch, batch]);
  expect(recovered[0]!.confirmation).toEqual({ input, state: 'uncertain' });
  expect(recovered[1]!.status).toBe('queued');
  expect(recovered[2]!.selected).toBe(true);
});
