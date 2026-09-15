import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { balanceOf, PASSWORD, uniqueEmail } from "../../test/factories";
import {
  authenticate,
  EmailAlreadyRegisteredError,
  registerUser,
} from "./users";

describe("registerUser", () => {
  it("creates one account per currency and credits the welcome bonus", async () => {
    const email = uniqueEmail();
    const { id } = await registerUser({
      name: "New User",
      email,
      password: PASSWORD,
    });

    const accounts = await db.account.findMany({
      where: { userId: id },
      orderBy: { currencyCode: "asc" },
      select: { currencyCode: true },
    });
    expect(accounts.map((a) => a.currencyCode)).toEqual([
      "BTC",
      "ETH",
      "EUR",
      "GBP",
      "USD",
    ]);
    expect(await balanceOf(id, "USD")).toBe("100.00");

    const bonus = await db.transaction.findMany({
      where: { initiatedById: id, type: "WELCOME_BONUS" },
      include: { ledgerEntries: { include: { account: true } } },
    });
    expect(bonus).toHaveLength(1);
    expect(
      bonus[0].ledgerEntries
        .map((e) => `${e.account.type} ${e.amount.toFixed(2)}`)
        .sort(),
    ).toEqual(["TREASURY -100.00", "USER 100.00"]);
  });

  it("rejects a duplicate email, even when both requests arrive at once", async () => {
    const email = uniqueEmail();
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        registerUser({ name: "Dup", email, password: PASSWORD }),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const result of results.filter((r) => r.status === "rejected")) {
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(
        EmailAlreadyRegisteredError,
      );
    }
    expect(await db.user.count({ where: { email } })).toBe(1);
  });
});

describe("authenticate", () => {
  it("accepts the right password only", async () => {
    const email = uniqueEmail();
    const { id } = await registerUser({
      name: "Auth",
      email,
      password: PASSWORD,
    });

    await expect(authenticate(email, PASSWORD)).resolves.toEqual({ id });
    await expect(authenticate(email, "Wrong1234")).resolves.toBeNull();
    await expect(authenticate(uniqueEmail(), PASSWORD)).resolves.toBeNull();
  });
});
