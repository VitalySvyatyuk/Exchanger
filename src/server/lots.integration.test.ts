import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  balanceOf,
  createUser,
  currentQuote,
  newKey,
} from "../../test/factories";
import { convertCurrency } from "./conversion";
import { OperationError } from "./errors";
import { buyLot, cancelLot, createLot, listOpenLots } from "./lots";

/** A user who converted 50 USD into 42.28 EUR (fixed test rates). */
async function createBuyer(name = "Buyer") {
  const user = await createUser(name);
  const quote = await currentQuote("USD", "EUR", "50");
  await convertCurrency(user.id, {
    from: "USD",
    to: "EUR",
    amount: "50",
    quotedRate: quote.rate,
    idempotencyKey: newKey(),
  });
  return user;
}

async function postLot(sellerId: string, sellAmount = "30", buyAmount = "24") {
  const { lotId } = await createLot(sellerId, {
    sellCurrency: "USD",
    sellAmount,
    buyCurrency: "EUR",
    buyAmount,
    idempotencyKey: newKey(),
  });
  return lotId;
}

async function statusOf(lotId: string) {
  return (await db.lot.findUniqueOrThrow({ where: { id: lotId } })).status;
}

describe("marketplace", () => {
  beforeAll(async () => {
    // Make sure rates are fresh before buyers convert money.
    await currentQuote("USD", "EUR", "1");
  });

  it("holds the offered amount in escrow when a lot is posted", async () => {
    const seller = await createUser("Seller");
    const lotId = await postLot(seller.id);

    expect(await balanceOf(seller.id, "USD")).toBe("70.00");
    expect(await statusOf(lotId)).toBe("OPEN");
    const { lots } = await listOpenLots({});
    expect(lots.find((lot) => lot.id === lotId)).toMatchObject({
      seller: { name: "Seller" },
      sellAmount: "30.00",
      buyAmount: "24.00",
    });
  });

  it("doesn't create a lot the seller can't cover", async () => {
    const seller = await createUser();
    await expect(postLot(seller.id, "100.01")).rejects.toMatchObject({
      code: "INSUFFICIENT_FUNDS",
    });
    expect(await db.lot.count({ where: { sellerId: seller.id } })).toBe(0);
  });

  it("settles a purchase between buyer, seller and escrow", async () => {
    const seller = await createUser("Seller");
    const buyer = await createBuyer();
    const lotId = await postLot(seller.id);

    await expect(buyLot(buyer.id, lotId)).resolves.toEqual({
      lotId,
      replayed: false,
    });

    expect(await statusOf(lotId)).toBe("FILLED");
    expect(await balanceOf(buyer.id, "USD")).toBe("80.00");
    expect(await balanceOf(buyer.id, "EUR")).toBe("18.28");
    expect(await balanceOf(seller.id, "EUR")).toBe("24.00");
    // A second click returns the original purchase.
    await expect(buyLot(buyer.id, lotId)).resolves.toMatchObject({
      replayed: true,
    });
  });

  it("sells a lot to exactly one of many simultaneous buyers", async () => {
    const seller = await createUser();
    const buyers = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createBuyer(`Racer ${i}`)),
    );
    const lotId = await postLot(seller.id);

    const results = await Promise.allSettled(
      buyers.map((buyer) => buyLot(buyer.id, lotId)),
    );

    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(results.length - rejected.length).toBe(1);
    for (const { reason } of rejected) {
      expect(reason).toBeInstanceOf(OperationError);
      expect(reason.code).toBe("LOT_NOT_AVAILABLE");
    }
    expect(await balanceOf(seller.id, "EUR")).toBe("24.00");
  });

  it("lets either a purchase or a cancellation win, never both", async () => {
    const seller = await createUser();
    const buyer = await createBuyer();

    for (let i = 0; i < 5; i++) {
      const lotId = await postLot(seller.id, "1", "0.80");
      const [bought, cancelled] = await Promise.allSettled([
        buyLot(buyer.id, lotId),
        cancelLot(seller.id, lotId),
      ]);
      const winners = [bought, cancelled].filter(
        (r) => r.status === "fulfilled",
      );
      expect(winners).toHaveLength(1);
      expect(await statusOf(lotId)).toBe(
        bought.status === "fulfilled" ? "FILLED" : "CANCELLED",
      );
    }
  });

  it("keeps the lot open when the buyer can't pay", async () => {
    const seller = await createUser();
    const buyer = await createBuyer();
    const lotId = await postLot(seller.id, "10", "999");

    await expect(buyLot(buyer.id, lotId)).rejects.toMatchObject({
      code: "INSUFFICIENT_FUNDS",
    });
    expect(await statusOf(lotId)).toBe("OPEN");
  });

  it("returns the escrowed amount on cancel, only to the seller", async () => {
    const seller = await createUser();
    const stranger = await createUser();
    const lotId = await postLot(seller.id);

    await expect(buyLot(seller.id, lotId)).rejects.toMatchObject({
      code: "OWN_LOT",
    });
    await expect(cancelLot(stranger.id, lotId)).rejects.toMatchObject({
      code: "LOT_NOT_FOUND",
    });

    await cancelLot(seller.id, lotId);
    expect(await statusOf(lotId)).toBe("CANCELLED");
    expect(await balanceOf(seller.id, "USD")).toBe("100.00");
    await expect(buyLot(stranger.id, lotId)).rejects.toMatchObject({
      code: "LOT_NOT_AVAILABLE",
    });
  });
});
