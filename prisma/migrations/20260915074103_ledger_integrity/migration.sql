-- Money integrity rules enforced by PostgreSQL itself, so that no code path
-- (application bug, manual SQL, future service) can corrupt balances.
-- Prisma can't express these in schema.prisma, so they live here.

-- ---------------------------------------------------------------------------
-- Check constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "currencies"
  ADD CONSTRAINT "currencies_code_format" CHECK ("code" ~ '^[A-Z]{3,10}$'),
  ADD CONSTRAINT "currencies_precision_range" CHECK ("precision" BETWEEN 0 AND 18);

ALTER TABLE "accounts"
  -- USER accounts have an owner, system accounts don't.
  ADD CONSTRAINT "accounts_owner_matches_type"
    CHECK (("type" = 'USER') = ("user_id" IS NOT NULL)),
  -- Only the treasury may go negative: its negative balance is the amount of
  -- money the platform has issued (welcome bonuses, conversions).
  ADD CONSTRAINT "accounts_balance_non_negative"
    CHECK ("type" = 'TREASURY' OR "balance" >= 0);

-- One TREASURY and one ESCROW account per currency.
CREATE UNIQUE INDEX "accounts_system_type_currency_code_key"
  ON "accounts" ("type", "currency_code")
  WHERE "user_id" IS NULL;

-- NULLs are distinct in unique indexes, so an idempotency key without an
-- initiator would not be unique.
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_idempotency_key_requires_initiator"
    CHECK ("idempotency_key" IS NULL OR "initiated_by_id" IS NOT NULL);

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_amount_non_zero" CHECK ("amount" <> 0);

ALTER TABLE "lots"
  ADD CONSTRAINT "lots_amounts_positive"
    CHECK ("sell_amount" > 0 AND "buy_amount" > 0),
  ADD CONSTRAINT "lots_different_currencies"
    CHECK ("sell_currency_code" <> "buy_currency_code"),
  ADD CONSTRAINT "lots_buyer_is_not_seller"
    CHECK ("buyer_id" IS NULL OR "buyer_id" <> "seller_id"),
  ADD CONSTRAINT "lots_status_consistency" CHECK (
    ("status" = 'OPEN'      AND "buyer_id" IS NULL     AND "closed_at" IS NULL) OR
    ("status" = 'FILLED'    AND "buyer_id" IS NOT NULL AND "closed_at" IS NOT NULL) OR
    ("status" = 'CANCELLED' AND "buyer_id" IS NULL     AND "closed_at" IS NOT NULL)
  );

ALTER TABLE "exchange_rates"
  ADD CONSTRAINT "exchange_rates_rate_positive" CHECK ("rate" > 0),
  ADD CONSTRAINT "exchange_rates_different_currencies"
    CHECK ("base_currency_code" <> "quote_currency_code");

-- ---------------------------------------------------------------------------
-- Balances are derived from the ledger
-- ---------------------------------------------------------------------------

-- Every ledger entry updates its account's balance in the same database
-- transaction. The UPDATE takes a row lock, so concurrent operations on the
-- same account are serialized, and "accounts_balance_non_negative" rejects
-- any overdraft. To avoid deadlocks, write entries in a consistent order
-- (e.g. sorted by account id).
CREATE FUNCTION "apply_ledger_entry"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  currency_precision smallint;
BEGIN
  SELECT c."precision" INTO currency_precision
  FROM "accounts" a
  JOIN "currencies" c ON c."code" = a."currency_code"
  WHERE a."id" = NEW."account_id";

  IF NEW."amount" <> round(NEW."amount", currency_precision) THEN
    RAISE EXCEPTION 'Amount % exceeds the currency precision of % decimal places',
      NEW."amount", currency_precision
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE "accounts"
  SET "balance" = "balance" + NEW."amount"
  WHERE "id" = NEW."account_id";

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ledger_entries_apply_to_balance"
  AFTER INSERT ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "apply_ledger_entry"();

-- Accounts can only change through ledger entries. A direct UPDATE runs this
-- trigger at depth 1; an update made by "apply_ledger_entry" runs it at depth 2.
CREATE FUNCTION "protect_account"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."balance" <> 0 THEN
      RAISE EXCEPTION 'Accounts must be created with a zero balance'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
     OR NEW."currency_code" IS DISTINCT FROM OLD."currency_code" THEN
    RAISE EXCEPTION 'Account type, owner and currency cannot be changed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."balance" IS DISTINCT FROM OLD."balance" AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Account balance can only be changed through ledger entries'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "accounts_protect"
  BEFORE INSERT OR UPDATE ON "accounts"
  FOR EACH ROW EXECUTE FUNCTION "protect_account"();

-- ---------------------------------------------------------------------------
-- Double-entry: every transaction balances per currency
-- ---------------------------------------------------------------------------

-- Deferred until COMMIT, so a transaction's entries can be inserted one by
-- one, but the database transaction fails if they don't sum to zero.
CREATE FUNCTION "check_transaction_balanced"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  unbalanced record;
BEGIN
  SELECT a."currency_code", sum(le."amount") AS total
  INTO unbalanced
  FROM "ledger_entries" le
  JOIN "accounts" a ON a."id" = le."account_id"
  WHERE le."transaction_id" = NEW."transaction_id"
  GROUP BY a."currency_code"
  HAVING sum(le."amount") <> 0
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Transaction % is unbalanced: % entries sum to %',
      NEW."transaction_id", unbalanced."currency_code", unbalanced.total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ledger_entries_balanced"
  AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_transaction_balanced"();

-- ---------------------------------------------------------------------------
-- Audit trail: transactions and ledger entries are append-only
-- ---------------------------------------------------------------------------

-- Mistakes are corrected with new, offsetting transactions.
CREATE FUNCTION "prevent_modification"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table "%" is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER "ledger_entries_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "prevent_modification"();

CREATE TRIGGER "transactions_append_only"
  BEFORE UPDATE OR DELETE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION "prevent_modification"();

-- ---------------------------------------------------------------------------
-- Reconciliation
-- ---------------------------------------------------------------------------

-- Accounts whose stored balance differs from the sum of their ledger entries.
-- Must always be empty.
CREATE VIEW "account_balance_mismatches" AS
SELECT
  a."id" AS "account_id",
  a."type",
  a."currency_code",
  a."balance" AS "stored_balance",
  coalesce(sum(le."amount"), 0) AS "ledger_balance"
FROM "accounts" a
LEFT JOIN "ledger_entries" le ON le."account_id" = a."id"
GROUP BY a."id"
HAVING a."balance" <> coalesce(sum(le."amount"), 0);
