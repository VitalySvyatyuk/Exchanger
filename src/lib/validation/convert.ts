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

export const convertSchema = z
  .object({
    from: currencyCode,
    to: currencyCode,
    amount: positiveAmount,
    quotedRate: quotedRate.min(1),
    idempotencyKey,
  })
  .refine((data) => data.from !== data.to, {
    error: "Choose two different currencies.",
    path: ["to"],
  })
  .refine((data) => fitsPrecision(data.from, data.amount), {
    error: PRECISION_ERROR,
    path: ["amount"],
  });

export type ConvertInput = z.infer<typeof convertSchema>;

export type ConvertFormState = MoneyFormState<"from" | "to" | "amount">;
