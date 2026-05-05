import { z } from 'zod';
import {
  csvSchema,
  dateOnlySchema,
  monthSchema,
  moneyPositiveIntSchema,
  uuidSchema,
} from '../../shared/zod.js';

export const transactionTipoSchema = z.enum(['ingreso', 'egreso', 'pasivo']);

export const createTransactionSchema = z.object({
  descripcion: z.string().min(1).max(200).trim(),
  fecha: dateOnlySchema,
  tipo: transactionTipoSchema,
  valor: moneyPositiveIntSchema,
  accountId: uuidSchema,
  categoryId: uuidSchema,
});

export const updateTransactionSchema = z
  .object({
    descripcion: z.string().min(1).max(200).trim().optional(),
    fecha: dateOnlySchema.optional(),
    tipo: transactionTipoSchema.optional(),
    valor: moneyPositiveIntSchema.optional(),
    accountId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
  })
  .strict();

export const listTransactionsQuerySchema = z.object({
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
  categoryIds: csvSchema(uuidSchema),
  tipos: csvSchema(transactionTipoSchema),
  valorMin: z.coerce.number().int().nonnegative().optional(),
  valorMax: z.coerce.number().int().nonnegative().optional(),
  q: z.string().max(120).optional(),
  sort: z
    .enum(['fecha', '-fecha', 'valor', '-valor', 'created', '-created'])
    .default('-fecha'),
});

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
