import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { config } from '../../config.js';
import { AppError } from '../../shared/errors.js';
import { idParamSchema } from '../../shared/zod.js';
import { AiTransactionsService } from './service.js';
import { AiTransactionBatchesService } from './batches-service.js';
import { ModelSession } from './model-session.js';
import { createInterpretSchema, batchItemParamsSchema } from './schemas.js';
import { OllamaProvider } from './ollama-provider.js';
import type { InterpretationProvider } from './provider.js';

export const aiTransactionsRoutes: FastifyPluginAsyncZod<{
  provider?: InterpretationProvider;
}> = async (app, options) => {
  app.addHook('preHandler', app.requireAuth);
  const provider =
    options.provider ??
    new OllamaProvider({
      baseUrl: config.OLLAMA_BASE_URL,
      model: config.OLLAMA_MODEL,
      timeoutMs: config.OLLAMA_TIMEOUT_MS,
      numCtx: config.OLLAMA_NUM_CTX,
      numPredict: config.OLLAMA_NUM_PREDICT,
      keepAliveSeconds: config.OLLAMA_KEEP_ALIVE_SECONDS,
      lifecycle: config.OLLAMA_MODEL_LIFECYCLE,
    });
  const modelSession = new ModelSession(provider, config.OLLAMA_MODEL_LIFECYCLE, (error) => {
    app.log.warn({ err: error }, 'Local AI lifecycle request failed');
  });
  app.addHook('onReady', async () => {
    if (config.AI_TRANSACTIONS_ENABLED) void modelSession.start();
  });
  app.addHook('preClose', async () => modelSession.close());
  app.addHook('onClose', async () => modelSession.close());
  const service = new AiTransactionsService(app.prisma, provider, config.AI_TRANSACTIONS_TIME_ZONE);
  const batches = new AiTransactionBatchesService(
    app.prisma,
    provider,
    config.AI_TRANSACTIONS_TIME_ZONE,
  );
  app.get('/capabilities', async () => ({
    enabled: config.AI_TRANSACTIONS_ENABLED,
    maxMessageLength: config.AI_TRANSACTIONS_MAX_MESSAGE_LENGTH,
  }));
  const requireEnabled = async () => {
    if (!config.AI_TRANSACTIONS_ENABLED)
      throw new AppError(404, 'AI_DISABLED', 'AI experiment is disabled');
  };
  app.post(
    '/interpret',
    {
      preHandler: requireEnabled,
      schema: { body: createInterpretSchema(config.AI_TRANSACTIONS_MAX_MESSAGE_LENGTH) },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const controller = new AbortController();
      const disconnected = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      reply.raw.on('close', disconnected);
      try {
        if (req.body.requestId) {
          const batch = await modelSession.run((signal) =>
            batches.organize(
              req.userId,
              req.body.requestId!,
              req.body.message,
              AbortSignal.any([signal, controller.signal]),
            ),
          );
          if (
            batch.items.length === 1 &&
            batch.items[0]!.kind !== 'unsupported' &&
            batch.items[0]!.kind !== 'cancelled'
          ) {
            const result = await modelSession.run((signal) =>
              batches.prepare(
                req.userId,
                batch.id,
                batch.items[0]!.id,
                AbortSignal.any([signal, controller.signal]),
              ),
            );
            return result;
          }
          return { batch };
        }
        return {
          draft: await modelSession.run((signal) =>
            service.interpret(
              req.userId,
              req.body.message,
              AbortSignal.any([signal, controller.signal]),
            ),
          ),
        };
      } finally {
        reply.raw.off('close', disconnected);
      }
    },
  );
  app.post(
    '/batches/:id/items/:itemId/interpret',
    {
      preHandler: requireEnabled,
      schema: { params: batchItemParamsSchema },
      config: { rateLimit: { max: 40, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const controller = new AbortController();
      const disconnected = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      reply.raw.on('close', disconnected);
      try {
        return await modelSession.run((signal) =>
          batches.prepare(
            req.userId,
            req.params.id,
            req.params.itemId,
            AbortSignal.any([signal, controller.signal]),
          ),
        );
      } finally {
        reply.raw.off('close', disconnected);
      }
    },
  );
  app.post(
    '/batches/:id/items/:itemId/cancel',
    {
      preHandler: requireEnabled,
      schema: { params: batchItemParamsSchema },
    },
    async (req, reply) => {
      await batches.cancel(req.userId, req.params.id, req.params.itemId);
      return reply.code(204).send();
    },
  );
  // Parse inside the service once: the existing date schema transforms strings into Date objects.
  app.post(
    '/:id/confirm',
    { preHandler: requireEnabled, schema: { params: idParamSchema } },
    async (req, reply) => {
      const result = await service.confirm(req.userId, req.params.id, req.body);
      return reply.code(result.replayed ? 200 : 201).send(result);
    },
  );
  app.post(
    '/:id/cancel',
    { preHandler: requireEnabled, schema: { params: idParamSchema } },
    async (req, reply) => {
      await service.cancel(req.userId, req.params.id);
      return reply.code(204).send();
    },
  );
};
