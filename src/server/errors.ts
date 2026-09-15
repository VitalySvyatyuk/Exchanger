import "server-only";

export type OperationErrorCode =
  | "INSUFFICIENT_FUNDS"
  | "AMOUNT_TOO_SMALL"
  | "RATE_CHANGED"
  | "RECIPIENT_NOT_FOUND"
  | "SELF_TRANSFER"
  | "LOT_NOT_FOUND"
  | "LOT_NOT_AVAILABLE"
  | "OWN_LOT";

/**
 * An expected business rule violation. Its message is safe to show to the
 * user; any other error is logged and shown as a generic failure.
 */
export class OperationError extends Error {
  constructor(
    readonly code: OperationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OperationError";
  }
}
