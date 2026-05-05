import type { Prisma, PrismaClient, LiabilityPayment } from '@prisma/client';
import { applyDeltaToAccount, type BalanceDelta } from '../transactions/service.js';
import { lockAccountsForUpdate } from '../../shared/locking.js';
import { NotFound } from '../../shared/errors.js';

export const deltaForLP = (valor: bigint): BalanceDelta => ({
  disponible: -valor,
  ahorro: 0n,
  pasivos: -valor,
});

const negate = (d: BalanceDelta): BalanceDelta => ({
  disponible: -d.disponible,
  ahorro: -d.ahorro,
  pasivos: -d.pasivos,
});

export class LiabilityPaymentsService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    userId: string,
    input: { descripcion: string; fecha: Date; valor: number; accountId: string },
  ): Promise<LiabilityPayment> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockAccountsForUpdate(tx, userId, [input.accountId]);
        const account = await tx.account.findFirst({
          where: { id: input.accountId, userId },
        });
        if (!account) throw NotFound('account');
        const valor = BigInt(input.valor);
        await applyDeltaToAccount(tx, input.accountId, deltaForLP(valor));
        return tx.liabilityPayment.create({
          data: {
            userId,
            accountId: input.accountId,
            descripcion: input.descripcion,
            fecha: input.fecha,
            valor,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<{ descripcion: string; fecha: Date; valor: number; accountId: string }>,
  ): Promise<LiabilityPayment> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.liabilityPayment.findFirst({ where: { id, userId } });
        if (!existing) throw NotFound('liability_payment');
        const newAccountId = patch.accountId ?? existing.accountId;
        const newValor = patch.valor !== undefined ? BigInt(patch.valor) : existing.valor;
        const newFecha = patch.fecha ?? existing.fecha;
        const newDescripcion = patch.descripcion ?? existing.descripcion;

        await lockAccountsForUpdate(tx, userId, [existing.accountId, newAccountId]);
        if (patch.accountId) {
          const acc = await tx.account.findFirst({ where: { id: newAccountId, userId } });
          if (!acc) throw NotFound('account');
        }

        await applyDeltaToAccount(tx, existing.accountId, negate(deltaForLP(existing.valor)));
        await applyDeltaToAccount(tx, newAccountId, deltaForLP(newValor));

        return tx.liabilityPayment.update({
          where: { id },
          data: {
            accountId: newAccountId,
            descripcion: newDescripcion,
            fecha: newFecha,
            valor: newValor,
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
        await applyDeltaToAccount(tx, existing.accountId, negate(deltaForLP(existing.valor)));
        await tx.liabilityPayment.delete({ where: { id } });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
