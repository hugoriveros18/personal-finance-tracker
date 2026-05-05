import type { Prisma, PrismaClient, Transaction, TransactionTipo } from '@prisma/client';
import { lockAccountsForUpdate } from '../../shared/locking.js';
import { AppError, NotFound } from '../../shared/errors.js';

export interface BalanceDelta {
  disponible: bigint;
  ahorro: bigint;
  pasivos: bigint;
}

const ZERO: BalanceDelta = { disponible: 0n, ahorro: 0n, pasivos: 0n };

export function deltaForTransaction(tipo: TransactionTipo, valor: bigint): BalanceDelta {
  switch (tipo) {
    case 'ingreso':
      return { disponible: valor, ahorro: 0n, pasivos: 0n };
    case 'egreso':
      return { disponible: -valor, ahorro: 0n, pasivos: 0n };
    case 'pasivo':
      return { disponible: 0n, ahorro: 0n, pasivos: valor };
  }
}

export async function applyDeltaToAccount(
  tx: Prisma.TransactionClient,
  accountId: string,
  delta: BalanceDelta,
): Promise<void> {
  if (delta.disponible === 0n && delta.ahorro === 0n && delta.pasivos === 0n) return;
  // Use raw to handle bigint arithmetic and trigger CHECK constraints to fire on row update
  await tx.$executeRaw`
    UPDATE "account" SET
      "disponible" = "disponible" + ${delta.disponible}::bigint,
      "ahorro"     = "ahorro"     + ${delta.ahorro}::bigint,
      "pasivos"    = "pasivos"    + ${delta.pasivos}::bigint,
      "total"      = ("disponible" + ${delta.disponible}::bigint) + ("ahorro" + ${delta.ahorro}::bigint),
      "updated_at" = now()
    WHERE id = ${accountId}::uuid
  `;
}

export class TransactionsService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    userId: string,
    input: {
      descripcion: string;
      fecha: Date;
      tipo: TransactionTipo;
      valor: number;
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
        if (input.tipo === 'ingreso' && category.tipo !== 'ingreso') {
          throw new AppError(
            422,
            'CATEGORY_TIPO_MISMATCH',
            'Income transactions require an income category',
          );
        }
        if ((input.tipo === 'egreso' || input.tipo === 'pasivo') && category.tipo !== 'egreso') {
          throw new AppError(
            422,
            'CATEGORY_TIPO_MISMATCH',
            'Expense and liability transactions require an expense category',
          );
        }

        const valor = BigInt(input.valor);
        const delta = deltaForTransaction(input.tipo, valor);
        await applyDeltaToAccount(tx, input.accountId, delta);

        return tx.transaction.create({
          data: {
            userId,
            accountId: input.accountId,
            categoryId: input.categoryId,
            categoryTipo: category.tipo,
            descripcion: input.descripcion,
            fecha: input.fecha,
            tipo: input.tipo,
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
    patch: Partial<{
      descripcion: string;
      fecha: Date;
      tipo: TransactionTipo;
      valor: number;
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
        const newTipo = patch.tipo ?? existing.tipo;
        const newValor = patch.valor !== undefined ? BigInt(patch.valor) : existing.valor;
        const newFecha = patch.fecha ?? existing.fecha;
        const newDescripcion = patch.descripcion ?? existing.descripcion;

        await lockAccountsForUpdate(tx, userId, [existing.accountId, newAccountId]);

        const newCategory = await tx.category.findFirst({
          where: { id: newCategoryId, userId },
        });
        if (!newCategory) throw NotFound('category');
        if (newTipo === 'ingreso' && newCategory.tipo !== 'ingreso') {
          throw new AppError(422, 'CATEGORY_TIPO_MISMATCH', 'Income requires income category');
        }
        if ((newTipo === 'egreso' || newTipo === 'pasivo') && newCategory.tipo !== 'egreso') {
          throw new AppError(422, 'CATEGORY_TIPO_MISMATCH', 'Expense/liability requires expense category');
        }

        if (patch.accountId) {
          const newAccount = await tx.account.findFirst({
            where: { id: newAccountId, userId },
          });
          if (!newAccount) throw NotFound('account');
        }

        // Reverse old impact
        const oldDelta = deltaForTransaction(existing.tipo, existing.valor);
        await applyDeltaToAccount(tx, existing.accountId, {
          disponible: -oldDelta.disponible,
          ahorro: -oldDelta.ahorro,
          pasivos: -oldDelta.pasivos,
        });
        // Reapply new impact
        const newDelta = deltaForTransaction(newTipo, newValor);
        await applyDeltaToAccount(tx, newAccountId, newDelta);

        return tx.transaction.update({
          where: { id },
          data: {
            accountId: newAccountId,
            categoryId: newCategoryId,
            categoryTipo: newCategory.tipo,
            tipo: newTipo,
            valor: newValor,
            fecha: newFecha,
            descripcion: newDescripcion,
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
        const oldDelta = deltaForTransaction(existing.tipo, existing.valor);
        await applyDeltaToAccount(tx, existing.accountId, {
          disponible: -oldDelta.disponible,
          ahorro: -oldDelta.ahorro,
          pasivos: -oldDelta.pasivos,
        });
        await tx.transaction.delete({ where: { id } });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}

export { ZERO };
