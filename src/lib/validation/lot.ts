import { z } from "zod";
import {
  currencyCode,
  fitsPrecision,
  idempotencyKey,
  positiveAmount,
  PRECISION_ERROR,
  type MoneyFormState,
} from "@/lib/validation/money";

export const createLotSchema = z
  .object({
    sellCurrency: currencyCode,
    sellAmount: positiveAmount,
    buyCurrency: currencyCode,
    buyAmount: positiveAmount,
    idempotencyKey,
  })
  .refine((data) => data.sellCurrency !== data.buyCurrency, {
    error: "Choose two different currencies.",
    path: ["buyCurrency"],
  })
  .refine((data) => fitsPrecision(data.sellCurrency, data.sellAmount), {
    error: PRECISION_ERROR,
    path: ["sellAmount"],
  })
  .refine((data) => fitsPrecision(data.buyCurrency, data.buyAmount), {
    error: PRECISION_ERROR,
    path: ["buyAmount"],
  });

export type CreateLotInput = z.infer<typeof createLotSchema>;

export type CreateLotFormState = MoneyFormState<
  "sellCurrency" | "sellAmount" | "buyCurrency" | "buyAmount"
>;

export const lotIdSchema = z.uuid();

export type LotActionState = { status: "idle" | "error"; message?: string };
