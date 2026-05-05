import { z } from 'zod';
import { moneyIntSchema } from '../../shared/zod.js';

export const createAccountSchema = z.object({
  nombre: z.string().min(1).max(80).trim(),
  disponible: moneyIntSchema.default(0),
  ahorro: moneyIntSchema.default(0),
  pasivos: moneyIntSchema.default(0),
});

export const updateAccountSchema = z
  .object({
    nombre: z.string().min(1).max(80).trim().optional(),
  })
  .strict();
