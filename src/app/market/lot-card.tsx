import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import type { UsdPrices } from "@/lib/conversion";
import { formatRate } from "@/lib/conversion";
import { Decimal } from "@/lib/decimal";
import { formatAge } from "@/lib/format";
import { buyerAdvantage, formatPercent, lotPrice } from "@/lib/lots";
import { formatAmount } from "@/lib/money";
import type { LotView } from "@/server/lots";
import { LotActions } from "./lot-actions";

function money(amount: string, code: string) {
  const currency = SUPPORTED_CURRENCIES.find((c) => c.code === code)!;
  return `${formatAmount(amount, currency)} ${code}`;
}

type LotCardProps = {
  lot: LotView;
  prices: UsdPrices;
  viewer: { id: string; balances: Record<string, string> } | null;
};

export function LotCard({ lot, prices, viewer }: LotCardProps) {
  const advantage = buyerAdvantage(lot, prices);
  const isOwn = viewer?.id === lot.seller.id;
  const canAfford =
    !viewer ||
    new Decimal(viewer.balances[lot.buyCurrency] ?? "0").greaterThanOrEqualTo(
      lot.buyAmount,
    );

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted">
          <span className="font-mono">{lot.number}</span>
          <span>·</span>
          <span>{isOwn ? "Your lot" : lot.seller.name}</span>
          <span>·</span>
          <span>{formatAge(lot.createdAt)}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 text-lg">
          <span className="text-sm text-muted">Sells</span>
          <span className="font-mono font-medium">
            {money(lot.sellAmount, lot.sellCurrency)}
          </span>
          <span className="text-sm text-muted">for</span>
          <span className="font-mono font-medium">
            {money(lot.buyAmount, lot.buyCurrency)}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 text-sm">
          <span className="font-mono text-muted">
            1 {lot.sellCurrency} ={" "}
            {formatRate(lotPrice(lot.sellAmount, lot.buyAmount))}{" "}
            {lot.buyCurrency}
          </span>
          {advantage !== null && (
            <span
              className={advantage >= 0 ? "text-success" : "text-danger"}
              title="Value the buyer receives compared with the market rate"
            >
              {formatPercent(advantage)} vs market
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0">
        <LotActions
          lotId={lot.id}
          mode={!viewer ? "login" : isOwn ? "cancel" : "buy"}
          summary={`Pay ${money(lot.buyAmount, lot.buyCurrency)}, get ${money(lot.sellAmount, lot.sellCurrency)}?`}
          disabledReason={
            viewer && !isOwn && !canAfford
              ? `Not enough ${lot.buyCurrency}`
              : undefined
          }
        />
      </div>
    </li>
  );
}
