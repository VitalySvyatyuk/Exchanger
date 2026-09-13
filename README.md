# Exchanger

A multi-currency wallet and peer-to-peer exchange platform built with Next.js, TypeScript and PostgreSQL.

Users hold balances in several fiat currencies and cryptocurrencies. They can convert money between their own accounts, send money to other users, and trade with each other through a simple order book of fixed-price offers ("lots").

> Status: work in progress. This README describes the planned scope.

## Features

### Accounts and balances

- Supported currencies:
  - Fiat: **USD**, **EUR**, **GBP**
  - Crypto: **BTC**, **ETH**
- Each user has one account per currency.
- Every newly registered user receives a **$100 USD welcome bonus**.

### Transfers and conversion

- **Convert between own accounts**: for example, USD → EUR at the current exchange rate.
- **Send money to another user**, with optional conversion: for example, send USD from your account and the recipient receives EUR.
- **Exchange rates** come from public APIs ([Frankfurter](https://frankfurter.dev) for fiat, [CoinGecko](https://www.coingecko.com/en/api) for crypto). They are cached in the database, so the app keeps working if an API is slow or unavailable.

### P2P marketplace (lots)

- A user creates a lot, for example: **"Sell 50 USD for 40 EUR"**.
- The lot's amount is reserved (held) on the seller's account until it is bought or cancelled.
- Other users browse open lots and can **buy** one if the offer is better than the market rate.
- The seller can cancel an open lot, which releases the held funds.
- Lot statuses: `open` → `filled` / `cancelled`.

### Profile

- Balances for every currency.
- Transaction history.
- **Deposit** and **Withdraw** options are shown in the profile but are **not functional**, because no payment provider (Stripe, etc.) is connected. They are UI placeholders only.

### Admin panel

- **Users**: list, search and view details.
- **Accounts**: all accounts with their balances.
- **Transactions**: full transaction log with filters (type, user, currency, date).

## Tech stack

| Layer      | Technology                           |
| ---------- | ------------------------------------ |
| Framework  | Next.js (App Router), React          |
| Language   | TypeScript                           |
| Database   | PostgreSQL                           |
| ORM        | Prisma                               |
| Auth       | Auth.js (NextAuth), email + password |
| Styling    | Tailwind CSS                         |
| Validation | Zod                                  |
| Testing    | Vitest, Playwright                   |
| Infra      | Docker Compose (Postgres)            |

## Design principles

- **Ledger-based balances**: every money movement is recorded as ledger entries, and an account's balance is derived from them. Each transaction's debit and credit entries must balance.
- **Exact money arithmetic**: amounts are stored as `NUMERIC`, never floating point. Each currency has its own precision (2 decimal places for fiat, 8 for BTC, 18 for ETH).
- **Atomic operations**: transfers, conversions and lot purchases each run inside a single database transaction with row-level locking, so balances can't go negative and one lot can't be bought twice.
- **Idempotency**: operations that change money accept an idempotency key, so a retried request can't be applied twice.
- **Auditability**: transactions are append-only; corrections are made with new, offsetting transactions.

## Data model (draft)

- `User`: id, email, password hash, role (`user` / `admin`), created at
- `Currency`: code, name, type (`fiat` / `crypto`), precision
- `Account`: id, user, currency, created at
- `Transaction`: id, type (`welcome_bonus`, `conversion`, `transfer`, `lot_purchase`, `deposit`, `withdrawal`), status, idempotency key, created at
- `LedgerEntry`: id, transaction, account, amount (signed)
- `Lot`: id, seller, sell currency and amount, buy currency and amount, status, buyer, created at, filled at
- `ExchangeRate`: base currency, quote currency, rate, fetched at

## Roadmap

- [x] Project setup: Next.js, TypeScript, Tailwind, Prisma, Docker Compose with Postgres
- [ ] Database schema, migrations, seed data (currencies, admin user)
- [ ] Authentication: registration and login, automatic account creation, $100 welcome bonus
- [ ] Profile: balances, transaction history, Deposit/Withdraw placeholders
- [ ] Exchange rates and conversion between own accounts
- [ ] Transfers to other users
- [ ] P2P marketplace: create, browse, buy and cancel lots
- [ ] Admin panel: users, accounts, transactions
- [ ] Tests (unit tests and end-to-end tests) and CI

## Getting started

### Requirements

- Node.js 20.9 or newer
- PostgreSQL 14 or newer: either local, or started with Docker Compose

### Setup

```bash
# 1. Install dependencies (this also generates the Prisma client)
npm install

# 2. Configure the environment
cp .env.example .env

# 3. Start PostgreSQL (skip if you use a local instance and have updated DATABASE_URL)
npm run db:up

# 4. Apply database migrations
npm run db:migrate

# 5. Start the dev server
npm run dev
```

The app runs at http://localhost:3000. The health check at http://localhost:3000/api/health confirms that the app can reach the database.

### Scripts

| Script               | Description                             |
| -------------------- | --------------------------------------- |
| `npm run dev`        | Start the development server            |
| `npm run build`      | Build for production                    |
| `npm run lint`       | Run ESLint                              |
| `npm run typecheck`  | Type-check with the TypeScript compiler |
| `npm run format`     | Format code with Prettier               |
| `npm run db:up`      | Start PostgreSQL with Docker Compose    |
| `npm run db:migrate` | Create and apply migrations (dev)       |
| `npm run db:deploy`  | Apply migrations (production)           |
| `npm run db:studio`  | Open Prisma Studio                      |

## Project structure

```
prisma/
  schema.prisma        Database schema
src/
  app/                 Next.js App Router pages and route handlers
    api/health/        Health check endpoint
  lib/
    db.ts              Prisma client singleton
    env.ts             Validated environment variables
  generated/prisma/    Generated Prisma client (git-ignored)
```
