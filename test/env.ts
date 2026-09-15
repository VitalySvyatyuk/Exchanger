// Environment for integration and end-to-end tests. Kept free of app
// imports so tools like the Playwright config can load it cheaply.

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://exchanger:exchanger@localhost:5432/exchanger_test?schema=public";

export const TEST_ADMIN = {
  email: "admin@exchanger.test",
  password: "AdminPass123",
};

/**
 * A small connection pool, like Prisma's default on a 2-core CI runner.
 * On a developer machine the default pool is much larger and hides bugs
 * such as a transaction waiting for a second connection.
 */
function withSmallPool(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("connection_limit")) {
    parsed.searchParams.set("connection_limit", "5");
  }
  return parsed.toString();
}

/** Variables the app needs when it runs against the test database. */
export function testEnv(): Record<string, string> {
  return {
    DATABASE_URL: withSmallPool(TEST_DATABASE_URL),
    // Deterministic exchange rates, no network calls.
    RATES_MODE: "fixed",
    ADMIN_EMAIL: TEST_ADMIN.email,
    ADMIN_PASSWORD: TEST_ADMIN.password,
  };
}
