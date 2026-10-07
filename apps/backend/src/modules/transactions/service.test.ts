import { describe, expect, it } from 'vitest';
import { deltaForTransaction } from './service.js';

describe('deltaForTransaction', () => {
  it('income increases availableBalance only', () => {
    const d = deltaForTransaction('income', 50_000n);
    expect(d).toEqual({ availableBalance: 50_000n, savingsBalance: 0n, liabilitiesBalance: 0n });
  });

  it('expense decreases availableBalance only', () => {
    const d = deltaForTransaction('expense', 12_000n);
    expect(d).toEqual({ availableBalance: -12_000n, savingsBalance: 0n, liabilitiesBalance: 0n });
  });

  it('liability increases liabilitiesBalance only (no availableBalance change)', () => {
    const d = deltaForTransaction('liability', 200_000n);
    expect(d).toEqual({ availableBalance: 0n, savingsBalance: 0n, liabilitiesBalance: 200_000n });
  });

  it('reverse + reapply leaves balance unchanged for same type/amount', () => {
    const original = deltaForTransaction('expense', 75_000n);
    const reversed = {
      availableBalance: -original.availableBalance,
      savingsBalance: -original.savingsBalance,
      liabilitiesBalance: -original.liabilitiesBalance,
    };
    const reapplied = deltaForTransaction('expense', 75_000n);
    expect(reversed.availableBalance + reapplied.availableBalance).toBe(0n);
    expect(reversed.savingsBalance + reapplied.savingsBalance).toBe(0n);
    expect(reversed.liabilitiesBalance + reapplied.liabilitiesBalance).toBe(0n);
  });

  it('reverse + reapply reflects type change (expense -> income)', () => {
    const old = deltaForTransaction('expense', 30_000n);
    const reverse = {
      availableBalance: -old.availableBalance,
      savingsBalance: -old.savingsBalance,
      liabilitiesBalance: -old.liabilitiesBalance,
    };
    const next = deltaForTransaction('income', 30_000n);
    // net effect: +30k (reversed expense) + 30k (new income) = +60k availableBalance
    expect(reverse.availableBalance + next.availableBalance).toBe(60_000n);
  });

  it('handles values beyond Number.MAX_SAFE_INTEGER', () => {
    const huge = 9_999_999_999_999_999_999n;
    const d = deltaForTransaction('income', huge);
    expect(d.availableBalance).toBe(huge);
  });
});
