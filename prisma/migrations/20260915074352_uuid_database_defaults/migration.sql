-- Generate UUIDs in PostgreSQL rather than in the Prisma client, so rows
-- inserted with raw SQL (scripts, data migrations) get ids too.


-- AlterTable
ALTER TABLE "accounts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "lots" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
