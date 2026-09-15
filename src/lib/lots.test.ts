import { describe, expect, it } from "vitest";
import { Decimal } from "./decimal";
import { buyerAdvantage, formatPercent, lotNumber, lotPrice } from "./lots";

const prices = {
  USD: "1",
  EUR: new Decimal(1).div("0.85").toString(),
  BTC: "80000",
};

describe("lots", () => {
  it("formats a short lot number", () => {
    expect(lotNumber("3f9a1c2e-0000-4000-8000-000000000000")).toBe("#3f9a1c2e");
  });

  it("computes the price per unit sold", () => {
    expect(lotPrice("30.00", "24.00")).toBe("0.8");
  });

  it("compares the lot with the market from the buyer's side", () => {
    // Buyer pays 24 EUR (≈ 28.24 USD) and receives 30 USD: 6.25% better.
    const cheap = buyerAdvantage(
      {
        sellCurrency: "USD",
        sellAmount: "30",
        buyCurrency: "EUR",
        buyAmount: "24",
      },
      prices,
    );
    expect(cheap).toBeCloseTo(0.0625, 10);

    // Asking 30 EUR (≈ 35.29 USD) for 30 USD is worse than the market.
    const expensive = buyerAdvantage(
      {
        sellCurrency: "USD",
        sellAmount: "30",
        buyCurrency: "EUR",
        buyAmount: "30",
      },
      prices,
    );
    expect(expensive).toBeLessThan(0);
  });

  it("returns null when a rate is missing", () => {
    expect(
      buyerAdvantage(
        {
          sellCurrency: "USD",
          sellAmount: "1",
          buyCurrency: "GBP",
          buyAmount: "1",
        },
        prices,
      ),
    ).toBeNull();
  });

  it("formats signed percentages", () => {
    expect(formatPercent(0.0625)).toBe("+6.3%");
    expect(formatPercent(-0.031)).toBe("-3.1%");
    expect(formatPercent(0)).toBe("0.0%");
  });
});
