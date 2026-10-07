import type { Prisma, PrismaClient, Transaction, TransactionType } from '@prisma/client';
import { lockAccountsForUpdate } from '../../shared/locking.js';
import { AppError, NotFound } from '../../shared/errors.js';

export interface BalanceDelta {
  availableBalance: bigint;
  savingsBalance: bigint;
  liabilitiesBalance: bigint;
}

const ZERO: BalanceDelta = { availableBalance: 0n, savingsBalance: 0n, liabilitiesBalance: 0n };

export function deltaForTransaction(type: TransactionType, amount: bigint): BalanceDelta {
  switch (type) {
    case 'income':
      return { availableBalance: amount, savingsBalance: 0n, liabilitiesBalance: 0n };
    case 'expense':
      return { availableBalance: -amount, savingsBalance: 0n, liabilitiesBalance: 0n };
    case 'liability':
      return { availableBalance: 0n, savingsBalance: 0n, liabilitiesBalance: amount };
  }
}

export async function applyDeltaToAccount(
  tx: Prisma.TransactionClient,
  accountId: string,
  delta: BalanceDelta,
): Promise<void> {
  if (
    delta.availableBalance === 0n &&
    delta.savingsBalance === 0n &&
    delta.liabilitiesBalance === 0n
  )
    return;
  // Use raw to handle bigint arithmetic and trigger CHECK constraints to fire on row update
  await tx.$executeRaw`
    UPDATE "account" SET
      "available_balance" = "available_balance" + ${delta.availableBalance}::bigint,
      "savings_balance"     = "savings_balance"     + ${delta.savingsBalance}::bigint,
      "liabilities_balance"    = "liabilities_balance"    + ${delta.liabilitiesBalance}::bigint,
      "total"      = ("available_balance" + ${delta.availableBalance}::bigint) + ("savings_balance" + ${delta.savingsBalance}::bigint),
      "updated_at" = now()
    WHERE id = ${accountId}::uuid
  `;
}

export class TransactionsService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    userId: string,
    input: {
      description: string;
      date: Date;
      type: TransactionType;
      amount: number;
      accountId: string;
      categoryId: string;
    },
  ): Promise<Transaction> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockAccountsForUpdate(tx, userId, [input.accountId]);
        const account = await tx.account.findFirst({
          where: { id: input.accountId, userId },
        });
        if (!account) throw NotFound('account');
        const category = await tx.category.findFirst({
          where: { id: input.categoryId, userId },
        });
        if (!category) throw NotFound('category');
        // Coherence (DB trigger also enforces; better error than 23514)
        if (input.type === 'income' && category.type !== 'income') {
          throw new AppError(
            422,
            'CATEGORY_TYPE_MISMATCH',
            'Income transactions require an income category',
          );
        }
        if (
          (input.type === 'expense' || input.type === 'liability') &&
          category.type !== 'expense'
        ) {
          throw new AppError(
            422,
            'CATEGORY_TYPE_MISMATCH',
            'Expense and liability transactions require an expense category',
          );
        }

        const amount = BigInt(input.amount);
        const delta = deltaForTransaction(input.type, amount);
        await applyDeltaToAccount(tx, input.accountId, delta);

        return tx.transaction.create({
          data: {
            userId,
            accountId: input.accountId,
            categoryId: input.categoryId,
            categoryType: category.type,
            description: input.description,
            date: input.date,
            type: input.type,
            amount,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<{
      description: string;
      date: Date;
      type: TransactionType;
      amount: number;
      accountId: string;
      categoryId: string;
    }>,
  ): Promise<Transaction> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.transaction.findFirst({ where: { id, userId } });
        if (!existing) throw NotFound('transaction');

        const newAccountId = patch.accountId ?? existing.accountId;
        const newCategoryId = patch.categoryId ?? existing.categoryId;
        const newType = patch.type ?? existing.type;
        const newAmount = patch.amount !== undefined ? BigInt(patch.amount) : existing.amount;
        const newDate = patch.date ?? existing.date;
        const newDescription = patch.description ?? existing.description;

        await lockAccountsForUpdate(tx, userId, [existing.accountId, newAccountId]);

        const newCategory = await tx.category.findFirst({
          where: { id: newCategoryId, userId },
        });
        if (!newCategory) throw NotFound('category');
        if (newType === 'income' && newCategory.type !== 'income') {
          throw new AppError(422, 'CATEGORY_TYPE_MISMATCH', 'Income requires income category');
        }
        if ((newType === 'expense' || newType === 'liability') && newCategory.type !== 'expense') {
          throw new AppError(
            422,
            'CATEGORY_TYPE_MISMATCH',
            'Expense/liability requires expense category',
          );
        }

        if (patch.accountId) {
          const newAccount = await tx.account.findFirst({
            where: { id: newAccountId, userId },
          });
          if (!newAccount) throw NotFound('account');
        }

        // Reverse old impact
        const oldDelta = deltaForTransaction(existing.type, existing.amount);
        await applyDeltaToAccount(tx, existing.accountId, {
          availableBalance: -oldDelta.availableBalance,
          savingsBalance: -oldDelta.savingsBalance,
          liabilitiesBalance: -oldDelta.liabilitiesBalance,
        });
        // Reapply new impact
        const newDelta = deltaForTransaction(newType, newAmount);
        await applyDeltaToAccount(tx, newAccountId, newDelta);

        return tx.transaction.update({
          where: { id },
          data: {
            accountId: newAccountId,
            categoryId: newCategoryId,
            categoryType: newCategory.type,
            type: newType,
            amount: newAmount,
            date: newDate,
            description: newDescription,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.transaction.findFirst({ where: { id, userId } });
        if (!existing) throw NotFound('transaction');
        await lockAccountsForUpdate(tx, userId, [existing.accountId]);
        const oldDelta = deltaForTransaction(existing.type, existing.amount);
        await applyDeltaToAccount(tx, existing.accountId, {
          availableBalance: -oldDelta.availableBalance,
          savingsBalance: -oldDelta.savingsBalance,
          liabilitiesBalance: -oldDelta.liabilitiesBalance,
        });
        await tx.transaction.delete({ where: { id } });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}

export { ZERO };
