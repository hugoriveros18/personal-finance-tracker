import { z } from 'zod';

export const exportEnvelopeSchema = z.object({
  $schema: z.literal('pft-export-v2'),
  exportedAt: z.string(),
  appVersion: z.string(),
  user: z.object({
    firstName: z.string().max(80),
    lastName: z.string().max(120),
    email: z.string().email().max(254),
    preferredLanguage: z.enum(['es', 'en']),
    preferredTheme: z.enum(['light', 'dark']),
  }),
  categories: z.array(
    z.object({
      exportId: z.string(),
      name: z.string().max(80),
      type: z.enum(['income', 'expense']),
    }),
  ),
  accounts: z.array(
    z.object({
      exportId: z.string(),
      name: z.string().max(80),
      initial: z.object({
        availableBalance: z.number().int().nonnegative(),
        savingsBalance: z.number().int().nonnegative(),
        liabilitiesBalance: z.number().int().nonnegative(),
      }),
    }),
  ),
  transactions: z.array(
    z.object({
      exportId: z.string(),
      accountExportId: z.string(),
      categoryExportId: z.string(),
      description: z.string().max(200),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      type: z.enum(['income', 'expense', 'liability']),
      amount: z.number().int().positive(),
    }),
  ),
  movements: z.array(
    z.object({
      exportId: z.string(),
      sourceAccountExportId: z.string(),
      destinationAccountExportId: z.string(),
      flow: z.enum(['INTER_AVAILABLE', 'INTRA_AVAILABLE_TO_SAVINGS', 'INTRA_SAVINGS_TO_AVAILABLE']),
      description: z.string().max(200),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amount: z.number().int().positive(),
    }),
  ),
  liabilityPayments: z.array(
    z.object({
      exportId: z.string(),
      accountExportId: z.string(),
      description: z.string().max(200),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amount: z.number().int().positive(),
    }),
  ),
});

export type ExportEnvelope = z.infer<typeof exportEnvelopeSchema>;
