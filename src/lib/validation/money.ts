import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { Decimal } from "@/lib/decimal";

const codes = SUPPORTED_CURRENCIES.map((c) => c.code) as [string, ...string[]];

export const currencyCode = z.enum(codes, { error: "Choose a currency." });

export const positiveAmount = z
  .string()
  .trim()
  .regex(/^\d{1,18}(\.\d{1,18})?$/, { error: "Enter an amount, e.g. 25.50." })
  .refine((value) => new Decimal(value).greaterThan(0), {
    error: "Amount must be greater than zero.",
  });

/** A rate the user was shown; empty when no conversion is involved. */
export const quotedRate = z.string().regex(/^(\d+(\.\d+)?)?$/);

export const idempotencyKey = z.uuid();

export function fitsPrecision(currency: string, amount: string): boolean {
  const definition = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
  return (
    !definition || new Decimal(amount).decimalPlaces() <= definition.precision
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
