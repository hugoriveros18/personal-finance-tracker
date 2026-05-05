import fp from 'fastify-plugin';
import { AppError } from '../shared/errors.js';
import type { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    userId: string;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export const authPlugin = fp(async (app) => {
  const requireAuth = async (req: FastifyRequest) => {
    try {
      const decoded = await req.jwtVerify<{ sub: string }>();
      req.userId = decoded.sub;
    } catch {
      throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid token');
    }
  };
  app.decorate('requireAuth', requireAuth);
});
