import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { idParamSchema } from '../../shared/zod.js';
import { buildPaginated } from '../../shared/pagination.js';
import { monthRange } from '../../shared/dates.js';
import {
  createMovementSchema,
  listMovementsQuerySchema,
  updateMovementSchema,
} from './schemas.js';
import { MovementsService } from './service.js';

export const movementsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);
  const service = new MovementsService(app.prisma);

  app.get('/', { schema: { querystring: listMovementsQuerySchema } }, async (req) => {
    const q = req.query;
    const where: Prisma.MovementWhereInput = { userId: req.userId };

    if (q.month) {
      const { from, to } = monthRange(q.month);
      where.fecha = { gte: from, lte: to };
    } else if (q.from || q.to) {
      where.fecha = {};
      if (q.from) where.fecha.gte = new Date(`${q.from}T00:00:00.000Z`);
      if (q.to) where.fecha.lte = new Date(`${q.to}T00:00:00.000Z`);
    }
    if (q.cuentaEmisoraIds?.length) where.cuentaEmisoraId = { in: q.cuentaEmisoraIds };
    if (q.cuentaReceptoraIds?.length) where.cuentaReceptoraId = { in: q.cuentaReceptoraIds };
    if (q.accountIds?.length) {
      where.OR = [
        { cuentaEmisoraId: { in: q.accountIds } },
        { cuentaReceptoraId: { in: q.accountIds } },
      ];
    }
    if (q.flujos?.length) where.flujo = { in: q.flujos };
    if (q.valorMin !== undefined || q.valorMax !== undefined) {
      where.valor = {};
      if (q.valorMin !== undefined) where.valor.gte = BigInt(q.valorMin);
      if (q.valorMax !== undefined) where.valor.lte = BigInt(q.valorMax);
    }

    const orderBy: Prisma.MovementOrderByWithRelationInput[] = (() => {
      const dir = q.sort.startsWith('-') ? 'desc' : 'asc';
      const field = q.sort.replace('-', '');
      return field === 'valor'
        ? [{ valor: dir }, { createdAt: dir }]
        : [{ fecha: dir }, { createdAt: dir }];
    })();

    const [items, total, sum] = await Promise.all([
      app.prisma.movement.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      app.prisma.movement.count({ where }),
      app.prisma.movement.aggregate({ where, _sum: { valor: true } }),
    ]);

    return {
      ...buildPaginated(items, total, q),
      totals: { totalValor: Number(sum._sum.valor ?? 0n) },
    };
  });

  app.get('/:id', { schema: { params: idParamSchema } }, async (req) => {
    const item = await app.prisma.movement.findFirstOrThrow({
      where: { id: req.params.id, userId: req.userId },
    });
    return { item };
  });

  app.post('/', { schema: { body: createMovementSchema } }, async (req, reply) => {
    const item = await service.create(req.userId, req.body);
    return reply.code(201).send({ item });
  });

  app.patch(
    '/:id',
    { schema: { params: idParamSchema, body: updateMovementSchema } },
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
