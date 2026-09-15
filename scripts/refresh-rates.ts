// Fetches exchange rates from all providers, ignoring the refresh interval.
// The app refreshes stale rates on its own; this is for cron jobs and
// manual use.
//
//   npm run rates:refresh

import "dotenv/config";

async function main() {
  // Imported after dotenv so the environment is loaded first.
  const { refreshRates, getLatestRates } =
    await import("../src/server/rates/rates");
  const { db } = await import("../src/lib/db");

  try {
    const results = await refreshRates({ force: true });
    console.table(results);

    const rates = await getLatestRates();
    console.table(
      [...rates.values()].map((rate) => ({
        currency: rate.currencyCode,
        usdPrice: rate.usdPrice.slice(0, 16),
        source: rate.source,
        fetchedAt: rate.fetchedAt.toISOString(),
        stale: rate.stale,
      })),
    );

    if (Object.values(results).includes("failed")) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main();
