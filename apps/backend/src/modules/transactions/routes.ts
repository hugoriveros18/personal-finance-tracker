import type { FastifyPluginAsync } from 'fastify';
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

export const transactionsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);
  const service = new TransactionsService(app.prisma);

  app.get(
    '/',
    { schema: { querystring: listTransactionsQuerySchema } },
    async (req) => {
      const q = req.query;
      const where: Prisma.TransactionWhereInput = { userId: req.userId };

      if (q.month) {
        const { from, to } = monthRange(q.month);
        where.fecha = { gte: from, lte: to };
      } else if (q.from || q.to) {
        where.fecha = {};
        if (q.from) where.fecha.gte = new Date(`${q.from}T00:00:00.000Z`);
        if (q.to) where.fecha.lte = new Date(`${q.to}T00:00:00.000Z`);
      }
      if (q.accountIds?.length) where.accountId = { in: q.accountIds };
      if (q.categoryIds?.length) where.categoryId = { in: q.categoryIds };
      if (q.tipos?.length) where.tipo = { in: q.tipos };
      if (q.valorMin !== undefined || q.valorMax !== undefined) {
        where.valor = {};
        if (q.valorMin !== undefined) where.valor.gte = BigInt(q.valorMin);
        if (q.valorMax !== undefined) where.valor.lte = BigInt(q.valorMax);
      }
      if (q.q) where.descripcion = { contains: q.q, mode: 'insensitive' };

      const orderBy: Prisma.TransactionOrderByWithRelationInput[] = (() => {
        const dir = q.sort.startsWith('-') ? 'desc' : 'asc';
        const field = q.sort.replace('-', '');
        switch (field) {
          case 'fecha':
            return [{ fecha: dir }, { createdAt: dir }];
          case 'valor':
            return [{ valor: dir }, { createdAt: dir }];
          case 'created':
            return [{ createdAt: dir }];
          default:
            return [{ fecha: 'desc' }, { createdAt: 'desc' }];
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
          by: ['tipo'],
          where,
          _sum: { valor: true },
        }),
      ]);

      const totalsByTipo: Record<string, number> = { ingreso: 0, egreso: 0, pasivo: 0 };
      for (const row of sums) {
        totalsByTipo[row.tipo] = Number(row._sum.valor ?? 0n);
      }

      return {
        ...buildPaginated(items, total, q),
        totals: totalsByTipo,
      };
    },
  );

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
