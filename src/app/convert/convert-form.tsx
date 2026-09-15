"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CONVERSION_FEE_RATE,
  formatRate,
  quoteConversion,
  type UsdPrices,
} from "@/lib/conversion";
import { Decimal } from "@/lib/decimal";
import { formatAmount } from "@/lib/money";
import type { ConvertFormState } from "@/lib/validation/convert";
import { convert } from "./actions";

export type ConvertAccount = {
  code: string;
  name: string;
  type: "FIAT" | "CRYPTO";
  precision: number;
  balance: string;
};

type ConvertFormProps = {
  accounts: ConvertAccount[];
  prices: UsdPrices;
  staleCurrencies: string[];
  initialIdempotencyKey: string;
};

const AMOUNT_PATTERN = /^\d{1,18}(\.\d{0,18})?$/;
const feePercent = new Decimal(CONVERSION_FEE_RATE).times(100).toString();

export function ConvertForm({
  accounts,
  prices,
  staleCurrencies,
  initialIdempotencyKey,
}: ConvertFormProps) {
  const [state, formAction, pending] = useActionState<
    ConvertFormState,
    FormData
  >(convert, { status: "idle", idempotencyKey: initialIdempotencyKey });

  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("EUR");
  const [amount, setAmount] = useState("");

  // Clear the amount after a successful conversion. Adjusting state while
  // rendering (instead of in an effect) avoids a flash of the old value.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setAmount("");
  }

  const fromAccount = accounts.find((a) => a.code === from)!;
  const toAccount = accounts.find((a) => a.code === to)!;

  const amountIsValid =
    AMOUNT_PATTERN.test(amount) &&
    new Decimal(amount).greaterThan(0) &&
    new Decimal(amount).decimalPlaces() <= fromAccount.precision;
  const exceedsBalance =
    amountIsValid && new Decimal(amount).greaterThan(fromAccount.balance);

  const quote =
    from !== to && prices[from] && prices[to]
      ? quoteConversion({
          from,
          to,
          amount: amountIsValid ? amount : "1",
          toPrecision: toAccount.precision,
          prices,
        })
      : null;

  const stale = [from, to].filter((code) => staleCurrencies.includes(code));

  function selectFrom(code: string) {
    if (code === to) setTo(from);
    setFrom(code);
  }

  function selectTo(code: string) {
    if (code === from) setFrom(to);
    setTo(code);
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5"
    >
      <input type="hidden" name="idempotencyKey" value={state.idempotencyKey} />
      <input type="hidden" name="quotedRate" value={quote?.rate ?? ""} />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="amount" className="text-sm font-medium">
            You pay
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
            label="Currency to pay"
            value={from}
            accounts={accounts}
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

      <div className="flex justify-center">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
          aria-label="Swap currencies"
          title="Swap currencies"
        >
          ⇅
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">You receive</span>
        <div className="flex gap-2">
          <output
            htmlFor="amount from to"
            aria-live="polite"
            className="flex h-11 min-w-0 flex-1 items-center overflow-x-auto rounded-md border border-border bg-background px-3 font-mono text-lg whitespace-nowrap"
          >
            {quote && amountIsValid ? (
              formatAmount(quote.toAmount, toAccount)
            ) : (
              <span className="text-muted">0.00</span>
            )}
          </output>
          <CurrencySelect
            name="to"
            label="Currency to receive"
            value={to}
            accounts={accounts}
            onChange={selectTo}
          />
        </div>
      </div>

      {quote && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Rate</dt>
          <dd className="text-right font-mono">
            1 {from} = {formatRate(quote.rate)} {to}
          </dd>
          <dt className="text-muted">Fee</dt>
          <dd className="text-right">{feePercent}% (included in the rate)</dd>
        </dl>
      )}

      {stale.length > 0 && (
        <p role="status" className="text-sm text-muted">
          Rates for {stale.join(", ")} are outdated. They will be refreshed when
          you convert.
        </p>
      )}

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
        disabled={pending || !quote || !amountIsValid || exceedsBalance}
        size="lg"
      >
        {pending ? "Converting…" : `Convert ${from} to ${to}`}
      </Button>
    </form>
  );
}

function CurrencySelect({
  name,
  label,
  value,
  accounts,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  accounts: ConvertAccount[];
  onChange: (code: string) => void;
}) {
  return (
    <select
      id={name}
      name={name}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 rounded-md border border-border bg-background px-3 font-mono text-sm"
    >
      {accounts.map((account) => (
        <option key={account.code} value={account.code}>
          {account.code}
        </option>
      ))}
    </select>
  );
}
