import { z } from 'zod';
import {
  csvSchema,
  dateOnlySchema,
  monthSchema,
  moneyPositiveIntSchema,
  uuidSchema,
} from '../../shared/zod.js';

export const transactionTypeSchema = z.enum(['income', 'expense', 'liability']);

export const createTransactionSchema = z.object({
  description: z.string().min(1).max(200).trim(),
  date: dateOnlySchema,
  type: transactionTypeSchema,
  amount: moneyPositiveIntSchema,
  accountId: uuidSchema,
  categoryId: uuidSchema,
});

export const updateTransactionSchema = z
  .object({
    description: z.string().min(1).max(200).trim().optional(),
    date: dateOnlySchema.optional(),
    type: transactionTypeSchema.optional(),
    amount: moneyPositiveIntSchema.optional(),
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
  types: csvSchema(transactionTypeSchema),
  amountMin: z.coerce.number().int().nonnegative().optional(),
  amountMax: z.coerce.number().int().nonnegative().optional(),
  q: z.string().max(120).optional(),
  sort: z.enum(['date', '-date', 'amount', '-amount', 'created', '-created']).default('-date'),
});

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
