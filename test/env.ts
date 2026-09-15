// Environment for integration and end-to-end tests. Kept free of app
// imports so tools like the Playwright config can load it cheaply.

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://exchanger:exchanger@localhost:5432/exchanger_test?schema=public";

export const TEST_ADMIN = {
  email: "admin@exchanger.test",
  password: "AdminPass123",
};

/** Variables the app needs when it runs against the test database. */
export function testEnv(): Record<string, string> {
  return {
    DATABASE_URL: TEST_DATABASE_URL,
    // Deterministic exchange rates, no network calls.
    RATES_MODE: "fixed",
    ADMIN_EMAIL: TEST_ADMIN.email,
    ADMIN_PASSWORD: TEST_ADMIN.password,
  };
}
