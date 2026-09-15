import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { after } from "next/server";
import { getUserBalances } from "@/server/accounts";
import { requireUser } from "@/server/auth";
import {
  getLatestRates,
  refreshRates,
  toUsdPrices,
} from "@/server/rates/rates";
import { TransferForm } from "./transfer-form";

export const metadata: Metadata = { title: "Send money" };

export default async function TransferPage() {
  const user = await requireUser();
  const [balances, rates] = await Promise.all([
    getUserBalances(user.id),
    getLatestRates(),
  ]);

  after(() => refreshRates());

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Send money</h1>
        <p className="text-muted">
          Send money to another user by email. They can receive it in a
          different currency.
        </p>
      </div>
      <TransferForm
        accounts={balances.map(({ balance, currency }) => ({
          code: currency.code,
          type: currency.type,
          precision: currency.precision,
          balance,
        }))}
        prices={toUsdPrices(rates)}
        initialIdempotencyKey={randomUUID()}
      />
    </div>
  );
}
