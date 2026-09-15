import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  CONVERSION_FEE_RATE,
  exceedsSlippage,
  quoteConversion,
} from "@/lib/conversion";
import { BASE_CURRENCY, SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { db } from "@/lib/db";
import { Decimal } from "@/lib/decimal";
import type { ConvertInput } from "@/lib/validation/convert";
import { isCheckViolation, isUniqueViolation } from "@/server/db-errors";
import { OperationError } from "@/server/errors";
import { findByIdempotencyKey } from "@/server/idempotency";
import {
  getSystemAccount,
  postTransaction,
  type LedgerEntryInput,
} from "@/server/ledger";
import { getExecutableRates, toUsdPrices } from "@/server/rates/rates";

export function precisionOf(code: string): number {
  const currency = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  if (!currency) throw new Error(`Unsupported currency ${code}`);
  return currency.precision;
}

/** Normalizes an amount to the currency's precision, e.g. "5" -> "5.00". */
export function normalizeAmount(code: string, amount: string): string {
  return new Decimal(amount).toFixed(precisionOf(code));
}

export type Exchange = {
  fromAmount: string;
  toAmount: string;
  rate: string;
  /** Stored in the transaction metadata for audit. */
  details: Prisma.InputJsonObject;
};

/**
 * Prices an exchange of `amount` of `from` into `to` at current rates, after
 * the fee, and enforces the rules shared by conversions and cross-currency
 * transfers: fresh rates, a non-zero result and slippage protection.
 */
export async function prepareExchange(input: {
  from: string;
  to: string;
  amount: string;
  quotedRate: string;
}): Promise<Exchange> {
  const rates = await getExecutableRates([input.from, input.to]);
  const quote = quoteConversion({
    from: input.from,
    to: input.to,
    amount: input.amount,
    toPrecision: precisionOf(input.to),
    prices: toUsdPrices(rates),
  });

  if (new Decimal(quote.toAmount).isZero()) {
    throw new OperationError(
      "AMOUNT_TOO_SMALL",
      `The amount is too small to exchange into ${input.to}.`,
    );
  }

  if (exceedsSlippage(input.quotedRate, quote.rate)) {
    throw new OperationError(
      "RATE_CHANGED",
      "The exchange rate has changed. Please review the new rate and try again.",
    );
  }

  return {
    fromAmount: normalizeAmount(input.from, input.amount),
    toAmount: quote.toAmount,
    rate: quote.rate,
    details: {
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
  };
}

/**
 * Ledger entries that move `fromAmount` out of one account and `toAmount`
 * into another in a different currency. The treasury is the counterparty
 * on both sides, so each currency balances on its own.
 */
export async function exchangeEntries(
  tx: Prisma.TransactionClient,
  params: {
    from: string;
    to: string;
    fromAccountId: string;
    toAccountId: string;
    fromAmount: string;
    toAmount: string;
  },
): Promise<LedgerEntryInput[]> {
  const fromTreasury = await getSystemAccount(tx, "TREASURY", params.from);
  const toTreasury = await getSystemAccount(tx, "TREASURY", params.to);

  return [
    { accountId: params.fromAccountId, amount: `-${params.fromAmount}` },
    { accountId: fromTreasury.id, amount: params.fromAmount },
    { accountId: toTreasury.id, amount: `-${params.toAmount}` },
    { accountId: params.toAccountId, amount: params.toAmount },
  ];
}

/** Maps database errors of a money operation to domain errors. */
export function toOperationError(error: unknown, currency: string): unknown {
  if (isCheckViolation(error, "accounts_balance_non_negative")) {
    return new OperationError(
      "INSUFFICIENT_FUNDS",
      `Insufficient ${currency} balance.`,
    );
  }
  return error;
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

type ConversionMetadata = {
  from: string;
  to: string;
  fromAmount: string;
  toAmount: string;
  rate: string;
};

async function findConversion(
  userId: string,
  idempotencyKey: string,
): Promise<ConversionResult | null> {
  const existing = await findByIdempotencyKey(
    userId,
    idempotencyKey,
    "CONVERSION",
  );
  if (!existing) return null;

  const metadata = existing.metadata as ConversionMetadata;
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

/**
 * Converts money between two of the user's own accounts through the
 * treasury, at the current rate minus the conversion fee.
 *
 * Throws RatesUnavailableError if rates are too old, and OperationError
 * for business rule violations.
 */
export async function convertCurrency(
  userId: string,
  input: ConvertInput,
): Promise<ConversionResult> {
  const replay = await findConversion(userId, input.idempotencyKey);
  if (replay) return replay;

  const exchange = await prepareExchange(input);

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

      return postTransaction(tx, {
        type: "CONVERSION",
        initiatedById: userId,
        idempotencyKey: input.idempotencyKey,
        description: `${input.from} → ${input.to}`,
        metadata: {
          from: input.from,
          to: input.to,
          fromAmount: exchange.fromAmount,
          toAmount: exchange.toAmount,
          ...exchange.details,
        },
        entries: await exchangeEntries(tx, {
          from: input.from,
          to: input.to,
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
          fromAmount: exchange.fromAmount,
          toAmount: exchange.toAmount,
        }),
      });
    });

    return {
      transactionId: transaction.id,
      from: input.from,
      to: input.to,
      fromAmount: exchange.fromAmount,
      toAmount: exchange.toAmount,
      rate: exchange.rate,
      replayed: false,
    };
  } catch (error) {
    // A concurrent request with the same key won the race.
    if (isUniqueViolation(error, "idempotency_key")) {
      const replayed = await findConversion(userId, input.idempotencyKey);
      if (replayed) return replayed;
    }
    throw toOperationError(error, input.from);
  }
}
