import { z } from 'zod';

export const exportEnvelopeSchema = z.object({
  $schema: z.literal('pft-export-v1'),
  exportedAt: z.string(),
  appVersion: z.string(),
  user: z.object({
    nombre: z.string().max(80),
    apellidos: z.string().max(120),
    email: z.string().email().max(254),
    preferredLanguage: z.enum(['es', 'en']),
    preferredTheme: z.enum(['light', 'dark']),
  }),
  categories: z.array(
    z.object({
      exportId: z.string(),
      nombre: z.string().max(80),
      tipo: z.enum(['ingreso', 'egreso']),
    }),
  ),
  accounts: z.array(
    z.object({
      exportId: z.string(),
      nombre: z.string().max(80),
      initial: z.object({
        disponible: z.number().int().nonnegative(),
        ahorro: z.number().int().nonnegative(),
        pasivos: z.number().int().nonnegative(),
      }),
    }),
  ),
  transactions: z.array(
    z.object({
      exportId: z.string(),
      accountExportId: z.string(),
      categoryExportId: z.string(),
      descripcion: z.string().max(200),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      tipo: z.enum(['ingreso', 'egreso', 'pasivo']),
      valor: z.number().int().positive(),
    }),
  ),
  movements: z.array(
    z.object({
      exportId: z.string(),
      cuentaEmisoraExportId: z.string(),
      cuentaReceptoraExportId: z.string(),
      flujo: z.enum([
        'INTER_DISPONIBLE',
        'INTRA_DISPONIBLE_TO_AHORRO',
        'INTRA_AHORRO_TO_DISPONIBLE',
      ]),
      descripcion: z.string().max(200),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      valor: z.number().int().positive(),
    }),
  ),
  liabilityPayments: z.array(
    z.object({
      exportId: z.string(),
      accountExportId: z.string(),
      descripcion: z.string().max(200),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      valor: z.number().int().positive(),
    }),
  ),
});

export type ExportEnvelope = z.infer<typeof exportEnvelopeSchema>;
