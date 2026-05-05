import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { PrismaClient, User } from '@prisma/client';
import { config } from '../../config.js';
import { Conflict, Forbidden, AppError } from '../../shared/errors.js';
import type { UserPublic } from './schemas.js';

const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const REFRESH_TTL_DAYS = 30;

export function publicUser(u: User): UserPublic {
  return {
    id: u.id,
    nombre: u.nombre,
    apellidos: u.apellidos,
    email: u.email,
    avatarPath: u.avatarPath,
    preferredLanguage: u.preferredLanguage,
    preferredTheme: u.preferredTheme,
  };
}

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(input: { nombre: string; apellidos: string; email: string; password: string }) {
    if (config.SINGLE_USER_MODE) {
      const count = await this.prisma.user.count();
      if (count > 0) {
        throw new Forbidden('Registration is disabled (single-user mode)');
      }
    }
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw Conflict('EMAIL_TAKEN', 'Email is already registered');
    }
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTS);
    const user = await this.prisma.user.create({
      data: {
        nombre: input.nombre,
        apellidos: input.apellidos,
        email: input.email,
        passwordHash,
      },
    });
    return user;
  }

  async login(input: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    return user;
  }

  async issueRefreshToken(userId: string, userAgent?: string) {
    const raw = crypto.randomBytes(48).toString('base64url');
    const tokenHash = sha256(raw);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt, userAgent: userAgent ?? null },
    });
    return { raw, expiresAt };
  }

  async rotateRefreshToken(rawToken: string, userAgent?: string) {
    const tokenHash = sha256(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new AppError(401, 'INVALID_REFRESH', 'Refresh token invalid or expired');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      const raw = crypto.randomBytes(48).toString('base64url');
      const newHash = sha256(raw);
      const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
      await tx.refreshToken.create({
        data: { userId: stored.userId, tokenHash: newHash, expiresAt, userAgent: userAgent ?? null },
      });
      return { raw, expiresAt, userId: stored.userId };
    });
  }

  async revokeRefreshToken(rawToken: string) {
    const tokenHash = sha256(rawToken);
    await this.prisma.refreshToken
      .update({ where: { tokenHash }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getUser(id: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id } });
  }
}
