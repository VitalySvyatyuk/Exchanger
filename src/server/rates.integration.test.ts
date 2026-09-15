import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { RATE_PROVIDERS } from "./rates/providers";
import {
  getExecutableRates,
  getLatestRates,
  RatesUnavailableError,
  refreshRates,
} from "./rates/rates";

describe("exchange rates", () => {
  afterEach(() => vi.restoreAllMocks());

  it("treats seed rates as stale and uses provider rates for execution", async () => {
    // Other test files may have refreshed rates already; either way, seed
    // rates must never be executable.
    const latest = await getLatestRates();
    for (const rate of latest.values()) {
      if (rate.source === "SEED" && rate.currencyCode !== "USD") {
        expect(rate.stale).toBe(true);
      }
    }

    const rates = await getExecutableRates(["EUR", "BTC"]);
    // Fixed test rates: 1 USD = 0.85 EUR, 1 BTC = 80,000 USD.
    expect(rates.get("EUR")).toMatchObject({
      source: "FRANKFURTER",
      stale: false,
    });
    expect(Number(rates.get("EUR")!.usdPrice)).toBeCloseTo(1 / 0.85, 12);
    expect(rates.get("BTC")).toMatchObject({
      source: "COINGECKO",
      usdPrice: "80000",
      stale: false,
    });
  });

  it("calls each provider once when many requests refresh at the same time", async () => {
    // Slow providers, so the refreshes really overlap.
    const spies = RATE_PROVIDERS.map((provider) => {
      const original = provider.fetch.bind(provider);
      return vi.spyOn(provider, "fetch").mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return original();
      });
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => refreshRates({ force: true })),
    );

    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(results.flatMap(Object.values).sort()).toEqual([
      ...Array(8).fill("locked"),
      ...Array(2).fill("refreshed"),
    ]);
  });

  it("keeps serving the last rates when a provider is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const provider of RATE_PROVIDERS) {
      vi.spyOn(provider, "fetch").mockRejectedValue(new Error("ENOTFOUND"));
    }

    const before = await getLatestRates();
    const results = await refreshRates({ force: true });
    expect(results).toEqual({ FRANKFURTER: "failed", COINGECKO: "failed" });

    const after = await getLatestRates();
    expect(after.get("BTC")!.usdPrice).toBe(before.get("BTC")!.usdPrice);
  });

  it("refuses to execute with rates older than the provider's limit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const provider of RATE_PROVIDERS) {
      vi.spyOn(provider, "fetch").mockRejectedValue(new Error("ENOTFOUND"));
    }
    // Age every crypto rate past CoinGecko's 10-minute limit.
    await db.exchangeRate.updateMany({
      where: { source: "COINGECKO" },
      data: { fetchedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    await expect(getExecutableRates(["USD", "BTC"])).rejects.toThrow(
      RatesUnavailableError,
    );
    // Fiat rates are still fine.
    await expect(getExecutableRates(["USD", "EUR"])).resolves.toBeDefined();

    // Restore fresh rates for the other test files.
    vi.restoreAllMocks();
    await refreshRates({ force: true });
  });
});
