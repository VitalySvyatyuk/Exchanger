import "server-only";
import type { LotStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { lotNumber } from "@/lib/lots";
import type { CreateLotInput } from "@/lib/validation/lot";
import { normalizeAmount, toOperationError } from "@/server/conversion";
import { isUniqueViolation } from "@/server/db-errors";
import { OperationError } from "@/server/errors";
import { findByIdempotencyKey } from "@/server/idempotency";
import { getSystemAccount, postTransaction } from "@/server/ledger";

export const LOTS_PAGE_SIZE = 20;

export type LotView = {
  id: string;
  number: string;
  status: LotStatus;
  seller: { id: string; name: string };
  buyerId: string | null;
  sellCurrency: string;
  sellAmount: string;
  buyCurrency: string;
  buyAmount: string;
  createdAt: Date;
};

/** Metadata stored on lot transactions; read by the history page. */
export type LotMetadata = {
  lotId: string;
  sellerId: string;
  sellerName: string;
  buyerId?: string;
  buyerName?: string;
  sellCurrency: string;
  sellAmount: string;
  buyCurrency: string;
  buyAmount: string;
};

const lotSelect = {
  id: true,
  status: true,
  sellCurrencyCode: true,
  sellAmount: true,
  buyCurrencyCode: true,
  buyAmount: true,
  createdAt: true,
  buyerId: true,
  seller: { select: { id: true, name: true } },
  sellCurrency: { select: { precision: true } },
  buyCurrency: { select: { precision: true } },
} satisfies Prisma.LotSelect;

type LotRow = Prisma.LotGetPayload<{ select: typeof lotSelect }>;

function toView(lot: LotRow): LotView {
  return {
    id: lot.id,
    number: lotNumber(lot.id),
    status: lot.status,
    // Emails are private: only the display name is shown to other users.
    seller: { id: lot.seller.id, name: lot.seller.name ?? "User" },
    buyerId: lot.buyerId,
    sellCurrency: lot.sellCurrencyCode,
    sellAmount: lot.sellAmount.toFixed(lot.sellCurrency.precision),
    buyCurrency: lot.buyCurrencyCode,
    buyAmount: lot.buyAmount.toFixed(lot.buyCurrency.precision),
    createdAt: lot.createdAt,
  };
}

function displayName(user: { name: string | null; email: string }) {
  return user.name ?? user.email;
}

/**
 * Open lots, newest first, optionally filtered by currency pair. The
 * viewer's own lots can be excluded, since they're listed separately.
 */
export async function listOpenLots(options: {
  sellCurrency?: string;
  buyCurrency?: string;
  cursor?: string;
  excludeSellerId?: string;
}): Promise<{ lots: LotView[]; nextCursor: string | null }> {
  const lots = await db.lot.findMany({
    where: {
      status: "OPEN",
      sellCurrencyCode: options.sellCurrency,
      buyCurrencyCode: options.buyCurrency,
      sellerId: options.excludeSellerId
        ? { not: options.excludeSellerId }
        : undefined,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LOTS_PAGE_SIZE + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: lotSelect,
  });

  const hasMore = lots.length > LOTS_PAGE_SIZE;
  const page = hasMore ? lots.slice(0, LOTS_PAGE_SIZE) : lots;
  return {
    lots: page.map(toView),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function listUserOpenLots(userId: string): Promise<LotView[]> {
  const lots = await db.lot.findMany({
    where: { sellerId: userId, status: "OPEN" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: lotSelect,
  });
  return lots.map(toView);
}

export async function getLot(id: string): Promise<LotView | null> {
  const lot = await db.lot.findUnique({ where: { id }, select: lotSelect });
  return lot ? toView(lot) : null;
}

/**
 * Creates a lot and moves the offered amount from the seller's account to
 * escrow in the same database transaction. If the seller can't cover it,
 * nothing is created.
 */
export async function createLot(
  sellerId: string,
  input: CreateLotInput,
): Promise<{ lotId: string; replayed: boolean }> {
  const existing = await findByIdempotencyKey(
    sellerId,
    input.idempotencyKey,
    "LOT_HOLD",
  );
  if (existing) {
    return { lotId: (existing.metadata as LotMetadata).lotId, replayed: true };
  }

  const sellAmount = normalizeAmount(input.sellCurrency, input.sellAmount);
  const buyAmount = normalizeAmount(input.buyCurrency, input.buyAmount);

  try {
    const lotId = await db.$transaction(async (tx) => {
      const seller = await tx.user.findUniqueOrThrow({
        where: { id: sellerId },
        select: { name: true, email: true },
      });
      const lot = await tx.lot.create({
        data: {
          sellerId,
          sellCurrencyCode: input.sellCurrency,
          sellAmount,
          buyCurrencyCode: input.buyCurrency,
          buyAmount,
        },
        select: { id: true },
      });
      const sellerAccount = await tx.account.findUniqueOrThrow({
        where: {
          userId_currencyCode: {
            userId: sellerId,
            currencyCode: input.sellCurrency,
          },
        },
        select: { id: true },
      });
      const escrow = await getSystemAccount(tx, "ESCROW", input.sellCurrency);

      const metadata: LotMetadata = {
        lotId: lot.id,
        sellerId,
        sellerName: displayName(seller),
        sellCurrency: input.sellCurrency,
        sellAmount,
        buyCurrency: input.buyCurrency,
        buyAmount,
      };
      await postTransaction(tx, {
        type: "LOT_HOLD",
        initiatedById: sellerId,
        idempotencyKey: input.idempotencyKey,
        lotId: lot.id,
        metadata,
        entries: [
          { accountId: sellerAccount.id, amount: `-${sellAmount}` },
          { accountId: escrow.id, amount: sellAmount },
        ],
      });
      return lot.id;
    });

    return { lotId, replayed: false };
  } catch (error) {
    if (isUniqueViolation(error, "idempotency_key")) {
      const replayed = await findByIdempotencyKey(
        sellerId,
        input.idempotencyKey,
        "LOT_HOLD",
      );
      if (replayed) {
        return {
          lotId: (replayed.metadata as LotMetadata).lotId,
          replayed: true,
        };
      }
    }
    throw toOperationError(error, input.sellCurrency);
  }
}

/** Explains why a lot couldn't be bought or cancelled. */
async function unavailableError(lotId: string, userId: string) {
  const lot = await db.lot.findUnique({
    where: { id: lotId },
    select: { sellerId: true, status: true },
  });
  if (!lot) {
    return new OperationError("LOT_NOT_FOUND", "This lot doesn't exist.");
  }
  if (lot.status === "OPEN" && lot.sellerId === userId) {
    return new OperationError("OWN_LOT", "You can't buy your own lot.");
  }
  return new OperationError(
    "LOT_NOT_AVAILABLE",
    "This lot is no longer available.",
  );
}

/**
 * Buys an open lot: the buyer pays the seller, and the escrowed amount is
 * released to the buyer.
 *
 * The lot is claimed with a conditional UPDATE (status = OPEN). If several
 * buyers race, PostgreSQL's row lock makes the others wait and then match
 * zero rows, so exactly one purchase succeeds. If the buyer can't pay, the
 * whole transaction rolls back and the lot stays open.
 *
 * The idempotency key is derived from the lot, so a repeated click returns
 * the original purchase instead of an error.
 */
export async function buyLot(
  buyerId: string,
  lotId: string,
): Promise<{ lotId: string; replayed: boolean }> {
  const idempotencyKey = `lot-purchase:${lotId}`;
  if (await findByIdempotencyKey(buyerId, idempotencyKey, "LOT_PURCHASE")) {
    return { lotId, replayed: true };
  }

  let buyCurrency: string | undefined;
  try {
    await db.$transaction(async (tx) => {
      const claimed = await tx.lot.updateMany({
        where: { id: lotId, status: "OPEN", sellerId: { not: buyerId } },
        data: { status: "FILLED", buyerId, closedAt: new Date() },
      });
      if (claimed.count === 0) throw await unavailableError(lotId, buyerId);

      const lot = await tx.lot.findUniqueOrThrow({
        where: { id: lotId },
        select: {
          sellerId: true,
          sellCurrencyCode: true,
          sellAmount: true,
          buyCurrencyCode: true,
          buyAmount: true,
          seller: { select: { name: true, email: true } },
          buyer: { select: { name: true, email: true } },
          sellCurrency: { select: { precision: true } },
          buyCurrency: { select: { precision: true } },
        },
      });
      buyCurrency = lot.buyCurrencyCode;
      const sellAmount = lot.sellAmount.toFixed(lot.sellCurrency.precision);
      const buyAmount = lot.buyAmount.toFixed(lot.buyCurrency.precision);

      const account = (userId: string, currencyCode: string) =>
        tx.account.findUniqueOrThrow({
          where: { userId_currencyCode: { userId, currencyCode } },
          select: { id: true },
        });
      const buyerReceives = await account(buyerId, lot.sellCurrencyCode);
      const buyerPays = await account(buyerId, lot.buyCurrencyCode);
      const sellerReceives = await account(lot.sellerId, lot.buyCurrencyCode);
      const escrow = await getSystemAccount(tx, "ESCROW", lot.sellCurrencyCode);

      const metadata: LotMetadata = {
        lotId,
        sellerId: lot.sellerId,
        sellerName: displayName(lot.seller),
        buyerId,
        buyerName: displayName(lot.buyer!),
        sellCurrency: lot.sellCurrencyCode,
        sellAmount,
        buyCurrency: lot.buyCurrencyCode,
        buyAmount,
      };
      await postTransaction(tx, {
        type: "LOT_PURCHASE",
        initiatedById: buyerId,
        idempotencyKey,
        lotId,
        metadata,
        entries: [
          { accountId: escrow.id, amount: `-${sellAmount}` },
          { accountId: buyerReceives.id, amount: sellAmount },
          { accountId: buyerPays.id, amount: `-${buyAmount}` },
          { accountId: sellerReceives.id, amount: buyAmount },
        ],
      });
    });

    return { lotId, replayed: false };
  } catch (error) {
    if (
      isUniqueViolation(error, "idempotency_key") &&
      (await findByIdempotencyKey(buyerId, idempotencyKey, "LOT_PURCHASE"))
    ) {
      return { lotId, replayed: true };
    }
    throw toOperationError(error, buyCurrency ?? "");
  }
}

/** Cancels the seller's open lot and returns the escrowed amount. */
export async function cancelLot(
  sellerId: string,
  lotId: string,
): Promise<{ lotId: string; replayed: boolean }> {
  const idempotencyKey = `lot-cancel:${lotId}`;
  if (await findByIdempotencyKey(sellerId, idempotencyKey, "LOT_CANCEL")) {
    return { lotId, replayed: true };
  }

  try {
    await db.$transaction(async (tx) => {
      const claimed = await tx.lot.updateMany({
        where: { id: lotId, status: "OPEN", sellerId },
        data: { status: "CANCELLED", closedAt: new Date() },
      });
      if (claimed.count === 0) {
        const lot = await tx.lot.findUnique({
          where: { id: lotId },
          select: { sellerId: true },
        });
        // Don't reveal other users' lots.
        throw lot && lot.sellerId === sellerId
          ? new OperationError(
              "LOT_NOT_AVAILABLE",
              "This lot is no longer open.",
            )
          : new OperationError("LOT_NOT_FOUND", "This lot doesn't exist.");
      }

      const lot = await tx.lot.findUniqueOrThrow({
        where: { id: lotId },
        select: {
          sellCurrencyCode: true,
          sellAmount: true,
          buyCurrencyCode: true,
          buyAmount: true,
          seller: { select: { name: true, email: true } },
          sellCurrency: { select: { precision: true } },
          buyCurrency: { select: { precision: true } },
        },
      });
      const sellAmount = lot.sellAmount.toFixed(lot.sellCurrency.precision);
      const sellerAccount = await tx.account.findUniqueOrThrow({
        where: {
          userId_currencyCode: {
            userId: sellerId,
            currencyCode: lot.sellCurrencyCode,
          },
        },
        select: { id: true },
      });
      const escrow = await getSystemAccount(tx, "ESCROW", lot.sellCurrencyCode);

      const metadata: LotMetadata = {
        lotId,
        sellerId,
        sellerName: displayName(lot.seller),
        sellCurrency: lot.sellCurrencyCode,
        sellAmount,
        buyCurrency: lot.buyCurrencyCode,
        buyAmount: lot.buyAmount.toFixed(lot.buyCurrency.precision),
      };
      await postTransaction(tx, {
        type: "LOT_CANCEL",
        initiatedById: sellerId,
        idempotencyKey,
        lotId,
        metadata,
        entries: [
          { accountId: escrow.id, amount: `-${sellAmount}` },
          { accountId: sellerAccount.id, amount: sellAmount },
        ],
      });
    });

    return { lotId, replayed: false };
  } catch (error) {
    if (
      isUniqueViolation(error, "idempotency_key") &&
      (await findByIdempotencyKey(sellerId, idempotencyKey, "LOT_CANCEL"))
    ) {
      return { lotId, replayed: true };
    }
    throw error;
  }
}
