import type { CategoryType } from '@prisma/client';
import type { Extraction, Proposal } from './schemas.js';
import { resolveAmount } from './money.js';
import { resolveMessageDate } from './dates.js';

const normalize = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');

export function containsName(message: string, name: string): boolean {
  const text = normalize(message);
  const candidate = normalize(name);
  if (!candidate) return false;
  for (
    let start = text.indexOf(candidate);
    start >= 0;
    start = text.indexOf(candidate, start + 1)
  ) {
    const before = text[start - 1] ?? '';
    const after = text[start + candidate.length] ?? '';
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true;
  }
  return false;
}

function uniqueName<T extends { name: string }>(name: string | null, items: T[]): T | null {
  if (!name) return null;
  const matches = items.filter((item) => normalize(item.name) === normalize(name));
  return matches.length === 1 ? matches[0]! : null;
}

/** Conservative guards supplement the model; they are not a general language parser. */
export function unsupportedMessage(message: string): boolean {
  const text = normalize(message);
  // Credit refunds or deposits are not new purchases and need their own financial operation.
  if (
    hasLiabilityEvidence(message) &&
    /\b(?:recibi|recibo|salario|reembolso|devolucion)\b/.test(text)
  )
    return true;
  return (
    /\b(transfer\w*|traspas\w*|ahorr\w*|deudas?|prestamos?|elimina\w*|borra\w*|edita\w*|modifica\w*|cambia\w*|cuanto\w*|consulta\w*|analiza\w*|historial|reporte|resumen|saldo)\b|\by\s+(?:gaste|pague|recibi|compre)\b|\bpor\s+\$?[\d.,]+\s*(?:pesos|mil|millones|k)?\s+y\b.+\bpor\s+\$?[\d.,]+/.test(
      text,
    ) ||
    /\b(?:pague|pago|abone|abono|liquide|saldar|cancele)\b(?:(?!\bcon\b).){0,100}\b(?:tarjeta|pasivos?|cuotas?)\b/.test(
      text,
    )
  );
}

/** A purchase on credit is a liability; a debt repayment remains a separate operation. */
export function hasLiabilityEvidence(message: string): boolean {
  const text = normalize(message);
  for (const match of text.matchAll(/\b(?:tarjeta de credito|a credito|pasivo)\b/g)) {
    const before = text.slice(0, match.index);
    if (!/\b(?:no|sin|nunca|ni)\b[^.,;!?]{0,40}$/.test(before)) return true;
  }
  return false;
}

export function resolveProposal(
  extraction: Extraction,
  message: string,
  accounts: { id: string; name: string }[],
  categories: { id: string; name: string; type: CategoryType }[],
  defaultAccountId: string | null,
  today: string,
): Proposal {
  const type = hasLiabilityEvidence(message)
    ? 'liability'
    : extraction.type === 'liability'
      ? 'expense'
      : extraction.type;
  const explicitAccounts = accounts.filter((item) => containsName(message, item.name));
  const nameIsGrounded = extraction.accountName && containsName(message, extraction.accountName);
  const mentioned =
    explicitAccounts.length > 0 ||
    Boolean(nameIsGrounded) ||
    /\b(?:cuenta|desde|banco|cargo)\b/.test(normalize(message));
  const account = mentioned
    ? explicitAccounts.length === 1
      ? explicitAccounts[0]
      : explicitAccounts.length > 1
        ? null
        : uniqueName(nameIsGrounded ? extraction.accountName : null, accounts)
    : (accounts.find((item) => item.id === defaultAccountId) ??
      (accounts.length === 1 ? accounts[0] : null));
  const category = uniqueName(
    extraction.categoryName,
    categories.filter((item) => item.type === (type === 'liability' ? 'expense' : type)),
  );
  const amount = resolveAmount(message, extraction.amountText);
  const { date, dateSource } = resolveMessageDate(message, extraction.dateText, today);
  return {
    type,
    amount,
    description:
      extraction.description?.trim() ||
      (/\bsalario\b/.test(normalize(message)) && type === 'income'
        ? 'Salario'
        : category?.name || message.trim().slice(0, 200)),
    date,
    accountId: account?.id ?? null,
    categoryId: category?.id ?? null,
    accountSource: !account
      ? 'missing'
      : mentioned
        ? 'mentioned'
        : account.id === defaultAccountId
          ? 'default'
          : 'only',
    dateSource,
  };
}
