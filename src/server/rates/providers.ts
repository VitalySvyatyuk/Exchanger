import "server-only";
import { z } from "zod";
import type { RateSource } from "@/generated/prisma/client";
import { BASE_CURRENCY } from "@/lib/currencies";
import { env } from "@/lib/env";
import { fetchJson } from "@/server/http";

/** A rate as published by the source: 1 `base` = `rate` `quote`. */
export type FetchedRate = {
  baseCurrencyCode: string;
  quoteCurrencyCode: string;
  rate: string;
};

export type RateProvider = {
  source: Exclude<RateSource, "SEED">;
  currencies: readonly string[];
  /** Serve cached rates for this long before refreshing. */
  refreshAfterMs: number;
  /** Older rates are too stale to execute a conversion with. */
  maxAgeMs: number;
  fetch: () => Promise<FetchedRate[]>;
};

/**
 * Deterministic rates used when RATES_MODE=fixed, in the same orientation
 * as the real providers publish them. 1 USD = 0.85 EUR = 0.75 GBP;
 * 1 BTC = 80,000 USD; 1 ETH = 2,500 USD.
 */
export const FIXED_RATES: Record<string, FetchedRate> = {
  EUR: {
    baseCurrencyCode: BASE_CURRENCY,
    quoteCurrencyCode: "EUR",
    rate: "0.85",
  },
  GBP: {
    baseCurrencyCode: BASE_CURRENCY,
    quoteCurrencyCode: "GBP",
    rate: "0.75",
  },
  BTC: {
    baseCurrencyCode: "BTC",
    quoteCurrencyCode: BASE_CURRENCY,
    rate: "80000",
  },
  ETH: {
    baseCurrencyCode: "ETH",
    quoteCurrencyCode: BASE_CURRENCY,
    rate: "2500",
  },
};

function fixedRates(currencies: readonly string[]): FetchedRate[] {
  return currencies.map((code) => FIXED_RATES[code]);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Numbers from JSON are converted to strings with their shortest exact
// representation, which is what the API sent.
const positiveNumber = z.number().positive().finite();

/** ECB reference rates, published once per working day. */
const frankfurter: RateProvider = {
  source: "FRANKFURTER",
  currencies: ["EUR", "GBP"],
  refreshAfterMs: HOUR,
  // Covers weekends and holidays, when the ECB doesn't publish.
  maxAgeMs: 4 * 24 * HOUR,
  async fetch() {
    if (env.RATES_MODE === "fixed") return fixedRates(this.currencies);
    const symbols = this.currencies.join(",");
    const data = await fetchJson(
      `https://api.frankfurter.dev/v1/latest?base=${BASE_CURRENCY}&symbols=${symbols}`,
      {
        schema: z.object({
          base: z.literal(BASE_CURRENCY),
          rates: z.record(z.string(), positiveNumber),
        }),
      },
    );

    return this.currencies.map((code) => {
      const rate = data.rates[code];
      if (rate === undefined)
        throw new Error(`Frankfurter: no rate for ${code}`);
      return {
        baseCurrencyCode: BASE_CURRENCY,
        quoteCurrencyCode: code,
        rate: String(rate),
      };
    });
  },
};

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
};

/** Crypto prices in USD. */
const coingecko: RateProvider = {
  source: "COINGECKO",
  currencies: ["BTC", "ETH"],
  refreshAfterMs: MINUTE,
  maxAgeMs: 10 * MINUTE,
  async fetch() {
    if (env.RATES_MODE === "fixed") return fixedRates(this.currencies);
    const ids = this.currencies.map((code) => COINGECKO_IDS[code]);
    const vs = BASE_CURRENCY.toLowerCase();
    const data = await fetchJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=${vs}`,
      {
        schema: z.record(z.string(), z.object({ [vs]: positiveNumber })),
        headers: env.COINGECKO_API_KEY
          ? { "x-cg-demo-api-key": env.COINGECKO_API_KEY }
          : undefined,
      },
    );

    return this.currencies.map((code) => {
      const price = data[COINGECKO_IDS[code]]?.[vs];
      if (price === undefined)
        throw new Error(`CoinGecko: no price for ${code}`);
      return {
        baseCurrencyCode: code,
        quoteCurrencyCode: BASE_CURRENCY,
        rate: String(price),
      };
    });
  },
};

export const RATE_PROVIDERS: readonly RateProvider[] = [frankfurter, coingecko];

export function providerFor(currencyCode: string): RateProvider | undefined {
  return RATE_PROVIDERS.find((p) => p.currencies.includes(currencyCode));
}
