"use client";

import { useActionState, useState } from "react";
import { CurrencySelect } from "@/components/currency-select";
import { Button } from "@/components/ui/button";
import { marketRate, type UsdPrices } from "@/lib/conversion";
import { Decimal } from "@/lib/decimal";
import { buyerAdvantage } from "@/lib/lots";
import { checkAmountInput, formatAmount } from "@/lib/money";
import type { CreateLotFormState } from "@/lib/validation/lot";
import { createLotAction } from "./actions";

export type LotFormAccount = {
  code: string;
  type: "FIAT" | "CRYPTO";
  precision: number;
  balance: string;
};

type CreateLotFormProps = {
  accounts: LotFormAccount[];
  prices: UsdPrices;
  initialIdempotencyKey: string;
};

export function CreateLotForm({
  accounts,
  prices,
  initialIdempotencyKey,
}: CreateLotFormProps) {
  const [state, formAction, pending] = useActionState<
    CreateLotFormState,
    FormData
  >(createLotAction, {
    status: "idle",
    idempotencyKey: initialIdempotencyKey,
  });

  const [sellCurrency, setSellCurrency] = useState("USD");
  const [sellAmount, setSellAmount] = useState("");
  const [buyCurrency, setBuyCurrency] = useState("EUR");
  const [buyAmount, setBuyAmount] = useState("");

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") {
      setSellAmount("");
      setBuyAmount("");
    }
  }

  const codes = accounts.map((a) => a.code);
  const sellAccount = accounts.find((a) => a.code === sellCurrency)!;
  const buyAccount = accounts.find((a) => a.code === buyCurrency)!;
  const sell = checkAmountInput(
    sellAmount,
    sellAccount.precision,
    sellAccount.balance,
  );
  // The asked amount isn't limited by a balance.
  const buy = checkAmountInput(buyAmount, buyAccount.precision, "1e30");

  const sameCurrency = sellCurrency === buyCurrency;
  const hasRates = Boolean(prices[sellCurrency] && prices[buyCurrency]);
  const marketValue =
    sell.valid && !sameCurrency && hasRates
      ? marketRate(sellCurrency, buyCurrency, prices)
          .times(sellAmount)
          .toDecimalPlaces(buyAccount.precision, Decimal.ROUND_HALF_UP)
          .toFixed(buyAccount.precision)
      : null;
  const advantage =
    sell.valid && buy.valid && !sameCurrency
      ? buyerAdvantage(
          { sellCurrency, sellAmount, buyCurrency, buyAmount },
          prices,
        )
      : null;

  function selectSell(code: string) {
    if (code === buyCurrency) setBuyCurrency(sellCurrency);
    setSellCurrency(code);
  }

  function selectBuy(code: string) {
    if (code === sellCurrency) setSellCurrency(buyCurrency);
    setBuyCurrency(code);
  }

  const inputClass =
    "h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-lg outline-none focus:border-foreground aria-invalid:border-danger";

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
    >
      <h2 className="text-lg font-semibold">Post a lot</h2>
      <input type="hidden" name="idempotencyKey" value={state.idempotencyKey} />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="sellAmount" className="text-sm font-medium">
            You sell
          </label>
          <span className="text-xs text-muted">
            Balance:{" "}
            <button
              type="button"
              className="font-mono underline"
              onClick={() => setSellAmount(sellAccount.balance)}
              title="Use the whole balance"
            >
              {formatAmount(sellAccount.balance, sellAccount)} {sellCurrency}
            </button>
          </span>
        </div>
        <div className="flex gap-2">
          <input
            id="sellAmount"
            name="sellAmount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={sellAmount}
            onChange={(e) => setSellAmount(e.target.value.replace(",", "."))}
            aria-invalid={
              Boolean(sellAmount && !sell.valid) ||
              sell.exceedsBalance ||
              undefined
            }
            className={inputClass}
          />
          <CurrencySelect
            name="sellCurrency"
            label="Currency to sell"
            value={sellCurrency}
            codes={codes}
            onChange={selectSell}
          />
        </div>
        {sellAmount && !sell.valid && (
          <p className="text-sm text-danger">
            Enter an amount with at most {sellAccount.precision} decimal places.
          </p>
        )}
        {sell.exceedsBalance && (
          <p className="text-sm text-danger">
            The amount exceeds your {sellCurrency} balance.
          </p>
        )}
        {state.errors?.sellAmount?.map((error) => (
          <p key={error} className="text-sm text-danger">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="buyAmount" className="text-sm font-medium">
          You ask
        </label>
        <div className="flex gap-2">
          <input
            id="buyAmount"
            name="buyAmount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={buyAmount}
            onChange={(e) => setBuyAmount(e.target.value.replace(",", "."))}
            aria-invalid={Boolean(buyAmount && !buy.valid) || undefined}
            className={inputClass}
          />
          <CurrencySelect
            name="buyCurrency"
            label="Currency you ask for"
            value={buyCurrency}
            codes={codes}
            onChange={selectBuy}
          />
        </div>
        {buyAmount && !buy.valid && (
          <p className="text-sm text-danger">
            Enter an amount with at most {buyAccount.precision} decimal places.
          </p>
        )}
        {state.errors?.buyAmount?.map((error) => (
          <p key={error} className="text-sm text-danger">
            {error}
          </p>
        ))}
      </div>

      {marketValue && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">
            Market value:{" "}
            <span className="font-mono text-foreground">
              {formatAmount(marketValue, buyAccount)} {buyCurrency}
            </span>
          </span>
          <button
            type="button"
            className="underline"
            onClick={() => setBuyAmount(marketValue)}
          >
            Use market price
          </button>
        </div>
      )}
      {advantage !== null && (
        <p className="text-sm text-muted">
          {Math.abs(advantage) < 0.0005
            ? "Your price matches the market."
            : advantage > 0
              ? `Your price is ${(advantage * 100).toFixed(1)}% better than market for buyers: it will likely sell quickly.`
              : `Your price is ${(-advantage * 100).toFixed(1)}% above market: buyers may prefer Convert.`}
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
        size="lg"
        disabled={
          pending ||
          !sell.valid ||
          sell.exceedsBalance ||
          !buy.valid ||
          sameCurrency
        }
      >
        {pending ? "Posting…" : "Post lot"}
      </Button>
      <p className="text-xs text-muted">
        The amount you sell is held in escrow until the lot is bought or you
        cancel it.
      </p>
    </form>
  );
}
