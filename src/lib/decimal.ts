import DecimalJs from "decimal.js";

/**
 * Decimal configured for money math. Used on both server and client so a
 * preview in the browser matches what the server executes.
 *
 * 40 significant digits covers amounts with 18 decimal places (ETH) and
 * large integer parts; plain notation avoids "1e-7" in strings.
 */
export const Decimal = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_EVEN,
  toExpNeg: -40,
  toExpPos: 40,
});

export type Decimal = InstanceType<typeof Decimal>;
