import { z } from 'zod';

export const categoryTypeSchema = z.enum(['income', 'expense']);

export const createCategorySchema = z.object({
  name: z.string().min(1).max(80).trim(),
  type: categoryTypeSchema,
});

export const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(80).trim().optional(),
  })
  .strict();

export const listCategoriesQuerySchema = z.object({ type: categoryTypeSchema.optional() }).strict();
