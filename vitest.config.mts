import path from "node:path";
import { defineConfig } from "vitest/config";
import { testEnv } from "./test/env";

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(root, "src"),
      "server-only": path.join(root, "test/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
          environment: "node",
          // Server modules validate the environment on import; unit tests
          // never connect to this database.
          env: { DATABASE_URL: "postgresql://localhost:5432/unit_tests" },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          environment: "node",
          env: { ...testEnv(), NODE_ENV: "test" },
          globalSetup: ["test/global-setup.ts"],
          setupFiles: ["test/integration-setup.ts"],
          // Files share one database; run them one at a time for
          // deterministic results. Tests inside a file still exercise
          // concurrency on purpose.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
