import { describe, expect, it } from 'vitest';
import { deltaForLP } from './service.js';
import { deltaForTransaction } from '../transactions/service.js';

describe('deltaForLP', () => {
  it('decreases both availableBalance and liabilitiesBalance by the same amount', () => {
    const d = deltaForLP(80_000n);
    expect(d).toEqual({
      availableBalance: -80_000n,
      savingsBalance: 0n,
      liabilitiesBalance: -80_000n,
    });
  });

  it('does NOT touch savingsBalance', () => {
    expect(deltaForLP(1n).savingsBalance).toBe(0n);
  });

  it('differs from a normal expense transaction (which only touches availableBalance)', () => {
    // A liability payment is NOT an expense — must not be conflated with an expense.
    const lp = deltaForLP(50_000n);
    const expense = deltaForTransaction('expense', 50_000n);
    expect(lp).not.toEqual(expense);
    // Same availableBalance decrement but different liabilitiesBalance behavior
    expect(lp.availableBalance).toBe(expense.availableBalance);
    expect(lp.liabilitiesBalance).not.toBe(expense.liabilitiesBalance);
  });

  it('combined liability (purchase) + liability payment net to zero liabilitiesBalance', () => {
    const purchase = deltaForTransaction('liability', 50_000n);
    const payment = deltaForLP(50_000n);
    expect(purchase.liabilitiesBalance + payment.liabilitiesBalance).toBe(0n);
  });
});
