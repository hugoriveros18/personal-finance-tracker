import { describe, expect, it } from 'vitest';
import { deltaForLP } from './service.js';
import { deltaForTransaction } from '../transactions/service.js';

describe('deltaForLP', () => {
  it('decreases both disponible and pasivos by the same amount', () => {
    const d = deltaForLP(80_000n);
    expect(d).toEqual({ disponible: -80_000n, ahorro: 0n, pasivos: -80_000n });
  });

  it('does NOT touch ahorro', () => {
    expect(deltaForLP(1n).ahorro).toBe(0n);
  });

  it('differs from a normal egreso transaction (which only touches disponible)', () => {
    // A liability payment is NOT an expense — must not be conflated with an egreso.
    const lp = deltaForLP(50_000n);
    const egreso = deltaForTransaction('egreso', 50_000n);
    expect(lp).not.toEqual(egreso);
    // Same disponible decrement but different pasivos behavior
    expect(lp.disponible).toBe(egreso.disponible);
    expect(lp.pasivos).not.toBe(egreso.pasivos);
  });

  it('combined pasivo (purchase) + liability payment net to zero pasivos', () => {
    const purchase = deltaForTransaction('pasivo', 50_000n);
    const payment = deltaForLP(50_000n);
    expect(purchase.pasivos + payment.pasivos).toBe(0n);
  });
});
