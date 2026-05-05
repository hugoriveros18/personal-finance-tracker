import { z } from 'zod';
import {
  csvSchema,
  dateOnlySchema,
  monthSchema,
  moneyPositiveIntSchema,
  uuidSchema,
} from '../../shared/zod.js';

export const createLiabilityPaymentSchema = z.object({
  descripcion: z.string().min(1).max(200).trim(),
  fecha: dateOnlySchema,
  valor: moneyPositiveIntSchema,
  accountId: uuidSchema,
});

export const updateLiabilityPaymentSchema = z
  .object({
    descripcion: z.string().min(1).max(200).trim().optional(),
    fecha: dateOnlySchema.optional(),
    valor: moneyPositiveIntSchema.optional(),
    accountId: uuidSchema.optional(),
  })
  .strict();

export const listLiabilityPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  month: monthSchema.optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  accountIds: csvSchema(uuidSchema),
  valorMin: z.coerce.number().int().nonnegative().optional(),
  valorMax: z.coerce.number().int().nonnegative().optional(),
});
