import "server-only";
import type { AccountType, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/server/auth";
import { ADMIN_PAGE_SIZE } from "@/server/admin/users";

export type AdminAccountRow = {
  id: string;
  type: AccountType;
  currency: { code: string; type: "FIAT" | "CRYPTO"; precision: number };
  balance: string;
  owner: { id: string; email: string; name: string | null } | null;
  createdAt: Date;
};

/** All accounts, largest balance first. */
export async function listAccounts(options: {
  type?: AccountType;
  currencyCode?: string;
  hideZero?: boolean;
  cursor?: string;
}): Promise<{ accounts: AdminAccountRow[]; nextCursor: string | null }> {
  await requireAdmin();

  const where: Prisma.AccountWhereInput = {
    type: options.type,
    currencyCode: options.currencyCode,
    balance: options.hideZero ? { not: 0 } : undefined,
  };

  const accounts = await db.account.findMany({
    where,
    orderBy: [{ balance: "desc" }, { id: "asc" }],
    take: ADMIN_PAGE_SIZE + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      balance: true,
      createdAt: true,
      currency: { select: { code: true, type: true, precision: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  const hasMore = accounts.length > ADMIN_PAGE_SIZE;
  const page = hasMore ? accounts.slice(0, ADMIN_PAGE_SIZE) : accounts;
  return {
    accounts: page.map((account) => ({
      id: account.id,
      type: account.type,
      currency: account.currency,
      balance: account.balance.toFixed(account.currency.precision),
      owner: account.user,
      createdAt: account.createdAt,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}
