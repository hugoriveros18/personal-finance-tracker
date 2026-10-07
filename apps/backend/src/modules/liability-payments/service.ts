import type { PrismaClient, LiabilityPayment } from '@prisma/client';
import { applyDeltaToAccount, type BalanceDelta } from '../transactions/service.js';
import { lockAccountsForUpdate } from '../../shared/locking.js';
import { NotFound } from '../../shared/errors.js';

export const deltaForLP = (amount: bigint): BalanceDelta => ({
  availableBalance: -amount,
  savingsBalance: 0n,
  liabilitiesBalance: -amount,
});

const negate = (d: BalanceDelta): BalanceDelta => ({
  availableBalance: -d.availableBalance,
  savingsBalance: -d.savingsBalance,
  liabilitiesBalance: -d.liabilitiesBalance,
});

export class LiabilityPaymentsService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    userId: string,
    input: { description: string; date: Date; amount: number; accountId: string },
  ): Promise<LiabilityPayment> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockAccountsForUpdate(tx, userId, [input.accountId]);
        const account = await tx.account.findFirst({
          where: { id: input.accountId, userId },
        });
        if (!account) throw NotFound('account');
        const amount = BigInt(input.amount);
        await applyDeltaToAccount(tx, input.accountId, deltaForLP(amount));
        return tx.liabilityPayment.create({
          data: {
            userId,
            accountId: input.accountId,
            description: input.description,
            date: input.date,
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
    patch: Partial<{ description: string; date: Date; amount: number; accountId: string }>,
  ): Promise<LiabilityPayment> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.liabilityPayment.findFirst({ where: { id, userId } });
        if (!existing) throw NotFound('liability_payment');
        const newAccountId = patch.accountId ?? existing.accountId;
        const newAmount = patch.amount !== undefined ? BigInt(patch.amount) : existing.amount;
        const newDate = patch.date ?? existing.date;
        const newDescription = patch.description ?? existing.description;

        await lockAccountsForUpdate(tx, userId, [existing.accountId, newAccountId]);
        if (patch.accountId) {
          const acc = await tx.account.findFirst({ where: { id: newAccountId, userId } });
          if (!acc) throw NotFound('account');
        }

        await applyDeltaToAccount(tx, existing.accountId, negate(deltaForLP(existing.amount)));
        await applyDeltaToAccount(tx, newAccountId, deltaForLP(newAmount));

        return tx.liabilityPayment.update({
          where: { id },
          data: {
            accountId: newAccountId,
            description: newDescription,
            date: newDate,
            amount: newAmount,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.liabilityPayment.findFirst({ where: { id, userId } });
        if (!existing) throw NotFound('liability_payment');
        await lockAccountsForUpdate(tx, userId, [existing.accountId]);
        await applyDeltaToAccount(tx, existing.accountId, negate(deltaForLP(existing.amount)));
        await tx.liabilityPayment.delete({ where: { id } });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
