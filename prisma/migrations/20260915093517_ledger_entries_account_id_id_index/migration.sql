-- Transaction history is paginated per account with
--   WHERE account_id = $1 AND id < $cursor ORDER BY id DESC LIMIT n.
-- An index on (account_id, id) returns those rows in order and stops after
-- n, instead of reading and sorting the account's whole history.
--
-- On a large live table, run these as separate migrations with
-- CREATE INDEX CONCURRENTLY (it can't run inside a transaction), and create
-- the new index before dropping the old one.

-- DropIndex
DROP INDEX "ledger_entries_account_id_created_at_idx";

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_id_idx" ON "ledger_entries"("account_id", "id");
