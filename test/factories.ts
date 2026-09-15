import { randomUUID } from "node:crypto";
import { quoteConversion } from "@/lib/conversion";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { db } from "@/lib/db";
import { getExecutableRates, toUsdPrices } from "@/server/rates/rates";
import { registerUser } from "@/server/users";

export const PASSWORD = "Secret123";

export function uniqueEmail(prefix = "user") {
  return `${prefix}-${randomUUID()}@example.test`;
}

/** A registered user with the $100 welcome bonus. */
export async function createUser(name = "Test User") {
  const email = uniqueEmail(name.toLowerCase().replace(/\W+/g, "-"));
  const { id } = await registerUser({ name, email, password: PASSWORD });
  return { id, name, email };
}

export async function balanceOf(userId: string, currencyCode: string) {
  const account = await db.account.findUniqueOrThrow({
    where: { userId_currencyCode: { userId, currencyCode } },
    select: { balance: true, currency: { select: { precision: true } } },
  });
  return account.balance.toFixed(account.currency.precision);
}

/** The quote a user would see right now, for `quotedRate`. */
export async function currentQuote(from: string, to: string, amount: string) {
  const rates = await getExecutableRates([from, to]);
  const precision = SUPPORTED_CURRENCIES.find((c) => c.code === to)!.precision;
  return quoteConversion({
    from,
    to,
    amount,
    toPrecision: precision,
    prices: toUsdPrices(rates),
  });
}

export const newKey = () => randomUUID();
