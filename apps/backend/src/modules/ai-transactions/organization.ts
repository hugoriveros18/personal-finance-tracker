import { AppError } from '../../shared/errors.js';
import { resolveMessageDate } from './dates.js';
import { containsName } from './resolution.js';
import { organizationSchema, type Organization, type OrganizationContext } from './schemas.js';
import type { InterpretationProvider } from './provider.js';

/** Keep the original low-latency interpreter for clearly simple input; all other layouts use AI organization. */
export function canUseSingleFlow(message: string) {
  const text = message.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return (
    message.length <= 2000 &&
    !/[\n\r;:]/.test(message) &&
    !/\b(?:y|tambien|ademas|luego|despues|otr[oa]s?|vari[oa]s?|cada|ambos|respectivamente)\b/.test(
      text,
    ) &&
    (text.match(/\d[\d.,]*/g)?.length ?? 0) === 1 &&
    (text.match(/\b(?:gaste|pague|recibi|compre|ingrese|cobre)\b/g)?.length ?? 0) === 1
  );
}

export async function organizeMessage(
  message: string,
  provider: InterpretationProvider,
  signal?: AbortSignal,
) {
  if (canUseSingleFlow(message))
    return {
      items: [
        {
          text: message,
          kind: 'transaction' as const,
          context: {
            dateText: null,
            accountText: null,
            categoryText: null,
            paymentText: null,
            uncertainFields: [],
          },
        },
      ],
      notes: [],
    };
  if (!provider.organize) throw new AppError(503, 'AI_UNAVAILABLE', 'Organization unavailable');
  return validateOrganization(message, await provider.organize(message, signal));
}

/** Reject invented source quotes and retain uncovered amounts as review-only entries. */
export function validateOrganization(message: string, value: unknown): Organization {
  const parsed = organizationSchema.safeParse(value);
  if (!parsed.success) throw new AppError(502, 'AI_INVALID_RESPONSE', 'Invalid organization');
  const result = parsed.data;
  let cursor = 0;
  const covered = new Uint8Array(message.length);
  const mark = (text: string, from = 0) => {
    const index = message.indexOf(text, from);
    if (index < 0) throw new AppError(502, 'AI_INVALID_RESPONSE', 'Ungrounded source quote');
    covered.fill(1, index, index + text.length);
    return index + text.length;
  };
  for (const item of result.items) {
    const sourceIndex = message.indexOf(item.text, cursor);
    if (
      /^[\d$]/.test(item.text) &&
      /(?:[−-]|menos)\s*\$?\s*$/u.test(message.slice(0, sourceIndex))
    ) {
      throw new AppError(502, 'AI_INVALID_RESPONSE', 'Dropped source negation');
    }
    cursor = mark(item.text, cursor);
    for (const text of [
      item.context.dateText,
      item.context.accountText,
      item.context.categoryText,
      item.context.paymentText,
    ])
      if (text) {
        let next = 0;
        while (message.indexOf(text, next) >= 0) next = mark(text, next);
        if (next === 0) mark(text);
      }
  }
  // Notes are shown to the user, never interpreted as additional purchases.
  for (const note of result.notes) mark(note);
  const uncovered = message
    .split('')
    .map((_, index) => (covered[index] ? ' ' : message[index]))
    .join('');
  if (/\d/.test(uncovered)) {
    result.items.push({
      text: message
        .slice(
          message.lastIndexOf('\n', uncovered.search(/\d/)) + 1,
          message.indexOf('\n', uncovered.search(/\d/)) < 0
            ? message.length
            : message.indexOf('\n', uncovered.search(/\d/)),
        )
        .trim()
        .slice(0, 2000),
      kind: 'unclear',
      context: {
        dateText: null,
        accountText: null,
        categoryText: null,
        paymentText: null,
        uncertainFields: [],
      },
    });
  }
  if (result.items.length > 30)
    throw new AppError(422, 'AI_BATCH_TOO_LARGE', 'Too many operations');
  return result;
}

/** Local evidence overrides inherited scope; unresolved temporal expressions never become today. */
export function sourceMentionsAccount(source: string, accounts: { name: string }[]) {
  return (
    accounts.some(({ name }) => containsName(source, name)) ||
    /\b(?:desde|cuenta|banco)\b|\bcon\s+(?!tarjeta\b|credito\b|crédito\b|efectivo\b)[A-ZÁÉÍÓÚ][\p{L}]+/u.test(
      source,
    )
  );
}

export function scopedMessage(
  source: string,
  context: OrganizationContext,
  accounts: { name: string }[],
  categories: { name: string }[],
  today: string,
) {
  const ownDate = resolveMessageDate(source, null, today).dateSource !== 'today';
  const ownAccount = sourceMentionsAccount(source, accounts);
  const ownCategory = categories.some(({ name }) => containsName(source, name));
  const ownPayment = /\b(?:credito|crédito|pasivo|contado|efectivo|debito|débito)\b/i.test(source);
  return [
    !ownDate && context.dateText,
    !ownAccount && context.accountText,
    !ownCategory && context.categoryText,
    !ownPayment && context.paymentText,
    source,
  ]
    .filter(Boolean)
    .join('\n');
}
