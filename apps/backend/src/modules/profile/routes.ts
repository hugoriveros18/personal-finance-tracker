import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import argon2 from 'argon2';
import type { FastifyPluginAsync } from 'fastify';
import { config } from '../../config.js';
import { AuthService, publicUser } from '../auth/service.js';
import { AppError, Conflict } from '../../shared/errors.js';
import { changePasswordSchema, patchProfileSchema } from './schemas.js';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const profileRoutes: FastifyPluginAsync = async (app) => {
  const auth = new AuthService(app.prisma);

  app.addHook('preHandler', app.requireAuth);

  app.get('/', async (req) => {
    const user = await auth.getUser(req.userId);
    return { user: publicUser(user) };
  });

  app.patch('/', { schema: { body: patchProfileSchema } }, async (req) => {
    const data = req.body;
    if (data.email) {
      const existing = await app.prisma.user.findUnique({ where: { email: data.email } });
      if (existing && existing.id !== req.userId) {
        throw Conflict('EMAIL_TAKEN', 'Email is already registered');
      }
    }
    const user = await app.prisma.user.update({ where: { id: req.userId }, data });
    if (data.email) {
      await auth.revokeAllForUser(user.id);
    }
    return { user: publicUser(user) };
  });

  app.post('/password', { schema: { body: changePasswordSchema } }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body;
    const user = await auth.getUser(req.userId);
    const ok = await argon2.verify(user.passwordHash, currentPassword);
    if (!ok) throw new AppError(401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
    const passwordHash = await argon2.hash(newPassword, ARGON2_OPTS);
    await app.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await auth.revokeAllForUser(user.id);
    return reply.code(204).send();
  });

  app.post('/avatar', async (req) => {
    const file = await req.file();
    if (!file) throw new AppError(422, 'NO_FILE', 'No file uploaded');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new AppError(422, 'INVALID_MIME', `Unsupported mime type: ${file.mimetype}`);
    }
    const buffer = await file.toBuffer();
    if (buffer.length > 2 * 1024 * 1024) {
      throw new AppError(422, 'FILE_TOO_LARGE', 'Avatar must be ≤ 2 MB');
    }
    const processed = await sharp(buffer)
      .rotate()
      .resize({ width: 512, height: 512, fit: 'cover' })
      .webp({ quality: 88 })
      .toBuffer();
    const sha = crypto.createHash('sha256').update(processed).digest('hex').slice(0, 32);
    const filename = `${req.userId}_${sha}.webp`;
    const dir = path.join(config.UPLOAD_DIR, 'avatars');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), processed);

    const previous = await app.prisma.user.findUnique({ where: { id: req.userId } });
    if (previous?.avatarPath) {
      const prevName = previous.avatarPath.split('/').pop();
      if (prevName && prevName !== filename) {
        await fs.unlink(path.join(dir, prevName)).catch(() => undefined);
      }
    }
    const avatarPath = `/uploads/avatars/${filename}`;
    const user = await app.prisma.user.update({
      where: { id: req.userId },
      data: { avatarPath },
    });
    return { avatarPath, user: publicUser(user) };
  });

  app.delete('/avatar', async (req, reply) => {
    const user = await app.prisma.user.findUnique({ where: { id: req.userId } });
    if (user?.avatarPath) {
      const filename = user.avatarPath.split('/').pop();
      if (filename) {
        const fullPath = path.join(config.UPLOAD_DIR, 'avatars', filename);
        await fs.unlink(fullPath).catch(() => undefined);
      }
    }
    await app.prisma.user.update({ where: { id: req.userId }, data: { avatarPath: null } });
    return reply.code(204).send();
  });
};
