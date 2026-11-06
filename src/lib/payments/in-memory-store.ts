/**
 * ShopMate AI — in-memory durable-store reference adapter (Phase 6B).
 *
 * Implements the same transactional contract as the Postgres adapter for unit
 * tests and local development. All mutations are synchronous inside a method,
 * so Node's single-threaded execution gives each operation transaction-like
 * atomicity with respect to other in-memory operations.
 *
 * This adapter is never selected in production.
 */
import { randomUUID } from "node:crypto";
import { PaymentStoreConflictError } from "./errors";
import { canTransition } from "./state-machine";
import type {
  CaptureMutationResult,
  ClaimCaptureInput,
  ClaimCaptureResult,
  CompleteCaptureInput,
  CompleteCreateOrderInput,
  CompleteCreateOrderResult,
  ExpireOrderInput,
  FailCreateOrderInput,
  ListOpenReconciliationInput,
  MarkCaptureFailedInput,
  MarkCaptureInDoubtInput,
  MarkCapturePendingInput,
  MarkCaptureRequestSentInput,
  MarkReconciliationRequiredInput,
  NewPaymentOrder,
  PaymentStore,
  ReserveCreateOrderInput,
  ReserveCreateOrderResult,
  StoredAuditLog,
  StoredIdempotency,
  StoredPaymentCapture,
  StoredPaymentOrder,
  StoredReconciliationIssue,
} from "./types";

function cloneOrder(order: StoredPaymentOrder): StoredPaymentOrder {
  return { ...order };
}

function cloneCapture(capture: StoredPaymentCapture): StoredPaymentCapture {
  return { ...capture };
}

function cloneIdempotency(record: StoredIdempotency): StoredIdempotency {
  return { ...record };
}

function cloneIssue(issue: StoredReconciliationIssue): StoredReconciliationIssue {
  return { ...issue };
}

function cloneAudit(log: StoredAuditLog): StoredAuditLog {
  return { ...log, safeMetadata: { ...log.safeMetadata } };
}

function isExpirable(order: StoredPaymentOrder): boolean {
  return order.status === "CREATED" || order.status === "APPROVED";
}

function isReconcilable(order: StoredPaymentOrder): boolean {
  return (
    order.status === "CAPTURE_IN_DOUBT" ||
    order.status === "PENDING" ||
    order.status === "RECONCILIATION_REQUIRED"
  );
}

interface CaptureUpsertResult {
  capture?: StoredPaymentCapture;
  conflict?: string;
}

export class InMemoryPaymentStore implements PaymentStore {
  readonly kind = "memory" as const;

  private orders = new Map<string, StoredPaymentOrder>();
  private captures = new Map<string, StoredPaymentCapture>(); // by PayPal order id
  private idempotency = new Map<string, StoredIdempotency>(); // scope:key
  private issues = new Map<string, StoredReconciliationIssue>();
  private auditLogs: StoredAuditLog[] = [];

  resetForTests(): void {
    this.orders.clear();
    this.captures.clear();
    this.idempotency.clear();
    this.issues.clear();
    this.auditLogs = [];
  }

  private audit(
    orderId: string,
    eventType: string,
    previousStatus: StoredPaymentOrder["status"] | null,
    newStatus: StoredPaymentOrder["status"] | null,
    nowMs: number,
    safeMetadata: Record<string, unknown> = {},
  ): void {
    this.auditLogs.push({
      id: randomUUID(),
      paypalOrderId: orderId,
      eventType,
      previousStatus,
      newStatus,
      safeMetadata,
      createdAtMs: nowMs,
    });
  }

