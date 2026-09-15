import { BASE_CURRENCY, SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { formatAge, formatPrice } from "@/lib/format";
import type { CurrencyRate } from "@/server/rates/rates";

const SOURCE_LABELS: Record<CurrencyRate["source"], string> = {
  FRANKFURTER: "ECB via Frankfurter",
  COINGECKO: "CoinGecko",
  SEED: "Fallback",
};

export function RatesTable({ rates }: { rates: Map<string, CurrencyRate> }) {
  const rows = SUPPORTED_CURRENCIES.filter(
    (currency) => currency.code !== BASE_CURRENCY,
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-card text-left text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              Currency
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Price in {BASE_CURRENCY}
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Source
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Updated
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((currency) => {
            const rate = rates.get(currency.code);
            return (
              <tr key={currency.code} className="border-t border-border">
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="font-mono font-medium">{currency.code}</span>
                  <span className="ml-2 text-muted">{currency.name}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums">
                  {rate ? `$${formatPrice(rate.usdPrice)}` : "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">
                  {rate ? SOURCE_LABELS[rate.source] : "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">
                  {rate ? formatAge(rate.fetchedAt) : "—"}
                  {rate?.stale && (
                    <span className="ml-2 rounded-full border border-danger px-2 py-0.5 text-xs text-danger">
                      outdated
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
