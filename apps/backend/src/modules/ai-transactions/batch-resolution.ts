import type { CategoryType } from '@prisma/client';
import { resolveAmount } from './money.js';
import { scopedMessage, sourceMentionsAccount } from './organization.js';
import { containsName, resolveProposal } from './resolution.js';
import type { Extraction, OrganizationContext } from './schemas.js';

/** Resolve local evidence and shared scope identically in production and real-model evaluations. */
export function resolveBatchProposal(
  extraction: Extraction,
  source: string,
  context: OrganizationContext,
  accounts: { id: string; name: string }[],
  categories: { id: string; name: string; type: CategoryType }[],
  defaultAccountId: string | null,
  today: string,
  unclear = false,
) {
  const message = scopedMessage(source, context, accounts, categories, today);
  const proposal = resolveProposal(
    extraction,
    message,
    accounts,
    categories,
    defaultAccountId,
    today,
  );
  // Monetary evidence belongs to this operation, not to a heading or another row.
  proposal.amount = resolveAmount(source, extraction.amountText);
  const localAccountMention =
    sourceMentionsAccount(source, accounts) ||
    Boolean(extraction.accountName && containsName(source, extraction.accountName));
  if (localAccountMention) {
    const local = resolveProposal(
      extraction,
      source,
      accounts,
      categories,
      defaultAccountId,
      today,
    );
    proposal.accountId = local.accountSource === 'mentioned' ? local.accountId : null;
    proposal.accountSource = proposal.accountId ? 'mentioned' : 'missing';
  } else if (context.accountText) {
    const matches = accounts.filter(({ name }) => containsName(context.accountText!, name));
    proposal.accountId = matches.length === 1 ? matches[0]!.id : null;
    proposal.accountSource = proposal.accountId ? 'mentioned' : 'missing';
  }
  if (context.categoryText && !categories.some(({ name }) => containsName(source, name))) {
    const expectedType = proposal.type === 'income' ? 'income' : 'expense';
    const matches = categories.filter(
      ({ name, type }) => type === expectedType && containsName(context.categoryText!, name),
    );
    proposal.categoryId = matches.length === 1 ? matches[0]!.id : null;
  }
  const uncertain = unclear
    ? ['date', 'account', 'category', 'type', 'amount']
    : context.uncertainFields;
  if (uncertain.includes('date')) {
    proposal.date = null;
    proposal.dateSource = 'missing';
  }
  if (uncertain.includes('account')) {
    proposal.accountId = null;
    proposal.accountSource = 'missing';
  }
  if (uncertain.includes('category')) proposal.categoryId = null;
  if (uncertain.includes('amount')) proposal.amount = null;
  if (uncertain.includes('type')) {
    proposal.type = null;
    proposal.categoryId = null;
  }
  return proposal;
}
