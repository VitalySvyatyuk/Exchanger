import "server-only";
import { Prisma, type TransactionType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { lotNumber } from "@/lib/lots";
import type { LotMetadata } from "@/server/lots";
import type { TransferMetadata } from "@/server/transfers";

export const HISTORY_PAGE_SIZE = 20;

export type HistoryItem = {
  /** Ledger entry id, as a string because it's a BigInt. */
  id: string;
  transactionId: string;
  type: TransactionType;
  /** Human-readable details, e.g. "USD → EUR" or "To Bob · “Rent”". */
  description: string | null;
  /** Signed decimal string: positive credits, negative debits. */
  amount: string;
  createdAt: Date;
  currency: {
    code: string;
    symbol: string;
    type: "FIAT" | "CRYPTO";
    precision: number;
  };
};

export type HistoryPage = {
  items: HistoryItem[];
  /** Pass as `cursor` to load the next (older) page; null on the last page. */
  nextCursor: string | null;
};

type HistoryRow = {
  id: bigint;
  amount: Prisma.Decimal;
  created_at: Date;
  transaction_id: string;
  type: TransactionType;
  description: string | null;
  metadata: Prisma.JsonValue;
  currency_code: string;
  currency_symbol: string;
  currency_type: "FIAT" | "CRYPTO";
  currency_precision: number;
};

/**
 * Operations between users are described from the viewer's side, e.g.
 * "To Bob" for the sender and "From Alice" for the recipient.
 */
function describe(row: HistoryRow, userId: string): string | null {
  if (!row.metadata) return row.description;

  switch (row.type) {
    case "TRANSFER": {
      const transfer = row.metadata as TransferMetadata;
      const counterparty =
        transfer.senderId === userId
          ? `To ${transfer.recipientName}`
          : `From ${transfer.senderName}`;
      return transfer.note
        ? `${counterparty} · “${transfer.note}”`
        : counterparty;
    }
    case "LOT_HOLD":
    case "LOT_CANCEL": {
      const lot = row.metadata as LotMetadata;
      return `${lotNumber(lot.lotId)} · ${lot.sellAmount} ${lot.sellCurrency} for ${lot.buyAmount} ${lot.buyCurrency}`;
    }
    case "LOT_PURCHASE": {
      const lot = row.metadata as LotMetadata;
      return lot.sellerId === userId
        ? `Sold ${lotNumber(lot.lotId)} to ${lot.buyerName}`
        : `Bought ${lotNumber(lot.lotId)} from ${lot.sellerName}`;
    }
    default:
      return row.description;
  }
}

/**
 * The user's ledger entries across all (or one) of their accounts, newest
 * first, with keyset pagination on the entry id.
 *
 * Written in SQL because it needs a LATERAL join, which Prisma can't express:
 * for each of the user's accounts, take at most one page of entries using
 * the (account_id, id) index, then merge. The work is bounded by the page
 * size, not by the length of the user's history. On 2M ledger entries, a
 * user with 20,000 entries gets a page in ~0.1 ms instead of ~20 ms for a
 * plain JOIN + ORDER BY (see "Performance" in the README).
 */
export async function getHistory(
  userId: string,
  options: { currencyCode?: string; cursor?: bigint } = {},
): Promise<HistoryPage> {
  // One extra row tells whether there is a next page.
  const limit = HISTORY_PAGE_SIZE + 1;
  const cursorFilter =
    options.cursor === undefined
      ? Prisma.empty
      : Prisma.sql`AND le.id < ${options.cursor}`;
  const currencyFilter =
    options.currencyCode === undefined
      ? Prisma.empty
      : Prisma.sql`AND a.currency_code = ${options.currencyCode}`;

  const rows = await db.$queryRaw<HistoryRow[]>`
    WITH page AS (
      SELECT e.id, e.amount, e.created_at, e.transaction_id, a.currency_code
      FROM accounts a
      CROSS JOIN LATERAL (
        SELECT le.id, le.amount, le.created_at, le.transaction_id
        FROM ledger_entries le
        WHERE le.account_id = a.id ${cursorFilter}
        ORDER BY le.id DESC
        LIMIT ${limit}
      ) e
      WHERE a.user_id = ${userId}::uuid ${currencyFilter}
      ORDER BY e.id DESC
      LIMIT ${limit}
    )
    SELECT
      p.id,
      p.amount,
      p.created_at,
      p.transaction_id::text AS transaction_id,
      t.type::text AS type,
      t.description,
      t.metadata,
      c.code AS currency_code,
      c.symbol AS currency_symbol,
      c.type::text AS currency_type,
      c.precision::int AS currency_precision
    FROM page p
    JOIN transactions t ON t.id = p.transaction_id
    JOIN currencies c ON c.code = p.currency_code
    ORDER BY p.id DESC
  `;

  const hasMore = rows.length > HISTORY_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, HISTORY_PAGE_SIZE) : rows;

  return {
    items: page.map((row) => ({
      id: row.id.toString(),
      transactionId: row.transaction_id,
      type: row.type,
      description: describe(row, userId),
      amount: new Prisma.Decimal(row.amount).toFixed(row.currency_precision),
      createdAt: row.created_at,
      currency: {
        code: row.currency_code,
        symbol: row.currency_symbol,
        type: row.currency_type,
        precision: row.currency_precision,
      },
    })),
    nextCursor: hasMore ? page[page.length - 1].id.toString() : null,
  };
}
