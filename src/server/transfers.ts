import "server-only";
import { db } from "@/lib/db";
import type { TransferInput } from "@/lib/validation/transfer";
import {
  exchangeEntries,
  normalizeAmount,
  prepareExchange,
  toOperationError,
  type Exchange,
} from "@/server/conversion";
import { isUniqueViolation } from "@/server/db-errors";
import { OperationError } from "@/server/errors";
import { findByIdempotencyKey } from "@/server/idempotency";
import { postTransaction } from "@/server/ledger";

export type TransferResult = {
  transactionId: string;
  recipientName: string;
  recipientEmail: string;
  from: string;
  to: string;
  fromAmount: string;
  toAmount: string;
  replayed: boolean;
};

/** Stored in the transaction metadata; read by the history page. */
export type TransferMetadata = {
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  from: string;
  to: string;
  fromAmount: string;
  toAmount: string;
  note?: string;
};

function displayName(user: { name: string | null; email: string }) {
  return user.name ?? user.email;
}

export async function findRecipient(email: string) {
  return db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });
}

async function findTransfer(
  senderId: string,
  idempotencyKey: string,
): Promise<TransferResult | null> {
  const existing = await findByIdempotencyKey(
    senderId,
    idempotencyKey,
    "TRANSFER",
  );
  if (!existing) return null;

  const metadata = existing.metadata as TransferMetadata;
  return {
    transactionId: existing.id,
    recipientName: metadata.recipientName,
    recipientEmail: metadata.recipientEmail,
    from: metadata.from,
    to: metadata.to,
    fromAmount: metadata.fromAmount,
    toAmount: metadata.toAmount,
    replayed: true,
  };
}

/**
 * Sends money to another user. In the same currency the sender's account
 * is debited and the recipient's credited directly, with no fee. In a
 * different currency the money is exchanged through the treasury, with the
 * same rates, fee and slippage protection as a conversion.
 */
export async function transferMoney(
  senderId: string,
  input: TransferInput,
): Promise<TransferResult> {
  const replay = await findTransfer(senderId, input.idempotencyKey);
  if (replay) return replay;

  const recipient = await findRecipient(input.recipientEmail);
  if (!recipient) {
    throw new OperationError(
      "RECIPIENT_NOT_FOUND",
      "There is no user with this email.",
    );
  }
  if (recipient.id === senderId) {
    throw new OperationError(
      "SELF_TRANSFER",
      "You can't send money to yourself. Use Convert to move money between your accounts.",
    );
  }

  const sender = await db.user.findUniqueOrThrow({
    where: { id: senderId },
    select: { name: true, email: true },
  });

  const exchange: Exchange | null =
    input.from === input.to ? null : await prepareExchange(input);
  const fromAmount =
    exchange?.fromAmount ?? normalizeAmount(input.from, input.amount);
  const toAmount = exchange?.toAmount ?? fromAmount;

  const metadata: TransferMetadata = {
    senderId,
    senderName: displayName(sender),
    recipientId: recipient.id,
    recipientName: displayName(recipient),
    recipientEmail: recipient.email,
    from: input.from,
    to: input.to,
    fromAmount,
    toAmount,
    note: input.note,
  };

  try {
    const transaction = await db.$transaction(async (tx) => {
      const senderAccount = await tx.account.findUniqueOrThrow({
        where: {
          userId_currencyCode: { userId: senderId, currencyCode: input.from },
        },
        select: { id: true },
      });
      const recipientAccount = await tx.account.findUniqueOrThrow({
        where: {
          userId_currencyCode: {
            userId: recipient.id,
            currencyCode: input.to,
          },
        },
        select: { id: true },
      });

      return postTransaction(tx, {
        type: "TRANSFER",
        initiatedById: senderId,
        idempotencyKey: input.idempotencyKey,
        metadata: exchange
          ? { ...metadata, exchange: exchange.details }
          : metadata,
        entries: exchange
          ? await exchangeEntries(tx, {
              from: input.from,
              to: input.to,
              fromAccountId: senderAccount.id,
              toAccountId: recipientAccount.id,
              fromAmount,
              toAmount,
            })
          : [
              { accountId: senderAccount.id, amount: `-${fromAmount}` },
              { accountId: recipientAccount.id, amount: toAmount },
            ],
      });
    });

    return {
      transactionId: transaction.id,
      recipientName: metadata.recipientName,
      recipientEmail: recipient.email,
      from: input.from,
      to: input.to,
      fromAmount,
      toAmount,
      replayed: false,
    };
  } catch (error) {
    if (isUniqueViolation(error, "idempotency_key")) {
      const replayed = await findTransfer(senderId, input.idempotencyKey);
      if (replayed) return replayed;
    }
    throw toOperationError(error, input.from);
  }
}
