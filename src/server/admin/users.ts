import "server-only";
import type { UserRole } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/search-params";
import { requireAdmin } from "@/server/auth";

export const ADMIN_PAGE_SIZE = 50;

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: Date;
  activeSessions: number;
  /** Balances by currency code, as decimal strings. */
  balances: Record<string, string>;
};

/** Users, newest first, optionally matching an email, name or id. */
export async function listUsers(options: {
  query?: string;
  cursor?: string;
}): Promise<{ users: AdminUserRow[]; nextCursor: string | null }> {
  await requireAdmin();

  const query = options.query?.trim();
  const now = new Date();
  const users = await db.user.findMany({
    where: query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            ...(isUuid(query) ? [{ id: query }] : []),
          ],
        }
      : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_PAGE_SIZE + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      accounts: { select: { currencyCode: true, balance: true } },
      _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
    },
  });

  const hasMore = users.length > ADMIN_PAGE_SIZE;
  const page = hasMore ? users.slice(0, ADMIN_PAGE_SIZE) : users;
  return {
    users: page.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      activeSessions: user._count.sessions,
      balances: Object.fromEntries(
        user.accounts.map((a) => [a.currencyCode, a.balance.toString()]),
      ),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function getUserDetail(id: string) {
  await requireAdmin();

  const now = new Date();
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      sessions: {
        where: { expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
        select: { id: true, userAgent: true, createdAt: true, expiresAt: true },
      },
      _count: {
        select: { transactions: true, lotsSold: true, lotsBought: true },
      },
    },
  });
  return user;
}
