import "server-only";
import {
  Prisma,
  type AccountType,
  type TransactionType,
} from "@/generated/prisma/client";

type TransactionClient = Prisma.TransactionClient;

export type LedgerEntryInput = {
  accountId: string;
  /** Positive credits the account, negative debits it. */
  amount: Prisma.Decimal | string;
};

export type PostTransactionInput = {
  type: TransactionType;
  entries: LedgerEntryInput[];
  initiatedById?: string;
  idempotencyKey?: string;
  lotId?: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Records a transaction and its ledger entries. Must be called inside a
 * database transaction.
 *
 * PostgreSQL enforces the money rules (see the ledger_integrity migration):
 * balances are updated by a trigger, overdrafts violate a check constraint,
 * and entries that don't sum to zero per currency fail at COMMIT.
 */
export async function postTransaction(
  tx: TransactionClient,
  { entries, ...transaction }: PostTransactionInput,
) {
  const { id } = await tx.transaction.create({
    data: transaction,
    select: { id: true },
  });

  // Each entry locks its account row. Locking accounts in the same order
  // (by id) in every operation prevents deadlocks between concurrent
  // operations on the same accounts.
  const sortedEntries = [...entries].sort((a, b) =>
    a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0,
  );

  await tx.ledgerEntry.createMany({
    data: sortedEntries.map((entry) => ({
      transactionId: id,
      accountId: entry.accountId,
      amount: entry.amount,
    })),
  });

  return { id };
}

export async function getSystemAccount(
  tx: TransactionClient,
  type: Exclude<AccountType, "USER">,
  currencyCode: string,
) {
  return tx.account.findFirstOrThrow({
    where: { type, currencyCode, userId: null },
    select: { id: true },
  });
}
