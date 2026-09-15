import DecimalJs from "decimal.js";

/**
 * Decimal configured for money math. Used on both server and client so a
 * preview in the browser matches what the server executes.
 *
 * Amounts have at most 36 significant digits (18 integer and 18 decimal
 * places). Intermediate results keep 60, so the rounding error of a
 * non-terminating division (e.g. 1 / 0.6) stays far below anything that
 * can affect a rounded amount; see MONEY_DIGITS. Plain notation avoids
 * "1e-7" in strings.
 */
export const Decimal = DecimalJs.clone({
  precision: 60,
  rounding: DecimalJs.ROUND_HALF_EVEN,
  toExpNeg: -60,
  toExpPos: 60,
});

/**
 * Significant digits an intermediate result is rounded to before it's
 * rounded to a currency's precision. This removes division noise: without
 * it, 590 × (1 / (1 / 0.6)) × 0.995 evaluates to 352.2299…9 and rounds down
 * to 352.22 instead of the exact 352.23.
 */
export const MONEY_DIGITS = 40;

export type Decimal = InstanceType<typeof Decimal>;
