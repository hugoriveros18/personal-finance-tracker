import fp from 'fastify-plugin';

/**
 * Fastify by default cannot serialize BigInt to JSON. Convert BigInts to plain
 * Numbers (safe for COP, where realistic balances stay well under 2^53).
 * If a value exceeds Number.MAX_SAFE_INTEGER we throw — surfaces as 500 with
 * a clear log entry rather than producing a silently-truncated value.
 */
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

export const bigintPlugin = fp(async (app) => {
  app.addHook('preSerialization', async (_req, _reply, payload) => bigintToNumber(payload));
});
