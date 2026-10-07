import { z } from 'zod';
import {
  csvSchema,
  dateOnlySchema,
  monthSchema,
  moneyPositiveIntSchema,
  uuidSchema,
} from '../../shared/zod.js';

export const movementFlowSchema = z.enum([
  'INTER_AVAILABLE',
  'INTRA_AVAILABLE_TO_SAVINGS',
  'INTRA_SAVINGS_TO_AVAILABLE',
]);

export const createMovementSchema = z
  .object({
    description: z.string().min(1).max(200).trim(),
    date: dateOnlySchema,
    flow: movementFlowSchema,
    amount: moneyPositiveIntSchema,
    sourceAccountId: uuidSchema,
    destinationAccountId: uuidSchema,
  })
  .superRefine((v, ctx) => {
    if (v.flow === 'INTER_AVAILABLE' && v.sourceAccountId === v.destinationAccountId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Inter-account movements require different accounts',
        path: ['destinationAccountId'],
      });
    }
    if (v.flow !== 'INTER_AVAILABLE' && v.sourceAccountId !== v.destinationAccountId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Intra-account movements require the same account on both sides',
        path: ['destinationAccountId'],
      });
    }
  });

export const updateMovementSchema = z
  .object({
    description: z.string().min(1).max(200).trim().optional(),
    date: dateOnlySchema.optional(),
    flow: movementFlowSchema.optional(),
    amount: moneyPositiveIntSchema.optional(),
    sourceAccountId: uuidSchema.optional(),
    destinationAccountId: uuidSchema.optional(),
  })
  .strict();

export const listMovementsQuerySchema = z.object({
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
  sourceAccountIds: csvSchema(uuidSchema),
  destinationAccountIds: csvSchema(uuidSchema),
  // accountIds matches movements where the account is EITHER source or destination
  // (used by the account-detail page to show all movements involving an account).
  accountIds: csvSchema(uuidSchema),
  flows: csvSchema(movementFlowSchema),
  amountMin: z.coerce.number().int().nonnegative().optional(),
  amountMax: z.coerce.number().int().nonnegative().optional(),
  sort: z.enum(['date', '-date', 'amount', '-amount']).default('-date'),
});
