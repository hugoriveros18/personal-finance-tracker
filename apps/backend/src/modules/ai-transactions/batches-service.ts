import { Prisma, type PrismaClient } from '@prisma/client';
import { AppError, NotFound } from '../../shared/errors.js';
import { calendarToday } from './dates.js';
import { scopedMessage, organizeMessage } from './organization.js';
import type { InterpretationProvider } from './provider.js';
import { unsupportedMessage } from './resolution.js';
import { resolveBatchProposal } from './batch-resolution.js';
import { extractionSchema, organizationContextSchema } from './schemas.js';

export class AiTransactionBatchesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: InterpretationProvider,
    private readonly timeZone: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async organize(
    userId: string,
    requestId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<Prisma.AiTransactionBatchGetPayload<{ include: { items: true } }>> {
    const existing = await this.prisma.aiTransactionBatch.findUnique({
      where: { userId_requestId: { userId, requestId } },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (existing) {
      if (existing.message !== message)
        throw new AppError(409, 'AI_REQUEST_CONFLICT', 'Message identity conflict');
      return existing;
    }
    const now = this.clock();
    const organization = await organizeMessage(message, this.provider, signal);
    if (signal?.aborted) throw new AppError(409, 'AI_INTERRUPTED', 'Organization interrupted');
    try {
      return await this.prisma.aiTransactionBatch.create({
        data: {
          userId,
          requestId,
          message,
          referenceDate: calendarToday(now, this.timeZone),
          timeZone: this.timeZone,
          notes: organization.notes,
          expiresAt: new Date(this.clock().getTime() + 90 * 60_000),
          items: {
            create: organization.items.map((item, position) => ({
              position,
              sourceText: item.text,
              context: item.context,
              kind: item.kind,
            })),
          },
        },
        include: { items: { orderBy: { position: 'asc' } } },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      // A concurrent identical organization must return the winning stable item identities.
      return this.organize(userId, requestId, message, signal);
    }
  }

  async prepare(userId: string, batchId: string, itemId: string, signal?: AbortSignal) {
    const item = await this.prisma.aiTransactionBatchItem.findFirst({
      where: { id: itemId, batchId, batch: { userId } },
      include: { batch: true, draft: true },
    });
    if (!item) throw NotFound('batch item');
    if (item.draft) return this.receipt(userId, item.draft);
    if (item.batch.expiresAt <= this.clock())
      throw new AppError(409, 'AI_DRAFT_INACTIVE', 'Batch expired');
    if (item.kind === 'cancelled') throw new AppError(409, 'AI_DRAFT_INACTIVE', 'Item discarded');
    if (item.kind === 'unsupported')
      throw new AppError(422, 'AI_UNSUPPORTED', 'Operation unsupported');
    const context = organizationContextSchema.parse(item.context);
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
    const message = scopedMessage(
      item.sourceText,
      context,
      accounts,
      categories,
      item.batch.referenceDate,
    );
    if (unsupportedMessage(message))
      throw new AppError(422, 'AI_UNSUPPORTED', 'Operation unsupported');
    const providerContext = {
      accounts: accounts.map(({ name }) => ({ name })),
      categories: categories.map(({ name, type }) => ({ name, type })),
      today: item.batch.referenceDate,
      timeZone: item.batch.timeZone,
    };
    if (JSON.stringify(providerContext).length > 8000)
      throw new AppError(422, 'AI_CONTEXT_TOO_LARGE', 'Context too large');
    const parsed = extractionSchema.safeParse(
      item.kind === 'unclear'
        ? {
            intent: 'transaction',
            type: null,
            amountText: null,
            description: item.sourceText.slice(0, 200),
            dateText: null,
            accountMentioned: false,
            accountName: null,
            categoryName: null,
          }
        : await this.provider.interpret(message, providerContext, signal),
    );
    if (!parsed.success) throw new AppError(502, 'AI_INVALID_RESPONSE', 'Invalid extraction');
    if (signal?.aborted) throw new AppError(409, 'AI_INTERRUPTED', 'Preparation interrupted');
    if (parsed.data.intent !== 'transaction')
      throw new AppError(422, 'AI_UNSUPPORTED', 'Operation unsupported');
    const proposal = resolveBatchProposal(
      parsed.data,
      item.sourceText,
      context,
      accounts,
      categories,
      user.defaultAccountId,
      item.batch.referenceDate,
      item.kind === 'unclear',
    );
    const draft = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ai_transaction_batch_item WHERE id = ${itemId}::uuid FOR UPDATE`;
      const current = await tx.aiTransactionBatchItem.findUniqueOrThrow({
        where: { id: itemId },
        include: { draft: true },
      });
      if (current.draft) return current.draft;
      const currentBatch = await tx.aiTransactionBatch.findUniqueOrThrow({
        where: { id: batchId },
      });
      if (currentBatch.expiresAt <= this.clock())
        throw new AppError(409, 'AI_DRAFT_INACTIVE', 'Batch expired');
      if (current.kind === 'cancelled')
        throw new AppError(409, 'AI_DRAFT_INACTIVE', 'Item discarded');
      const created = await tx.aiTransactionDraft.create({
        data: {
          userId,
          proposal,
          expiresAt: new Date(this.clock().getTime() + 90 * 60_000),
        },
      });
      await tx.aiTransactionBatchItem.update({
        where: { id: itemId },
        data: { draftId: created.id },
      });
      return created;
    });
    return this.receipt(userId, draft);
  }

  async cancel(userId: string, batchId: string, itemId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT item.id FROM ai_transaction_batch_item item
        JOIN ai_transaction_batch batch ON item.batch_id = batch.id
        WHERE item.id = ${itemId}::uuid AND batch.id = ${batchId}::uuid AND batch.user_id = ${userId}::uuid
        FOR UPDATE OF item`;
      const item = await tx.aiTransactionBatchItem.findFirst({
        where: { id: itemId, batchId, batch: { userId } },
      });
      if (!item) throw NotFound('batch item');
      if (item.draftId) {
        await tx.$queryRaw`SELECT id FROM ai_transaction_draft WHERE id = ${item.draftId}::uuid FOR UPDATE`;
        const draft = await tx.aiTransactionDraft.findUniqueOrThrow({
          where: { id: item.draftId },
        });
        if (draft.status === 'confirmed')
          throw new AppError(409, 'AI_DRAFT_CONSUMED', 'Item already confirmed');
        await tx.aiTransactionDraft.update({
          where: { id: draft.id },
          data: { status: 'cancelled' },
        });
      }
      await tx.aiTransactionBatchItem.update({
        where: { id: itemId },
        data: { kind: 'cancelled' },
      });
    });
  }

  private async receipt(
    userId: string,
    draft: {
      id: string;
      proposal: Prisma.JsonValue;
      expiresAt: Date;
      status: string;
      transactionId: string | null;
    },
  ) {
    if (draft.status === 'confirmed') {
      const result = await this.prisma.transaction.findFirst({
        where: { id: draft.transactionId!, userId },
      });
      if (!result) throw new AppError(409, 'AI_DRAFT_CONSUMED', 'Transaction removed');
      return { draft, result };
    }
    if (draft.status === 'cancelled' || draft.expiresAt <= this.clock())
      throw new AppError(409, 'AI_DRAFT_INACTIVE', 'Draft inactive');
    return { draft, result: null };
  }
}
