// Recreates the test database (TEST_DATABASE_URL): migrations and seed.
// Runs automatically before integration and end-to-end tests.
//
//   npm run db:test:reset

import { TEST_DATABASE_URL } from "../test/env";
import { resetTestDatabase } from "../test/test-db";

resetTestDatabase()
  .then(() => {
    const { host, pathname } = new URL(TEST_DATABASE_URL);
    console.log(`Test database ready: ${host}${pathname}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
