import type { FastifyPluginAsync } from 'fastify';
import { config } from '../../config.js';
import { AuthService, publicUser } from './service.js';
import { loginBodySchema, registerBodySchema } from './schemas.js';
import { AppError } from '../../shared/errors.js';

const REFRESH_COOKIE = 'pft_refresh';

export const authRoutes: FastifyPluginAsync = async (app) => {
  const service = new AuthService(app.prisma);

  const setRefreshCookie = (reply: import('fastify').FastifyReply, raw: string, expiresAt: Date) => {
    reply.setCookie(REFRESH_COOKIE, raw, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/api/v1/auth',
      expires: expiresAt,
    });
  };
  const clearRefreshCookie = (reply: import('fastify').FastifyReply) => {
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  };

  app.post(
    '/register',
    {
      schema: { body: registerBodySchema },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const user = await service.register(req.body);
      const accessToken = await reply.jwtSign({ sub: user.id });
      const { raw, expiresAt } = await service.issueRefreshToken(user.id, req.headers['user-agent'] ?? undefined);
      setRefreshCookie(reply, raw, expiresAt);
      return { user: publicUser(user), accessToken };
    },
  );

  app.post(
    '/login',
    {
      schema: { body: loginBodySchema },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const user = await service.login(req.body);
      const accessToken = await reply.jwtSign({ sub: user.id });
      const { raw, expiresAt } = await service.issueRefreshToken(user.id, req.headers['user-agent'] ?? undefined);
      setRefreshCookie(reply, raw, expiresAt);
      return { user: publicUser(user), accessToken };
    },
  );

  app.post('/refresh', async (req, reply) => {
    const raw = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (!raw) throw new AppError(401, 'NO_REFRESH', 'Missing refresh token');
    const { raw: newRaw, expiresAt, userId } = await service.rotateRefreshToken(
      raw,
      req.headers['user-agent'] ?? undefined,
    );
    setRefreshCookie(reply, newRaw, expiresAt);
    const accessToken = await reply.jwtSign({ sub: userId });
    return { accessToken };
  });

  app.post('/logout', async (req, reply) => {
    const raw = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (raw) await service.revokeRefreshToken(raw);
    clearRefreshCookie(reply);
    return reply.code(204).send();
  });

  app.get(
    '/me',
    {
      preHandler: app.requireAuth,
    },
    async (req) => {
      const user = await service.getUser(req.userId);
      return { user: publicUser(user) };
    },
  );
};
