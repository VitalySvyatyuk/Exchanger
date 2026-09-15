import type { Metadata } from "next";
import { formatAmount } from "@/lib/money";
import { getUserBalances } from "@/server/accounts";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const balances = await getUserBalances(user.id);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          Hello, {user.name ?? user.email}
        </h1>
        <p className="text-muted">{user.email}</p>
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
    </div>
  );
}
