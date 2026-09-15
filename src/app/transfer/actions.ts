"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { formatAmount } from "@/lib/money";
import {
  recipientEmail,
  transferSchema,
  type RecipientLookup,
  type TransferFormState,
} from "@/lib/validation/transfer";
import { requireUser } from "@/server/auth";
import { OperationError } from "@/server/errors";
import { RatesUnavailableError } from "@/server/rates/rates";
import { findRecipient, transferMoney } from "@/server/transfers";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function formatMoney(amount: string, code: string): string {
  const currency = SUPPORTED_CURRENCIES.find((c) => c.code === code)!;
  return `${formatAmount(amount, currency)} ${code}`;
}

/** Shows who the money will go to before it's sent. */
export async function lookupRecipient(email: string): Promise<RecipientLookup> {
  const user = await requireUser();
  const parsed = recipientEmail.safeParse(email);
  if (!parsed.success) return { status: "invalid" };

  const recipient = await findRecipient(parsed.data);
  if (!recipient) return { status: "not_found" };
  if (recipient.id === user.id) return { status: "self" };

  return {
    status: "found",
    name: recipient.name ?? recipient.email,
    email: recipient.email,
  };
}

export async function sendTransfer(
  previousState: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
  const user = await requireUser();

  const parsed = transferSchema.safeParse({
    recipientEmail: field(formData, "recipientEmail"),
    from: field(formData, "from"),
    to: field(formData, "to"),
    amount: field(formData, "amount"),
    note: field(formData, "note"),
    quotedRate: field(formData, "quotedRate"),
    idempotencyKey: field(formData, "idempotencyKey"),
  });

  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    const errors = {
      recipientEmail: fieldErrors.recipientEmail,
      from: fieldErrors.from,
      to: fieldErrors.to,
      amount: fieldErrors.amount,
      note: fieldErrors.note,
    };
    return {
      status: "error",
      errors,
      message: Object.values(errors).some(Boolean)
        ? undefined
        : "Invalid request. Please reload the page and try again.",
      idempotencyKey: previousState.idempotencyKey,
    };
  }

  try {
    const result = await transferMoney(user.id, parsed.data);
    refresh();

    const received =
      result.from === result.to
        ? ""
        : ` They receive ${formatMoney(result.toAmount, result.to)}.`;
    return {
      status: "success",
      message: `Sent ${formatMoney(result.fromAmount, result.from)} to ${result.recipientName}.${received}`,
      idempotencyKey: randomUUID(),
    };
  } catch (error) {
    if (
      error instanceof OperationError ||
      error instanceof RatesUnavailableError
    ) {
      if (error instanceof OperationError && error.code === "RATE_CHANGED") {
        refresh();
      }
      const onRecipient =
        error instanceof OperationError &&
        (error.code === "RECIPIENT_NOT_FOUND" ||
          error.code === "SELF_TRANSFER");
      return {
        status: "error",
        errors: onRecipient ? { recipientEmail: [error.message] } : undefined,
        message: onRecipient ? undefined : error.message,
        idempotencyKey: previousState.idempotencyKey,
      };
    }

    console.error("Transfer failed:", error);
    return {
      status: "error",
      message: "Something went wrong. Please try again.",
      idempotencyKey: previousState.idempotencyKey,
    };
  }
}
