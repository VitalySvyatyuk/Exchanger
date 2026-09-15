import "server-only";
import { db } from "@/lib/db";

export type AccountBalance = {
  id: string;
  /** Decimal string with the currency's precision, e.g. "100.00". */
  balance: string;
  currency: {
    code: string;
    name: string;
    symbol: string;
    type: "FIAT" | "CRYPTO";
    precision: number;
  };
};

export async function getUserBalances(
  userId: string,
): Promise<AccountBalance[]> {
  const accounts = await db.account.findMany({
    where: { userId },
    orderBy: { currency: { sortOrder: "asc" } },
    select: {
      id: true,
      balance: true,
      currency: {
        select: {
          code: true,
          name: true,
          symbol: true,
          type: true,
          precision: true,
        },
      },
    },
  });

  // Decimal objects can't be passed to Client Components; send strings.
  return accounts.map(({ id, balance, currency }) => ({
    id,
    balance: balance.toFixed(currency.precision),
    currency,
  }));
}
