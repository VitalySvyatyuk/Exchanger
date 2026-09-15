import type { Metadata } from "next";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { formatAmount } from "@/lib/money";
import { getUserBalances } from "@/server/accounts";
import { requireUser } from "@/server/auth";
import { getHistory } from "@/server/history";
import { History } from "./history";
import { PaymentDialog } from "./payment-dialog";

export const metadata: Metadata = { title: "Profile" };

function parseCurrency(value: unknown): string | undefined {
  return SUPPORTED_CURRENCIES.some((c) => c.code === value)
    ? (value as string)
    : undefined;
}

function parseCursor(value: unknown): bigint | undefined {
  return typeof value === "string" && /^\d{1,19}$/.test(value)
    ? BigInt(value)
    : undefined;
}

export default async function ProfilePage({
  searchParams,
}: PageProps<"/profile">) {
  const user = await requireUser();
  const params = await searchParams;
  const currency = parseCurrency(params.currency);
  const cursor = parseCursor(params.cursor);

  const [balances, history] = await Promise.all([
    getUserBalances(user.id),
    getHistory(user.id, { currencyCode: currency, cursor }),
  ]);

  const currencyOptions = balances.map(({ currency }) => ({
    code: currency.code,
    name: currency.name,
  }));

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Hello, {user.name ?? user.email}
          </h1>
          <p className="text-muted">{user.email}</p>
        </div>
        <div className="flex gap-2">
          <PaymentDialog kind="deposit" currencies={currencyOptions} />
          <PaymentDialog kind="withdraw" currencies={currencyOptions} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Balances</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {balances.map(({ id, balance, currency }) => (
            <li
              key={id}
              className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4"
            >
              <span className="text-sm text-muted">
                {currency.name} · {currency.code}
              </span>
              <span className="font-mono text-2xl font-medium tabular-nums">
                {currency.symbol} {formatAmount(balance, currency)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <History
        page={history}
        currency={currency}
        isFirstPage={cursor === undefined}
      />
    </div>
  );
}
