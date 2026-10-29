import { z } from 'zod';
import { parseApiDate, toISODate } from '@/shared/lib/dates';
import type { ChatEntry } from './store';

export const AI_CHAT_SESSION_KEY = 'pft.ai-chat.v1';
export const MAX_SESSION_LENGTH = 1_000_000;
const type = z.enum(['income', 'expense', 'liability']);
const id = z.string().min(1).max(100);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !value.startsWith('0000') &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
const money = z.number().int().positive().max(999_999_999_999);
const confirmation = z.object({
  type,
  amount: money,
  description: z.string().trim().min(1).max(200),
  date,
  accountId: id,
  categoryId: id,
});
const entry = z
  .object({
    id,
    message: z.string().max(6000),
    status: z.enum(['queued', 'interpreting', 'pending', 'confirmed', 'cancelled', 'error']),
    selected: z.boolean().optional(),
    batch: z
      .object({
        id,
        sourceMessage: z.string().max(6000),
        referenceDate: date,
        notes: z.array(z.string().max(2000)).max(30),
        context: z.object({
          dateText: z.string().nullable(),
          accountText: z.string().nullable(),
          categoryText: z.string().nullable(),
          paymentText: z.string().nullable(),
        }),
      })
      .optional(),
    draft: z
      .object({
        id,
        expiresAt: z.string().datetime({ offset: true }),
        proposal: z.object({
          type: type.nullable(),
          amount: money.nullable(),
          description: z.string().max(200),
          date: date.nullable(),
          accountId: id.nullable(),
          categoryId: id.nullable(),
          accountSource: z.enum(['mentioned', 'default', 'only', 'missing']),
          dateSource: z.enum(['mentioned', 'today', 'missing']),
        }),
      })
      .optional(),
    // Preserve incomplete edits; the registration form and server validate them again.
    values: z
      .object({
        type: type.nullable().optional(),
        amount: z.number().finite().nullable().optional(),
        description: z.string().max(10_000).optional(),
        date: date.nullable().optional(),
        accountId: z.string().max(100).optional(),
        categoryId: z.string().max(100).optional(),
      })
      .optional(),
    result: confirmation
      .extend({
        id,
        categoryType: z.enum(['income', 'expense']),
        date: z
          .string()
          .refine(
            (value) =>
              date.safeParse(value.slice(0, 10)).success &&
              Number.isFinite(new Date(value).getTime()),
          ),
        createdAt: z.string(),
        updatedAt: z.string(),
      })
      .optional(),
    errorCode: z.string().max(100).optional(),
    saveErrorCode: z.string().max(100).optional(),
    confirmation: z
      .object({ input: confirmation, state: z.enum(['saving', 'uncertain']) })
      .optional(),
    cancelling: z.boolean().optional(),
    receipt: z
      .object({
        accountName: z.string().max(80).optional(),
        categoryName: z.string().max(80).optional(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (
      (value.status === 'pending' && !value.draft) ||
      (value.status === 'confirmed' && !value.result) ||
      (value.confirmation && value.status !== 'pending')
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Incomplete chat entry' });
    }
  });
const snapshot = z.object({
  version: z.literal(1),
  userId: id,
  input: z.string().max(MAX_SESSION_LENGTH),
  entries: z.array(entry).max(1000),
});

export function encodeSession(userId: string, entries: ChatEntry[], input: string): string {
  const saved = snapshot.parse({
    version: 1,
    userId,
    input,
    entries: entries.map((item) => {
      const values = item.values;
      return {
        ...item,
        values: values && {
          ...values,
          ...('date' in values ? { date: values.date ? toISODate(values.date) : null } : {}),
          ...('amount' in values ? { amount: values.amount ?? null } : {}),
          ...('type' in values ? { type: values.type ?? null } : {}),
        },
      };
    }),
  });
  const text = JSON.stringify(saved);
  if (text.length > MAX_SESSION_LENGTH) throw new Error('Chat session exceeds storage limit');
  return text;
}

export function decodeSession(
  text: string,
  userId: string,
  now = Date.now(),
): { entries: ChatEntry[]; input: string } {
  if (text.length > MAX_SESSION_LENGTH) throw new Error('Chat session exceeds storage limit');
  const saved = snapshot.parse(JSON.parse(text));
  if (saved.userId !== userId) throw new Error('Chat session belongs to another user');
  return {
    input: saved.input,
    entries: saved.entries.map((item): ChatEntry => {
      const {
        type: savedType,
        amount: savedAmount,
        date: savedDate,
        ...otherValues
      } = item.values ?? {};
      const restored: ChatEntry = {
        ...item,
        values: item.values && {
          ...otherValues,
          ...('type' in item.values ? { type: savedType ?? undefined } : {}),
          ...('amount' in item.values ? { amount: savedAmount ?? undefined } : {}),
          ...('date' in item.values
            ? { date: savedDate ? parseApiDate(savedDate) : undefined }
            : {}),
        },
        cancelling: false,
      };
      if (restored.status === 'interpreting')
        return { ...restored, status: 'error', errorCode: 'AI_INTERRUPTED' };
      if (restored.confirmation) {
        // The server may already have committed. Preserve the exact payload even past expiry.
        return { ...restored, confirmation: { ...restored.confirmation, state: 'uncertain' } };
      }
      if (restored.status === 'pending' && Date.parse(restored.draft!.expiresAt) <= now) {
        return { ...restored, status: 'error', errorCode: 'AI_DRAFT_INACTIVE' };
      }
      return item.cancelling ? { ...restored, saveErrorCode: 'AI_INTERRUPTED' } : restored;
    }),
  };
}
