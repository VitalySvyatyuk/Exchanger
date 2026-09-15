import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  balanceOf,
  createUser,
  currentQuote,
  newKey,
} from "../../test/factories";
import { convertCurrency } from "./conversion";
import { OperationError } from "./errors";

describe("convertCurrency", () => {
  it("converts at the quoted amount through the treasury", async () => {
    const user = await createUser();
    const quote = await currentQuote("USD", "EUR", "40");
    // Fixed rates: 40 × 0.85 × 0.995
    expect(quote.toAmount).toBe("33.83");

    const result = await convertCurrency(user.id, {
      from: "USD",
      to: "EUR",
      amount: "40",
      quotedRate: quote.rate,
      idempotencyKey: newKey(),
    });

    expect(result).toMatchObject({
      fromAmount: "40.00",
      toAmount: "33.83",
      replayed: false,
    });
    expect(await balanceOf(user.id, "USD")).toBe("60.00");
    expect(await balanceOf(user.id, "EUR")).toBe("33.83");

    const transaction = await db.transaction.findUniqueOrThrow({
      where: { id: result.transactionId },
      include: { ledgerEntries: { include: { account: true } } },
    });
    expect(
      transaction.ledgerEntries
        .map(
          (e) =>
            `${e.account.type} ${e.account.currencyCode} ${e.amount.toFixed(2)}`,
        )
        .sort(),
    ).toEqual([
      "TREASURY EUR -33.83",
      "TREASURY USD 40.00",
      "USER EUR 33.83",
      "USER USD -40.00",
    ]);
    expect(transaction.metadata).toMatchObject({
      marketRate: "0.85",
      rate: "0.84575",
      feeRate: "0.005",
      rates: { EUR: { source: "FRANKFURTER" } },
    });
  });

  it("executes a repeated request only once, even concurrently", async () => {
    const user = await createUser();
    const quote = await currentQuote("USD", "GBP", "10");
    const input = {
      from: "USD",
      to: "GBP",
      amount: "10",
      quotedRate: quote.rate,
      idempotencyKey: newKey(),
    };

    const results = await Promise.all(
      Array.from({ length: 4 }, () => convertCurrency(user.id, input)),
    );

    expect(new Set(results.map((r) => r.transactionId)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await balanceOf(user.id, "USD")).toBe("90.00");
  });

  it("never overspends a balance under concurrent conversions", async () => {
    const user = await createUser();
    const quote = await currentQuote("USD", "EUR", "30");

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        convertCurrency(user.id, {
          from: "USD",
          to: "EUR",
          amount: "30",
          quotedRate: quote.rate,
          idempotencyKey: newKey(),
        }),
      ),
    );

    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(results.length - rejected.length).toBe(3);
    for (const { reason } of rejected) {
      expect(reason).toBeInstanceOf(OperationError);
      expect(reason.code).toBe("INSUFFICIENT_FUNDS");
    }
    expect(await balanceOf(user.id, "USD")).toBe("10.00");
  });

  it("rejects the conversion when the rate moved against the user", async () => {
    const user = await createUser();
    const quote = await currentQuote("USD", "EUR", "10");

    await expect(
      convertCurrency(user.id, {
        from: "USD",
        to: "EUR",
        amount: "10",
        // The user saw a rate 2% better than the current one.
        quotedRate: String(Number(quote.rate) * 1.02),
        idempotencyKey: newKey(),
      }),
    ).rejects.toMatchObject({ code: "RATE_CHANGED" });
    expect(await balanceOf(user.id, "USD")).toBe("100.00");
  });

  it("rejects amounts that round to zero in the target currency", async () => {
    const user = await createUser();
    const quote = await currentQuote("USD", "BTC", "0.01");
    // 0.01 USD is 0.00000012 BTC: fine. The reverse direction isn't:
    expect(quote.toAmount).toBe("0.00000012");

    await convertCurrency(user.id, {
      from: "USD",
      to: "BTC",
      amount: "0.01",
      quotedRate: quote.rate,
      idempotencyKey: newKey(),
    });
    const back = await currentQuote("BTC", "USD", "0.00000012");
    await expect(
      convertCurrency(user.id, {
        from: "BTC",
        to: "USD",
        amount: "0.00000012",
        quotedRate: back.rate,
        idempotencyKey: newKey(),
      }),
    ).rejects.toMatchObject({ code: "AMOUNT_TOO_SMALL" });
  });
});
