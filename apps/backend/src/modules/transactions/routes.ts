import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Prisma } from '@prisma/client';
import { idParamSchema } from '../../shared/zod.js';
import { buildPaginated } from '../../shared/pagination.js';
import { monthRange } from '../../shared/dates.js';
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
} from './schemas.js';
import { TransactionsService } from './service.js';

export const transactionsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireAuth);
  const service = new TransactionsService(app.prisma);

  app.get('/', { schema: { querystring: listTransactionsQuerySchema } }, async (req) => {
    const q = req.query;
    const where: Prisma.TransactionWhereInput = { userId: req.userId };

    if (q.month) {
      const { from, to } = monthRange(q.month);
      where.date = { gte: from, lte: to };
    } else if (q.from || q.to) {
      where.date = {};
      if (q.from) where.date.gte = new Date(`${q.from}T00:00:00.000Z`);
      if (q.to) where.date.lte = new Date(`${q.to}T00:00:00.000Z`);
    }
    if (q.accountIds?.length) where.accountId = { in: q.accountIds };
    if (q.categoryIds?.length) where.categoryId = { in: q.categoryIds };
    if (q.types?.length) where.type = { in: q.types };
    if (q.amountMin !== undefined || q.amountMax !== undefined) {
      where.amount = {};
      if (q.amountMin !== undefined) where.amount.gte = BigInt(q.amountMin);
      if (q.amountMax !== undefined) where.amount.lte = BigInt(q.amountMax);
    }
    if (q.q) where.description = { contains: q.q, mode: 'insensitive' };

    const orderBy: Prisma.TransactionOrderByWithRelationInput[] = (() => {
      const dir = q.sort.startsWith('-') ? 'desc' : 'asc';
      const field = q.sort.replace('-', '');
      switch (field) {
        case 'date':
          return [{ date: dir }, { createdAt: dir }];
        case 'amount':
          return [{ amount: dir }, { createdAt: dir }];
        case 'created':
          return [{ createdAt: dir }];
        default:
          return [{ date: 'desc' }, { createdAt: 'desc' }];
      }
    })();

    const [items, total, sums] = await Promise.all([
      app.prisma.transaction.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      app.prisma.transaction.count({ where }),
      app.prisma.transaction.groupBy({
        by: ['type'],
        where,
        _sum: { amount: true },
      }),
    ]);

    const totalsByType: Record<string, number> = { income: 0, expense: 0, liability: 0 };
    for (const row of sums) {
      totalsByType[row.type] = Number(row._sum.amount ?? 0n);
    }

    return {
      ...buildPaginated(items, total, q),
      totals: totalsByType,
    };
  });

  app.get('/:id', { schema: { params: idParamSchema } }, async (req) => {
    const item = await app.prisma.transaction.findFirstOrThrow({
      where: { id: req.params.id, userId: req.userId },
    });
    return { item };
  });

  app.post('/', { schema: { body: createTransactionSchema } }, async (req, reply) => {
    const item = await service.create(req.userId, req.body);
    return reply.code(201).send({ item });
  });

  app.patch(
    '/:id',
    { schema: { params: idParamSchema, body: updateTransactionSchema } },
    async (req) => {
      const item = await service.update(req.userId, req.params.id, req.body);
      return { item };
    },
  );

  app.delete('/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    await service.remove(req.userId, req.params.id);
    return reply.code(204).send();
  });
};
