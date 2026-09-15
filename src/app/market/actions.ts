"use server";

import { randomUUID } from "node:crypto";
import type { Route } from "next";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { lotNumber } from "@/lib/lots";
import {
  createLotSchema,
  lotIdSchema,
  type CreateLotFormState,
  type LotActionState,
} from "@/lib/validation/lot";
import { requireUser } from "@/server/auth";
import { OperationError } from "@/server/errors";
import { buyLot, cancelLot, createLot } from "@/server/lots";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createLotAction(
  previousState: CreateLotFormState,
  formData: FormData,
): Promise<CreateLotFormState> {
  const user = await requireUser();

  const parsed = createLotSchema.safeParse({
    sellCurrency: field(formData, "sellCurrency"),
    sellAmount: field(formData, "sellAmount"),
    buyCurrency: field(formData, "buyCurrency"),
    buyAmount: field(formData, "buyAmount"),
    idempotencyKey: field(formData, "idempotencyKey"),
  });

  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    const errors = {
      sellCurrency: fieldErrors.sellCurrency,
      sellAmount: fieldErrors.sellAmount,
      buyCurrency: fieldErrors.buyCurrency,
      buyAmount: fieldErrors.buyAmount,
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
    const { lotId } = await createLot(user.id, parsed.data);
    refresh();
    return {
      status: "success",
      message: `Lot ${lotNumber(lotId)} posted. ${parsed.data.sellAmount} ${parsed.data.sellCurrency} is held in escrow until the lot is sold or cancelled.`,
      idempotencyKey: randomUUID(),
    };
  } catch (error) {
    if (error instanceof OperationError) {
      return {
        status: "error",
        message: error.message,
        idempotencyKey: previousState.idempotencyKey,
      };
    }
    console.error("Creating a lot failed:", error);
    return {
      status: "error",
      message: "Something went wrong. Please try again.",
      idempotencyKey: previousState.idempotencyKey,
    };
  }
}

type LotOperation = typeof buyLot;

/**
 * Runs a buy or cancel and redirects to the marketplace with the outcome,
 * since the lot disappears from the list either way.
 */
async function runLotOperation(
  operation: LotOperation,
  outcome: "bought" | "cancelled",
  formData: FormData,
): Promise<LotActionState> {
  const user = await requireUser();
  const lotId = lotIdSchema.safeParse(field(formData, "lotId"));
  if (!lotId.success) return { status: "error", message: "Invalid lot." };

  let destination: string;
  try {
    await operation(user.id, lotId.data);
    destination = `/market?${outcome}=${lotId.data}`;
  } catch (error) {
    if (
      error instanceof OperationError &&
      (error.code === "LOT_NOT_AVAILABLE" || error.code === "LOT_NOT_FOUND")
    ) {
      destination = "/market?unavailable=1";
    } else if (error instanceof OperationError) {
      return { status: "error", message: error.message };
    } else {
      console.error(`Lot operation failed (${outcome}):`, error);
      return {
        status: "error",
        message: "Something went wrong. Please try again.",
      };
    }
  }
  // Outside try/catch: redirect() works by throwing.
  redirect(destination as Route);
}

export async function buyLotAction(
  _previousState: LotActionState,
  formData: FormData,
): Promise<LotActionState> {
  return runLotOperation(buyLot, "bought", formData);
}

export async function cancelLotAction(
  _previousState: LotActionState,
  formData: FormData,
): Promise<LotActionState> {
  return runLotOperation(cancelLot, "cancelled", formData);
}
