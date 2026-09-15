import { randomUUID } from "node:crypto";
import type { Metadata, Route } from "next";
import Form from "next/form";
import Link from "next/link";
import { after } from "next/server";
import { Button, buttonClassName } from "@/components/ui/button";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { formatAmount } from "@/lib/money";
import { isUuid, param } from "@/lib/search-params";
import { getUserBalances } from "@/server/accounts";
import { getCurrentUser } from "@/server/auth";
import {
  getLot,
  listOpenLots,
  listUserOpenLots,
  type LotView,
} from "@/server/lots";
import {
  getLatestRates,
  refreshRates,
  toUsdPrices,
} from "@/server/rates/rates";
import { CreateLotForm } from "./create-lot-form";
import { LotCard } from "./lot-card";

export const metadata: Metadata = { title: "Marketplace" };

const CODES: readonly string[] = SUPPORTED_CURRENCIES.map((c) => c.code);

function money(amount: string, code: string) {
  const currency = SUPPORTED_CURRENCIES.find((c) => c.code === code)!;
  return `${formatAmount(amount, currency)} ${code}`;
}

async function outcomeBanner(
  params: Record<string, string | string[] | undefined>,
  userId: string | undefined,
): Promise<{ tone: "success" | "muted"; text: string } | null> {
  if (param(params.unavailable)) {
    return {
      tone: "muted",
      text: "That lot is no longer available: someone else bought it or the seller cancelled it.",
    };
  }

  const bought = param(params.bought);
  const cancelled = param(params.cancelled);
  const lotId = bought ?? cancelled;
  if (!lotId || !isUuid(lotId) || !userId) return null;

  const lot: LotView | null = await getLot(lotId);
  if (bought && lot?.status === "FILLED" && lot.buyerId === userId) {
    return {
      tone: "success",
      text: `Purchase complete: you received ${money(lot.sellAmount, lot.sellCurrency)} for ${money(lot.buyAmount, lot.buyCurrency)}.`,
    };
  }
  if (cancelled && lot?.status === "CANCELLED" && lot.seller.id === userId) {
    return {
      tone: "success",
      text: `Lot ${lot.number} cancelled: ${money(lot.sellAmount, lot.sellCurrency)} returned to your account.`,
    };
  }
  return null;
}

export default async function MarketPage({
  searchParams,
}: PageProps<"/market">) {
  const params = await searchParams;
  const sellFilter = CODES.includes(param(params.sell) ?? "")
    ? param(params.sell)
    : undefined;
  const buyFilter = CODES.includes(param(params.buy) ?? "")
    ? param(params.buy)
    : undefined;
  const cursor = isUuid(param(params.cursor))
    ? param(params.cursor)
    : undefined;

  const user = await getCurrentUser();
  const [page, rates, balances, ownLots, banner] = await Promise.all([
    listOpenLots({
      sellCurrency: sellFilter,
      buyCurrency: buyFilter,
      cursor,
      excludeSellerId: user?.id,
    }),
    getLatestRates(),
    user ? getUserBalances(user.id) : Promise.resolve([]),
    user ? listUserOpenLots(user.id) : Promise.resolve([]),
    outcomeBanner(params, user?.id),
  ]);

  after(() => refreshRates());

  const prices = toUsdPrices(rates);
  const outcomeKey = ["bought", "cancelled", "unavailable"]
    .map((name) => param(params[name]) ?? "")
    .join("|");
  const viewer = user
    ? {
        id: user.id,
        balances: Object.fromEntries(
          balances.map((b) => [b.currency.code, b.balance]),
        ),
      }
    : null;

  const filterQuery = (extra: Record<string, string> = {}) => {
    const query = new URLSearchParams();
    if (sellFilter) query.set("sell", sellFilter);
    if (buyFilter) query.set("buy", buyFilter);
    for (const [key, value] of Object.entries(extra)) query.set(key, value);
    const string = query.toString();
    return `/market${string ? `?${string}` : ""}` as Route;
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Marketplace</h1>
        <p className="text-muted">
          Buy currency from other users at their price, or post your own offer.
        </p>
      </section>

      {banner && (
        <p
          id="market-outcome"
          role="status"
          className={`rounded-lg border p-4 text-sm ${
            banner.tone === "success"
              ? "border-success text-success"
              : "border-border bg-card text-muted"
          }`}
        >
          {banner.text}
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section className="flex min-w-0 flex-col gap-4">
          <Form
            action="/market"
            className="flex flex-wrap items-end gap-2"
            aria-label="Filter lots"
          >
            <FilterSelect name="sell" label="Sells" value={sellFilter} />
            <FilterSelect name="buy" label="For" value={buyFilter} />
            <Button type="submit" variant="secondary" size="sm">
              Filter
            </Button>
            {(sellFilter || buyFilter) && (
              <Link href="/market" className={buttonClassName("ghost", "sm")}>
                Clear
              </Link>
            )}
          </Form>

          {page.lots.length === 0 ? (
            <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted">
              No open lots{sellFilter || buyFilter ? " for this filter" : ""}{" "}
              yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Open lots">
              {page.lots.map((lot) => (
                <LotCard
                  key={lot.id}
                  lot={lot}
                  prices={prices}
                  viewer={viewer}
                />
              ))}
            </ul>
          )}

          {(page.nextCursor || cursor) && (
            <nav aria-label="Pagination" className="flex justify-between">
              {cursor ? (
                <Link href={filterQuery()} className="text-sm underline">
                  ← Newest
                </Link>
              ) : (
                <span />
              )}
              {page.nextCursor && (
                <Link
                  href={filterQuery({ cursor: page.nextCursor })}
                  className="text-sm underline"
                >
                  Older lots →
                </Link>
              )}
            </nav>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          {user ? (
            <CreateLotForm
              // Start fresh after a buy or cancel redirect, but keep the
              // success message after posting (which only refreshes).
              key={outcomeKey}
              accounts={balances.map(({ balance, currency }) => ({
                code: currency.code,
                type: currency.type,
                precision: currency.precision,
                balance,
              }))}
              prices={prices}
              initialIdempotencyKey={randomUUID()}
            />
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
              <h2 className="text-lg font-semibold">Post a lot</h2>
              <p className="text-sm text-muted">
                Sign up to trade. New users get $100 to start.
              </p>
              <Link href="/signup" className={buttonClassName("primary")}>
                Sign up
              </Link>
            </div>
          )}

          {ownLots.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Your open lots</h2>
              <ul className="flex flex-col gap-3" aria-label="Your open lots">
                {ownLots.map((lot) => (
                  <LotCard
                    key={lot.id}
                    lot={lot}
                    prices={prices}
                    viewer={viewer}
                  />
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="h-9 rounded-md border border-border bg-background px-3 font-mono"
      >
        <option value="">Any</option>
        {CODES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </label>
  );
}
