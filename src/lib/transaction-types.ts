import type { TransactionType } from "@/generated/prisma/enums";

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  WELCOME_BONUS: "Welcome bonus",
  CONVERSION: "Conversion",
  TRANSFER: "Transfer",
  LOT_HOLD: "Lot created",
  LOT_PURCHASE: "Lot purchase",
  LOT_CANCEL: "Lot cancelled",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
};
