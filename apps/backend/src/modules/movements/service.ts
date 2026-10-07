import type { Prisma, PrismaClient, MovementFlow, Movement } from '@prisma/client';
import { applyDeltaToAccount, type BalanceDelta } from '../transactions/service.js';
import { lockAccountsForUpdate } from '../../shared/locking.js';
import { AppError, NotFound } from '../../shared/errors.js';

/**
 * Movement balance impact, returned as deltas to apply per side.
 * For INTRA_*, both sides apply to the same account row.
 */
export function deltasForMovement(
  flow: MovementFlow,
  amount: bigint,
): { source: BalanceDelta; destination: BalanceDelta } {
  switch (flow) {
    case 'INTER_AVAILABLE':
      return {
        source: { availableBalance: -amount, savingsBalance: 0n, liabilitiesBalance: 0n },
        destination: { availableBalance: amount, savingsBalance: 0n, liabilitiesBalance: 0n },
      };
    case 'INTRA_AVAILABLE_TO_SAVINGS':
      // Same account; combine into one delta when applying
      return {
        source: { availableBalance: -amount, savingsBalance: amount, liabilitiesBalance: 0n },
        destination: { availableBalance: 0n, savingsBalance: 0n, liabilitiesBalance: 0n },
      };
    case 'INTRA_SAVINGS_TO_AVAILABLE':
      return {
        source: { availableBalance: amount, savingsBalance: -amount, liabilitiesBalance: 0n },
        destination: { availableBalance: 0n, savingsBalance: 0n, liabilitiesBalance: 0n },
      };
  }
}

async function applyMovement(
  tx: Prisma.TransactionClient,
  flow: MovementFlow,
  amount: bigint,
  sourceAccountId: string,
  destinationAccountId: string,
  sign: 1 | -1,
) {
  const { source, destination } = deltasForMovement(flow, amount);
  const apply = (d: BalanceDelta) => ({
    availableBalance: BigInt(sign) * d.availableBalance,
    savingsBalance: BigInt(sign) * d.savingsBalance,
    liabilitiesBalance: BigInt(sign) * d.liabilitiesBalance,
  });
  if (flow === 'INTER_AVAILABLE') {
    await applyDeltaToAccount(tx, sourceAccountId, apply(source));
    await applyDeltaToAccount(tx, destinationAccountId, apply(destination));
  } else {
    await applyDeltaToAccount(tx, sourceAccountId, apply(source));
  }
}

export class MovementsService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    userId: string,
    input: {
      description: string;
      date: Date;
      flow: MovementFlow;
      amount: number;
      sourceAccountId: string;
      destinationAccountId: string;
    },
  ): Promise<Movement> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockAccountsForUpdate(tx, userId, [
          input.sourceAccountId,
          input.destinationAccountId,
        ]);
        const ids = Array.from(new Set([input.sourceAccountId, input.destinationAccountId]));
        const accounts = await tx.account.findMany({ where: { id: { in: ids }, userId } });
        if (accounts.length !== ids.length) throw NotFound('account');

        const amount = BigInt(input.amount);
        await applyMovement(
          tx,
          input.flow,
          amount,
          input.sourceAccountId,
          input.destinationAccountId,
          1,
        );

        return tx.movement.create({
          data: {
            userId,
            description: input.description,
            date: input.date,
            flow: input.flow,
            amount,
            sourceAccountId: input.sourceAccountId,
            destinationAccountId: input.destinationAccountId,
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
      flow: MovementFlow;
      amount: number;
      sourceAccountId: string;
      destinationAccountId: string;
    }>,
  ): Promise<Movement> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.movement.findFirst({ where: { id, userId } });
        if (!existing) throw NotFound('movement');

        const newFlow = patch.flow ?? existing.flow;
        const newAmount = patch.amount !== undefined ? BigInt(patch.amount) : existing.amount;
        const newSourceAccountId = patch.sourceAccountId ?? existing.sourceAccountId;
        const newDestinationAccountId = patch.destinationAccountId ?? existing.destinationAccountId;
        const newDate = patch.date ?? existing.date;
        const newDescription = patch.description ?? existing.description;

        // Validate flow/account-pair shape pre-DB to give a clean error
        if (newFlow === 'INTER_AVAILABLE' && newSourceAccountId === newDestinationAccountId) {
          throw new AppError(
            422,
            'INVALID_FLOW_SHAPE',
            'Inter-account movements require different accounts',
          );
        }
        if (newFlow !== 'INTER_AVAILABLE' && newSourceAccountId !== newDestinationAccountId) {
          throw new AppError(
            422,
            'INVALID_FLOW_SHAPE',
            'Intra-account movements require the same account on both sides',
          );
        }

        await lockAccountsForUpdate(tx, userId, [
          existing.sourceAccountId,
          existing.destinationAccountId,
          newSourceAccountId,
          newDestinationAccountId,
        ]);

        const ids = Array.from(new Set([newSourceAccountId, newDestinationAccountId]));
        const accounts = await tx.account.findMany({ where: { id: { in: ids }, userId } });
        if (accounts.length !== ids.length) throw NotFound('account');

        // Reverse old
        await applyMovement(
          tx,
          existing.flow,
          existing.amount,
          existing.sourceAccountId,
          existing.destinationAccountId,
          -1,
        );
        // Reapply new
        await applyMovement(tx, newFlow, newAmount, newSourceAccountId, newDestinationAccountId, 1);

        return tx.movement.update({
          where: { id },
          data: {
            description: newDescription,
            date: newDate,
            flow: newFlow,
            amount: newAmount,
            sourceAccountId: newSourceAccountId,
            destinationAccountId: newDestinationAccountId,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.movement.findFirst({ where: { id, userId } });
        if (!existing) throw NotFound('movement');
        await lockAccountsForUpdate(tx, userId, [
          existing.sourceAccountId,
          existing.destinationAccountId,
        ]);
        await applyMovement(
          tx,
          existing.flow,
          existing.amount,
          existing.sourceAccountId,
          existing.destinationAccountId,
          -1,
        );
        await tx.movement.delete({ where: { id } });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
