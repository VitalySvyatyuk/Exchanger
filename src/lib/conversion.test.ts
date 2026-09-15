import { describe, expect, it } from "vitest";
import {
  exceedsSlippage,
  formatRate,
  marketRate,
  quoteConversion,
  type UsdPrices,
} from "./conversion";
import { Decimal } from "./decimal";

// Same orientation as the providers: fiat as "1 USD = x", crypto as a USD price.
function pricesFor(rates: {
  eur: string;
  gbp: string;
  btc: string;
  eth: string;
}): UsdPrices {
  return {
    USD: "1",
    EUR: new Decimal(1).div(rates.eur).toString(),
    GBP: new Decimal(1).div(rates.gbp).toString(),
    BTC: rates.btc,
    ETH: rates.eth,
  };
}

const prices = pricesFor({
  eur: "0.85",
  gbp: "0.75",
  btc: "80000",
  eth: "2500",
});

describe("marketRate", () => {
  it("derives cross rates from USD prices", () => {
    expect(
      marketRate("USD", "EUR", prices).toSignificantDigits(18).toString(),
    ).toBe("0.85");
    expect(marketRate("BTC", "ETH", prices).toString()).toBe("32");
  });

  it("throws when a rate is missing", () => {
    expect(() => marketRate("USD", "JPY", prices)).toThrow(
      "No exchange rate for USD/JPY",
    );
  });
});

describe("quoteConversion", () => {
  it("applies the 0.5% fee", () => {
    expect(
      quoteConversion({
        from: "USD",
        to: "EUR",
        amount: "40",
        toPrecision: 2,
        prices,
      }),
    ).toEqual({
      marketRate: "0.85",
      rate: "0.84575",
      toAmount: "33.83",
      fee: "0.17",
    });
  });

  it("rounds down, never crediting more than the exact amount", () => {
    // 100 × 0.75 × 0.995 = 74.625
    const quote = quoteConversion({
      from: "USD",
      to: "GBP",
      amount: "100",
      toPrecision: 2,
      prices,
    });
    expect(quote.toAmount).toBe("74.62");
  });

  it("keeps the full precision of crypto currencies", () => {
    const toEth = quoteConversion({
      from: "USD",
      to: "ETH",
      amount: "100",
      toPrecision: 18,
      prices,
    });
    expect(toEth.toAmount).toBe("0.039800000000000000");

    // 1 / 80,000 × 0.995 = 0.0000124375
    const toBtc = quoteConversion({
      from: "USD",
      to: "BTC",
      amount: "1",
      toPrecision: 8,
      prices,
    });
    expect(toBtc.toAmount).toBe("0.00001243");
  });

  it("returns zero for amounts too small for the target currency", () => {
    const quote = quoteConversion({
      from: "BTC",
      to: "USD",
      amount: "0.00000001",
      toPrecision: 2,
      prices,
    });
    expect(quote.toAmount).toBe("0.00");
  });

  // Regression: division noise from inverted prices (1 / 0.6) used to push
  // exact results just below a cent, and rounding down lost that cent.
  it.each([
    {
      amount: "590",
      from: "USD",
      to: "EUR",
      eur: "0.6",
      gbp: "1",
      expected: "352.23",
    },
    {
      amount: "63",
      from: "EUR",
      to: "USD",
      eur: "0.63",
      gbp: "1",
      expected: "99.50",
    },
    {
      amount: "156",
      from: "GBP",
      to: "EUR",
      eur: "0.86",
      gbp: "1.72",
      expected: "77.61",
    },
  ])(
    "lands exactly on cent boundaries: $amount $from → $to",
    ({ amount, from, to, eur, gbp, expected }) => {
      const quote = quoteConversion({
        from,
        to,
        amount,
        toPrecision: 2,
        prices: pricesFor({ eur, gbp, btc: "80000", eth: "2500" }),
      });
      expect(quote.toAmount).toBe(expected);
    },
  );

  it("matches exact rational arithmetic for random inputs", () => {
    // Reference: the rate as an exact fraction of the published rates, with
    // one division at the end at 120 digits of precision.
    const Exact = Decimal.clone({ precision: 120 });
    const random = seededRandom(42);
    const pick = (max: number) => Math.floor(random() * max);
    const codes = ["USD", "EUR", "GBP", "BTC", "ETH"];
    const precision: Record<string, number> = {
      USD: 2,
      EUR: 2,
      GBP: 2,
      BTC: 8,
      ETH: 18,
    };

    for (let i = 0; i < 5_000; i++) {
      const eur = String((pick(190) + 10) / 100);
      const gbp = String((pick(190) + 10) / 100);
      const btc = String((pick(90) + 10) * 1000);
      const eth = String((pick(90) + 10) * 100);
      const from = codes[pick(5)];
      const to = codes[pick(5)];
      if (from === to) continue;
      // Whole numbers make results land on exact boundaries often.
      const amount = String(pick(1000) + 1);

      const fraction: Record<string, [string, string]> = {
        USD: ["1", "1"],
        EUR: ["1", eur],
        GBP: ["1", gbp],
        BTC: [btc, "1"],
        ETH: [eth, "1"],
      };
      const [fromNum, fromDen] = fraction[from];
      const [toNum, toDen] = fraction[to];
      const expected = new Exact(amount)
        .times(fromNum)
        .times(toDen)
        .times("0.995")
        .div(new Exact(fromDen).times(toNum))
        .toDecimalPlaces(precision[to], Exact.ROUND_DOWN)
        .toFixed(precision[to]);

      const quote = quoteConversion({
        from,
        to,
        amount,
        toPrecision: precision[to],
        prices: pricesFor({ eur, gbp, btc, eth }),
      });
      expect(quote.toAmount, `${amount} ${from} → ${to}`).toBe(expected);
    }
  });
});

describe("exceedsSlippage", () => {
  it("allows moves up to 0.5% and better rates", () => {
    expect(exceedsSlippage("1", "0.995")).toBe(false);
    expect(exceedsSlippage("1", "1.2")).toBe(false);
  });

  it("rejects worse moves", () => {
    expect(exceedsSlippage("1", "0.9949")).toBe(true);
  });
});

describe("formatRate", () => {
  it("keeps 6 significant digits", () => {
    expect(formatRate("0.8614013500")).toBe("0.861401");
    expect(formatRate("76939")).toBe("76939");
    expect(formatRate("0.0000129293123")).toBe("0.0000129293");
  });
});

/** Deterministic PRNG (mulberry32), so failures are reproducible. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
