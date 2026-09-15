import { Decimal, MONEY_DIGITS } from "@/lib/decimal";

/** Fee kept by the treasury on every conversion (0.5%). */
export const CONVERSION_FEE_RATE = "0.005";

/**
 * Maximum tolerated drop between the rate the user was shown and the rate
 * at execution time (0.5%). A bigger move rejects the conversion.
 */
export const MAX_SLIPPAGE = "0.005";

/** Significant digits kept when a rate is shown or stored. */
const RATE_DIGITS = 18;

/** USD value of one unit of each currency, as decimal strings. */
export type UsdPrices = Record<string, string>;

export type ConversionQuote = {
  /** Mid-market rate: units of `to` per unit of `from`. */
  marketRate: string;
  /** Rate after the fee: what the user actually gets per unit of `from`. */
  rate: string;
  /** Amount credited, rounded down to the target currency precision. */
  toAmount: string;
  /** Fee in the target currency (before rounding). */
  fee: string;
};

export function marketRate(from: string, to: string, prices: UsdPrices) {
  const fromPrice = prices[from];
  const toPrice = prices[to];
  if (!fromPrice || !toPrice) {
    throw new Error(`No exchange rate for ${from}/${to}`);
  }
  return new Decimal(fromPrice).div(toPrice);
}

export function quoteConversion(input: {
  from: string;
  to: string;
  amount: string;
  toPrecision: number;
  prices: UsdPrices;
}): ConversionQuote {
  const market = marketRate(input.from, input.to, input.prices);
  const rate = market.times(new Decimal(1).minus(CONVERSION_FEE_RATE));
  const gross = market.times(input.amount);
  const net = rate.times(input.amount);

  return {
    // Computed at full precision; rounded only for display and storage.
    marketRate: market.toSignificantDigits(RATE_DIGITS).toString(),
    rate: rate.toSignificantDigits(RATE_DIGITS).toString(),
    // Round down: the platform never credits more than the exact amount.
    toAmount: net
      .toSignificantDigits(MONEY_DIGITS)
      .toDecimalPlaces(input.toPrecision, Decimal.ROUND_DOWN)
      .toFixed(input.toPrecision),
    fee: gross.minus(net).toSignificantDigits(RATE_DIGITS).toString(),
  };
}

/** True if `current` is worse than `quoted` by more than MAX_SLIPPAGE. */
export function exceedsSlippage(quoted: string, current: string): boolean {
  const floor = new Decimal(quoted).times(new Decimal(1).minus(MAX_SLIPPAGE));
  return new Decimal(current).lessThan(floor);
}

/** Formats a rate with 6 significant digits, e.g. 0.861403 or 76939. */
export function formatRate(rate: string): string {
  return new Decimal(rate).toSignificantDigits(6).toString();
}
