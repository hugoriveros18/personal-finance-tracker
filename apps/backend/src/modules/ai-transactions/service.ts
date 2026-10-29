import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { AppError, NotFound } from '../../shared/errors.js';
import { TransactionsService } from '../transactions/service.js';
import { calendarToday } from './dates.js';
import { confirmSchema, extractionSchema } from './schemas.js';
import { resolveProposal, unsupportedMessage } from './resolution.js';
import type { InterpretationProvider } from './provider.js';

export class AiTransactionsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: InterpretationProvider,
    private readonly timeZone: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async interpret(userId: string, message: string, signal?: AbortSignal) {
    if (unsupportedMessage(message)) {
      throw new AppError(
        422,
        'AI_UNSUPPORTED',
        'Only one income, expense or liability purchase is supported',
      );
    }
    const [accounts, categories, user] = await Promise.all([
      this.prisma.account.findMany({ where: { userId }, select: { id: true, name: true } }),
      this.prisma.category.findMany({
        where: { userId },
        select: { id: true, name: true, type: true },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { defaultAccountId: true },
      }),
    ]);
    const now = this.clock();
    const today = calendarToday(now, this.timeZone);
    const context = {
      accounts: accounts.map(({ name }) => ({ name })),
      categories: categories.map(({ name, type }) => ({ name, type })),
      today,
      timeZone: this.timeZone,
    };
    if (JSON.stringify(context).length > 8000) {
      throw new AppError(
        422,
        'AI_CONTEXT_TOO_LARGE',
        'Too many accounts or categories for this experiment',
      );
    }
    // Provider boundary is validated again, including injected providers used by tests.
    const parsed = extractionSchema.safeParse(
      await this.provider.interpret(message, context, signal),
    );
    if (signal?.aborted) throw new AppError(409, 'AI_INTERRUPTED', 'Interpretation interrupted');
    if (!parsed.success) throw new AppError(502, 'AI_INVALID_RESPONSE', 'Invalid model response');
    if (parsed.data.intent !== 'transaction') {
      throw new AppError(
        422,
        'AI_UNSUPPORTED',
        'Please describe a single income, expense or liability purchase',
      );
    }
    const proposal = resolveProposal(
      parsed.data,
      message,
      accounts,
      categories,
      user.defaultAccountId,
      today,
    );
    // Only operational metadata is written here. Never create financial entries on interpretation.
    const draft = await this.prisma.aiTransactionDraft.create({
      data: {
        userId,
        proposal,
        expiresAt: new Date(now.getTime() + 30 * 60_000),
      },
    });
    return { id: draft.id, proposal, expiresAt: draft.expiresAt };
  }

  private async lockedDraft(tx: Prisma.TransactionClient, userId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM ai_transaction_draft
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
    const draft = await tx.aiTransactionDraft.findFirst({ where: { id, userId } });
    if (!draft) throw NotFound('draft');
    return draft;
  }

  private async serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(work, { isolationLevel: 'Serializable' });
      } catch (error) {
        const code = (error as { code?: string; meta?: { code?: string } }).code;
        const pgCode = (error as { meta?: { code?: string } }).meta?.code;
        if (attempt >= 2 || !(code === 'P2034' || pgCode === '40001' || pgCode === '40P01'))
          throw error;
      }
    }
  }

  async confirm(userId: string, id: string, payload: unknown) {
    const input = confirmSchema.parse(payload);
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          type: input.type,
          amount: input.amount,
          description: input.description,
          date: input.date.toISOString(),
          accountId: input.accountId,
          categoryId: input.categoryId,
        }),
      )
      .digest('hex');
    return this.serializable(async (tx) => {
      const draft = await this.lockedDraft(tx, userId, id);
      if (draft.status === 'confirmed') {
        if (draft.confirmedHash !== hash)
          throw new AppError(
            409,
            'AI_DRAFT_CONFLICT',
            'Draft already confirmed with different values',
          );
        const item = await tx.transaction.findFirst({
          where: { id: draft.transactionId!, userId },
        });
        if (!item)
          throw new AppError(
            409,
            'AI_DRAFT_CONSUMED',
            'The confirmed transaction no longer exists',
          );
        return { item, replayed: true };
      }
      if (draft.status === 'cancelled' || draft.expiresAt <= this.clock()) {
        throw new AppError(409, 'AI_DRAFT_INACTIVE', 'Draft cancelled or expired');
      }
      const item = await new TransactionsService(this.prisma).createInTransaction(
        tx,
        userId,
        input,
      );
      await tx.aiTransactionDraft.update({
        where: { id },
        data: {
          status: 'confirmed',
          confirmedHash: hash,
          transactionId: item.id,
        },
      });
      return { item, replayed: false };
    });
  }

  async cancel(userId: string, id: string) {
    await this.serializable(async (tx) => {
      const draft = await this.lockedDraft(tx, userId, id);
      if (draft.status === 'confirmed')
        throw new AppError(409, 'AI_DRAFT_CONSUMED', 'Draft already confirmed');
      await tx.aiTransactionDraft.update({ where: { id }, data: { status: 'cancelled' } });
    });
  }
}
