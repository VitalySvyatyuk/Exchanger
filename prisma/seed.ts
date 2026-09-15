// Seeds reference data. Safe to run repeatedly: existing rows are kept.
//
//   npm run db:seed
//
// Creates currencies, a TREASURY and an ESCROW account per currency,
// fallback exchange rates and an admin user (ADMIN_EMAIL / ADMIN_PASSWORD).

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { BASE_CURRENCY, SUPPORTED_CURRENCIES } from "../src/lib/currencies";
import { hashPassword } from "../src/lib/password";

const db = new PrismaClient();

// Approximate rates: 1 USD = <rate> units of the currency. Used only until
// live rates are fetched, so the app works offline from the first run.
const FALLBACK_USD_RATES: Record<string, string> = {
  EUR: "0.86",
  GBP: "0.74",
  BTC: "0.0000090",
  ETH: "0.00025",
};

async function seedCurrencies() {
  for (const [index, currency] of SUPPORTED_CURRENCIES.entries()) {
    const data = { ...currency, sortOrder: index + 1 };
    await db.currency.upsert({
      where: { code: currency.code },
      create: data,
      update: data,
    });
  }
  console.log(`Currencies: ${SUPPORTED_CURRENCIES.length}`);
}

async function seedSystemAccounts() {
  // skipDuplicates relies on the partial unique index on (type, currency_code).
  const { count } = await db.account.createMany({
    data: SUPPORTED_CURRENCIES.flatMap((currency) => [
      { type: "TREASURY" as const, currencyCode: currency.code },
      { type: "ESCROW" as const, currencyCode: currency.code },
    ]),
    skipDuplicates: true,
  });
  console.log(`System accounts created: ${count}`);
}

async function seedFallbackRates() {
  let created = 0;

  for (const [quoteCurrencyCode, rate] of Object.entries(FALLBACK_USD_RATES)) {
    const exists = await db.exchangeRate.findFirst({
      where: { baseCurrencyCode: BASE_CURRENCY, quoteCurrencyCode },
      select: { id: true },
    });
    if (exists) continue;

    await db.exchangeRate.create({
      data: {
        baseCurrencyCode: BASE_CURRENCY,
        quoteCurrencyCode,
        rate,
        source: "SEED",
      },
    });
    created++;
  }
  console.log(`Fallback exchange rates created: ${created}`);
}

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@exchanger.local")
    .trim()
    .toLowerCase();

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== "ADMIN") {
      await db.user.update({ where: { email }, data: { role: "ADMIN" } });
    }
    console.log(`Admin user exists: ${email}`);
    return;
  }

  const generated = !process.env.ADMIN_PASSWORD;
  const password =
    process.env.ADMIN_PASSWORD || randomBytes(12).toString("base64url");

  await db.user.create({
    data: {
      email,
      name: "Admin",
      role: "ADMIN",
      passwordHash: await hashPassword(password),
    },
  });

  console.log(`Admin user created: ${email}`);
  if (generated) {
    console.log(`Generated admin password (shown once): ${password}`);
  }
}

async function main() {
  await seedCurrencies();
  await seedSystemAccounts();
  await seedFallbackRates();
  await seedAdmin();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
