import "server-only";
import {
  CONVERSION_FEE_RATE,
  exceedsSlippage,
  quoteConversion,
  type ConversionQuote,
} from "@/lib/conversion";
import { BASE_CURRENCY, SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { db } from "@/lib/db";
import { Decimal } from "@/lib/decimal";
import type { ConvertInput } from "@/lib/validation/convert";
import { isCheckViolation, isUniqueViolation } from "@/server/db-errors";
import { getSystemAccount, postTransaction } from "@/server/ledger";
import { getExecutableRates, toUsdPrices } from "@/server/rates/rates";

export type ConversionErrorCode =
  "INSUFFICIENT_FUNDS" | "AMOUNT_TOO_SMALL" | "RATE_CHANGED";

export class ConversionError extends Error {
  constructor(
    readonly code: ConversionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ConversionError";
  }
}

export type ConversionResult = {
  transactionId: string;
  from: string;
  to: string;
  fromAmount: string;
  toAmount: string;
  rate: string;
  /** True if this idempotency key was already processed. */
  replayed: boolean;
};

function precisionOf(code: string): number {
  const currency = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  if (!currency) throw new Error(`Unsupported currency ${code}`);
  return currency.precision;
}

/**
 * Converts money between two of the user's own accounts through the
 * treasury, at the current rate minus the conversion fee.
 *
 * Throws RatesUnavailableError if rates are too old, and ConversionError
 * for business rule violations.
 */
export async function convertCurrency(
  userId: string,
  input: ConvertInput,
): Promise<ConversionResult> {
  const replay = await findReplay(userId, input.idempotencyKey);
  if (replay) return replay;

  const rates = await getExecutableRates([input.from, input.to]);
  const quote: ConversionQuote = quoteConversion({
    from: input.from,
    to: input.to,
    amount: input.amount,
    toPrecision: precisionOf(input.to),
    prices: toUsdPrices(rates),
  });

  if (new Decimal(quote.toAmount).isZero()) {
    throw new ConversionError(
      "AMOUNT_TOO_SMALL",
      `The amount is too small to convert to ${input.to}.`,
    );
  }

  if (exceedsSlippage(input.quotedRate, quote.rate)) {
    throw new ConversionError(
      "RATE_CHANGED",
      "The exchange rate has changed. Please review the new rate and try again.",
    );
  }

  const fromAmount = new Decimal(input.amount).toFixed(precisionOf(input.from));

  try {
    const transaction = await db.$transaction(async (tx) => {
      const [fromAccount, toAccount] = await Promise.all(
        [input.from, input.to].map((currencyCode) =>
          tx.account.findUniqueOrThrow({
            where: { userId_currencyCode: { userId, currencyCode } },
            select: { id: true },
          }),
        ),
      );
      const fromTreasury = await getSystemAccount(tx, "TREASURY", input.from);
      const toTreasury = await getSystemAccount(tx, "TREASURY", input.to);

      return postTransaction(tx, {
        type: "CONVERSION",
        initiatedById: userId,
        idempotencyKey: input.idempotencyKey,
        description: `${input.from} → ${input.to}`,
        metadata: {
          from: input.from,
          to: input.to,
          fromAmount,
          toAmount: quote.toAmount,
          marketRate: quote.marketRate,
          rate: quote.rate,
          feeRate: CONVERSION_FEE_RATE,
          fee: quote.fee,
          // Rates used, except the base currency, which has none.
          rates: Object.fromEntries(
            [input.from, input.to]
              .filter((code) => code !== BASE_CURRENCY)
              .map((code) => {
                const rate = rates.get(code)!;
                return [
                  code,
                  {
                    usdPrice: rate.usdPrice,
                    source: rate.source,
                    fetchedAt: rate.fetchedAt.toISOString(),
                  },
                ];
              }),
          ),
        },
        entries: [
          { accountId: fromAccount.id, amount: `-${fromAmount}` },
          { accountId: fromTreasury.id, amount: fromAmount },
          { accountId: toTreasury.id, amount: `-${quote.toAmount}` },
          { accountId: toAccount.id, amount: quote.toAmount },
        ],
      });
    });

    return {
      transactionId: transaction.id,
      from: input.from,
      to: input.to,
      fromAmount,
      toAmount: quote.toAmount,
      rate: quote.rate,
      replayed: false,
    };
  } catch (error) {
    if (isCheckViolation(error, "accounts_balance_non_negative")) {
      throw new ConversionError(
        "INSUFFICIENT_FUNDS",
        `Insufficient ${input.from} balance.`,
      );
    }
    // A concurrent request with the same key won the race.
    if (isUniqueViolation(error, "idempotency_key")) {
      const replayed = await findReplay(userId, input.idempotencyKey);
      if (replayed) return replayed;
    }
    throw error;
  }
}

/** Returns the result of an already processed request with this key. */
async function findReplay(
  userId: string,
  idempotencyKey: string,
): Promise<ConversionResult | null> {
  const existing = await db.transaction.findUnique({
    where: {
      initiatedById_idempotencyKey: { initiatedById: userId, idempotencyKey },
    },
    select: { id: true, type: true, metadata: true },
  });
  if (!existing) return null;
  if (existing.type !== "CONVERSION") {
    throw new Error("Idempotency key was already used for another operation");
  }

  const metadata = existing.metadata as {
    from: string;
    to: string;
    fromAmount: string;
    toAmount: string;
    rate: string;
  };
  return {
    transactionId: existing.id,
    from: metadata.from,
    to: metadata.to,
    fromAmount: metadata.fromAmount,
    toAmount: metadata.toAmount,
    rate: metadata.rate,
    replayed: true,
  };
}
