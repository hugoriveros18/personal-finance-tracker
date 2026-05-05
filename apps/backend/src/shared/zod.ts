import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const idParamSchema = z.object({ id: uuidSchema });

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

export const moneyIntSchema = z
  .number()
  .int()
  .nonnegative()
  .max(999_999_999_999, 'Amount exceeds maximum');

export const moneyPositiveIntSchema = moneyIntSchema.refine((n) => n > 0, 'Must be > 0');

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

export const csvSchema = (inner: z.ZodTypeAny) =>
  z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined))
    .pipe(z.array(inner).optional());
