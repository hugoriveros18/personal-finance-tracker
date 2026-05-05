import { describe, expect, it } from 'vitest';

// Replicate the internal serializer to test it without booting Fastify.
// Mirrors apps/backend/src/plugins/bigint.ts.
function bigintToNumber(value: unknown): unknown {
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new Error(`BigInt value ${value.toString()} exceeds safe integer range`);
    }
    return Number(value);
  }
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(bigintToNumber);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = bigintToNumber(v);
    }
    return out;
  }
  return value;
}

describe('bigintToNumber', () => {
  it('converts bigint to number', () => {
    expect(bigintToNumber(123n)).toBe(123);
  });

  it('throws when bigint exceeds Number.MAX_SAFE_INTEGER', () => {
    expect(() => bigintToNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(/exceeds/);
  });

  it('preserves Date instances (not collapsed to {})', () => {
    // Regression: previous version walked Object.entries(date) → {} → "Invalid time value" downstream.
    const d = new Date('2026-04-27T00:00:00Z');
    const out = bigintToNumber(d);
    expect(out).toBeInstanceOf(Date);
    expect((out as Date).toISOString()).toBe('2026-04-27T00:00:00.000Z');
  });

  it('walks plain objects and converts bigint inside while preserving Date', () => {
    const tx = {
      id: 'abc',
      valor: 50_000n,
      fecha: new Date('2026-04-27T00:00:00Z'),
      meta: { extra: 1n },
    };
    const out = bigintToNumber(tx) as typeof tx;
    expect(out.valor).toBe(50_000);
    expect(out.fecha).toBeInstanceOf(Date);
    expect(out.meta.extra).toBe(1);
  });

  it('walks arrays', () => {
    const out = bigintToNumber([1n, 2n, new Date('2026-01-01Z')]) as unknown[];
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(2);
    expect(out[2]).toBeInstanceOf(Date);
  });
});
