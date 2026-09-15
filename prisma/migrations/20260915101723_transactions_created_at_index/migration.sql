-- The admin transaction log lists all transactions newest first with keyset
-- pagination (ORDER BY created_at DESC, id DESC). Without this index every
-- page sorts the whole table; with it PostgreSQL scans the index backward
-- and stops after one page. The existing (type, created_at) index only helps
-- when filtering by type.

-- CreateIndex
CREATE INDEX "transactions_created_at_id_idx" ON "transactions"("created_at", "id");
