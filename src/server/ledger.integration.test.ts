import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createUser, newKey } from "../../test/factories";
import { getSystemAccount, postTransaction } from "./ledger";

/** The user's USD account and the USD treasury. */
async function usdAccounts(userId: string) {
  const user = await db.account.findUniqueOrThrow({
    where: { userId_currencyCode: { userId, currencyCode: "USD" } },
    select: { id: true },
  });
  const treasury = await getSystemAccount(db, "TREASURY", "USD");
  return { user: user.id, treasury: treasury.id };
}

describe("ledger integrity enforced by PostgreSQL", () => {
  it("updates balances from ledger entries", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const [a, b] = await Promise.all([
      usdAccounts(alice.id),
      usdAccounts(bob.id),
    ]);

    await db.$transaction((tx) =>
      postTransaction(tx, {
        type: "TRANSFER",
        entries: [
          { accountId: a.user, amount: "-12.34" },
          { accountId: b.user, amount: "12.34" },
        ],
      }),
    );

    const balances = await db.account.findMany({
      where: { id: { in: [a.user, b.user] } },
      select: { id: true, balance: true },
    });
    expect(
      Object.fromEntries(balances.map((x) => [x.id, x.balance.toFixed(2)])),
    ).toEqual({ [a.user]: "87.66", [b.user]: "112.34" });
  });

  it("rejects a transaction that doesn't balance, at commit", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const [a, b] = await Promise.all([
      usdAccounts(alice.id),
      usdAccounts(bob.id),
    ]);

    await expect(
      db.$transaction((tx) =>
        postTransaction(tx, {
          type: "TRANSFER",
          entries: [
            { accountId: a.user, amount: "-10" },
            { accountId: b.user, amount: "9" },
          ],
        }),
      ),
    ).rejects.toThrow(/is unbalanced: USD entries sum to -1/);

    // Nothing was written.
    const accounts = await db.account.findMany({
      where: { id: { in: [a.user, b.user] } },
      select: { balance: true },
    });
    expect(accounts.map((x) => x.balance.toFixed(2))).toEqual([
      "100.00",
      "100.00",
    ]);
  });

  it("rejects overdrafts on user accounts but not on the treasury", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const [a, b] = await Promise.all([
      usdAccounts(alice.id),
      usdAccounts(bob.id),
    ]);

    await expect(
      db.$transaction((tx) =>
        postTransaction(tx, {
          type: "TRANSFER",
          entries: [
            { accountId: a.user, amount: "-100.01" },
            { accountId: b.user, amount: "100.01" },
          ],
        }),
      ),
    ).rejects.toThrow(/accounts_balance_non_negative/);

    // The treasury funds the welcome bonus, so it is already negative.
    const treasury = await db.account.findUniqueOrThrow({
      where: { id: a.treasury },
    });
    expect(treasury.balance.isNegative()).toBe(true);
  });

  it("rejects amounts more precise than the currency", async () => {
    const alice = await createUser();
    const { user, treasury } = await usdAccounts(alice.id);

    await expect(
      db.$transaction((tx) =>
        postTransaction(tx, {
          type: "TRANSFER",
          entries: [
            { accountId: user, amount: "-0.001" },
            { accountId: treasury, amount: "0.001" },
          ],
        }),
      ),
    ).rejects.toThrow(/exceeds the currency precision of 2 decimal places/);
  });

  it("forbids editing balances, ledger entries and transactions", async () => {
    const alice = await createUser();
    const { user } = await usdAccounts(alice.id);
    const entry = await db.ledgerEntry.findFirstOrThrow({
      where: { accountId: user },
    });

    await expect(
      db.$executeRaw`UPDATE accounts SET balance = 1000000 WHERE id = ${user}::uuid`,
    ).rejects.toThrow(/can only be changed through ledger entries/);
    await expect(
      db.ledgerEntry.update({
        where: { id: entry.id },
        data: { amount: 1000 },
      }),
    ).rejects.toThrow(/append-only: UPDATE is not allowed/);
    await expect(
      db.ledgerEntry.delete({ where: { id: entry.id } }),
    ).rejects.toThrow(/append-only: DELETE is not allowed/);
    await expect(
      db.transaction.delete({ where: { id: entry.transactionId } }),
    ).rejects.toThrow(/append-only: DELETE is not allowed/);
  });

  it("makes idempotency keys unique per user", async () => {
    const alice = await createUser();
    const key = newKey();
    await db.transaction.create({
      data: { type: "TRANSFER", initiatedById: alice.id, idempotencyKey: key },
    });
    await expect(
      db.transaction.create({
        data: {
          type: "TRANSFER",
          initiatedById: alice.id,
          idempotencyKey: key,
        },
      }),
    ).rejects.toThrow(/Unique constraint/);
  });
});
