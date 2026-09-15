import type { Route } from "next";
import Link from "next/link";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { formatAmount } from "@/lib/money";
import { TRANSACTION_TYPE_LABELS } from "@/lib/transaction-types";
import type { HistoryPage } from "@/server/history";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function historyHref(params: { currency?: string; cursor?: string }): Route {
  const search = new URLSearchParams();
  if (params.currency) search.set("currency", params.currency);
  if (params.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  return `/profile${query ? `?${query}` : ""}#history` as Route;
}

type HistoryProps = {
  page: HistoryPage;
  currency?: string;
  isFirstPage: boolean;
};

export function History({ page, currency, isFirstPage }: HistoryProps) {
  const filters = [
    { label: "All", code: undefined },
    ...SUPPORTED_CURRENCIES.map((c) => ({ label: c.code, code: c.code })),
  ];

  return (
    <section id="history" className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Transaction history</h2>
        <nav aria-label="Filter by currency" className="flex flex-wrap gap-1">
          {filters.map((filter) => {
            const active = filter.code === currency;
            return (
              <Link
                key={filter.label}
                href={historyHref({ currency: filter.code })}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={`rounded-full border px-3 py-1 text-sm ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-card"
                }`}
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {page.items.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted">
          {currency
            ? `No ${currency} transactions yet.`
            : "No transactions yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-left text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Date (UTC)
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Operation
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((item) => {
                const isCredit = !item.amount.startsWith("-");
                return (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      <time dateTime={item.createdAt.toISOString()}>
                        {dateFormat.format(item.createdAt)}
                      </time>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {TRANSACTION_TYPE_LABELS[item.type]}
                      </div>
                      {item.description &&
                        item.description !==
                          TRANSACTION_TYPE_LABELS[item.type] && (
                          <div className="text-muted">{item.description}</div>
                        )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums ${
                        isCredit ? "text-success" : ""
                      }`}
                    >
                      {isCredit ? "+" : "−"}
                      {formatAmount(
                        item.amount.replace(/^-/, ""),
                        item.currency,
                      )}{" "}
                      {item.currency.code}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(page.nextCursor || !isFirstPage) && (
        <nav aria-label="Pagination" className="flex justify-between gap-2">
          {isFirstPage ? (
            <span />
          ) : (
            <Link
              href={historyHref({ currency })}
              scroll={false}
              className="text-sm underline"
            >
              ← Latest
            </Link>
          )}
          {page.nextCursor && (
            <Link
              href={historyHref({ currency, cursor: page.nextCursor })}
              scroll={false}
              className="text-sm underline"
            >
              Older →
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
