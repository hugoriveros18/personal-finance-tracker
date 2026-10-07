import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParamSchema } from '../../shared/zod.js';
import { createAccountSchema, updateAccountSchema } from './schemas.js';

export const accountsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', async (req) => {
    const items = await app.prisma.account.findMany({
      where: { userId: req.userId },
      orderBy: { name: 'asc' },
    });
    return { items };
  });

  app.get('/:id', { schema: { params: idParamSchema } }, async (req) => {
    const item = await app.prisma.account.findFirstOrThrow({
      where: { id: req.params.id, userId: req.userId },
    });
    return { item };
  });

  app.post('/', { schema: { body: createAccountSchema } }, async (req, reply) => {
    const { name, availableBalance, savingsBalance, liabilitiesBalance } = req.body;
    const item = await app.prisma.account.create({
      data: {
        userId: req.userId,
        name,
        availableBalance: BigInt(availableBalance),
        savingsBalance: BigInt(savingsBalance),
        liabilitiesBalance: BigInt(liabilitiesBalance),
        total: BigInt(availableBalance) + BigInt(savingsBalance),
      },
    });
    return reply.code(201).send({ item });
  });

  app.patch(
    '/:id',
    { schema: { params: idParamSchema, body: updateAccountSchema } },
    async (req) => {
      await app.prisma.account.findFirstOrThrow({
        where: { id: req.params.id, userId: req.userId },
      });
      const item = await app.prisma.account.update({
        where: { id: req.params.id },
        data: req.body,
      });
      return { item };
    },
  );

  app.delete('/:id', { schema: { params: idParamSchema } }, async (req, reply) => {
    await app.prisma.account.findFirstOrThrow({
      where: { id: req.params.id, userId: req.userId },
    });
    await app.prisma.account.delete({ where: { id: req.params.id } });
    return reply.code(204).send();
  });
};
