"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { formatAmount } from "@/lib/money";
import { convertSchema, type ConvertFormState } from "@/lib/validation/convert";
import { requireUser } from "@/server/auth";
import { ConversionError, convertCurrency } from "@/server/conversion";
import { RatesUnavailableError } from "@/server/rates/rates";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function formatMoney(amount: string, code: string): string {
  const currency = SUPPORTED_CURRENCIES.find((c) => c.code === code)!;
  return `${formatAmount(amount, currency)} ${code}`;
}

export async function convert(
  previousState: ConvertFormState,
  formData: FormData,
): Promise<ConvertFormState> {
  const user = await requireUser();

  const parsed = convertSchema.safeParse({
    from: field(formData, "from"),
    to: field(formData, "to"),
    amount: field(formData, "amount"),
    quotedRate: field(formData, "quotedRate"),
    idempotencyKey: field(formData, "idempotencyKey"),
  });

  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      status: "error",
      errors: {
        from: fieldErrors.from,
        to: fieldErrors.to,
        amount: fieldErrors.amount,
      },
      message:
        fieldErrors.from || fieldErrors.to || fieldErrors.amount
          ? undefined
          : "Invalid request. Please reload the page and try again.",
      idempotencyKey: previousState.idempotencyKey,
    };
  }

  try {
    const result = await convertCurrency(user.id, parsed.data);
    // Re-render the page with the new balances.
    refresh();
    return {
      status: "success",
      message: `Converted ${formatMoney(result.fromAmount, result.from)} to ${formatMoney(result.toAmount, result.to)}.`,
      // A new key for the next conversion; retries of this one reuse the old key.
      idempotencyKey: randomUUID(),
    };
  } catch (error) {
    if (
      error instanceof ConversionError ||
      error instanceof RatesUnavailableError
    ) {
      if (error instanceof ConversionError && error.code === "RATE_CHANGED") {
        // Show the user the current rates.
        refresh();
      }
      // Nothing was executed, so the same key stays valid.
      return {
        status: "error",
        message: error.message,
        idempotencyKey: previousState.idempotencyKey,
      };
    }

    console.error("Conversion failed:", error);
    return {
      status: "error",
      message: "Something went wrong. Please try again.",
      idempotencyKey: previousState.idempotencyKey,
    };
  }
}
