import { describe, expect, it } from 'vitest';
import { deltaForTransaction } from './service.js';

describe('deltaForTransaction', () => {
  it('ingreso increases disponible only', () => {
    const d = deltaForTransaction('ingreso', 50_000n);
    expect(d).toEqual({ disponible: 50_000n, ahorro: 0n, pasivos: 0n });
  });

  it('egreso decreases disponible only', () => {
    const d = deltaForTransaction('egreso', 12_000n);
    expect(d).toEqual({ disponible: -12_000n, ahorro: 0n, pasivos: 0n });
  });

  it('pasivo increases pasivos only (no disponible change)', () => {
    const d = deltaForTransaction('pasivo', 200_000n);
    expect(d).toEqual({ disponible: 0n, ahorro: 0n, pasivos: 200_000n });
  });

  it('reverse + reapply leaves balance unchanged for same tipo/valor', () => {
    const original = deltaForTransaction('egreso', 75_000n);
    const reversed = {
      disponible: -original.disponible,
      ahorro: -original.ahorro,
      pasivos: -original.pasivos,
    };
    const reapplied = deltaForTransaction('egreso', 75_000n);
    expect(reversed.disponible + reapplied.disponible).toBe(0n);
    expect(reversed.ahorro + reapplied.ahorro).toBe(0n);
    expect(reversed.pasivos + reapplied.pasivos).toBe(0n);
  });

  it('reverse + reapply reflects tipo change (egreso -> ingreso)', () => {
    const old = deltaForTransaction('egreso', 30_000n);
    const reverse = {
      disponible: -old.disponible,
      ahorro: -old.ahorro,
      pasivos: -old.pasivos,
    };
    const next = deltaForTransaction('ingreso', 30_000n);
    // net effect: +30k (reversed egreso) + 30k (new ingreso) = +60k disponible
    expect(reverse.disponible + next.disponible).toBe(60_000n);
  });

  it('handles values beyond Number.MAX_SAFE_INTEGER', () => {
    const huge = 9_999_999_999_999_999_999n;
    const d = deltaForTransaction('ingreso', huge);
    expect(d.disponible).toBe(huge);
  });
});
