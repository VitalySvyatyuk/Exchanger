import "server-only";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.url(),
  // Optional: CoinGecko's public API works without a key, with lower limits.
  COINGECKO_API_KEY: z.string().min(1).optional(),
  // "fixed" serves deterministic rates without network calls (tests, offline).
  RATES_MODE: z.enum(["live", "fixed"]).default("live"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    z.flattenError(parsed.error).fieldErrors,
  );
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
