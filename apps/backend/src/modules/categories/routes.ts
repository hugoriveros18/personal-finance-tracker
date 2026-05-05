import type { FastifyPluginAsync } from 'fastify';
import { idParamSchema } from '../../shared/zod.js';
import {
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from './schemas.js';

export const categoriesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', { schema: { querystring: listCategoriesQuerySchema } }, async (req) => {
    const items = await app.prisma.category.findMany({
      where: { userId: req.userId, ...(req.query.tipo ? { tipo: req.query.tipo } : {}) },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    });
    return { items };
  });

  app.get('/:id', { schema: { params: idParamSchema } }, async (req) => {
    const item = await app.prisma.category.findFirstOrThrow({
      where: { id: req.params.id, userId: req.userId },
    });
    return { item };
  });

  app.post('/', { schema: { body: createCategorySchema } }, async (req, reply) => {
    const item = await app.prisma.category.create({
      data: { ...req.body, userId: req.userId },
    });
    return reply.code(201).send({ item });
  });

  app.patch(
    '/:id',
    { schema: { params: idParamSchema, body: updateCategorySchema } },
    async (req) => {
      // Ensure ownership
      await app.prisma.category.findFirstOrThrow({
        where: { id: req.params.id, userId: req.userId },
      });
      const item = await app.prisma.category.update({
        where: { id: req.params.id },
        data: req.body,
      });
      return { item };
    },
  );

  app.delete('/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    await app.prisma.category.findFirstOrThrow({
      where: { id: req.params.id, userId: req.userId },
    });
    await app.prisma.category.delete({ where: { id: req.params.id } });
    return reply.code(204).send();
  });
};
