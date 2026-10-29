import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createTransactionSchema } from '../transactions/schemas.js';
import { isCalendarDate } from './dates.js';
import { DEFAULT_MESSAGE_LENGTH } from './limits.js';

export const createInterpretSchema = (maxLength = DEFAULT_MESSAGE_LENGTH) =>
  z
    .object({
      message: z.string().max(maxLength).trim().min(1),
      requestId: z.string().uuid().optional(),
    })
    .strict();
export const interpretSchema = createInterpretSchema();

// Names and verbatim text only: the provider never sees or returns database identifiers.
export const extractionSchema = z
  .object({
    intent: z
      .enum(['transaction', 'unsupported', 'multiple', 'unclear'])
      .describe(
        'Only ONE income, expense or liability purchase is a transaction. Transfers, savings, debt repayments, analysis and editing are unsupported. Multiple purchases are multiple.',
      ),
    type: z.enum(['income', 'expense', 'liability']).nullable(),
    amountText: z.string().max(100).nullable(),
    description: z.string().trim().max(200).nullable(),
    dateText: z.string().max(80).nullable(),
    accountMentioned: z.boolean(),
    accountName: z.string().max(80).nullable(),
    categoryName: z
      .string()
      .max(80)
      .nullable()
      .describe(
        'Choose the most specific semantically suitable existing category for what was bought or received. Compare all compatible names; null when none fits.',
      ),
  })
  .strict();

export const extractionJsonSchema = zodToJsonSchema(extractionSchema, { target: 'jsonSchema7' });
export type Extraction = z.infer<typeof extractionSchema>;

// Describe the purchase before assigning fields so semantic categorization has a focused cue.
// This provider-only label is discarded; it never becomes a financial description or command.
export const extractionResponseSchema = z
  .object({
    purchase: z.string().trim().max(120).nullable(),
    transaction: extractionSchema,
  })
  .strict();
export const extractionResponseJsonSchema = zodToJsonSchema(extractionResponseSchema, {
  target: 'jsonSchema7',
});

export const organizationContextSchema = z
  .object({
    uncertainFields: z
      .array(z.enum(['date', 'account', 'category', 'type', 'amount']))
      .max(5)
      .default([]),
    dateText: z.string().min(1).max(160).nullable(),
    accountText: z.string().min(1).max(160).nullable(),
    categoryText: z.string().min(1).max(160).nullable(),
    paymentText: z.string().min(1).max(160).nullable(),
  })
  .strict();
export const organizationSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(2000),
            kind: z.enum(['transaction', 'unclear', 'unsupported']),
            context: organizationContextSchema,
          })
          .strict(),
      )
      .min(1)
      .max(30),
    notes: z.array(z.string().min(1).max(2000)).max(30),
  })
  .strict();
export const organizationJsonSchema = zodToJsonSchema(organizationSchema, {
  target: 'jsonSchema7',
});
export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationContext = z.infer<typeof organizationContextSchema>;
export const batchItemParamsSchema = z.object({ id: z.string().uuid(), itemId: z.string().uuid() });

// Stricter experiment boundary; retain the existing transaction contract and money limits.
export const confirmSchema = createTransactionSchema
  .extend({
    type: z.enum(['income', 'expense', 'liability']),
    description: z.string().trim().min(1).max(200),
    date: z
      .string()
      .refine(isCalendarDate, 'Invalid calendar date')
      .transform((value) => new Date(`${value}T00:00:00.000Z`)),
  })
  .strict();

export type Proposal = {
  type: 'income' | 'expense' | 'liability' | null;
  amount: number | null;
  description: string;
  date: string | null;
  accountId: string | null;
  categoryId: string | null;
  accountSource: 'mentioned' | 'default' | 'only' | 'missing';
  dateSource: 'mentioned' | 'today' | 'missing';
};
