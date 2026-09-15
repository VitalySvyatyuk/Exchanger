import type { UsdPrices } from "@/lib/conversion";
import { Decimal } from "@/lib/decimal";

/** Short, human-friendly lot reference, e.g. "#3f9a1c2e". */
export function lotNumber(id: string): string {
  return `#${id.slice(0, 8)}`;
}

/** Units of the buy currency asked per unit of the sell currency. */
export function lotPrice(sellAmount: string, buyAmount: string): string {
  return new Decimal(buyAmount).div(sellAmount).toString();
}

/**
 * How much better (positive) or worse (negative) the lot is for a buyer
 * than the market, as a fraction: 0.05 means the buyer receives 5% more
 * value than they pay. Null when rates are missing.
 */
export function buyerAdvantage(
  lot: {
    sellCurrency: string;
    sellAmount: string;
    buyCurrency: string;
    buyAmount: string;
  },
  prices: UsdPrices,
): number | null {
  const sellPrice = prices[lot.sellCurrency];
  const buyPrice = prices[lot.buyCurrency];
  if (!sellPrice || !buyPrice) return null;

  const received = new Decimal(lot.sellAmount).times(sellPrice);
  const paid = new Decimal(lot.buyAmount).times(buyPrice);
  return received.div(paid).minus(1).toNumber();
}

/** Formats a fraction as a signed percentage, e.g. "+4.2%". */
export function formatPercent(fraction: number): string {
  const value = (fraction * 100).toFixed(1);
  return fraction > 0 ? `+${value}%` : `${value}%`;
}
