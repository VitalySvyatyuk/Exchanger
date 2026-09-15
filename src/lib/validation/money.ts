import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { Decimal } from "@/lib/decimal";

const codes = SUPPORTED_CURRENCIES.map((c) => c.code) as [string, ...string[]];

export const currencyCode = z.enum(codes, { error: "Choose a currency." });

const DECIMAL_AMOUNT = /^\d{1,18}(\.\d{1,18})?$/;

// Zod runs every check even after one fails, so checks that construct a
// Decimal must not assume the format check passed: new Decimal("abc") throws.
function isDecimalAmount(value: string): boolean {
  return DECIMAL_AMOUNT.test(value);
}

export const positiveAmount = z
  .string()
  .trim()
  .regex(DECIMAL_AMOUNT, { error: "Enter an amount, e.g. 25.50." })
  .refine(
    (value) => !isDecimalAmount(value) || new Decimal(value).greaterThan(0),
    { error: "Amount must be greater than zero." },
  );

/** A rate the user was shown; empty when no conversion is involved. */
export const quotedRate = z.string().regex(/^(\d+(\.\d+)?)?$/);

export const idempotencyKey = z.uuid();

export function fitsPrecision(currency: string, amount: string): boolean {
  const definition = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
  return (
    !definition ||
    // Malformed amounts are reported by the amount field itself.
    !isDecimalAmount(amount) ||
    new Decimal(amount).decimalPlaces() <= definition.precision
  );
}

export const PRECISION_ERROR = "Too many decimal places for this currency.";

export type MoneyFormState<Field extends string> = {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: Partial<Record<Field, string[]>>;
  /** Key for the next submission. Rotated only after a success. */
  idempotencyKey: string;
};
