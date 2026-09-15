import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { Decimal } from "@/lib/decimal";

const codes = SUPPORTED_CURRENCIES.map((c) => c.code) as [string, ...string[]];

const decimalString = /^\d{1,18}(\.\d{1,18})?$/;

export const convertSchema = z
  .object({
    from: z.enum(codes, { error: "Choose a currency to convert from." }),
    to: z.enum(codes, { error: "Choose a currency to convert to." }),
    amount: z
      .string()
      .trim()
      .regex(decimalString, { error: "Enter an amount, e.g. 25.50." })
      .refine((value) => new Decimal(value).greaterThan(0), {
        error: "Amount must be greater than zero.",
      }),
    quotedRate: z.string().regex(/^\d+(\.\d+)?$/),
    idempotencyKey: z.uuid(),
  })
  .refine((data) => data.from !== data.to, {
    error: "Choose two different currencies.",
    path: ["to"],
  })
  .refine(
    (data) => {
      const currency = SUPPORTED_CURRENCIES.find((c) => c.code === data.from);
      return (
        !currency ||
        new Decimal(data.amount).decimalPlaces() <= currency.precision
      );
    },
    {
      error: "Too many decimal places for this currency.",
      path: ["amount"],
    },
  );

export type ConvertInput = z.infer<typeof convertSchema>;

export type ConvertFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: Partial<Record<"from" | "to" | "amount", string[]>>;
  /** Fresh key for the next submission. */
  idempotencyKey: string;
};
