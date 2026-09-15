import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { SUPPORTED_CURRENCIES, WELCOME_BONUS } from "@/lib/currencies";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { isUniqueViolation } from "@/server/db-errors";
import { getSystemAccount, postTransaction } from "@/server/ledger";

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailAlreadyRegisteredError";
  }
}

/**
 * Creates a user with one account per supported currency and credits the
 * welcome bonus, all in one database transaction: either everything is
 * created or nothing is.
 */
export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ id: string }> {
  // Hash before opening the transaction: scrypt is deliberately slow.
  const passwordHash = await hashPassword(input.password);

  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: input.name, email: input.email, passwordHash },
        select: { id: true },
      });

      await tx.account.createMany({
        data: SUPPORTED_CURRENCIES.map((currency) => ({
          userId: user.id,
          currencyCode: currency.code,
        })),
      });

      await creditWelcomeBonus(tx, user.id);

      return user;
    });
  } catch (error) {
    if (isUniqueViolation(error, "email")) {
      throw new EmailAlreadyRegisteredError();
    }
    throw error;
  }
}

async function creditWelcomeBonus(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const { currencyCode, amount } = WELCOME_BONUS;

  const userAccount = await tx.account.findUniqueOrThrow({
    where: { userId_currencyCode: { userId, currencyCode } },
    select: { id: true },
  });
  const treasury = await getSystemAccount(tx, "TREASURY", currencyCode);

  await postTransaction(tx, {
    type: "WELCOME_BONUS",
    initiatedById: userId,
    // Unique per user, so the bonus can never be credited twice.
    idempotencyKey: "welcome-bonus",
    description: "Welcome bonus",
    entries: [
      { accountId: userAccount.id, amount },
      { accountId: treasury.id, amount: new Prisma.Decimal(amount).neg() },
    ],
  });
}

// Checked when the email is unknown, so the response time doesn't reveal
// which emails are registered.
let dummyPasswordHash: Promise<string> | undefined;

/** Returns the user id if the credentials are valid, otherwise null. */
export async function authenticate(
  email: string,
  password: string,
): Promise<{ id: string } | null> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  if (!user) {
    dummyPasswordHash ??= hashPassword(randomBytes(16).toString("hex"));
    await verifyPassword(password, await dummyPasswordHash);
    return null;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? { id: user.id } : null;
}
