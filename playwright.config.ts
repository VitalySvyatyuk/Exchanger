import { defineConfig, devices } from "@playwright/test";
import { testEnv } from "./test/env";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const CI = Boolean(process.env.CI);

/**
 * End-to-end tests against a production build and the test database.
 *
 *   npm run build
 *   npm run test:e2e
 *
 * Set PLAYWRIGHT_CHANNEL=chrome to use an installed Chrome instead of the
 * bundled Chromium.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHANNEL,
      },
    },
  ],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: testEnv(),
  },
});
