import { z } from 'zod';
import { moneyIntSchema } from '../../shared/zod.js';

export const createAccountSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  availableBalance: moneyIntSchema.default(0),
  savingsBalance: moneyIntSchema.default(0),
  liabilitiesBalance: moneyIntSchema.default(0),
});

export const updateAccountSchema = z
  .object({
    name: z.string().min(1).max(80).trim().optional(),
  })
  .strict();
