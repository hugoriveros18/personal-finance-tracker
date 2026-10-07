import { describe, expect, it } from 'vitest';
import { deltasForMovement } from './service.js';
import { createMovementSchema } from './schemas.js';

describe('deltasForMovement', () => {
  it('INTER_AVAILABLE moves availableBalance across two accounts', () => {
    const { source, destination } = deltasForMovement('INTER_AVAILABLE', 100_000n);
    expect(source).toEqual({
      availableBalance: -100_000n,
      savingsBalance: 0n,
      liabilitiesBalance: 0n,
    });
    expect(destination).toEqual({
      availableBalance: 100_000n,
      savingsBalance: 0n,
      liabilitiesBalance: 0n,
    });
  });

  it('INTRA_AVAILABLE_TO_SAVINGS moves money inside one account', () => {
    const { source, destination } = deltasForMovement('INTRA_AVAILABLE_TO_SAVINGS', 50_000n);
    expect(source).toEqual({
      availableBalance: -50_000n,
      savingsBalance: 50_000n,
      liabilitiesBalance: 0n,
    });
    expect(destination).toEqual({
      availableBalance: 0n,
      savingsBalance: 0n,
      liabilitiesBalance: 0n,
    });
  });

  it('INTRA_SAVINGS_TO_AVAILABLE is the inverse of the previous flow', () => {
    const { source } = deltasForMovement('INTRA_SAVINGS_TO_AVAILABLE', 50_000n);
    expect(source).toEqual({
      availableBalance: 50_000n,
      savingsBalance: -50_000n,
      liabilitiesBalance: 0n,
    });
  });

  it('INTER_AVAILABLE preserves system-wide sum (zero-sum)', () => {
    const { source, destination } = deltasForMovement('INTER_AVAILABLE', 75_000n);
    expect(source.availableBalance + destination.availableBalance).toBe(0n);
  });

  it('INTRA_* preserves total = availableBalance + savingsBalance on the same account', () => {
    const { source } = deltasForMovement('INTRA_AVAILABLE_TO_SAVINGS', 12_345n);
    expect(source.availableBalance + source.savingsBalance).toBe(0n);
  });
});

describe('createMovementSchema', () => {
  const baseInter = {
    description: 'transfer',
    date: '2026-04-27',
    flow: 'INTER_AVAILABLE' as const,
    amount: 10_000,
    sourceAccountId: '11111111-1111-4111-8111-111111111111',
    destinationAccountId: '22222222-2222-4222-8222-222222222222',
  };

  it('rejects INTER_AVAILABLE with same source and destination', () => {
    const r = createMovementSchema.safeParse({
      ...baseInter,
      destinationAccountId: baseInter.sourceAccountId,
    });
    expect(r.success).toBe(false);
  });

  it('rejects INTRA_* with different accounts on each side', () => {
    const r = createMovementSchema.safeParse({
      ...baseInter,
      flow: 'INTRA_AVAILABLE_TO_SAVINGS',
    });
    expect(r.success).toBe(false);
  });

  it('accepts well-shaped INTER_AVAILABLE', () => {
    const r = createMovementSchema.safeParse(baseInter);
    expect(r.success).toBe(true);
  });

  it('accepts well-shaped INTRA_AVAILABLE_TO_SAVINGS', () => {
    const r = createMovementSchema.safeParse({
      ...baseInter,
      flow: 'INTRA_AVAILABLE_TO_SAVINGS',
      destinationAccountId: baseInter.sourceAccountId,
    });
    expect(r.success).toBe(true);
  });
});
