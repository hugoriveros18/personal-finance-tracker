import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Prisma } from '@prisma/client';
import { idParamSchema } from '../../shared/zod.js';
import { buildPaginated } from '../../shared/pagination.js';
import { monthRange } from '../../shared/dates.js';
import {
  createLiabilityPaymentSchema,
  listLiabilityPaymentsQuerySchema,
  updateLiabilityPaymentSchema,
} from './schemas.js';
import { LiabilityPaymentsService } from './service.js';

export const liabilityPaymentsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireAuth);
  const service = new LiabilityPaymentsService(app.prisma);

  app.get('/', { schema: { querystring: listLiabilityPaymentsQuerySchema } }, async (req) => {
    const q = req.query;
    const where: Prisma.LiabilityPaymentWhereInput = { userId: req.userId };
    if (q.month) {
      const { from, to } = monthRange(q.month);
      where.date = { gte: from, lte: to };
    } else if (q.from || q.to) {
      where.date = {};
      if (q.from) where.date.gte = new Date(`${q.from}T00:00:00.000Z`);
      if (q.to) where.date.lte = new Date(`${q.to}T00:00:00.000Z`);
    }
    if (q.accountIds?.length) where.accountId = { in: q.accountIds };
    if (q.amountMin !== undefined || q.amountMax !== undefined) {
      where.amount = {};
      if (q.amountMin !== undefined) where.amount.gte = BigInt(q.amountMin);
      if (q.amountMax !== undefined) where.amount.lte = BigInt(q.amountMax);
    }
    const [items, total, sum] = await Promise.all([
      app.prisma.liabilityPayment.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      app.prisma.liabilityPayment.count({ where }),
      app.prisma.liabilityPayment.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      ...buildPaginated(items, total, q),
      totals: { totalAmount: Number(sum._sum.amount ?? 0n) },
    };
  });

  app.get('/:id', { schema: { params: idParamSchema } }, async (req) => {
    const item = await app.prisma.liabilityPayment.findFirstOrThrow({
      where: { id: req.params.id, userId: req.userId },
    });
    return { item };
  });

  app.post('/', { schema: { body: createLiabilityPaymentSchema } }, async (req, reply) => {
    const item = await service.create(req.userId, req.body);
    return reply.code(201).send({ item });
  });

  app.patch(
    '/:id',
    { schema: { params: idParamSchema, body: updateLiabilityPaymentSchema } },
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
