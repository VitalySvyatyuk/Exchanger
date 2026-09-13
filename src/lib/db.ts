import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

// Reuse a single client across hot reloads in development,
// otherwise every reload opens a new connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: env.DATABASE_URL,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
