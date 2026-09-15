import "server-only";
import type {
  AccountType,
  Prisma,
  TransactionType,
} from "@/generated/prisma/client";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { db } from "@/lib/db";
import { lotNumber } from "@/lib/lots";
import { requireAdmin } from "@/server/auth";
import { ADMIN_PAGE_SIZE } from "@/server/admin/users";
import type { LotMetadata } from "@/server/lots";
import type { TransferMetadata } from "@/server/transfers";

export type AdminTransactionRow = {
  id: string;
  type: TransactionType;
  createdAt: Date;
  description: string | null;
  idempotencyKey: string | null;
  initiatedBy: { id: string; email: string } | null;
  metadata: Prisma.JsonValue;
  entries: {
    id: string;
    accountType: AccountType;
    currency: { code: string; type: "FIAT" | "CRYPTO"; precision: number };
    owner: { id: string; email: string } | null;
    amount: string;
  }[];
};

export type TransactionFilters = {
  type?: TransactionType;
  /** Only transactions with an entry on this user's accounts. */
  userId?: string;
  /** Only transactions with an entry in this currency. */
  currencyCode?: string;
  /** Inclusive, UTC. */
  from?: Date;
  /** Exclusive, UTC. */
  to?: Date;
  cursor?: string;
};

function currencyOrder(code: string): number {
  return SUPPORTED_CURRENCIES.findIndex((c) => c.code === code);
}

/** A neutral, third-person description for the admin log. */
function describe(
  type: TransactionType,
  metadata: Prisma.JsonValue,
  description: string | null,
): string | null {
  if (!metadata) return description;
  switch (type) {
    case "TRANSFER": {
      const transfer = metadata as TransferMetadata;
      const note = transfer.note ? ` · “${transfer.note}”` : "";
      return `${transfer.senderName} → ${transfer.recipientName}${note}`;
    }
    case "LOT_HOLD":
    case "LOT_CANCEL": {
      const lot = metadata as LotMetadata;
      return `${lotNumber(lot.lotId)} by ${lot.sellerName} · ${lot.sellAmount} ${lot.sellCurrency} for ${lot.buyAmount} ${lot.buyCurrency}`;
    }
    case "LOT_PURCHASE": {
      const lot = metadata as LotMetadata;
      return `${lotNumber(lot.lotId)} · ${lot.sellerName} → ${lot.buyerName}`;
    }
    default:
      return description;
  }
}

/**
 * The full transaction log, newest first, with keyset pagination on
 * (created_at, id) using the transactions_created_at_id_idx index.
 */
export async function listTransactions(
  filters: TransactionFilters,
): Promise<{ transactions: AdminTransactionRow[]; nextCursor: string | null }> {
  await requireAdmin();

  const entryFilter =
    filters.userId || filters.currencyCode
      ? {
          some: {
            account: {
              userId: filters.userId,
              currencyCode: filters.currencyCode,
            },
          },
        }
      : undefined;

  const transactions = await db.transaction.findMany({
    where: {
      type: filters.type,
      createdAt:
        filters.from || filters.to
          ? { gte: filters.from, lt: filters.to }
          : undefined,
      ledgerEntries: entryFilter,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_PAGE_SIZE + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      createdAt: true,
      description: true,
      idempotencyKey: true,
      metadata: true,
      initiatedBy: { select: { id: true, email: true } },
      ledgerEntries: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          amount: true,
          account: {
            select: {
              type: true,
              currency: { select: { code: true, type: true, precision: true } },
              user: { select: { id: true, email: true } },
            },
          },
        },
      },
    },
  });

  const hasMore = transactions.length > ADMIN_PAGE_SIZE;
  const page = hasMore ? transactions.slice(0, ADMIN_PAGE_SIZE) : transactions;
  return {
    transactions: page.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      createdAt: transaction.createdAt,
      description: describe(
        transaction.type,
        transaction.metadata,
        transaction.description,
      ),
      idempotencyKey: transaction.idempotencyKey,
      initiatedBy: transaction.initiatedBy,
      metadata: transaction.metadata,
      // Entries are stored in account id order (for locking); show them
      // grouped by currency, debits first, so each operation reads naturally.
      entries: [...transaction.ledgerEntries]
        .sort(
          (a, b) =>
            currencyOrder(a.account.currency.code) -
              currencyOrder(b.account.currency.code) ||
            a.amount.comparedTo(b.amount),
        )
        .map((entry) => ({
          id: entry.id.toString(),
          accountType: entry.account.type,
          currency: entry.account.currency,
          owner: entry.account.user,
          amount: entry.amount.toFixed(entry.account.currency.precision),
        })),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/** Finds a user id by exact email, for the user filter. */
export async function findUserIdByEmail(email: string) {
  await requireAdmin();
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  return user?.id;
}
