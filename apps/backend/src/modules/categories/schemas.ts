import { z } from 'zod';

export const categoryTipoSchema = z.enum(['ingreso', 'egreso']);

export const createCategorySchema = z.object({
  nombre: z.string().min(1).max(80).trim(),
  tipo: categoryTipoSchema,
});

export const updateCategorySchema = z
  .object({
    nombre: z.string().min(1).max(80).trim().optional(),
  })
  .strict();

export const listCategoriesQuerySchema = z
  .object({ tipo: categoryTipoSchema.optional() })
  .strict();
