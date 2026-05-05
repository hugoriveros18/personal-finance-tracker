import { z } from 'zod';

export const registerBodySchema = z.object({
  nombre: z.string().min(1).max(80).trim(),
  apellidos: z.string().min(1).max(120).trim(),
  email: z.string().email().max(254).trim().toLowerCase(),
  password: z.string().min(8).max(128),
});

export const loginBodySchema = z.object({
  email: z.string().email().max(254).trim().toLowerCase(),
  password: z.string().min(1).max(128),
});

export const userPublicSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  apellidos: z.string(),
  email: z.string(),
  avatarPath: z.string().nullable(),
  preferredLanguage: z.enum(['es', 'en']),
  preferredTheme: z.enum(['light', 'dark']),
});

export type UserPublic = z.infer<typeof userPublicSchema>;
