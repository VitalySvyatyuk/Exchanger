import { afterEach, describe, expect, it, vi } from "vitest";
import { providerFor, RATE_PROVIDERS } from "./providers";

function stubResponse(body: unknown) {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("rate providers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("assigns every non-base currency to one provider", () => {
    expect(providerFor("EUR")?.source).toBe("FRANKFURTER");
    expect(providerFor("GBP")?.source).toBe("FRANKFURTER");
    expect(providerFor("BTC")?.source).toBe("COINGECKO");
    expect(providerFor("ETH")?.source).toBe("COINGECKO");
    expect(providerFor("USD")).toBeUndefined();
  });

  it("parses Frankfurter rates as published (USD → currency)", async () => {
    const fetch = stubResponse({
      amount: 1,
      base: "USD",
      date: "2026-09-14",
      rates: { EUR: 0.86573, GBP: 0.74104 },
    });

    await expect(providerFor("EUR")!.fetch()).resolves.toEqual([
      { baseCurrencyCode: "USD", quoteCurrencyCode: "EUR", rate: "0.86573" },
      { baseCurrencyCode: "USD", quoteCurrencyCode: "GBP", rate: "0.74104" },
    ]);
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP",
    );
  });

  it("parses CoinGecko prices as published (coin → USD)", async () => {
    stubResponse({ bitcoin: { usd: 76939 }, ethereum: { usd: 2475.5 } });

    await expect(providerFor("BTC")!.fetch()).resolves.toEqual([
      { baseCurrencyCode: "BTC", quoteCurrencyCode: "USD", rate: "76939" },
      { baseCurrencyCode: "ETH", quoteCurrencyCode: "USD", rate: "2475.5" },
    ]);
  });

  it("fails when a currency is missing from the response", async () => {
    stubResponse({ amount: 1, base: "USD", rates: { EUR: 0.9 } });
    await expect(providerFor("EUR")!.fetch()).rejects.toThrow(
      "Frankfurter: no rate for GBP",
    );
  });

  it("refreshes crypto more often than fiat", () => {
    const [fiat, crypto] = RATE_PROVIDERS;
    expect(crypto.refreshAfterMs).toBeLessThan(fiat.refreshAfterMs);
    expect(crypto.maxAgeMs).toBeLessThan(fiat.maxAgeMs);
  });
});
