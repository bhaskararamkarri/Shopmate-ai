/**
 * ShopMate AI — durable payment domain types (Phase 6B).
 *
 * These types are the server-only contract between the PayPal services and the
 * payment store. They deliberately contain no PayPal credentials, OAuth tokens,
 * capture tokens, or raw upstream payloads.
 */

export const PAYMENT_STATUSES = [
  "CREATED",
  "APPROVED",
  "CAPTURE_IN_PROGRESS",
  "CAPTURE_IN_DOUBT",
  "PENDING",
  "COMPLETED",
  "FAILED",
  "RECONCILIATION_REQUIRED",
  "EXPIRED",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const CAPTURE_STATUSES = [
  "COMPLETED",
  "PENDING",
  "DENIED",
  "FAILED",
  "UNVERIFIED_COMPLETED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;

export type PaymentCaptureStatus = (typeof CAPTURE_STATUSES)[number];

export type IdempotencyStatus = "PROCESSING" | "COMPLETED" | "FAILED";

export type ReconciliationStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "IGNORED";

export interface StoredPaymentOrder {
  id: string;
  paypalOrderId: string;
  referenceId: string;
  amountCents: number;
  currency: "USD";
  status: PaymentStatus;
  captureTokenHash: string;
  cartFingerprint: string;
  guestOwnerHash: string | null;
  idempotencyKey: string | null;
  approvalUrl: string | null;
  providerOrderStatus: string | null;
  captureInDoubtAtMs: number | null;
  captureLeaseOwner: string | null;
  captureLeaseExpiresAtMs: number | null;
  captureRequestSentAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
  expiresAtMs: number;
  capturedAtMs: number | null;
}

export interface StoredPaymentCapture {
  id: string;
  paypalCaptureId: string;
  paypalOrderId: string;
  amountCents: number;
  currency: "USD";
  status: PaymentCaptureStatus;
  sellerProtectionStatus: string | null;
  capturedAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface StoredIdempotency {
  id: string;
  scope: "create_order";
  idempotencyKey: string;
  cartFingerprint: string;
  guestOwnerHash: string | null;
  requestStatus: IdempotencyStatus;
  paypalOrderId: string | null;
  referenceId: string | null;
  amountCents: number | null;
  currency: "USD" | null;
  providerOrderStatus: string | null;
  approvalUrl: string | null;
  safeErrorCode: string | null;
  attempts: number;
  processingStartedAtMs: number;
  /** The in-flight lease; an expired lease may be taken over. */
  processingLeaseExpiresAtMs: number;
  lastAttemptedAtMs: number;
  retryNotBeforeMs: number | null;
  completedAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
  expiresAtMs: number;
}

export interface StoredReconciliationIssue {
  id: string;
  paypalOrderId: string;
  issueType: string;
  reconciliationStatus: ReconciliationStatus;
  attempts: number;
  lastCheckedAtMs: number | null;
  nextCheckAtMs: number | null;
  resolvedAtMs: number | null;
  safeErrorCode: string | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface StoredAuditLog {
  id: string;
  paypalOrderId: string;
  eventType: string;
  previousStatus: PaymentStatus | null;
  newStatus: PaymentStatus | null;
  safeMetadata: Record<string, unknown>;
  createdAtMs: number;
}

export interface NewPaymentOrder {
  paypalOrderId: string;
  referenceId: string;
  amountCents: number;
  currency: "USD";
  status: "CREATED";
  captureTokenHash: string;
  cartFingerprint: string;
  guestOwnerHash?: string | null;
  idempotencyKey: string | null;
  approvalUrl: string | null;
  providerOrderStatus: string | null;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface VerifiedCapture {
  captureId: string;
  status: "COMPLETED";
  amountCents: number;
  currency: "USD";
  referenceId: string;
  sellerProtectionStatus: string | null;
  capturedAtMs: number | null;
}

export interface ProviderCaptureSummary {
  captureId: string | null;
  captureStatus: string | null;
  amountCents: number | null;
  currency: string | null;
  referenceId: string | null;
}

export interface ReserveCreateOrderInput {
  scope: "create_order";
  idempotencyKey: string;
  cartFingerprint: string;
  guestOwnerHash?: string | null;
  nowMs: number;
  expiresAtMs: number;
  processingLeaseMs: number;
}

export type ReserveCreateOrderResult =
  | { kind: "reserved"; reservation: StoredIdempotency }
  | { kind: "replay"; order: StoredPaymentOrder }
  | { kind: "in_progress"; retryAfterMs: number }
  | { kind: "conflict" };

export interface CompleteCreateOrderInput {
  reservationId: string;
  order: NewPaymentOrder;
  nowMs: number;
}

export type CompleteCreateOrderResult =
  | { kind: "completed"; order: StoredPaymentOrder }
  | { kind: "replayed"; order: StoredPaymentOrder }
  | { kind: "conflict" };

export interface FailCreateOrderInput {
  reservationId: string;
  errorCode: string;
  /** Ambiguous failures stay PROCESSING and become retryable later. */
  retryable: boolean;
  retryAfterMs: number;
  nowMs: number;
}

export interface ClaimCaptureInput {
  orderId: string;
  leaseOwner: string;
  nowMs: number;
  leaseMs: number;
}

export type ClaimCaptureResult =
  | { kind: "claimed"; order: StoredPaymentOrder; leaseOwner: string }
  | {
      kind: "already_completed";
      order: StoredPaymentOrder;
      capture: StoredPaymentCapture;
    }
  | { kind: "in_progress"; order: StoredPaymentOrder; retryAfterMs: number }
  | { kind: "in_doubt"; order: StoredPaymentOrder }
  | { kind: "reconcile_only"; order: StoredPaymentOrder }
  | { kind: "expired"; order: StoredPaymentOrder }
  | { kind: "not_allowed"; order: StoredPaymentOrder }
  | { kind: "not_found" };

export interface MarkCaptureRequestSentInput {
  orderId: string;
  leaseOwner: string;
  nowMs: number;
}

export interface CompleteCaptureInput {
  orderId: string;
  leaseOwner?: string;
  capture: VerifiedCapture;
  nowMs: number;
}

export interface MarkCapturePendingInput {
  orderId: string;
  leaseOwner?: string;
  summary: ProviderCaptureSummary;
  errorCode: string;
  nowMs: number;
}

export interface MarkCaptureFailedInput {
  orderId: string;
  leaseOwner?: string;
  summary: ProviderCaptureSummary;
  providerStatus: "DENIED" | "FAILED";
  errorCode: string;
  nowMs: number;
}

export interface MarkCaptureInDoubtInput {
  orderId: string;
  leaseOwner?: string;
  issueType: string;
  errorCode: string;
  nowMs: number;
}

export interface MarkReconciliationRequiredInput {
  orderId: string;
  leaseOwner?: string;
  issueType: string;
  errorCode: string;
  summary: ProviderCaptureSummary;
  nowMs: number;
}

export interface CaptureMutationResult {
  order: StoredPaymentOrder;
  capture?: StoredPaymentCapture;
  /** Present when the store refused a conflicting terminal state. */
  conflictReason?: string;
}

export interface ExpireOrderInput {
  orderId: string;
  nowMs: number;
}

export interface ListOpenReconciliationInput {
  nowMs: number;
  limit: number;
}

export interface PaymentStore {
  readonly kind: "memory" | "postgres" | "unavailable";

  /** Persists an order created without an Idempotency-Key. */
  createOrder(order: NewPaymentOrder): Promise<StoredPaymentOrder>;

  reserveCreateOrder(
    input: ReserveCreateOrderInput,
  ): Promise<ReserveCreateOrderResult>;

  completeCreateOrder(
    input: CompleteCreateOrderInput,
  ): Promise<CompleteCreateOrderResult>;

  failCreateOrder(input: FailCreateOrderInput): Promise<void>;

  getOrderByPayPalId(orderId: string): Promise<StoredPaymentOrder | null>;

  getCaptureByOrderId(
    orderId: string,
  ): Promise<StoredPaymentCapture | null>;

  claimCapture(input: ClaimCaptureInput): Promise<ClaimCaptureResult>;

  markCaptureRequestSent(
    input: MarkCaptureRequestSentInput,
  ): Promise<boolean>;

  completeCapture(
    input: CompleteCaptureInput,
  ): Promise<CaptureMutationResult>;

  markCapturePending(
    input: MarkCapturePendingInput,
  ): Promise<CaptureMutationResult>;

  markCaptureFailed(
    input: MarkCaptureFailedInput,
  ): Promise<CaptureMutationResult>;

  markCaptureInDoubt(
    input: MarkCaptureInDoubtInput,
  ): Promise<CaptureMutationResult>;

  markReconciliationRequired(
    input: MarkReconciliationRequiredInput,
  ): Promise<CaptureMutationResult>;

  expireOrder(input: ExpireOrderInput): Promise<StoredPaymentOrder | null>;

  listOpenReconciliation(
    input: ListOpenReconciliationInput,
  ): Promise<StoredReconciliationIssue[]>;

  getAuditLogs(orderId: string): Promise<StoredAuditLog[]>;

  /** Test isolation only. The Postgres adapter refuses to run this. */
  resetForTests(): void;
}
