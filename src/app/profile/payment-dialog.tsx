"use client";

import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";

type PaymentDialogProps = {
  kind: "deposit" | "withdraw";
  currencies: { code: string; name: string }[];
};

const COPY = {
  deposit: {
    button: "Deposit",
    title: "Deposit funds",
    notice:
      "Deposits are not available in this demo: no payment provider (such as Stripe) is connected.",
  },
  withdraw: {
    button: "Withdraw",
    title: "Withdraw funds",
    notice:
      "Withdrawals are not available in this demo: no payment provider (such as Stripe) is connected.",
  },
};

/**
 * Placeholder for deposits and withdrawals. The form is shown so the flow is
 * visible, but it can't be submitted.
 */
export function PaymentDialog({ kind, currencies }: PaymentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  const copy = COPY[kind];

  return (
    <>
      <Button
        type="button"
        variant={kind === "deposit" ? "primary" : "secondary"}
        onClick={() => dialogRef.current?.showModal()}
      >
        {copy.button}
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
      >
        {/* method="dialog" closes the dialog on submit without a request. */}
        <form method="dialog" className="flex flex-col gap-4 p-6">
          <h2 id={`${id}-title`} className="text-lg font-semibold">
            {copy.title}
          </h2>

          <p
            role="note"
            className="rounded-md border border-border bg-card p-3 text-sm text-muted"
          >
            {copy.notice}
          </p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-currency`} className="text-sm font-medium">
              Currency
            </label>
            <select
              id={`${id}-currency`}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} · {currency.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-amount`} className="text-sm font-medium">
              Amount
            </label>
            <input
              id={`${id}-amount`}
              inputMode="decimal"
              placeholder="0.00"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="submit" variant="ghost">
              Close
            </Button>
            <Button
              type="button"
              disabled
              title="Not available: no payment provider"
            >
              Continue
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
