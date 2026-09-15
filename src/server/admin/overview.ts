import "server-only";
import type { AccountType, TransactionType } from "@/generated/prisma/client";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { db } from "@/lib/db";
import { Decimal } from "@/lib/decimal";
import { requireAdmin } from "@/server/auth";

export type CurrencyTotals = {
  code: string;
  precision: number;
  type: "FIAT" | "CRYPTO";
  byType: Record<AccountType, string>;
  /** Sum over all accounts. Double-entry means this is always zero. */
  total: string;
};

export type AccountMismatch = {
  account_id: string;
  type: AccountType;
  currency_code: string;
  stored_balance: string;
  ledger_balance: string;
};

export type EscrowMismatch = {
  currency_code: string;
  escrow_balance: string;
  open_lots_total: string;
};

export async function getOverview() {
  await requireAdmin();

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    users,
    newUsers,
    activeSessions,
    openLots,
    transactionsByType,
    balances,
    accountMismatches,
    escrowMismatches,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: dayAgo } } }),
    db.session.count({ where: { expiresAt: { gt: now } } }),
    db.lot.count({ where: { status: "OPEN" } }),
    db.transaction.groupBy({
      by: ["type"],
      where: { createdAt: { gte: dayAgo } },
      _count: { _all: true },
    }),
    db.account.groupBy({
      by: ["currencyCode", "type"],
      _sum: { balance: true },
    }),
    db.$queryRaw<AccountMismatch[]>`
      SELECT account_id::text, type::text, currency_code,
             stored_balance::text, ledger_balance::text
      FROM account_balance_mismatches
      LIMIT 20
    `,
    db.$queryRaw<EscrowMismatch[]>`
      SELECT currency_code, escrow_balance::text, open_lots_total::text
      FROM escrow_balance_mismatches
    `,
  ]);

  const totals: CurrencyTotals[] = SUPPORTED_CURRENCIES.map((currency) => {
    const sumFor = (type: AccountType) =>
      new Decimal(
        balances
          .find((b) => b.currencyCode === currency.code && b.type === type)
          ?._sum.balance?.toString() ?? "0",
      );
    const byType = {
      USER: sumFor("USER"),
      ESCROW: sumFor("ESCROW"),
      TREASURY: sumFor("TREASURY"),
    };
    const format = (value: Decimal) => value.toFixed(currency.precision);
    return {
      code: currency.code,
      precision: currency.precision,
      type: currency.type,
      byType: {
        USER: format(byType.USER),
        ESCROW: format(byType.ESCROW),
        TREASURY: format(byType.TREASURY),
      },
      total: format(byType.USER.plus(byType.ESCROW).plus(byType.TREASURY)),
    };
  });

  return {
    users,
    newUsers,
    activeSessions,
    openLots,
    transactionsLastDay: Object.fromEntries(
      transactionsByType.map((row) => [row.type, row._count._all]),
    ) as Partial<Record<TransactionType, number>>,
    totals,
    accountMismatches,
    escrowMismatches,
  };
}
