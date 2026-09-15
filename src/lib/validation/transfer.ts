import { z } from "zod";
import {
  currencyCode,
  fitsPrecision,
  idempotencyKey,
  positiveAmount,
  PRECISION_ERROR,
  quotedRate,
  type MoneyFormState,
} from "@/lib/validation/money";

export const recipientEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(255)
  .pipe(z.email({ error: "Enter the recipient's email address." }));

export const transferSchema = z
  .object({
    recipientEmail,
    from: currencyCode,
    to: currencyCode,
    amount: positiveAmount,
    note: z
      .string()
      .trim()
      .max(140, { error: "The note must be at most 140 characters long." })
      .transform((value) => value || undefined),
    quotedRate,
    idempotencyKey,
  })
  .refine((data) => fitsPrecision(data.from, data.amount), {
    error: PRECISION_ERROR,
    path: ["amount"],
  })
  .refine((data) => data.from === data.to || data.quotedRate !== "", {
    error: "Missing exchange rate. Please reload the page.",
    path: ["to"],
  });

export type TransferInput = z.infer<typeof transferSchema>;

export type TransferFormState = MoneyFormState<
  "recipientEmail" | "from" | "to" | "amount" | "note"
>;

export type RecipientLookup =
  | { status: "found"; name: string; email: string }
  | { status: "not_found" | "self" | "invalid" };
