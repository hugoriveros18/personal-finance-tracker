import type { Prisma } from '@prisma/client';

/**
 * Lock a set of account rows FOR UPDATE in deterministic id-sorted order.
 * Required for any mutation that touches account balances.
 */
export async function lockAccountsForUpdate(
  tx: Prisma.TransactionClient,
  userId: string,
  ids: string[],
): Promise<void> {
  const unique = Array.from(new Set(ids)).filter(Boolean).sort();
  if (unique.length === 0) return;
  // Postgres array binding via Prisma raw
  await tx.$queryRaw`
    SELECT id FROM "account"
    WHERE "user_id" = ${userId}::uuid
      AND id = ANY(${unique}::uuid[])
    ORDER BY id
    FOR UPDATE
  `;
}
