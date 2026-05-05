import { describe, expect, it } from 'vitest';
import { deltasForMovement } from './service.js';
import { createMovementSchema } from './schemas.js';

describe('deltasForMovement', () => {
  it('INTER_DISPONIBLE moves disponible across two accounts', () => {
    const { emisora, receptora } = deltasForMovement('INTER_DISPONIBLE', 100_000n);
    expect(emisora).toEqual({ disponible: -100_000n, ahorro: 0n, pasivos: 0n });
    expect(receptora).toEqual({ disponible: 100_000n, ahorro: 0n, pasivos: 0n });
  });

  it('INTRA_DISPONIBLE_TO_AHORRO moves money inside one account', () => {
    const { emisora, receptora } = deltasForMovement('INTRA_DISPONIBLE_TO_AHORRO', 50_000n);
    expect(emisora).toEqual({ disponible: -50_000n, ahorro: 50_000n, pasivos: 0n });
    expect(receptora).toEqual({ disponible: 0n, ahorro: 0n, pasivos: 0n });
  });

  it('INTRA_AHORRO_TO_DISPONIBLE is the inverse of the previous flujo', () => {
    const { emisora } = deltasForMovement('INTRA_AHORRO_TO_DISPONIBLE', 50_000n);
    expect(emisora).toEqual({ disponible: 50_000n, ahorro: -50_000n, pasivos: 0n });
  });

  it('INTER_DISPONIBLE preserves system-wide sum (zero-sum)', () => {
    const { emisora, receptora } = deltasForMovement('INTER_DISPONIBLE', 75_000n);
    expect(emisora.disponible + receptora.disponible).toBe(0n);
  });

  it('INTRA_* preserves total = disponible + ahorro on the same account', () => {
    const { emisora } = deltasForMovement('INTRA_DISPONIBLE_TO_AHORRO', 12_345n);
    expect(emisora.disponible + emisora.ahorro).toBe(0n);
  });
});

describe('createMovementSchema', () => {
  const baseInter = {
    descripcion: 'transfer',
    fecha: '2026-04-27',
    flujo: 'INTER_DISPONIBLE' as const,
    valor: 10_000,
    cuentaEmisoraId: '11111111-1111-4111-8111-111111111111',
    cuentaReceptoraId: '22222222-2222-4222-8222-222222222222',
  };

  it('rejects INTER_DISPONIBLE with same emisora and receptora', () => {
    const r = createMovementSchema.safeParse({
      ...baseInter,
      cuentaReceptoraId: baseInter.cuentaEmisoraId,
    });
    expect(r.success).toBe(false);
  });

  it('rejects INTRA_* with different accounts on each side', () => {
    const r = createMovementSchema.safeParse({
      ...baseInter,
      flujo: 'INTRA_DISPONIBLE_TO_AHORRO',
    });
    expect(r.success).toBe(false);
  });

  it('accepts well-shaped INTER_DISPONIBLE', () => {
    const r = createMovementSchema.safeParse(baseInter);
    expect(r.success).toBe(true);
  });

  it('accepts well-shaped INTRA_DISPONIBLE_TO_AHORRO', () => {
    const r = createMovementSchema.safeParse({
      ...baseInter,
      flujo: 'INTRA_DISPONIBLE_TO_AHORRO',
      cuentaReceptoraId: baseInter.cuentaEmisoraId,
    });
    expect(r.success).toBe(true);
  });
});
