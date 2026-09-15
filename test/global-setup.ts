import { resetTestDatabase } from "./test-db";

/** Vitest global setup for integration tests: a fresh test database. */
export default async function setup() {
  await resetTestDatabase();
}
