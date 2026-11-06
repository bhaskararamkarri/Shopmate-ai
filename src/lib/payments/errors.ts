/**
 * ShopMate AI — payment store errors (Phase 6B).
 *
 * These errors are server-only and deliberately contain no connection string,
 * credential, token, or upstream payload.
 */

export type PaymentStoreErrorCode =
  | "payment_store_unavailable"
  | "payment_store_conflict"
  | "payment_store_corrupt";

export class PaymentStoreError extends Error {
  readonly code: PaymentStoreErrorCode;

  constructor(code: PaymentStoreErrorCode, message: string) {
    super(message);
    this.name = "PaymentStoreError";
    this.code = code;
  }
}

export class PaymentStoreUnavailableError extends PaymentStoreError {
  constructor(message = "The durable payment store is not configured.") {
    super("payment_store_unavailable", message);
    this.name = "PaymentStoreUnavailableError";
  }
}

export class PaymentStoreConflictError extends PaymentStoreError {
  constructor(message = "The payment store rejected a conflicting write.") {
    super("payment_store_conflict", message);
    this.name = "PaymentStoreConflictError";
  }
}
