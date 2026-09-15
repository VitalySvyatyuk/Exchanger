import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { TEST_DATABASE_URL, testEnv } from "./env";

const bin = (name: string) =>
  path.join(process.cwd(), "node_modules", ".bin", name);

/**
 * Recreates the test database from scratch: drops the schema, applies all
 * migrations and runs the seed.
 *
 * Refuses to touch a database whose name doesn't end in "_test", so it can
 * never wipe a development or production database by mistake.
 */
export async function resetTestDatabase(): Promise<void> {
  const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to reset "${name}": the test database name must end with "_test".`,
    );
  }

  const db = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  try {
    await db.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await db.$executeRawUnsafe("CREATE SCHEMA public");
  } finally {
    await db.$disconnect();
  }

  const env = { ...process.env, ...testEnv() };
  execFileSync(bin("prisma"), ["migrate", "deploy"], { env, stdio: "pipe" });
  execFileSync(bin("tsx"), ["prisma/seed.ts"], { env, stdio: "pipe" });
}
