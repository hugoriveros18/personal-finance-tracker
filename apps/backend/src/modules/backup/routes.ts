import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { applyDeltaToAccount, deltaForTransaction } from '../transactions/service.js';
import { lockAccountsForUpdate } from '../../shared/locking.js';
import { AppError } from '../../shared/errors.js';
import { exportEnvelopeSchema, type ExportEnvelope } from './schemas.js';

const APP_VERSION = '1.0.0';

const fmtDate = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

const importQuerySchema = z.object({
  mode: z.enum(['replace', 'merge-fail-on-conflict']).default('replace'),
  dryRun: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

export const backupRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/export', async (req, reply) => {
    const userId = req.userId;
    const [user, categories, accounts, transactions, movements, liabilityPayments] = await Promise.all([
      app.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      app.prisma.category.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      app.prisma.account.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      app.prisma.transaction.findMany({
        where: { userId },
        orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
      }),
      app.prisma.movement.findMany({
        where: { userId },
        orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
      }),
      app.prisma.liabilityPayment.findMany({
        where: { userId },
        orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const catIdToExport = new Map<string, string>();
    categories.forEach((c, i) => catIdToExport.set(c.id, `c-${String(i + 1).padStart(4, '0')}`));
    const accIdToExport = new Map<string, string>();
    accounts.forEach((a, i) => accIdToExport.set(a.id, `a-${String(i + 1).padStart(4, '0')}`));

    // For accounts, "initial" balance is reconstructed by reversing all activity
    const initialByAccount = new Map<string, { disponible: bigint; ahorro: bigint; pasivos: bigint }>();
    for (const a of accounts) {
      initialByAccount.set(a.id, { disponible: a.disponible, ahorro: a.ahorro, pasivos: a.pasivos });
    }
    for (const t of transactions) {
      const init = initialByAccount.get(t.accountId);
      if (!init) continue;
      const d = deltaForTransaction(t.tipo, t.valor);
      init.disponible -= d.disponible;
      init.ahorro -= d.ahorro;
      init.pasivos -= d.pasivos;
    }
    for (const m of movements) {
      const ie = initialByAccount.get(m.cuentaEmisoraId);
      const ir = initialByAccount.get(m.cuentaReceptoraId);
      if (!ie || !ir) continue;
      if (m.flujo === 'INTER_DISPONIBLE') {
        ie.disponible += m.valor;
        ir.disponible -= m.valor;
      } else if (m.flujo === 'INTRA_DISPONIBLE_TO_AHORRO') {
        ie.disponible += m.valor;
        ie.ahorro -= m.valor;
      } else {
        ie.disponible -= m.valor;
        ie.ahorro += m.valor;
      }
    }
    for (const p of liabilityPayments) {
      const init = initialByAccount.get(p.accountId);
      if (!init) continue;
      init.disponible += p.valor;
      init.pasivos += p.valor;
    }

    const envelope: ExportEnvelope = {
      $schema: 'pft-export-v1',
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      user: {
        nombre: user.nombre,
        apellidos: user.apellidos,
        email: user.email,
        preferredLanguage: user.preferredLanguage,
        preferredTheme: user.preferredTheme,
      },
      categories: categories.map((c) => ({
        exportId: catIdToExport.get(c.id)!,
        nombre: c.nombre,
        tipo: c.tipo,
      })),
      accounts: accounts.map((a) => {
        const init = initialByAccount.get(a.id)!;
        return {
          exportId: accIdToExport.get(a.id)!,
          nombre: a.nombre,
          initial: {
            disponible: Number(init.disponible),
            ahorro: Number(init.ahorro),
            pasivos: Number(init.pasivos),
          },
        };
      }),
      transactions: transactions.map((t, i) => ({
        exportId: `t-${String(i + 1).padStart(5, '0')}`,
        accountExportId: accIdToExport.get(t.accountId)!,
        categoryExportId: catIdToExport.get(t.categoryId)!,
        descripcion: t.descripcion,
        fecha: fmtDate(t.fecha),
        tipo: t.tipo,
        valor: Number(t.valor),
      })),
      movements: movements.map((m, i) => ({
        exportId: `m-${String(i + 1).padStart(5, '0')}`,
        cuentaEmisoraExportId: accIdToExport.get(m.cuentaEmisoraId)!,
        cuentaReceptoraExportId: accIdToExport.get(m.cuentaReceptoraId)!,
        flujo: m.flujo,
        descripcion: m.descripcion,
        fecha: fmtDate(m.fecha),
        valor: Number(m.valor),
      })),
      liabilityPayments: liabilityPayments.map((p, i) => ({
        exportId: `lp-${String(i + 1).padStart(5, '0')}`,
        accountExportId: accIdToExport.get(p.accountId)!,
        descripcion: p.descripcion,
        fecha: fmtDate(p.fecha),
        valor: Number(p.valor),
      })),
    };

    const filename = `pft-backup-${user.id}-${fmtDate(new Date())}.json`;
    reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`);
    return envelope;
  });

  app.post('/import', { schema: { querystring: importQuerySchema } }, async (req) => {
    const { mode, dryRun } = req.query;
    const file = await req.file();
    if (!file) throw new AppError(422, 'NO_FILE', 'No file uploaded');
    const buf = await file.toBuffer();
    let parsed: unknown;
    try {
      parsed = JSON.parse(buf.toString('utf-8'));
    } catch {
      throw new AppError(422, 'INVALID_JSON', 'Could not parse import file');
    }
    const envelope = exportEnvelopeSchema.parse(parsed);

    // Validate referential integrity within the envelope
    const catIds = new Set(envelope.categories.map((c) => c.exportId));
    const accIds = new Set(envelope.accounts.map((a) => a.exportId));
    if (catIds.size !== envelope.categories.length) {
      throw new AppError(422, 'DUPLICATE_EXPORT_ID', 'Duplicate category exportId');
    }
    if (accIds.size !== envelope.accounts.length) {
      throw new AppError(422, 'DUPLICATE_EXPORT_ID', 'Duplicate account exportId');
    }
    for (const t of envelope.transactions) {
      if (!catIds.has(t.categoryExportId) || !accIds.has(t.accountExportId)) {
        throw new AppError(422, 'BROKEN_REFERENCE', `Transaction ${t.exportId} references missing category/account`);
      }
    }
    for (const m of envelope.movements) {
      if (!accIds.has(m.cuentaEmisoraExportId) || !accIds.has(m.cuentaReceptoraExportId)) {
        throw new AppError(422, 'BROKEN_REFERENCE', `Movement ${m.exportId} references missing account`);
      }
    }
    for (const p of envelope.liabilityPayments) {
      if (!accIds.has(p.accountExportId)) {
        throw new AppError(422, 'BROKEN_REFERENCE', `Liability payment ${p.exportId} references missing account`);
      }
    }

    const summary = {
      mode,
      dryRun: !!dryRun,
      counts: {
        categories: envelope.categories.length,
        accounts: envelope.accounts.length,
        transactions: envelope.transactions.length,
        movements: envelope.movements.length,
        liabilityPayments: envelope.liabilityPayments.length,
      },
    };

    if (dryRun) {
      return { summary };
    }

    const userId = req.userId;
    await app.prisma.$transaction(
      async (tx) => {
        if (mode === 'replace') {
          await tx.transaction.deleteMany({ where: { userId } });
          await tx.movement.deleteMany({ where: { userId } });
          await tx.liabilityPayment.deleteMany({ where: { userId } });
          await tx.account.deleteMany({ where: { userId } });
          await tx.category.deleteMany({ where: { userId } });
        }

        // Update user preferences
        await tx.user.update({
          where: { id: userId },
          data: {
            nombre: envelope.user.nombre,
            apellidos: envelope.user.apellidos,
            preferredLanguage: envelope.user.preferredLanguage,
            preferredTheme: envelope.user.preferredTheme,
          },
        });

        // Insert categories
        const catMap = new Map<string, string>();
        for (const c of envelope.categories) {
          const created = await tx.category.create({
            data: { userId, nombre: c.nombre, tipo: c.tipo },
          });
          catMap.set(c.exportId, created.id);
        }

        // Insert accounts with initial balances
        const accMap = new Map<string, string>();
        for (const a of envelope.accounts) {
          const total = a.initial.disponible + a.initial.ahorro;
          const created = await tx.account.create({
            data: {
              userId,
              nombre: a.nombre,
              disponible: BigInt(a.initial.disponible),
              ahorro: BigInt(a.initial.ahorro),
              pasivos: BigInt(a.initial.pasivos),
              total: BigInt(total),
            },
          });
          accMap.set(a.exportId, created.id);
        }

        // Replay transactions chronologically
        const allEvents: Array<{ kind: 'tx' | 'mov' | 'lp'; fecha: string; idx: number }> = [
          ...envelope.transactions.map((_, idx) => ({ kind: 'tx' as const, fecha: envelope.transactions[idx].fecha, idx })),
          ...envelope.movements.map((_, idx) => ({ kind: 'mov' as const, fecha: envelope.movements[idx].fecha, idx })),
          ...envelope.liabilityPayments.map((_, idx) => ({
            kind: 'lp' as const,
            fecha: envelope.liabilityPayments[idx].fecha,
            idx,
          })),
        ];
        allEvents.sort((a, b) => a.fecha.localeCompare(b.fecha));

        for (const ev of allEvents) {
          if (ev.kind === 'tx') {
            const t = envelope.transactions[ev.idx];
            const accountId = accMap.get(t.accountExportId)!;
            const categoryId = catMap.get(t.categoryExportId)!;
            const cat = await tx.category.findUniqueOrThrow({ where: { id: categoryId } });
            const valor = BigInt(t.valor);
            await lockAccountsForUpdate(tx, userId, [accountId]);
            await applyDeltaToAccount(tx, accountId, deltaForTransaction(t.tipo, valor));
            await tx.transaction.create({
              data: {
                userId,
                accountId,
                categoryId,
                categoryTipo: cat.tipo,
                descripcion: t.descripcion,
                fecha: new Date(`${t.fecha}T00:00:00.000Z`),
                tipo: t.tipo,
                valor,
              },
            });
          } else if (ev.kind === 'mov') {
            const m = envelope.movements[ev.idx];
            const emisora = accMap.get(m.cuentaEmisoraExportId)!;
            const receptora = accMap.get(m.cuentaReceptoraExportId)!;
            const valor = BigInt(m.valor);
            await lockAccountsForUpdate(tx, userId, [emisora, receptora]);
            if (m.flujo === 'INTER_DISPONIBLE') {
              await applyDeltaToAccount(tx, emisora, { disponible: -valor, ahorro: 0n, pasivos: 0n });
              await applyDeltaToAccount(tx, receptora, { disponible: valor, ahorro: 0n, pasivos: 0n });
            } else if (m.flujo === 'INTRA_DISPONIBLE_TO_AHORRO') {
              await applyDeltaToAccount(tx, emisora, { disponible: -valor, ahorro: valor, pasivos: 0n });
            } else {
              await applyDeltaToAccount(tx, emisora, { disponible: valor, ahorro: -valor, pasivos: 0n });
            }
            await tx.movement.create({
              data: {
                userId,
                cuentaEmisoraId: emisora,
                cuentaReceptoraId: receptora,
                flujo: m.flujo,
                descripcion: m.descripcion,
                fecha: new Date(`${m.fecha}T00:00:00.000Z`),
                valor,
              },
            });
          } else {
            const p = envelope.liabilityPayments[ev.idx];
            const accountId = accMap.get(p.accountExportId)!;
            const valor = BigInt(p.valor);
            await lockAccountsForUpdate(tx, userId, [accountId]);
            await applyDeltaToAccount(tx, accountId, { disponible: -valor, ahorro: 0n, pasivos: -valor });
            await tx.liabilityPayment.create({
              data: {
                userId,
                accountId,
                descripcion: p.descripcion,
                fecha: new Date(`${p.fecha}T00:00:00.000Z`),
                valor,
              },
            });
          }
        }
      },
      { isolationLevel: 'Serializable', timeout: 60_000, maxWait: 5_000 },
    );

    return { summary };
  });
};
