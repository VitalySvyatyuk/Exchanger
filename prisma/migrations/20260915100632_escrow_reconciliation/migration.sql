-- Reconciles the ledger with the marketplace: the escrow account of each
-- currency must hold exactly the total of the open lots selling that
-- currency. Lists the currencies where it doesn't. Must always be empty.
--
-- This complements "account_balance_mismatches", which checks the ledger
-- against itself; this view checks the ledger against the lots table.
CREATE VIEW "escrow_balance_mismatches" AS
SELECT
  a."currency_code",
  a."balance" AS "escrow_balance",
  coalesce(open_lots."total", 0) AS "open_lots_total"
FROM "accounts" a
LEFT JOIN (
  SELECT "sell_currency_code", sum("sell_amount") AS "total"
  FROM "lots"
  WHERE "status" = 'OPEN'
  GROUP BY "sell_currency_code"
) open_lots ON open_lots."sell_currency_code" = a."currency_code"
WHERE a."type" = 'ESCROW'
  AND a."balance" <> coalesce(open_lots."total", 0);
