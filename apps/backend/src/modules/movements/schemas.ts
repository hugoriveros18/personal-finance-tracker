import { z } from 'zod';
import {
  csvSchema,
  dateOnlySchema,
  monthSchema,
  moneyPositiveIntSchema,
  uuidSchema,
} from '../../shared/zod.js';

export const flujoSchema = z.enum([
  'INTER_DISPONIBLE',
  'INTRA_DISPONIBLE_TO_AHORRO',
  'INTRA_AHORRO_TO_DISPONIBLE',
]);

export const createMovementSchema = z
  .object({
    descripcion: z.string().min(1).max(200).trim(),
    fecha: dateOnlySchema,
    flujo: flujoSchema,
    valor: moneyPositiveIntSchema,
    cuentaEmisoraId: uuidSchema,
    cuentaReceptoraId: uuidSchema,
  })
  .superRefine((v, ctx) => {
    if (v.flujo === 'INTER_DISPONIBLE' && v.cuentaEmisoraId === v.cuentaReceptoraId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Inter-account movements require different accounts',
        path: ['cuentaReceptoraId'],
      });
    }
    if (v.flujo !== 'INTER_DISPONIBLE' && v.cuentaEmisoraId !== v.cuentaReceptoraId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Intra-account movements require the same account on both sides',
        path: ['cuentaReceptoraId'],
      });
    }
  });

export const updateMovementSchema = z
  .object({
    descripcion: z.string().min(1).max(200).trim().optional(),
    fecha: dateOnlySchema.optional(),
    flujo: flujoSchema.optional(),
    valor: moneyPositiveIntSchema.optional(),
    cuentaEmisoraId: uuidSchema.optional(),
    cuentaReceptoraId: uuidSchema.optional(),
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
  cuentaEmisoraIds: csvSchema(uuidSchema),
  cuentaReceptoraIds: csvSchema(uuidSchema),
  // accountIds matches movements where the account is EITHER emisora or receptora
  // (used by the account-detail page to show all movements involving an account).
  accountIds: csvSchema(uuidSchema),
  flujos: csvSchema(flujoSchema),
  valorMin: z.coerce.number().int().nonnegative().optional(),
  valorMax: z.coerce.number().int().nonnegative().optional(),
  sort: z.enum(['fecha', '-fecha', 'valor', '-valor']).default('-fecha'),
});