  private openIssue(
    paypalOrderId: string,
    issueType: string,
    nowMs: number,
    safeErrorCode: string,
    nextCheckAtMs: number | null = null,
  ): StoredReconciliationIssue {
    for (const issue of this.issues.values()) {
      if (
        issue.paypalOrderId === paypalOrderId &&
        issue.issueType === issueType &&
        (issue.reconciliationStatus === "OPEN" ||
          issue.reconciliationStatus === "IN_PROGRESS")
      ) {
        issue.lastCheckedAtMs = nowMs;
        issue.safeErrorCode = safeErrorCode;
        issue.nextCheckAtMs = nextCheckAtMs;
        issue.updatedAtMs = nowMs;
        return issue;
      }
    }

    const issue: StoredReconciliationIssue = {
      id: randomUUID(),
      paypalOrderId,
      issueType,
      reconciliationStatus: "OPEN",
      attempts: 0,
      lastCheckedAtMs: nowMs,
      nextCheckAtMs,
      resolvedAtMs: null,
      safeErrorCode,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    this.issues.set(issue.id, issue);
    return issue;
  }

  private resolveIssues(paypalOrderId: string, nowMs: number): void {
    for (const issue of this.issues.values()) {
      if (
        issue.paypalOrderId === paypalOrderId &&
        (issue.reconciliationStatus === "OPEN" ||
          issue.reconciliationStatus === "IN_PROGRESS")
      ) {
        issue.reconciliationStatus = "RESOLVED";
        issue.resolvedAtMs = nowMs;
        issue.updatedAtMs = nowMs;
      }
    }
  }

  private upsertCapture(
    order: StoredPaymentOrder,
    input: {
      captureId: string;
      amountCents: number;
      currency: "USD";
      status: StoredPaymentCapture["status"];
      sellerProtectionStatus?: string | null;
      capturedAtMs: number | null;
      nowMs: number;
    },
  ): CaptureUpsertResult {
    const existing = this.captures.get(order.paypalOrderId);
    if (existing && existing.paypalCaptureId !== input.captureId) {
      return {
        conflict: `Capture ${input.captureId} does not match the recorded capture ${existing.paypalCaptureId}.`,
      };
    }
    if (existing) {
      existing.status = input.status;
      existing.amountCents = input.amountCents;
      existing.currency = input.currency;
      existing.sellerProtectionStatus =
        input.sellerProtectionStatus ?? existing.sellerProtectionStatus;
      existing.capturedAtMs = input.capturedAtMs ?? existing.capturedAtMs;
      existing.updatedAtMs = input.nowMs;
      return { capture: existing };
    }
    const capture: StoredPaymentCapture = {
      id: randomUUID(),
      paypalCaptureId: input.captureId,
      paypalOrderId: order.paypalOrderId,
      amountCents: input.amountCents,
      currency: input.currency,
      status: input.status,
      sellerProtectionStatus: input.sellerProtectionStatus ?? null,
      capturedAtMs: input.capturedAtMs,
      createdAtMs: input.nowMs,
      updatedAtMs: input.nowMs,
    };
    this.captures.set(order.paypalOrderId, capture);
    return { capture };
  }

  async createOrder(order: NewPaymentOrder): Promise<StoredPaymentOrder> {
    const existing = this.orders.get(order.paypalOrderId);
    if (existing) {
      if (existing.referenceId !== order.referenceId) {
        this.audit(
          existing.paypalOrderId,
          "ORDER_ID_REUSED",
          existing.status,
          existing.status,
          order.createdAtMs,
          { amountCents: existing.amountCents, currency: existing.currency },
        );
        this.openIssue(
          existing.paypalOrderId,
          "DUPLICATE_PAYPAL_ORDER_ID",
          order.createdAtMs,
          "paypal_order_id_reused",
        );
      }
      // Never rebind an existing PayPal order to a different cart/amount.
      return cloneOrder(existing);
    }

    const stored: StoredPaymentOrder = {
      ...order,
      id: randomUUID(),
      guestOwnerHash: order.guestOwnerHash ?? null,
      captureInDoubtAtMs: null,
      captureLeaseOwner: null,
      captureLeaseExpiresAtMs: null,
      captureRequestSentAtMs: null,
      updatedAtMs: order.createdAtMs,
      capturedAtMs: null,
    };
    this.orders.set(stored.paypalOrderId, stored);
    this.audit(
      stored.paypalOrderId,
      "ORDER_CREATED",
      null,
      stored.status,
      stored.createdAtMs,
      { amountCents: stored.amountCents, currency: stored.currency },
    );
    return cloneOrder(stored);
  }

  async reserveCreateOrder(
    input: ReserveCreateOrderInput,
  ): Promise<ReserveCreateOrderResult> {
    const key = `${input.scope}:${input.guestOwnerHash ?? "global"}:${input.idempotencyKey}`;
    const existing = this.idempotency.get(key);
    const leaseExpiresAtMs = input.nowMs + input.processingLeaseMs;

    if (!existing) {
      const record: StoredIdempotency = {
        id: randomUUID(),
        scope: input.scope,
        idempotencyKey: input.idempotencyKey,
        cartFingerprint: input.cartFingerprint,
        guestOwnerHash: input.guestOwnerHash ?? null,
        requestStatus: "PROCESSING",
        paypalOrderId: null,
        referenceId: null,
        amountCents: null,
        currency: null,
        providerOrderStatus: null,
        approvalUrl: null,
        safeErrorCode: null,
        attempts: 1,
        processingStartedAtMs: input.nowMs,
        processingLeaseExpiresAtMs: leaseExpiresAtMs,
        lastAttemptedAtMs: input.nowMs,
        retryNotBeforeMs: null,
        completedAtMs: null,
        createdAtMs: input.nowMs,
        updatedAtMs: input.nowMs,
        expiresAtMs: input.expiresAtMs,
      };
      this.idempotency.set(key, record);
      return { kind: "reserved", reservation: cloneIdempotency(record) };
    }

    // The old record's whole 30-minute window has elapsed: this is a new
    // logical request under the same key, regardless of its prior outcome.
    if (existing.expiresAtMs <= input.nowMs) {
      Object.assign(existing, {
        cartFingerprint: input.cartFingerprint,
        guestOwnerHash: input.guestOwnerHash ?? null,
        requestStatus: "PROCESSING" as const,
        paypalOrderId: null,
        referenceId: null,
        amountCents: null,
        currency: null,
        providerOrderStatus: null,
        approvalUrl: null,
        safeErrorCode: null,
        attempts: 1,
        processingStartedAtMs: input.nowMs,
        processingLeaseExpiresAtMs: leaseExpiresAtMs,
        lastAttemptedAtMs: input.nowMs,
        retryNotBeforeMs: null,
        completedAtMs: null,
        createdAtMs: input.nowMs,
        updatedAtMs: input.nowMs,
        expiresAtMs: input.expiresAtMs,
      });
      return { kind: "reserved", reservation: cloneIdempotency(existing) };
    }

    // Prevent one guest from replaying, observing, or taking over another guest's idempotency key.
    if (
      existing.guestOwnerHash &&
      input.guestOwnerHash &&
      existing.guestOwnerHash !== input.guestOwnerHash
    ) {
      return { kind: "conflict" };
    }
    if (existing.guestOwnerHash && !input.guestOwnerHash) {
      return { kind: "conflict" };
    }
    if (!existing.guestOwnerHash && input.guestOwnerHash) {
      return { kind: "conflict" };
    }

    // A key may never be silently reused for a different cart while the
    // original record is still live.
    if (existing.cartFingerprint !== input.cartFingerprint) {
      return { kind: "conflict" };
    }

    if (existing.requestStatus === "COMPLETED") {
      const order = existing.paypalOrderId
        ? this.orders.get(existing.paypalOrderId)
        : undefined;
      if (!order) return { kind: "conflict" };
      return { kind: "replay", order: cloneOrder(order) };
    }

    if (existing.requestStatus === "FAILED") {
      // A definitive failure may be retried with the same cart.
      this.takeOver(existing, input, leaseExpiresAtMs);
      return { kind: "reserved", reservation: cloneIdempotency(existing) };
    }

    // PROCESSING: honor the lease/retry window before allowing a takeover.
    if (input.nowMs < existing.processingLeaseExpiresAtMs) {
      return {
        kind: "in_progress",
        retryAfterMs: Math.max(
          1,
          existing.processingLeaseExpiresAtMs - input.nowMs,
        ),
      };
    }

    this.takeOver(existing, input, leaseExpiresAtMs);
    return { kind: "reserved", reservation: cloneIdempotency(existing) };
  }

  private takeOver(
    record: StoredIdempotency,
    input: ReserveCreateOrderInput,
    leaseExpiresAtMs: number,
  ): void {
    record.cartFingerprint = input.cartFingerprint;
    record.guestOwnerHash = input.guestOwnerHash ?? null;
    record.requestStatus = "PROCESSING";
    record.paypalOrderId = null;
    record.referenceId = null;
    record.amountCents = null;
    record.currency = null;
    record.providerOrderStatus = null;
    record.approvalUrl = null;
    record.safeErrorCode = null;
    record.attempts += 1;
    record.processingStartedAtMs = input.nowMs;
    record.processingLeaseExpiresAtMs = leaseExpiresAtMs;
    record.lastAttemptedAtMs = input.nowMs;
    record.retryNotBeforeMs = null;
    record.completedAtMs = null;
    record.updatedAtMs = input.nowMs;
    record.expiresAtMs = input.expiresAtMs;
  }

  async completeCreateOrder(
    input: CompleteCreateOrderInput,
  ): Promise<CompleteCreateOrderResult> {
    const record = [...this.idempotency.values()].find(
      (candidate) => candidate.id === input.reservationId,
    );
    if (!record) {
      throw new PaymentStoreConflictError("Unknown idempotency reservation.");
    }
    if (record.cartFingerprint !== input.order.cartFingerprint) {
      return { kind: "conflict" };
    }

    if (record.requestStatus === "COMPLETED") {
      const order = record.paypalOrderId
        ? this.orders.get(record.paypalOrderId)
        : undefined;
      if (!order) return { kind: "conflict" };
      return { kind: "replayed", order: cloneOrder(order) };
    }
    if (record.requestStatus !== "PROCESSING") {
      return { kind: "conflict" };
    }

    const existing = this.orders.get(input.order.paypalOrderId);
    if (existing && existing.referenceId !== input.order.referenceId) {
      // PayPal returned an order id this server already owns. Replay the
      // authoritative record instead of rebinding it to a different cart.
      this.audit(
        existing.paypalOrderId,
        "ORDER_ID_REUSED",
        existing.status,
        existing.status,
        input.nowMs,
        { amountCents: existing.amountCents, currency: existing.currency },
      );
      this.openIssue(
        existing.paypalOrderId,
        "DUPLICATE_PAYPAL_ORDER_ID",
        input.nowMs,
        "paypal_order_id_reused",
      );
    }

    const order: StoredPaymentOrder = existing ?? {
      ...input.order,
      id: randomUUID(),
      guestOwnerHash:
        input.order.guestOwnerHash ?? record.guestOwnerHash ?? null,
      captureInDoubtAtMs: null,
      captureLeaseOwner: null,
      captureLeaseExpiresAtMs: null,
      captureRequestSentAtMs: null,
      updatedAtMs: input.nowMs,
      capturedAtMs: null,
    };
    if (!existing) {
      this.orders.set(order.paypalOrderId, order);
    }

    record.requestStatus = "COMPLETED";
    record.paypalOrderId = order.paypalOrderId;
    record.referenceId = order.referenceId;
    record.amountCents = order.amountCents;
    record.currency = order.currency;
    record.providerOrderStatus = order.providerOrderStatus;
    record.approvalUrl = order.approvalUrl;
    record.safeErrorCode = null;
    record.retryNotBeforeMs = null;
    record.completedAtMs = input.nowMs;
    record.updatedAtMs = input.nowMs;

    if (!existing) {
      this.audit(
        order.paypalOrderId,
        "ORDER_CREATED",
        null,
        order.status,
        input.nowMs,
        { amountCents: order.amountCents, currency: order.currency },
      );
    }

    return {
      kind: existing ? "replayed" : "completed",
      order: cloneOrder(order),
    };
  }

  async failCreateOrder(input: FailCreateOrderInput): Promise<void> {
    const record = [...this.idempotency.values()].find(
      (candidate) => candidate.id === input.reservationId,
    );
    if (!record || record.requestStatus !== "PROCESSING") return;

    record.safeErrorCode = input.errorCode;
    record.lastAttemptedAtMs = input.nowMs;
    record.updatedAtMs = input.nowMs;

    if (input.retryable) {
      record.retryNotBeforeMs = input.nowMs + input.retryAfterMs;
      record.processingLeaseExpiresAtMs = input.nowMs + input.retryAfterMs;
      return;
    }

    record.requestStatus = "FAILED";
    record.completedAtMs = input.nowMs;
    record.retryNotBeforeMs = null;
    record.processingLeaseExpiresAtMs = input.nowMs;
  }

  async getOrderByPayPalId(
    orderId: string,
  ): Promise<StoredPaymentOrder | null> {
    const order = this.orders.get(orderId);
    return order ? cloneOrder(order) : null;
  }

  async getCaptureByOrderId(
    orderId: string,
  ): Promise<StoredPaymentCapture | null> {
    const capture = this.captures.get(orderId);
    return capture ? cloneCapture(capture) : null;
  }

  async claimCapture(input: ClaimCaptureInput): Promise<ClaimCaptureResult> {
    const order = this.orders.get(input.orderId);
    if (!order) return { kind: "not_found" };

    if (order.status === "COMPLETED") {
      const capture = this.captures.get(order.paypalOrderId);
      if (capture) {
        return {
          kind: "already_completed",
          order: cloneOrder(order),
          capture: cloneCapture(capture),
        };
      }
      this.openIssue(
        order.paypalOrderId,
        "COMPLETED_ORDER_WITHOUT_CAPTURE",
        input.nowMs,
        "capture_record_missing",
      );
      return { kind: "not_allowed", order: cloneOrder(order) };
    }

    if (isExpirable(order) && order.expiresAtMs <= input.nowMs) {
      const previous = order.status;
      order.status = "EXPIRED";
      order.updatedAtMs = input.nowMs;
      this.audit(
        order.paypalOrderId,
        "ORDER_EXPIRED",
        previous,
        order.status,
        input.nowMs,
      );
      return { kind: "expired", order: cloneOrder(order) };
    }

    if (isReconcilable(order)) {
      return { kind: "reconcile_only", order: cloneOrder(order) };
    }

    if (order.status === "CAPTURE_IN_PROGRESS") {
      const leaseLive =
        order.captureLeaseExpiresAtMs !== null &&
        order.captureLeaseExpiresAtMs > input.nowMs;
      if (leaseLive) {
        return {
          kind: "in_progress",
          order: cloneOrder(order),
          retryAfterMs: Math.max(
            1,
            (order.captureLeaseExpiresAtMs ?? input.nowMs) - input.nowMs,
          ),
        };
      }

      if (order.captureRequestSentAtMs !== null) {
        // The request may have reached PayPal. Never send another one.
        order.status = "CAPTURE_IN_DOUBT";
        order.captureInDoubtAtMs = input.nowMs;
        order.captureLeaseOwner = null;
        order.captureLeaseExpiresAtMs = null;
        order.updatedAtMs = input.nowMs;
        this.openIssue(
          order.paypalOrderId,
          "CAPTURE_LEASE_EXPIRED",
          input.nowMs,
          "capture_outcome_unknown",
        );
        this.audit(
          order.paypalOrderId,
          "CAPTURE_LEASE_EXPIRED",
          "CAPTURE_IN_PROGRESS",
          order.status,
          input.nowMs,
        );
        return { kind: "in_doubt", order: cloneOrder(order) };
      }

      // Claimed but the request was never sent: safe to take over.
      order.captureLeaseOwner = input.leaseOwner;
      order.captureLeaseExpiresAtMs = input.nowMs + input.leaseMs;
      order.updatedAtMs = input.nowMs;
      this.audit(
        order.paypalOrderId,
        "CAPTURE_CLAIM_RECLAIMED",
        "CAPTURE_IN_PROGRESS",
        "CAPTURE_IN_PROGRESS",
        input.nowMs,
      );
      return { kind: "claimed", order: cloneOrder(order), leaseOwner: input.leaseOwner };
    }

    if (order.status === "CREATED" || order.status === "APPROVED") {
      const previous = order.status;
      order.status = "CAPTURE_IN_PROGRESS";
      order.captureLeaseOwner = input.leaseOwner;
      order.captureLeaseExpiresAtMs = input.nowMs + input.leaseMs;
      order.captureRequestSentAtMs = null;
      order.captureInDoubtAtMs = null;
      order.updatedAtMs = input.nowMs;
      this.audit(
        order.paypalOrderId,
        "CAPTURE_CLAIMED",
        previous,
        order.status,
        input.nowMs,
      );
      return { kind: "claimed", order: cloneOrder(order), leaseOwner: input.leaseOwner };
    }

    return { kind: "not_allowed", order: cloneOrder(order) };
  }

  async markCaptureRequestSent(
    input: MarkCaptureRequestSentInput,
  ): Promise<boolean> {
    const order = this.orders.get(input.orderId);
    if (
      !order ||
      order.status !== "CAPTURE_IN_PROGRESS" ||
      order.captureLeaseOwner !== input.leaseOwner
    ) {
      return false;
    }
    order.captureRequestSentAtMs = input.nowMs;
    order.updatedAtMs = input.nowMs;
    return true;
  }

  private finishCapture(
    order: StoredPaymentOrder,
    leaseOwner: string | undefined,
    nowMs: number,
  ): boolean {
    if (order.status === "COMPLETED") return true;
    if (!canTransition(order.status, "COMPLETED")) return false;
    if (
      leaseOwner !== undefined &&
      order.captureLeaseOwner !== null &&
      order.captureLeaseOwner !== leaseOwner
    ) {
      return false;
    }
    order.status = "COMPLETED";
    order.capturedAtMs = nowMs;
    order.captureInDoubtAtMs = null;
    order.captureLeaseOwner = null;
    order.captureLeaseExpiresAtMs = null;
    order.captureRequestSentAtMs = null;
    order.updatedAtMs = nowMs;
    return true;
  }

  async completeCapture(
    input: CompleteCaptureInput,
  ): Promise<CaptureMutationResult> {
    const order = this.orders.get(input.orderId);
    if (!order) throw new PaymentStoreConflictError("Unknown payment order.");

    const existing = this.captures.get(order.paypalOrderId);
    if (order.status === "COMPLETED") {
      if (existing && existing.paypalCaptureId === input.capture.captureId) {
        return { order: cloneOrder(order), capture: cloneCapture(existing) };
      }
      this.openIssue(
        order.paypalOrderId,
        "CAPTURE_VERIFICATION_MISMATCH",
        input.nowMs,
        "completed_order_capture_conflict",
      );
      return {
        order: cloneOrder(order),
        ...(existing ? { capture: cloneCapture(existing) } : {}),
        conflictReason: "completed_order_capture_conflict",
      };
    }

    if (!this.finishCapture(order, input.leaseOwner, input.nowMs)) {
      return {
        order: cloneOrder(order),
        conflictReason: "capture_not_completable",
      };
    }

    const upsert = this.upsertCapture(order, {
      captureId: input.capture.captureId,
      amountCents: input.capture.amountCents,
      currency: input.capture.currency,
      status: "COMPLETED",
      sellerProtectionStatus: input.capture.sellerProtectionStatus,
      capturedAtMs: input.capture.capturedAtMs ?? input.nowMs,
      nowMs: input.nowMs,
    });

    if (upsert.conflict) {
      this.openIssue(
        order.paypalOrderId,
        "CAPTURE_VERIFICATION_MISMATCH",
        input.nowMs,
        "capture_identity_conflict",
      );
      return {
        order: cloneOrder(order),
        conflictReason: upsert.conflict,
      };
    }

    this.resolveIssues(order.paypalOrderId, input.nowMs);
    this.audit(
      order.paypalOrderId,
      "CAPTURE_COMPLETED",
      "CAPTURE_IN_PROGRESS",
      "COMPLETED",
      input.nowMs,
      {
        amountCents: input.capture.amountCents,
        currency: input.capture.currency,
      },
    );
    return {
      order: cloneOrder(order),
      ...(upsert.capture ? { capture: cloneCapture(upsert.capture) } : {}),
    };
  }

  async markCapturePending(
    input: MarkCapturePendingInput,
  ): Promise<CaptureMutationResult> {
    const order = this.orders.get(input.orderId);
    if (!order) throw new PaymentStoreConflictError("Unknown payment order.");

    if (order.status === "COMPLETED") {
      const existing = this.captures.get(order.paypalOrderId);
      return {
        order: cloneOrder(order),
        ...(existing ? { capture: cloneCapture(existing) } : {}),
        conflictReason: "capture_already_completed",
      };
    }

    const previous = order.status;
    if (!canTransition(order.status, "PENDING")) {
      return {
        order: cloneOrder(order),
        conflictReason: "capture_not_markable_pending",
      };
    }
    order.status = "PENDING";
    order.providerOrderStatus = input.summary.captureStatus;
    order.captureInDoubtAtMs = null;
    order.captureLeaseOwner = null;
    order.captureLeaseExpiresAtMs = null;
    order.captureRequestSentAtMs = null;
    order.updatedAtMs = input.nowMs;

    let capture: StoredPaymentCapture | undefined;
    if (input.summary.captureId) {
      const upsert = this.upsertCapture(order, {
        captureId: input.summary.captureId,
        amountCents: input.summary.amountCents ?? order.amountCents,
        currency: "USD",
        status: "PENDING",
        capturedAtMs: null,
        nowMs: input.nowMs,
      });
      capture = upsert.capture;
    }

    this.openIssue(
      order.paypalOrderId,
      "CAPTURE_PENDING",
      input.nowMs,
      input.errorCode,
      input.nowMs + 5 * 60_000,
    );
    this.audit(
      order.paypalOrderId,
      "CAPTURE_PENDING",
      previous,
      order.status,
      input.nowMs,
      { errorCode: input.errorCode, captureStatus: input.summary.captureStatus },
    );

    return {
      order: cloneOrder(order),
      ...(capture ? { capture: cloneCapture(capture) } : {}),
    };
  }

  async markCaptureFailed(
    input: MarkCaptureFailedInput,
  ): Promise<CaptureMutationResult> {
    const order = this.orders.get(input.orderId);
    if (!order) throw new PaymentStoreConflictError("Unknown payment order.");

    if (order.status === "COMPLETED") {
      const existing = this.captures.get(order.paypalOrderId);
      return {
        order: cloneOrder(order),
        ...(existing ? { capture: cloneCapture(existing) } : {}),
        conflictReason: "capture_already_completed",
      };
    }

    const previous = order.status;
    if (!canTransition(order.status, "FAILED")) {
      return { order: cloneOrder(order), conflictReason: "capture_not_failable" };
    }
    order.status = "FAILED";
    order.providerOrderStatus = input.providerStatus;
    order.captureInDoubtAtMs = null;
    order.captureLeaseOwner = null;
    order.captureLeaseExpiresAtMs = null;
    order.captureRequestSentAtMs = null;
    order.updatedAtMs = input.nowMs;

    let capture: StoredPaymentCapture | undefined;
    if (input.summary.captureId) {
      const upsert = this.upsertCapture(order, {
        captureId: input.summary.captureId,
        amountCents: input.summary.amountCents ?? order.amountCents,
        currency: "USD",
        status: input.providerStatus === "DENIED" ? "DENIED" : "FAILED",
        capturedAtMs: null,
        nowMs: input.nowMs,
      });
      capture = upsert.capture;
    }

    this.resolveIssues(order.paypalOrderId, input.nowMs);
    this.audit(
      order.paypalOrderId,
      "CAPTURE_FAILED",
      previous,
      order.status,
      input.nowMs,
      { errorCode: input.errorCode, captureStatus: input.providerStatus },
    );

    return {
      order: cloneOrder(order),
      ...(capture ? { capture: cloneCapture(capture) } : {}),
    };
  }

  async markCaptureInDoubt(
    input: MarkCaptureInDoubtInput,
  ): Promise<CaptureMutationResult> {
    const order = this.orders.get(input.orderId);
    if (!order) throw new PaymentStoreConflictError("Unknown payment order.");

    if (order.status === "COMPLETED") {
      const existing = this.captures.get(order.paypalOrderId);
      return {
        order: cloneOrder(order),
        ...(existing ? { capture: cloneCapture(existing) } : {}),
        conflictReason: "capture_already_completed",
      };
    }

    const previous = order.status;
    if (canTransition(order.status, "CAPTURE_IN_DOUBT")) {
      order.status = "CAPTURE_IN_DOUBT";
    }
    order.captureInDoubtAtMs = order.captureInDoubtAtMs ?? input.nowMs;
    order.captureLeaseOwner = null;
    order.captureLeaseExpiresAtMs = null;
    order.updatedAtMs = input.nowMs;

    this.openIssue(
      order.paypalOrderId,
      input.issueType,
      input.nowMs,
      input.errorCode,
      input.nowMs + 30_000,
    );
    this.audit(
      order.paypalOrderId,
      "CAPTURE_IN_DOUBT",
      previous,
      order.status,
      input.nowMs,
      { issueType: input.issueType, errorCode: input.errorCode },
    );
    return { order: cloneOrder(order) };
  }

  async markReconciliationRequired(
    input: MarkReconciliationRequiredInput,
  ): Promise<CaptureMutationResult> {
    const order = this.orders.get(input.orderId);
    if (!order) throw new PaymentStoreConflictError("Unknown payment order.");

    const previous = order.status;
    if (canTransition(order.status, "RECONCILIATION_REQUIRED")) {
      order.status = "RECONCILIATION_REQUIRED";
    }
    order.captureInDoubtAtMs = order.captureInDoubtAtMs ?? input.nowMs;
    order.captureLeaseOwner = null;
    order.captureLeaseExpiresAtMs = null;
    order.updatedAtMs = input.nowMs;

    let capture: StoredPaymentCapture | undefined;
    if (input.summary.captureId) {
      const upsert = this.upsertCapture(order, {
        captureId: input.summary.captureId,
        amountCents: input.summary.amountCents ?? order.amountCents,
        currency: "USD",
        status: "UNVERIFIED_COMPLETED",
        capturedAtMs: input.nowMs,
        nowMs: input.nowMs,
      });
      capture = upsert.capture;
    }

    this.openIssue(
      order.paypalOrderId,
      input.issueType,
      input.nowMs,
      input.errorCode,
      input.nowMs + 60_000,
    );
    this.audit(
      order.paypalOrderId,
      "RECONCILIATION_REQUIRED",
      previous,
      order.status,
      input.nowMs,
      {
        issueType: input.issueType,
        errorCode: input.errorCode,
        hasCapture: input.summary.captureId !== null,
      },
    );
    return {
      order: cloneOrder(order),
      ...(capture ? { capture: cloneCapture(capture) } : {}),
    };
  }

  async expireOrder(
    input: ExpireOrderInput,
  ): Promise<StoredPaymentOrder | null> {
    const order = this.orders.get(input.orderId);
    if (!order) return null;
    if (order.status === "EXPIRED") return cloneOrder(order);
    if (!isExpirable(order) || order.expiresAtMs > input.nowMs) return null;

    const previous = order.status;
    order.status = "EXPIRED";
    order.updatedAtMs = input.nowMs;
    this.audit(
      order.paypalOrderId,
      "ORDER_EXPIRED",
      previous,
      order.status,
      input.nowMs,
    );
    return cloneOrder(order);
  }

  async listOpenReconciliation(
    input: ListOpenReconciliationInput,
  ): Promise<StoredReconciliationIssue[]> {
    return [...this.issues.values()]
      .filter(
        (issue) =>
          (issue.reconciliationStatus === "OPEN" ||
            issue.reconciliationStatus === "IN_PROGRESS") &&
          (issue.nextCheckAtMs === null ||
            issue.nextCheckAtMs <= input.nowMs),
      )
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .slice(0, input.limit)
      .map(cloneIssue);
  }

  async getAuditLogs(orderId: string): Promise<StoredAuditLog[]> {
    return this.auditLogs
      .filter((log) => log.paypalOrderId === orderId)
      .map(cloneAudit);
  }
}

export const inMemoryPaymentStore = new InMemoryPaymentStore();
