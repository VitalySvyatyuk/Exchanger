import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { History } from "@/components/history";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { formatDateTime } from "@/lib/format";
import { formatAmount } from "@/lib/money";
import { isUuid, param } from "@/lib/search-params";
import { getUserBalances } from "@/server/accounts";
import { getUserDetail } from "@/server/admin/users";
import { getHistory } from "@/server/history";
import { listUserOpenLots } from "@/server/lots";
import { Badge, EmptyRow, Table, td, th } from "../../ui";

export const metadata: Metadata = { title: "User" };

export default async function AdminUserPage({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  // getUserDetail checks admin access before anything else is loaded.
  const user = await getUserDetail(id);
  if (!user) notFound();

  const query = await searchParams;
  const currency = SUPPORTED_CURRENCIES.some((c) => c.code === query.currency)
    ? param(query.currency)
    : undefined;
  const cursorParam = param(query.cursor);
  const cursor =
    cursorParam && /^\d{1,19}$/.test(cursorParam)
      ? BigInt(cursorParam)
      : undefined;

  const [balances, lots, history] = await Promise.all([
    getUserBalances(user.id),
    listUserOpenLots(user.id),
    getHistory(user.id, { currencyCode: currency, cursor }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <Link href="/admin/users" className="text-sm text-muted underline">
          ← All users
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold">{user.name ?? user.email}</h2>
          <Badge tone={user.role === "ADMIN" ? "strong" : "muted"}>
            {user.role}
          </Badge>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Email</dt>
          <dd>{user.email}</dd>
          <dt className="text-muted">User id</dt>
          <dd className="font-mono break-all">{user.id}</dd>
          <dt className="text-muted">Joined</dt>
          <dd>{formatDateTime(user.createdAt)} UTC</dd>
          <dt className="text-muted">Activity</dt>
          <dd>
            {user._count.transactions} transactions initiated ·{" "}
            {user._count.lotsSold} lots posted · {user._count.lotsBought} lots
            bought
          </dd>
        </dl>
        <Link
          href={
            `/admin/transactions?user=${encodeURIComponent(user.email)}` as Route
          }
          className="text-sm underline"
        >
          View in transaction log →
        </Link>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Balances</h3>
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {balances.map(({ id: accountId, balance, currency: c }) => (
            <li
              key={accountId}
              className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3"
            >
              <span className="text-xs text-muted">{c.code}</span>
              <span className="font-mono tabular-nums">
                {formatAmount(balance, c)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Open lots</h3>
        <Table>
          <thead>
            <tr>
              <th className={th}>Lot</th>
              <th className={th}>Sells</th>
              <th className={th}>For</th>
              <th className={th}>Posted (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {lots.length === 0 && (
              <EmptyRow colSpan={4}>No open lots.</EmptyRow>
            )}
            {lots.map((lot) => (
              <tr key={lot.id}>
                <td className={`${td} font-mono`}>{lot.number}</td>
                <td className={`${td} font-mono`}>
                  {lot.sellAmount} {lot.sellCurrency}
                </td>
                <td className={`${td} font-mono`}>
                  {lot.buyAmount} {lot.buyCurrency}
                </td>
                <td className={`${td} text-muted`}>
                  {formatDateTime(lot.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Active sessions</h3>
        <Table>
          <thead>
            <tr>
              <th className={th}>Signed in (UTC)</th>
              <th className={th}>Expires (UTC)</th>
              <th className={th}>User agent</th>
            </tr>
          </thead>
          <tbody>
            {user.sessions.length === 0 && (
              <EmptyRow colSpan={3}>No active sessions.</EmptyRow>
            )}
            {user.sessions.map((session) => (
              <tr key={session.id}>
                <td className={`${td} whitespace-nowrap`}>
                  {formatDateTime(session.createdAt)}
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {formatDateTime(session.expiresAt)}
                </td>
                <td className={`${td} text-muted`}>
                  {session.userAgent ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <History
        page={history}
        currency={currency}
        isFirstPage={cursor === undefined}
        basePath={`/admin/users/${user.id}`}
      />
    </div>
  );
}
