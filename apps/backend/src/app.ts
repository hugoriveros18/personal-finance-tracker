import path from 'node:path';
import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { config } from './config.js';
import { prismaPlugin } from './plugins/prisma.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { authPlugin } from './plugins/auth.js';
import { bigintPlugin } from './plugins/bigint.js';

import { authRoutes } from './modules/auth/routes.js';
import { profileRoutes } from './modules/profile/routes.js';
import { accountsRoutes } from './modules/accounts/routes.js';
import { categoriesRoutes } from './modules/categories/routes.js';
import { transactionsRoutes } from './modules/transactions/routes.js';
import { movementsRoutes } from './modules/movements/routes.js';
import { liabilityPaymentsRoutes } from './modules/liability-payments/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { backupRoutes } from './modules/backup/routes.js';

export async function buildApp() {
  const app = fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
          : undefined,
    },
    bodyLimit: 10 * 1024 * 1024,
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(bigintPlugin);
  await app.register(errorHandlerPlugin);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(cors, {
    origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: { private: config.JWT_ACCESS_SECRET, public: config.JWT_ACCESS_SECRET },
    sign: { expiresIn: config.ACCESS_TOKEN_TTL },
  });
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    allowList: () => false,
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);

  // Static avatar serving
  await app.register(staticPlugin, {
    root: path.join(config.UPLOAD_DIR, 'avatars'),
    prefix: '/uploads/avatars/',
    decorateReply: false,
  });

  app.get('/api/v1/health', async (req) => {
    let dbOk = true;
    try {
      await req.server.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
    }
    return { status: 'ok', db: dbOk ? 'ok' : 'down', uptime: process.uptime() };
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(profileRoutes, { prefix: '/me' });
      await api.register(accountsRoutes, { prefix: '/accounts' });
      await api.register(categoriesRoutes, { prefix: '/categories' });
      await api.register(transactionsRoutes, { prefix: '/transactions' });
      await api.register(movementsRoutes, { prefix: '/movements' });
      await api.register(liabilityPaymentsRoutes, { prefix: '/liability-payments' });
      await api.register(dashboardRoutes, { prefix: '/dashboard' });
      await api.register(backupRoutes, { prefix: '' });
    },
    { prefix: '/api/v1' },
  );

  return app;
}
