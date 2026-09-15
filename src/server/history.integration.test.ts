import { describe, expect, it } from "vitest";
import { createUser, newKey } from "../../test/factories";
import { getHistory, HISTORY_PAGE_SIZE } from "./history";
import { transferMoney } from "./transfers";

describe("getHistory", () => {
  it("pages through the whole history without gaps or duplicates", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");

    for (let i = 0; i < 45; i++) {
      await transferMoney(alice.id, {
        recipientEmail: bob.email,
        from: "USD",
        to: "USD",
        amount: "1",
        note: `#${i}`,
        quotedRate: "",
        idempotencyKey: newKey(),
      });
    }

    const pages = [];
    let cursor: bigint | undefined;
    do {
      const page = await getHistory(alice.id, { cursor });
      pages.push(page);
      cursor = page.nextCursor ? BigInt(page.nextCursor) : undefined;
    } while (cursor !== undefined);

    const items = pages.flatMap((page) => page.items);
    // 45 transfers + the welcome bonus
    expect(pages.map((page) => page.items.length)).toEqual([
      HISTORY_PAGE_SIZE,
      HISTORY_PAGE_SIZE,
      6,
    ]);
    expect(new Set(items.map((item) => item.id)).size).toBe(46);
    // Newest first.
    const ids = items.map((item) => BigInt(item.id));
    expect(ids).toEqual([...ids].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)));
    expect(items[0].description).toBe("To Bob · “#44”");
    expect(items.at(-1)!.type).toBe("WELCOME_BONUS");
  });

  it("filters by currency", async () => {
    const user = await createUser();
    const usd = await getHistory(user.id, { currencyCode: "USD" });
    const eur = await getHistory(user.id, { currencyCode: "EUR" });

    expect(usd.items).toHaveLength(1);
    expect(eur.items).toEqual([]);
    expect(eur.nextCursor).toBeNull();
  });
});
