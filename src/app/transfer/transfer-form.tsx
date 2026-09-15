"use client";

import { useActionState, useState, useTransition } from "react";
import { CurrencySelect } from "@/components/currency-select";
import { Button } from "@/components/ui/button";
import {
  CONVERSION_FEE_RATE,
  formatRate,
  quoteConversion,
  type UsdPrices,
} from "@/lib/conversion";
import { Decimal } from "@/lib/decimal";
import { checkAmountInput, formatAmount } from "@/lib/money";
import type {
  RecipientLookup,
  TransferFormState,
} from "@/lib/validation/transfer";
import { lookupRecipient, sendTransfer } from "./actions";

export type TransferAccount = {
  code: string;
  type: "FIAT" | "CRYPTO";
  precision: number;
  balance: string;
};

type TransferFormProps = {
  accounts: TransferAccount[];
  prices: UsdPrices;
  initialIdempotencyKey: string;
};

const feePercent = new Decimal(CONVERSION_FEE_RATE).times(100).toString();

const LOOKUP_MESSAGES: Record<
  Exclude<RecipientLookup["status"], "found">,
  string
> = {
  not_found: "There is no user with this email.",
  self: "That's you. Use Convert to move money between your accounts.",
  invalid: "Enter a valid email address.",
};

export function TransferForm({
  accounts,
  prices,
  initialIdempotencyKey,
}: TransferFormProps) {
  const [state, formAction, pending] = useActionState<
    TransferFormState,
    FormData
  >(sendTransfer, { status: "idle", idempotencyKey: initialIdempotencyKey });

  const [email, setEmail] = useState("");
  const [recipient, setRecipient] = useState<
    (RecipientLookup & { email: string }) | null
  >(null);
  const [lookingUp, startLookup] = useTransition();
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("USD");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  // Reset the form after a successful transfer.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") {
      setEmail("");
      setRecipient(null);
      setAmount("");
      setNote("");
    }
  }

  const codes = accounts.map((a) => a.code);
  const fromAccount = accounts.find((a) => a.code === from)!;
  const toAccount = accounts.find((a) => a.code === to)!;
  const { valid: amountIsValid, exceedsBalance } = checkAmountInput(
    amount,
    fromAccount.precision,
    fromAccount.balance,
  );

  const isExchange = from !== to;
  const quote =
    isExchange && prices[from] && prices[to]
      ? quoteConversion({
          from,
          to,
          amount: amountIsValid ? amount : "1",
          toPrecision: toAccount.precision,
          prices,
        })
      : null;
  const received = !amountIsValid
    ? null
    : isExchange
      ? quote?.toAmount
      : new Decimal(amount).toFixed(fromAccount.precision);

  // Only a lookup for the email currently in the field counts.
  const currentLookup =
    recipient && recipient.email === email.trim().toLowerCase()
      ? recipient
      : null;

  function checkRecipient() {
    const normalized = email.trim().toLowerCase();
    if (!normalized || currentLookup) return;
    startLookup(async () => {
      const result = await lookupRecipient(normalized);
      setRecipient({ ...result, email: normalized });
    });
  }

  function selectFrom(code: string) {
    // Keep "same currency" as the default: change both together.
    if (from === to) setTo(code);
    setFrom(code);
  }

  const recipientErrors =
    state.errors?.recipientEmail ??
    (currentLookup && currentLookup.status !== "found"
      ? [LOOKUP_MESSAGES[currentLookup.status]]
      : undefined);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5"
    >
      <input type="hidden" name="idempotencyKey" value={state.idempotencyKey} />
      <input type="hidden" name="quotedRate" value={quote?.rate ?? ""} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="recipientEmail" className="text-sm font-medium">
          Recipient
        </label>
        <input
          id="recipientEmail"
          name="recipientEmail"
          type="email"
          autoComplete="off"
          placeholder="friend@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={checkRecipient}
          aria-invalid={Boolean(recipientErrors) || undefined}
          aria-describedby="recipient-status"
          className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground aria-invalid:border-danger"
        />
        <div id="recipient-status" aria-live="polite" className="text-sm">
          {lookingUp ? (
            <span className="text-muted">Checking…</span>
          ) : recipientErrors ? (
            <span className="text-danger">{recipientErrors.join(" ")}</span>
          ) : currentLookup?.status === "found" ? (
            <span className="text-success">
              ✓ {currentLookup.name}
              {currentLookup.name !== currentLookup.email &&
                ` (${currentLookup.email})`}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="amount" className="text-sm font-medium">
            You send
          </label>
          <span className="text-xs text-muted">
            Balance:{" "}
            <button
              type="button"
              className="font-mono underline"
              onClick={() => setAmount(fromAccount.balance)}
              title="Use the whole balance"
            >
              {formatAmount(fromAccount.balance, fromAccount)} {from}
            </button>
          </span>
        </div>
        <div className="flex gap-2">
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value.replace(",", "."))
            }
            aria-invalid={
              Boolean(amount && !amountIsValid) || exceedsBalance || undefined
            }
            className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-lg outline-none focus:border-foreground aria-invalid:border-danger"
          />
          <CurrencySelect
            name="from"
            label="Currency to send"
            value={from}
            codes={codes}
            onChange={selectFrom}
          />
        </div>
        {amount && !amountIsValid && (
          <p className="text-sm text-danger">
            Enter an amount with at most {fromAccount.precision} decimal places.
          </p>
        )}
        {exceedsBalance && (
          <p className="text-sm text-danger">
            The amount exceeds your {from} balance.
          </p>
        )}
        {state.errors?.amount?.map((error) => (
          <p key={error} className="text-sm text-danger">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Recipient gets</span>
        <div className="flex gap-2">
          <output
            htmlFor="amount from to"
            aria-live="polite"
            className="flex h-11 min-w-0 flex-1 items-center overflow-x-auto rounded-md border border-border bg-background px-3 font-mono text-lg whitespace-nowrap"
          >
            {received ? (
              formatAmount(received, toAccount)
            ) : (
              <span className="text-muted">0.00</span>
            )}
          </output>
          <CurrencySelect
            name="to"
            label="Currency the recipient gets"
            value={to}
            codes={codes}
            onChange={setTo}
          />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {quote ? (
            <>
              <dt className="text-muted">Rate</dt>
              <dd className="text-right font-mono">
                1 {from} = {formatRate(quote.rate)} {to}
              </dd>
              <dt className="text-muted">Fee</dt>
              <dd className="text-right">
                {feePercent}% (included in the rate)
              </dd>
            </>
          ) : (
            <>
              <dt className="text-muted">Fee</dt>
              <dd className="text-right">No fee in the same currency</dd>
            </>
          )}
        </dl>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="note" className="text-sm font-medium">
          Note <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="note"
          name="note"
          maxLength={140}
          placeholder="What's it for?"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
        />
        {state.errors?.note?.map((error) => (
          <p key={error} className="text-sm text-danger">
            {error}
          </p>
        ))}
      </div>

      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`text-sm ${state.status === "error" ? "text-danger" : "text-success"}`}
        >
          {state.message}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={
          pending ||
          !email.trim() ||
          (currentLookup !== null && currentLookup.status !== "found") ||
          !amountIsValid ||
          exceedsBalance ||
          (isExchange && !quote)
        }
      >
        {pending
          ? "Sending…"
          : amountIsValid
            ? `Send ${formatAmount(new Decimal(amount).toFixed(fromAccount.precision), fromAccount)} ${from}`
            : "Send"}
      </Button>
    </form>
  );
}
