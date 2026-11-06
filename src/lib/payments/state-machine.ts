/**
 * ShopMate AI — explicit payment state machine (Phase 6B).
 *
 * The same transition table is enforced in TypeScript and in the database
 * migration (`payment_order_transition_allowed`). Keeping both copies aligned
 * means an application bug cannot write an impossible financial state, and a
 * direct SQL update cannot bypass the rules either.
 */
import type { PaymentStatus } from "./types";

const ALLOWED: Record<PaymentStatus, ReadonlySet<PaymentStatus>> = {
  CREATED: new Set(["APPROVED", "CAPTURE_IN_PROGRESS", "EXPIRED", "FAILED"]),
  APPROVED: new Set(["CAPTURE_IN_PROGRESS", "EXPIRED", "FAILED"]),
  CAPTURE_IN_PROGRESS: new Set([
    "CAPTURE_IN_PROGRESS", // lease renewal / re-claim before a request is sent
    "CAPTURE_IN_DOUBT",
    "PENDING",
    "COMPLETED",
    "FAILED",
    "RECONCILIATION_REQUIRED",
  ]),
  CAPTURE_IN_DOUBT: new Set([
    "CAPTURE_IN_DOUBT",
    "PENDING",
    "COMPLETED",
    "FAILED",
    "RECONCILIATION_REQUIRED",
  ]),
  PENDING: new Set([
    "PENDING",
    "COMPLETED",
    "FAILED",
    "RECONCILIATION_REQUIRED",
  ]),
  COMPLETED: new Set(["COMPLETED"]),
  FAILED: new Set(["FAILED"]),
  RECONCILIATION_REQUIRED: new Set([
    "RECONCILIATION_REQUIRED",
    "CAPTURE_IN_DOUBT",
    "PENDING",
    "COMPLETED",
    "FAILED",
  ]),
  EXPIRED: new Set(["EXPIRED"]),
};

export class PaymentStateError extends Error {
  readonly from: PaymentStatus;
  readonly to: PaymentStatus;

  constructor(from: PaymentStatus, to: PaymentStatus) {
    super(`Invalid payment state transition: ${from} -> ${to}`);
    this.name = "PaymentStateError";
    this.from = from;
    this.to = to;
  }
}

export function canTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return ALLOWED[from].has(to);
}

export function assertTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): void {
  if (!canTransition(from, to)) throw new PaymentStateError(from, to);
}

export function isTerminalStatus(status: PaymentStatus): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "EXPIRED";
}

/** A capture may only be started from a state that has never been in flight. */
export function canStartCapture(status: PaymentStatus): boolean {
  return status === "CREATED" || status === "APPROVED";
}

/** States that must be resolved with read-only PayPal calls, never a new POST. */
export function requiresReadOnlyReconciliation(status: PaymentStatus): boolean {
  return (
    status === "CAPTURE_IN_DOUBT" ||
    status === "PENDING" ||
    status === "RECONCILIATION_REQUIRED"
  );
}

/** The 30-minute demo capability window applies only before a capture starts. */
export function isExpirableStatus(status: PaymentStatus): boolean {
  return status === "CREATED" || status === "APPROVED";
}
