import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
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

export const backupRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/export', async (req, reply) => {
    const userId = req.userId;
    const [user, categories, accounts, transactions, movements, liabilityPayments] =
      await Promise.all([
        app.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
        app.prisma.category.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
        app.prisma.account.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
        app.prisma.transaction.findMany({
          where: { userId },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        }),
        app.prisma.movement.findMany({
          where: { userId },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        }),
        app.prisma.liabilityPayment.findMany({
          where: { userId },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        }),
      ]);

    const catIdToExport = new Map<string, string>();
    categories.forEach((c, i) => catIdToExport.set(c.id, `c-${String(i + 1).padStart(4, '0')}`));
    const accIdToExport = new Map<string, string>();
    accounts.forEach((a, i) => accIdToExport.set(a.id, `a-${String(i + 1).padStart(4, '0')}`));

    // For accounts, "initial" balance is reconstructed by reversing all activity
    const initialByAccount = new Map<
      string,
      { availableBalance: bigint; savingsBalance: bigint; liabilitiesBalance: bigint }
    >();
    for (const a of accounts) {
      initialByAccount.set(a.id, {
        availableBalance: a.availableBalance,
        savingsBalance: a.savingsBalance,
        liabilitiesBalance: a.liabilitiesBalance,
      });
    }
    for (const t of transactions) {
      const init = initialByAccount.get(t.accountId);
      if (!init) continue;
      const d = deltaForTransaction(t.type, t.amount);
      init.availableBalance -= d.availableBalance;
      init.savingsBalance -= d.savingsBalance;
      init.liabilitiesBalance -= d.liabilitiesBalance;
    }
    for (const m of movements) {
      const ie = initialByAccount.get(m.sourceAccountId);
      const ir = initialByAccount.get(m.destinationAccountId);
      if (!ie || !ir) continue;
      if (m.flow === 'INTER_AVAILABLE') {
        ie.availableBalance += m.amount;
        ir.availableBalance -= m.amount;
      } else if (m.flow === 'INTRA_AVAILABLE_TO_SAVINGS') {
        ie.availableBalance += m.amount;
        ie.savingsBalance -= m.amount;
      } else {
        ie.availableBalance -= m.amount;
        ie.savingsBalance += m.amount;
      }
    }
    for (const p of liabilityPayments) {
      const init = initialByAccount.get(p.accountId);
      if (!init) continue;
      init.availableBalance += p.amount;
      init.liabilitiesBalance += p.amount;
    }

    const envelope: ExportEnvelope = {
      $schema: 'pft-export-v2',
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        preferredLanguage: user.preferredLanguage,
        preferredTheme: user.preferredTheme,
      },
      categories: categories.map((c) => ({
        exportId: catIdToExport.get(c.id)!,
        name: c.name,
        type: c.type,
      })),
      accounts: accounts.map((a) => {
        const init = initialByAccount.get(a.id)!;
        return {
          exportId: accIdToExport.get(a.id)!,
          name: a.name,
          initial: {
            availableBalance: Number(init.availableBalance),
            savingsBalance: Number(init.savingsBalance),
            liabilitiesBalance: Number(init.liabilitiesBalance),
          },
        };
      }),
      transactions: transactions.map((t, i) => ({
        exportId: `t-${String(i + 1).padStart(5, '0')}`,
        accountExportId: accIdToExport.get(t.accountId)!,
        categoryExportId: catIdToExport.get(t.categoryId)!,
        description: t.description,
        date: fmtDate(t.date),
        type: t.type,
        amount: Number(t.amount),
      })),
      movements: movements.map((m, i) => ({
        exportId: `m-${String(i + 1).padStart(5, '0')}`,
        sourceAccountExportId: accIdToExport.get(m.sourceAccountId)!,
        destinationAccountExportId: accIdToExport.get(m.destinationAccountId)!,
        flow: m.flow,
        description: m.description,
        date: fmtDate(m.date),
        amount: Number(m.amount),
      })),
      liabilityPayments: liabilityPayments.map((p, i) => ({
        exportId: `lp-${String(i + 1).padStart(5, '0')}`,
        accountExportId: accIdToExport.get(p.accountId)!,
        description: p.description,
        date: fmtDate(p.date),
        amount: Number(p.amount),
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
        throw new AppError(
          422,
          'BROKEN_REFERENCE',
          `Transaction ${t.exportId} references missing category/account`,
        );
      }
    }
    for (const m of envelope.movements) {
      if (!accIds.has(m.sourceAccountExportId) || !accIds.has(m.destinationAccountExportId)) {
        throw new AppError(
          422,
          'BROKEN_REFERENCE',
          `Movement ${m.exportId} references missing account`,
        );
      }
    }
    for (const p of envelope.liabilityPayments) {
      if (!accIds.has(p.accountExportId)) {
        throw new AppError(
          422,
          'BROKEN_REFERENCE',
          `Liability payment ${p.exportId} references missing account`,
        );
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
            firstName: envelope.user.firstName,
            lastName: envelope.user.lastName,
            preferredLanguage: envelope.user.preferredLanguage,
            preferredTheme: envelope.user.preferredTheme,
          },
        });

        // Insert categories
        const catMap = new Map<string, string>();
        for (const c of envelope.categories) {
          const created = await tx.category.create({
            data: { userId, name: c.name, type: c.type },
          });
          catMap.set(c.exportId, created.id);
        }

        // Insert accounts with initial balances
        const accMap = new Map<string, string>();
        for (const a of envelope.accounts) {
          const total = a.initial.availableBalance + a.initial.savingsBalance;
          const created = await tx.account.create({
            data: {
              userId,
              name: a.name,
              availableBalance: BigInt(a.initial.availableBalance),
              savingsBalance: BigInt(a.initial.savingsBalance),
              liabilitiesBalance: BigInt(a.initial.liabilitiesBalance),
              total: BigInt(total),
            },
          });
          accMap.set(a.exportId, created.id);
        }

        // Replay transactions chronologically
        const allEvents: Array<{ kind: 'tx' | 'mov' | 'lp'; date: string; idx: number }> = [
          ...envelope.transactions.map((item, idx) => ({
            kind: 'tx' as const,
            date: item.date,
            idx,
          })),
          ...envelope.movements.map((item, idx) => ({
            kind: 'mov' as const,
            date: item.date,
            idx,
          })),
          ...envelope.liabilityPayments.map((item, idx) => ({
            kind: 'lp' as const,
            date: item.date,
            idx,
          })),
        ];
        allEvents.sort((a, b) => a.date.localeCompare(b.date));

        for (const ev of allEvents) {
          if (ev.kind === 'tx') {
            const t = envelope.transactions[ev.idx]!;
            const accountId = accMap.get(t.accountExportId)!;
            const categoryId = catMap.get(t.categoryExportId)!;
            const cat = await tx.category.findUniqueOrThrow({ where: { id: categoryId } });
            const amount = BigInt(t.amount);
            await lockAccountsForUpdate(tx, userId, [accountId]);
            await applyDeltaToAccount(tx, accountId, deltaForTransaction(t.type, amount));
            await tx.transaction.create({
              data: {
                userId,
                accountId,
                categoryId,
                categoryType: cat.type,
                description: t.description,
                date: new Date(`${t.date}T00:00:00.000Z`),
                type: t.type,
                amount,
              },
            });
          } else if (ev.kind === 'mov') {
            const m = envelope.movements[ev.idx]!;
            const source = accMap.get(m.sourceAccountExportId)!;
            const destination = accMap.get(m.destinationAccountExportId)!;
            const amount = BigInt(m.amount);
            await lockAccountsForUpdate(tx, userId, [source, destination]);
            if (m.flow === 'INTER_AVAILABLE') {
              await applyDeltaToAccount(tx, source, {
                availableBalance: -amount,
                savingsBalance: 0n,
                liabilitiesBalance: 0n,
              });
              await applyDeltaToAccount(tx, destination, {
                availableBalance: amount,
                savingsBalance: 0n,
                liabilitiesBalance: 0n,
              });
            } else if (m.flow === 'INTRA_AVAILABLE_TO_SAVINGS') {
              await applyDeltaToAccount(tx, source, {
                availableBalance: -amount,
                savingsBalance: amount,
                liabilitiesBalance: 0n,
              });
            } else {
              await applyDeltaToAccount(tx, source, {
                availableBalance: amount,
                savingsBalance: -amount,
                liabilitiesBalance: 0n,
              });
            }
            await tx.movement.create({
              data: {
                userId,
                sourceAccountId: source,
                destinationAccountId: destination,
                flow: m.flow,
                description: m.description,
                date: new Date(`${m.date}T00:00:00.000Z`),
                amount,
              },
            });
          } else {
            const p = envelope.liabilityPayments[ev.idx]!;
            const accountId = accMap.get(p.accountExportId)!;
            const amount = BigInt(p.amount);
            await lockAccountsForUpdate(tx, userId, [accountId]);
            await applyDeltaToAccount(tx, accountId, {
              availableBalance: -amount,
              savingsBalance: 0n,
              liabilitiesBalance: -amount,
            });
            await tx.liabilityPayment.create({
              data: {
                userId,
                accountId,
                description: p.description,
                date: new Date(`${p.date}T00:00:00.000Z`),
                amount,
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
