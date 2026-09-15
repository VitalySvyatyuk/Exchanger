import { afterAll, expect } from "vitest";
import { db } from "@/lib/db";

// Whatever a test file did, the books must still balance afterwards.
afterAll(async () => {
  const [row] = await db.$queryRaw<{ accounts: bigint; escrow: bigint }[]>`
    SELECT
      (SELECT count(*) FROM account_balance_mismatches) AS accounts,
      (SELECT count(*) FROM escrow_balance_mismatches) AS escrow
  `;
  expect({
    accountMismatches: Number(row.accounts),
    escrowMismatches: Number(row.escrow),
  }).toEqual({ accountMismatches: 0, escrowMismatches: 0 });

  await db.$disconnect();
});
