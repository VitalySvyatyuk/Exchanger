import "server-only";
import type { RateSource } from "@/generated/prisma/client";
import type { UsdPrices } from "@/lib/conversion";
import { BASE_CURRENCY } from "@/lib/currencies";
import { db } from "@/lib/db";
import { Decimal } from "@/lib/decimal";
import {
  providerFor,
  RATE_PROVIDERS,
  type RateProvider,
} from "@/server/rates/providers";

export type CurrencyRate = {
  currencyCode: string;
  /** USD value of one unit, as a decimal string. */
  usdPrice: string;
  source: RateSource;
  fetchedAt: Date;
  /** Too old to execute a conversion with. */
  stale: boolean;
};

type LatestRateRow = {
  currency_code: string;
  base_currency_code: string;
  rate: string;
  source: RateSource;
  fetched_at: Date;
};

/**
 * Latest known USD price of every currency, from the database.
 *
 * Rates are stored as published: USD→EUR for Frankfurter, BTC→USD for
 * CoinGecko. Each branch of the UNION reads one row from the
 * (base, quote, fetched_at DESC) index, so the query stays cheap however
 * long the rate history grows.
 */
export async function getLatestRates(): Promise<Map<string, CurrencyRate>> {
  const rows = await db.$queryRaw<LatestRateRow[]>`
    SELECT c.code AS currency_code, r.base_currency_code, r.rate::text AS rate,
           r.source::text AS source, r.fetched_at
    FROM currencies c
    CROSS JOIN LATERAL (
      SELECT * FROM (
        (SELECT base_currency_code, rate, source, fetched_at
         FROM exchange_rates
         WHERE base_currency_code = ${BASE_CURRENCY} AND quote_currency_code = c.code
         ORDER BY fetched_at DESC LIMIT 1)
        UNION ALL
        (SELECT base_currency_code, rate, source, fetched_at
         FROM exchange_rates
         WHERE base_currency_code = c.code AND quote_currency_code = ${BASE_CURRENCY}
         ORDER BY fetched_at DESC LIMIT 1)
      ) latest
      ORDER BY fetched_at DESC
      LIMIT 1
    ) r
    WHERE c.code <> ${BASE_CURRENCY}
  `;

  const now = Date.now();
  const rates = new Map<string, CurrencyRate>();

  rates.set(BASE_CURRENCY, {
    currencyCode: BASE_CURRENCY,
    usdPrice: "1",
    source: "SEED",
    fetchedAt: new Date(now),
    stale: false,
  });

  for (const row of rows) {
    const rate = new Decimal(row.rate);
    const maxAgeMs = providerFor(row.currency_code)?.maxAgeMs ?? 0;
    rates.set(row.currency_code, {
      currencyCode: row.currency_code,
      usdPrice: (row.base_currency_code === BASE_CURRENCY
        ? new Decimal(1).div(rate)
        : rate
      ).toString(),
      source: row.source,
      fetchedAt: row.fetched_at,
      stale: row.source === "SEED" || now - row.fetched_at.getTime() > maxAgeMs,
    });
  }

  return rates;
}

export function toUsdPrices(rates: Map<string, CurrencyRate>): UsdPrices {
  return Object.fromEntries(
    [...rates.values()].map((rate) => [rate.currencyCode, rate.usdPrice]),
  );
}

type RefreshResult = "refreshed" | "fresh" | "locked" | "failed";

/**
 * Fetches rates from one provider and stores them, unless they were
 * refreshed recently.
 *
 * A transaction-level advisory lock makes sure only one process calls the
 * API at a time; others skip instead of waiting. The freshness check runs
 * again inside the lock, since another process may have just finished.
 */
async function refreshProvider(
  provider: RateProvider,
  { force = false } = {},
): Promise<RefreshResult> {
  try {
    return await db.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${`rates:${provider.source}`})) AS locked
        `;
        if (!locked) return "locked";

        if (!force) {
          const latest = await tx.exchangeRate.findFirst({
            where: { source: provider.source },
            orderBy: { fetchedAt: "desc" },
            select: { fetchedAt: true },
          });
          if (
            latest &&
            Date.now() - latest.fetchedAt.getTime() < provider.refreshAfterMs
          ) {
            return "fresh";
          }
        }

        const rates = await provider.fetch();
        await tx.exchangeRate.createMany({
          data: rates.map((rate) => ({ ...rate, source: provider.source })),
        });
        return "refreshed";
      },
      // The API call happens inside the transaction (it holds the lock);
      // allow for timeouts and retries.
      { timeout: 30_000 },
    );
  } catch (error) {
    // Keep serving the last known rates.
    console.error(`Refreshing ${provider.source} rates failed:`, error);
    return "failed";
  }
}

/** Refreshes providers whose rates are older than their refresh interval. */
export async function refreshRates(options: { force?: boolean } = {}) {
  const results = await Promise.all(
    RATE_PROVIDERS.map(async (provider) => [
      provider.source,
      await refreshProvider(provider, options),
    ]),
  );
  return Object.fromEntries(results) as Record<
    RateProvider["source"],
    RefreshResult
  >;
}

export class RatesUnavailableError extends Error {
  constructor(currencies: string[]) {
    super(
      `Exchange rates for ${currencies.join(", ")} are temporarily unavailable. Please try again later.`,
    );
    this.name = "RatesUnavailableError";
  }
}

/**
 * Rates that are safe to execute a conversion with. Refreshes first if
 * needed, and throws if any of the currencies still has no fresh rate.
 */
export async function getExecutableRates(
  currencies: string[],
): Promise<Map<string, CurrencyRate>> {
  let rates = await getLatestRates();
  const needsRefresh = (codes: string[]) =>
    codes.filter((code) => {
      const rate = rates.get(code);
      const provider = providerFor(code);
      return (
        !rate ||
        (provider &&
          (rate.source === "SEED" ||
            Date.now() - rate.fetchedAt.getTime() > provider.refreshAfterMs))
      );
    });

  if (needsRefresh(currencies).length > 0) {
    await refreshRates();
    rates = await getLatestRates();
  }

  const unavailable = currencies.filter((code) => {
    const rate = rates.get(code);
    return !rate || rate.stale;
  });
  if (unavailable.length > 0) throw new RatesUnavailableError(unavailable);

  return rates;
}
