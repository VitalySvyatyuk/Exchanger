import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { after } from "next/server";
import { RatesTable } from "@/components/rates-table";
import { getUserBalances } from "@/server/accounts";
import { requireUser } from "@/server/auth";
import {
  getLatestRates,
  refreshRates,
  toUsdPrices,
} from "@/server/rates/rates";
import { ConvertForm } from "./convert-form";

export const metadata: Metadata = { title: "Convert" };

export default async function ConvertPage() {
  const user = await requireUser();
  const [balances, rates] = await Promise.all([
    getUserBalances(user.id),
    getLatestRates(),
  ]);

  // Serve cached rates now; refresh stale ones after the response is sent.
  after(() => refreshRates());

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Convert</h1>
          <p className="text-muted">
            Exchange money between your own accounts at the current rate.
          </p>
        </div>
        <ConvertForm
          accounts={balances.map(({ balance, currency }) => ({
            code: currency.code,
            name: currency.name,
            type: currency.type,
            precision: currency.precision,
            balance,
          }))}
          prices={toUsdPrices(rates)}
          staleCurrencies={[...rates.values()]
            .filter((rate) => rate.stale)
            .map((rate) => rate.currencyCode)}
          initialIdempotencyKey={randomUUID()}
        />
      </section>

      <section className="flex min-w-0 flex-col gap-4">
        <h2 className="text-xl font-semibold">Exchange rates</h2>
        <RatesTable rates={rates} />
      </section>
    </div>
  );
}
