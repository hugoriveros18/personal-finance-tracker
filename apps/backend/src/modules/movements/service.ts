import type { Prisma, PrismaClient, MovementFlujo, Movement } from '@prisma/client';
import { applyDeltaToAccount, type BalanceDelta } from '../transactions/service.js';
import { lockAccountsForUpdate } from '../../shared/locking.js';
import { AppError, NotFound } from '../../shared/errors.js';

/**
 * Movement balance impact, returned as deltas to apply per side.
 * For INTRA_*, both sides apply to the same account row.
 */
export function deltasForMovement(
  flujo: MovementFlujo,
  valor: bigint,
): { emisora: BalanceDelta; receptora: BalanceDelta } {
  switch (flujo) {
    case 'INTER_DISPONIBLE':
      return {
        emisora: { disponible: -valor, ahorro: 0n, pasivos: 0n },
        receptora: { disponible: valor, ahorro: 0n, pasivos: 0n },
      };
    case 'INTRA_DISPONIBLE_TO_AHORRO':
      // Same account; combine into one delta when applying
      return {
        emisora: { disponible: -valor, ahorro: valor, pasivos: 0n },
        receptora: { disponible: 0n, ahorro: 0n, pasivos: 0n },
      };
    case 'INTRA_AHORRO_TO_DISPONIBLE':
      return {
        emisora: { disponible: valor, ahorro: -valor, pasivos: 0n },
        receptora: { disponible: 0n, ahorro: 0n, pasivos: 0n },
      };
  }
}

async function applyMovement(
  tx: Prisma.TransactionClient,
  flujo: MovementFlujo,
  valor: bigint,
  cuentaEmisoraId: string,
  cuentaReceptoraId: string,
  sign: 1 | -1,
) {
  const { emisora, receptora } = deltasForMovement(flujo, valor);
  const apply = (d: BalanceDelta) => ({
    disponible: BigInt(sign) * d.disponible,
    ahorro: BigInt(sign) * d.ahorro,
    pasivos: BigInt(sign) * d.pasivos,
  });
  if (flujo === 'INTER_DISPONIBLE') {
    await applyDeltaToAccount(tx, cuentaEmisoraId, apply(emisora));
    await applyDeltaToAccount(tx, cuentaReceptoraId, apply(receptora));
  } else {
    await applyDeltaToAccount(tx, cuentaEmisoraId, apply(emisora));
  }
}

export class MovementsService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    userId: string,
    input: {
      descripcion: string;
      fecha: Date;
      flujo: MovementFlujo;
      valor: number;
      cuentaEmisoraId: string;
      cuentaReceptoraId: string;
    },
  ): Promise<Movement> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockAccountsForUpdate(tx, userId, [
          input.cuentaEmisoraId,
          input.cuentaReceptoraId,
        ]);
        const ids = Array.from(new Set([input.cuentaEmisoraId, input.cuentaReceptoraId]));
        const accounts = await tx.account.findMany({ where: { id: { in: ids }, userId } });
        if (accounts.length !== ids.length) throw NotFound('account');

        const valor = BigInt(input.valor);
        await applyMovement(tx, input.flujo, valor, input.cuentaEmisoraId, input.cuentaReceptoraId, 1);

        return tx.movement.create({
          data: {
            userId,
            descripcion: input.descripcion,
            fecha: input.fecha,
            flujo: input.flujo,
            valor,
            cuentaEmisoraId: input.cuentaEmisoraId,
            cuentaReceptoraId: input.cuentaReceptoraId,
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
      descripcion: string;
      fecha: Date;
      flujo: MovementFlujo;
      valor: number;
      cuentaEmisoraId: string;
      cuentaReceptoraId: string;
    }>,
  ): Promise<Movement> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.movement.findFirst({ where: { id, userId } });
        if (!existing) throw NotFound('movement');

        const newFlujo = patch.flujo ?? existing.flujo;
        const newValor = patch.valor !== undefined ? BigInt(patch.valor) : existing.valor;
        const newEmisoraId = patch.cuentaEmisoraId ?? existing.cuentaEmisoraId;
        const newReceptoraId = patch.cuentaReceptoraId ?? existing.cuentaReceptoraId;
        const newFecha = patch.fecha ?? existing.fecha;
        const newDescripcion = patch.descripcion ?? existing.descripcion;

        // Validate flujo/account-pair shape pre-DB to give a clean error
        if (newFlujo === 'INTER_DISPONIBLE' && newEmisoraId === newReceptoraId) {
          throw new AppError(
            422,
            'INVALID_FLUJO_SHAPE',
            'Inter-account movements require different accounts',
          );
        }
        if (newFlujo !== 'INTER_DISPONIBLE' && newEmisoraId !== newReceptoraId) {
          throw new AppError(
            422,
            'INVALID_FLUJO_SHAPE',
            'Intra-account movements require the same account on both sides',
          );
        }

        await lockAccountsForUpdate(tx, userId, [
          existing.cuentaEmisoraId,
          existing.cuentaReceptoraId,
          newEmisoraId,
          newReceptoraId,
        ]);

        const ids = Array.from(new Set([newEmisoraId, newReceptoraId]));
        const accounts = await tx.account.findMany({ where: { id: { in: ids }, userId } });
        if (accounts.length !== ids.length) throw NotFound('account');

        // Reverse old
        await applyMovement(
          tx,
          existing.flujo,
          existing.valor,
          existing.cuentaEmisoraId,
          existing.cuentaReceptoraId,
          -1,
        );
        // Reapply new
        await applyMovement(tx, newFlujo, newValor, newEmisoraId, newReceptoraId, 1);

        return tx.movement.update({
          where: { id },
          data: {
            descripcion: newDescripcion,
            fecha: newFecha,
            flujo: newFlujo,
            valor: newValor,
            cuentaEmisoraId: newEmisoraId,
            cuentaReceptoraId: newReceptoraId,
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
          existing.cuentaEmisoraId,
          existing.cuentaReceptoraId,
        ]);
        await applyMovement(
          tx,
          existing.flujo,
          existing.valor,
          existing.cuentaEmisoraId,
          existing.cuentaReceptoraId,
          -1,
        );
        await tx.movement.delete({ where: { id } });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
