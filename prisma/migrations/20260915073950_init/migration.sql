-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CurrencyType" AS ENUM ('FIAT', 'CRYPTO');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('USER', 'TREASURY', 'ESCROW');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('WELCOME_BONUS', 'CONVERSION', 'TRANSFER', 'LOT_HOLD', 'LOT_PURCHASE', 'LOT_CANCEL', 'DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('FRANKFURTER', 'COINGECKO', 'SEED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100),
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "symbol" VARCHAR(5) NOT NULL,
    "type" "CurrencyType" NOT NULL,
    "precision" SMALLINT NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "type" "AccountType" NOT NULL DEFAULT 'USER',
    "user_id" UUID,
    "currency_code" VARCHAR(10) NOT NULL,
    "balance" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "idempotency_key" VARCHAR(100),
    "initiated_by_id" UUID,
    "lot_id" UUID,
    "description" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" BIGSERIAL NOT NULL,
    "transaction_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "buyer_id" UUID,
    "sell_currency_code" VARCHAR(10) NOT NULL,
    "sell_amount" DECIMAL(36,18) NOT NULL,
    "buy_currency_code" VARCHAR(10) NOT NULL,
    "buy_amount" DECIMAL(36,18) NOT NULL,
    "status" "LotStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" BIGSERIAL NOT NULL,
    "base_currency_code" VARCHAR(10) NOT NULL,
    "quote_currency_code" VARCHAR(10) NOT NULL,
    "rate" DECIMAL(36,18) NOT NULL,
    "source" "RateSource" NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_currency_code_idx" ON "accounts"("currency_code");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_currency_code_key" ON "accounts"("user_id", "currency_code");

-- CreateIndex
CREATE INDEX "transactions_type_created_at_idx" ON "transactions"("type", "created_at");

-- CreateIndex
CREATE INDEX "transactions_lot_id_idx" ON "transactions"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_initiated_by_id_idempotency_key_key" ON "transactions"("initiated_by_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_created_at_idx" ON "ledger_entries"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "lots_status_created_at_idx" ON "lots"("status", "created_at");

-- CreateIndex
CREATE INDEX "lots_seller_id_status_idx" ON "lots"("seller_id", "status");

-- CreateIndex
CREATE INDEX "lots_buyer_id_idx" ON "lots"("buyer_id");

-- CreateIndex
CREATE INDEX "exchange_rates_base_currency_code_quote_currency_code_fetch_idx" ON "exchange_rates"("base_currency_code", "quote_currency_code", "fetched_at" DESC);

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_initiated_by_id_fkey" FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_sell_currency_code_fkey" FOREIGN KEY ("sell_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_buy_currency_code_fkey" FOREIGN KEY ("buy_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_base_currency_code_fkey" FOREIGN KEY ("base_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_quote_currency_code_fkey" FOREIGN KEY ("quote_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
