"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, buttonClassName } from "@/components/ui/button";
import type { LotActionState } from "@/lib/validation/lot";
import { buyLotAction, cancelLotAction } from "./actions";

type LotActionsProps = {
  lotId: string;
  /** "buy" for other users' lots, "cancel" for your own, "login" for guests. */
  mode: "buy" | "cancel" | "login";
  /** e.g. "Pay 25.00 EUR, get 30.00 USD". */
  summary: string;
  /** Why the viewer can't buy, e.g. "Not enough EUR". */
  disabledReason?: string;
};

const idle: LotActionState = { status: "idle" };

/** Buy or cancel with a confirmation step, so a stray click does nothing. */
export function LotActions({
  lotId,
  mode,
  summary,
  disabledReason,
}: LotActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(
    mode === "cancel" ? cancelLotAction : buyLotAction,
    idle,
  );

  if (mode === "login") {
    return (
      <Link
        href="/login?next=/market"
        className={buttonClassName("secondary", "sm")}
      >
        Log in to buy
      </Link>
    );
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          size="sm"
          variant={mode === "buy" ? "primary" : "secondary"}
          disabled={Boolean(disabledReason)}
          onClick={() => setConfirming(true)}
        >
          {mode === "buy" ? "Buy" : "Cancel lot"}
        </Button>
        {disabledReason && (
          <span className="text-xs text-muted">{disabledReason}</span>
        )}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col items-stretch gap-2 sm:items-end"
    >
      <input type="hidden" name="lotId" value={lotId} />
      <span className="text-sm">
        {mode === "buy" ? summary : "Cancel this lot and return the funds?"}
      </span>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Back
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending
            ? "Working…"
            : mode === "buy"
              ? "Confirm purchase"
              : "Confirm cancel"}
        </Button>
      </div>
      {state.status === "error" && (
        <span role="alert" className="text-sm text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}
