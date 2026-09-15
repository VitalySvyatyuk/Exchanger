export type CurrencyDefinition = {
  code: string;
  name: string;
  symbol: string;
  type: "FIAT" | "CRYPTO";
  /** Number of decimal places. */
  precision: number;
};

export const SUPPORTED_CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$", type: "FIAT", precision: 2 },
  { code: "EUR", name: "Euro", symbol: "€", type: "FIAT", precision: 2 },
  {
    code: "GBP",
    name: "British Pound",
    symbol: "£",
    type: "FIAT",
    precision: 2,
  },
  { code: "BTC", name: "Bitcoin", symbol: "₿", type: "CRYPTO", precision: 8 },
  { code: "ETH", name: "Ether", symbol: "Ξ", type: "CRYPTO", precision: 18 },
] as const satisfies readonly CurrencyDefinition[];

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

/** Currency that exchange rates are quoted against. */
export const BASE_CURRENCY: CurrencyCode = "USD";

/** Credited to every new user from the treasury. */
export const WELCOME_BONUS = { currencyCode: "USD", amount: "100" } as const;
