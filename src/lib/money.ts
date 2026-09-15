type CurrencyFormat = {
  type: "FIAT" | "CRYPTO";
  /** Number of decimal places. */
  precision: number;
};

/**
 * Formats a decimal string without converting it to a JS number, so
 * 18-decimal amounts keep full precision. Fiat shows every decimal place;
 * crypto trims trailing zeros but keeps at least two.
 */
export function formatAmount(amount: string, currency: CurrencyFormat): string {
  const negative = amount.startsWith("-");
  const [integerPart = "0", fractionPart = ""] = amount
    .replace(/^[-+]/, "")
    .split(".");

  const integer = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let fraction = fractionPart
    .padEnd(currency.precision, "0")
    .slice(0, currency.precision);

  if (currency.type === "CRYPTO") {
    fraction = fraction.replace(/0+$/, "").padEnd(2, "0");
  }

  const sign = negative && /[1-9]/.test(integerPart + fraction) ? "-" : "";
  return `${sign}${integer}${fraction ? `.${fraction}` : ""}`;
}
