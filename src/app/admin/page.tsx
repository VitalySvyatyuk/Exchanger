import type { Metadata } from "next";
import { after } from "next/server";
import { RatesTable } from "@/components/rates-table";
import { formatAmount } from "@/lib/money";
import { TRANSACTION_TYPE_LABELS } from "@/lib/transaction-types";
import { getOverview } from "@/server/admin/overview";
import { getLatestRates, refreshRates } from "@/server/rates/rates";
import { Badge, Table, td, th } from "./ui";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  const [overview, rates] = await Promise.all([
    getOverview(),
    getLatestRates(),
  ]);
  after(() => refreshRates());

  const stats = [
    {
      label: "Users",
      value: overview.users,
      hint: `+${overview.newUsers} in 24 h`,
    },
    { label: "Active sessions", value: overview.activeSessions },
    { label: "Open lots", value: overview.openLots },
    {
      label: "Transactions (24 h)",
      value: Object.values(overview.transactionsLastDay).reduce(
        (sum, count) => sum + (count ?? 0),
        0,
      ),
    },
  ];
  const reconciled =
    overview.accountMismatches.length === 0 &&
    overview.escrowMismatches.length === 0 &&
    overview.totals.every((row) => Number(row.total) === 0);

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4"
          >
            <span className="text-sm text-muted">{stat.label}</span>
            <span className="text-2xl font-semibold tabular-nums">
              {stat.value}
            </span>
            {stat.hint && (
              <span className="text-xs text-muted">{stat.hint}</span>
            )}
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="reconciliation">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="reconciliation" className="text-xl font-semibold">
            Reconciliation
          </h2>
          {reconciled ? (
            <Badge tone="success">All checks passed</Badge>
          ) : (
            <Badge tone="danger">Mismatches found</Badge>
          )}
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            {overview.accountMismatches.length === 0 ? "✓" : "✗"} Every account
            balance equals the sum of its ledger entries
            {overview.accountMismatches.length > 0 &&
              ` (${overview.accountMismatches.length} mismatched)`}
          </li>
          <li>
            {overview.escrowMismatches.length === 0 ? "✓" : "✗"} Escrow holds
            exactly the total of open lots in each currency
          </li>
          <li>
            {overview.totals.every((row) => Number(row.total) === 0)
              ? "✓"
              : "✗"}{" "}
            All accounts in each currency sum to zero (double-entry)
          </li>
        </ul>
        {overview.accountMismatches.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th className={th}>Account</th>
                <th className={th}>Type</th>
                <th className={th}>Stored</th>
                <th className={th}>Ledger</th>
              </tr>
            </thead>
            <tbody>
              {overview.accountMismatches.map((row) => (
                <tr key={row.account_id}>
                  <td className={`${td} font-mono`}>{row.account_id}</td>
                  <td className={td}>{row.type}</td>
                  <td className={`${td} font-mono`}>
                    {row.stored_balance} {row.currency_code}
                  </td>
                  <td className={`${td} font-mono`}>
                    {row.ledger_balance} {row.currency_code}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {overview.escrowMismatches.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th className={th}>Currency</th>
                <th className={th}>Escrow balance</th>
                <th className={th}>Open lots total</th>
              </tr>
            </thead>
            <tbody>
              {overview.escrowMismatches.map((row) => (
                <tr key={row.currency_code}>
                  <td className={td}>{row.currency_code}</td>
                  <td className={`${td} font-mono`}>{row.escrow_balance}</td>
                  <td className={`${td} font-mono`}>{row.open_lots_total}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="money-supply">
        <div className="flex flex-col gap-1">
          <h2 id="money-supply" className="text-xl font-semibold">
            Balances by account type
          </h2>
          <p className="text-sm text-muted">
            The treasury&apos;s negative balance is the money the platform has
            issued (bonuses, conversions). Every currency sums to zero.
          </p>
        </div>
        <Table>
          <thead>
            <tr>
              <th className={th}>Currency</th>
              <th className={`${th} text-right`}>Users</th>
              <th className={`${th} text-right`}>Escrow</th>
              <th className={`${th} text-right`}>Treasury</th>
              <th className={`${th} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {overview.totals.map((row) => (
              <tr key={row.code}>
                <td className={`${td} font-mono font-medium`}>{row.code}</td>
                {(["USER", "ESCROW", "TREASURY"] as const).map((type) => (
                  <td
                    key={type}
                    className={`${td} text-right font-mono whitespace-nowrap tabular-nums`}
                  >
                    {formatAmount(row.byType[type], row)}
                  </td>
                ))}
                <td
                  className={`${td} text-right font-mono whitespace-nowrap tabular-nums`}
                >
                  {formatAmount(row.total, row)}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="activity">
        <h2 id="activity" className="text-xl font-semibold">
          Last 24 hours
        </h2>
        <ul className="flex flex-wrap gap-2">
          {Object.entries(TRANSACTION_TYPE_LABELS).map(([type, label]) => (
            <li
              key={type}
              className="rounded-full border border-border px-3 py-1 text-sm"
            >
              {label}:{" "}
              <span className="font-medium tabular-nums">
                {overview.transactionsLastDay[
                  type as keyof typeof TRANSACTION_TYPE_LABELS
                ] ?? 0}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="rates">
        <h2 id="rates" className="text-xl font-semibold">
          Exchange rates
        </h2>
        <RatesTable rates={rates} />
      </section>
    </div>
  );
}
