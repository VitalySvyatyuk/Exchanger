import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  balanceOf,
  createUser,
  currentQuote,
  newKey,
} from "../../test/factories";
import { getHistory } from "./history";
import { transferMoney } from "./transfers";

const sameCurrency = { quotedRate: "", note: undefined };

describe("transferMoney", () => {
  it("moves money between users in the same currency without a fee", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");

    const result = await transferMoney(alice.id, {
      ...sameCurrency,
      recipientEmail: bob.email,
      from: "USD",
      to: "USD",
      amount: "25.50",
      note: "Dinner",
      idempotencyKey: newKey(),
    });

    expect(result).toMatchObject({ fromAmount: "25.50", toAmount: "25.50" });
    expect(await balanceOf(alice.id, "USD")).toBe("74.50");
    expect(await balanceOf(bob.id, "USD")).toBe("125.50");

    const entries = await db.ledgerEntry.count({
      where: { transactionId: result.transactionId },
    });
    expect(entries).toBe(2);

    // Each side sees the transfer from its own perspective.
    const [aliceHistory, bobHistory] = await Promise.all([
      getHistory(alice.id),
      getHistory(bob.id),
    ]);
    expect(aliceHistory.items[0]).toMatchObject({
      type: "TRANSFER",
      description: "To Bob · “Dinner”",
      amount: "-25.50",
    });
    expect(bobHistory.items[0]).toMatchObject({
      description: "From Alice · “Dinner”",
      amount: "25.50",
    });
  });

  it("exchanges into the recipient's currency through the treasury", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const quote = await currentQuote("USD", "EUR", "20");

    const result = await transferMoney(alice.id, {
      ...sameCurrency,
      recipientEmail: bob.email,
      from: "USD",
      to: "EUR",
      amount: "20",
      quotedRate: quote.rate,
      idempotencyKey: newKey(),
    });

    // 20 × 0.85 × 0.995
    expect(result.toAmount).toBe("16.91");
    expect(await balanceOf(bob.id, "EUR")).toBe("16.91");
    expect(await balanceOf(alice.id, "USD")).toBe("80.00");
  });

  it("rejects unknown recipients and transfers to yourself", async () => {
    const alice = await createUser();
    const input = {
      ...sameCurrency,
      from: "USD",
      to: "USD",
      amount: "1",
      idempotencyKey: newKey(),
    };

    await expect(
      transferMoney(alice.id, {
        ...input,
        recipientEmail: "nobody@example.test",
      }),
    ).rejects.toMatchObject({ code: "RECIPIENT_NOT_FOUND" });
    await expect(
      transferMoney(alice.id, { ...input, recipientEmail: alice.email }),
    ).rejects.toMatchObject({ code: "SELF_TRANSFER" });
  });

  it("doesn't deadlock when two users send each other money at the same time", async () => {
    const alice = await createUser();
    const bob = await createUser();

    // Opposite directions lock the same two accounts. Ledger entries are
    // written in account id order, so both transactions lock in the same
    // order instead of waiting on each other.
    const results = await Promise.allSettled(
      Array.from({ length: 40 }, (_, i) =>
        transferMoney(i % 2 ? bob.id : alice.id, {
          ...sameCurrency,
          recipientEmail: i % 2 ? alice.email : bob.email,
          from: "USD",
          to: "USD",
          amount: "1",
          idempotencyKey: newKey(),
        }),
      ),
    );

    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect(await balanceOf(alice.id, "USD")).toBe("100.00");
    expect(await balanceOf(bob.id, "USD")).toBe("100.00");
  });

  it("doesn't let an idempotency key be reused for another kind of operation", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const key = newKey();
    const input = {
      ...sameCurrency,
      recipientEmail: bob.email,
      from: "USD",
      to: "USD",
      amount: "1",
      idempotencyKey: key,
    };

    await transferMoney(alice.id, input);
    await expect(transferMoney(alice.id, input)).resolves.toMatchObject({
      replayed: true,
    });

    const { convertCurrency } = await import("./conversion");
    await expect(
      convertCurrency(alice.id, {
        from: "USD",
        to: "EUR",
        amount: "1",
        quotedRate: "0.8",
        idempotencyKey: key,
      }),
    ).rejects.toThrow(/already used for a TRANSFER transaction/);
  });
});
