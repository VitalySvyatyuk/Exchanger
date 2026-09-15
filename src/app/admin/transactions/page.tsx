import type { Metadata, Route } from "next";
import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { TransactionType } from "@/generated/prisma/enums";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { formatDateTime } from "@/lib/format";
import { isUuid, param } from "@/lib/search-params";
import { TRANSACTION_TYPE_LABELS } from "@/lib/transaction-types";
import {
  findUserIdByEmail,
  listTransactions,
} from "@/server/admin/transactions";
import {
  Badge,
  EmptyRow,
  FilterField,
  inputClass,
  Pager,
  SignedAmount,
  Table,
  td,
  th,
} from "../ui";

export const metadata: Metadata = { title: "Transactions" };

const TYPES = Object.keys(TRANSACTION_TYPE_LABELS) as TransactionType[];

/** Parses "YYYY-MM-DD" as midnight UTC. */
function parseDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function AdminTransactionsPage({
  searchParams,
}: PageProps<"/admin/transactions">) {
  const params = await searchParams;
  const type = TYPES.find((t) => t === params.type);
  const currencyCode = SUPPORTED_CURRENCIES.find(
    (c) => c.code === params.currency,
  )?.code;
  const userEmail = param(params.user);
  const fromParam = param(params.from);
  const toParam = param(params.to);
  const from = parseDate(fromParam);
  const toDay = parseDate(toParam);
  // The "to" date is inclusive: include the whole day.
  const to = toDay && new Date(toDay.getTime() + 24 * 60 * 60 * 1000);
  const cursor = isUuid(param(params.cursor))
    ? param(params.cursor)
    : undefined;

  const userId = userEmail ? await findUserIdByEmail(userEmail) : undefined;
  const unknownUser = Boolean(userEmail && !userId);

  const { transactions, nextCursor } = unknownUser
    ? { transactions: [], nextCursor: null }
    : await listTransactions({ type, userId, currencyCode, from, to, cursor });

  const hasFilters = type || currencyCode || userEmail || from || to;

  return (
    <div className="flex flex-col gap-4">
      <Form
        action="/admin/transactions"
        className="flex flex-wrap items-end gap-2"
      >
        <FilterField label="Type">
          <select name="type" defaultValue={type ?? ""} className={inputClass}>
            <option value="">Any</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TRANSACTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="User email">
          <input
            name="user"
            type="search"
            defaultValue={userEmail}
            placeholder="user@example.com"
            className={`${inputClass} w-56 max-w-full`}
          />
        </FilterField>
        <FilterField label="Currency">
          <select
            name="currency"
            defaultValue={currencyCode ?? ""}
            className={`${inputClass} font-mono`}
          >
            <option value="">Any</option>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="From (UTC)">
          <input
            name="from"
            type="date"
            defaultValue={from ? fromParam : undefined}
            className={inputClass}
          />
        </FilterField>
        <FilterField label="To (UTC)">
          <input
            name="to"
            type="date"
            defaultValue={toDay ? toParam : undefined}
            className={inputClass}
          />
        </FilterField>
        <Button type="submit" variant="secondary" size="sm">
          Filter
        </Button>
        {hasFilters && (
          <Link href="/admin/transactions" className="px-2 text-sm underline">
            Clear
          </Link>
        )}
      </Form>

      {unknownUser && (
        <p role="status" className="text-sm text-danger">
          There is no user with the email “{userEmail}”.
        </p>
      )}

      <Table>
        <thead>
          <tr>
            <th className={th}>Date (UTC)</th>
            <th className={th}>Operation</th>
            <th className={th}>Ledger entries</th>
          </tr>
        </thead>
        <tbody>
          {transactions.length === 0 && (
            <EmptyRow colSpan={3}>No transactions found.</EmptyRow>
          )}
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td className={`${td} whitespace-nowrap text-muted`}>
                {formatDateTime(transaction.createdAt)}
              </td>
              <td className={`${td} min-w-56`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="strong">
                    {TRANSACTION_TYPE_LABELS[transaction.type]}
                  </Badge>
                  {transaction.initiatedBy && (
                    <Link
                      href={
                        `/admin/users/${transaction.initiatedBy.id}` as Route
                      }
                      className="text-muted underline"
                    >
                      {transaction.initiatedBy.email}
                    </Link>
                  )}
                </div>
                {transaction.description && (
                  <div className="mt-1">{transaction.description}</div>
                )}
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer text-muted">
                    Details
                  </summary>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    <dt className="text-muted">Id</dt>
                    <dd className="font-mono break-all">{transaction.id}</dd>
                    {transaction.idempotencyKey && (
                      <>
                        <dt className="text-muted">Idempotency key</dt>
                        <dd className="font-mono break-all">
                          {transaction.idempotencyKey}
                        </dd>
                      </>
                    )}
                  </dl>
                  {transaction.metadata && (
                    <pre className="mt-1 max-w-md overflow-x-auto rounded bg-card p-2">
                      {JSON.stringify(transaction.metadata, null, 2)}
                    </pre>
                  )}
                </details>
              </td>
              <td className={td}>
                <ul className="flex flex-col gap-0.5">
                  {transaction.entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-4"
                    >
                      <span className="text-muted">
                        {entry.owner ? (
                          <Link
                            href={`/admin/users/${entry.owner.id}` as Route}
                            className="underline"
                          >
                            {entry.owner.email}
                          </Link>
                        ) : (
                          entry.accountType.toLowerCase()
                        )}
                      </span>
                      <SignedAmount
                        amount={entry.amount}
                        currency={entry.currency}
                      />
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Pager
        path="/admin/transactions"
        params={params}
        nextCursor={nextCursor}
      />
    </div>
  );
}
