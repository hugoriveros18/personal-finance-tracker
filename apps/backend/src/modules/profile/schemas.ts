import { z } from 'zod';

export const patchProfileSchema = z
  .object({
    nombre: z.string().min(1).max(80).trim().optional(),
    apellidos: z.string().min(1).max(120).trim().optional(),
    email: z.string().email().max(254).trim().toLowerCase().optional(),
    preferredLanguage: z.enum(['es', 'en']).optional(),
    preferredTheme: z.enum(['light', 'dark']).optional(),
  })
  .strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});
