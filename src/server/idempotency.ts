import "server-only";
import type { Prisma, TransactionType } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * Looks up a transaction the user already created with this idempotency
 * key. Returns null if the key is new.
 */
export async function findByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
  expectedType: TransactionType,
): Promise<{ id: string; metadata: Prisma.JsonValue } | null> {
  const existing = await db.transaction.findUnique({
    where: {
      initiatedById_idempotencyKey: { initiatedById: userId, idempotencyKey },
    },
    select: { id: true, type: true, metadata: true },
  });
  if (!existing) return null;

  if (existing.type !== expectedType) {
    throw new Error(
      `Idempotency key was already used for a ${existing.type} transaction`,
    );
  }
  return { id: existing.id, metadata: existing.metadata };
}
