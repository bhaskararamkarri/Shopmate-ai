/**
 * ShopMate AI — PayPal Sandbox Capture service (Phase 6B).
 *
 * Server-side only. Buyer approval is not payment. This module captures an
 * approved order and reports success only after it has verified ALL of:
 *   - the PayPal order id matches the order this server created,
 *   - the purchase unit reference_id matches the server-generated reference,
 *   - the capture status and order status are COMPLETED,
 *   - the captured currency is USD,
 *   - the captured amount exactly equals the server-recalculated total.
 *
 * The browser supplies only the order id (route parameter) and the opaque
 * capture token issued when the order was created. It can never supply the
 * authoritative amount or currency. The database stores only the token hash.
 *
 * Durability (Phase 6B):
 *   * A short transaction claims the capture with CAPTURE_IN_PROGRESS and a
 *     lease. A live lease returns 202; an expired lease that never sent a
 *     request is safely re-claimable.
 *   * `capture_request_sent_at` records the moment before the POST. If that
 *     lease expires, the order becomes CAPTURE_IN_DOUBT and only read-only
 *     reconciliation is allowed — never a second capture.
 *
 * Flow (PayPal Orders v2):
 *   POST https://api-m.sandbox.paypal.com/v2/checkout/orders/{id}/capture
 *   Authorization: Bearer <token from ./auth>
 *   PayPal-Request-Id: stable per order for upstream deduplication
 *
 * No access token, client credential, Authorization header, or raw upstream
 * payload is ever returned or logged.
 */
import { randomUUID } from "node:crypto";
import {
  captureTokenMatches,
  deriveCaptureToken,
  hashCaptureToken,
  isValidCaptureToken,
} from "@/lib/payments/capture-token";
import { PaymentStoreError } from "@/lib/payments/errors";
import { formatCents, parseUsdToCents } from "@/lib/payments/money";
import { getPaymentStore } from "@/lib/payments/store";
import type {
  PaymentStore,
  ProviderCaptureSummary,
  StoredPaymentOrder,
  VerifiedCapture,
} from "@/lib/payments/types";
import { getPayPalAccessToken, PayPalAuthError } from "./auth";
import { isValidPayPalOrderId } from "./orders";

// Hard guard: a client bundle that somehow imports this module fails loudly
// at module evaluation instead of shipping secret-reading code.
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/paypal/capture is server-only; do not import it from client code",
  );
}

const SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";
const REQUEST_TIMEOUT_MS = 15_000;

/** How long one capture attempt may hold the database lease. */
const CAPTURE_LEASE_MS = 60_000;

const APPROVED_STATUSES = new Set([
  "APPROVED",
  "CREATED",
  "PAYER_ACTION_REQUIRED",
  "SAVED",
]);

const DENIED_STATUSES = new Set(["DENIED", "DECLINED", "FAILED"]);

/**
 * Outcomes that are not trustworthy enough to report as final. Each one is
 * reconciled with a read-only order lookup before the buyer is told anything.
 */
const RECONCILABLE_CAPTURE_ERRORS = new Set<PayPalCaptureErrorCode>([
  "paypal_timeout",
  "paypal_unavailable",
  "paypal_capture_failed",
  "capture_not_allowed",
  "paypal_malformed_response",
  "order_id_mismatch",
  "purchase_unit_mismatch",
  "amount_mismatch",
  "currency_mismatch",
  "capture_verification_failed",
]);

const VERIFICATION_MISMATCH_CODES = new Set<PayPalCaptureErrorCode>([
  "order_id_mismatch",
  "purchase_unit_mismatch",
  "amount_mismatch",
  "currency_mismatch",
  "capture_verification_failed",
]);

export { isValidCaptureToken };

export type PayPalCaptureErrorCode =
  | "invalid_order_id"
  | "invalid_capture_token"
  | "order_not_found"
  | "capture_not_allowed"
  | "capture_pending"
  | "capture_denied"
  | "order_id_mismatch"
  | "purchase_unit_mismatch"
  | "amount_mismatch"
  | "currency_mismatch"
  | "capture_verification_failed"
  | "payment_status_unknown"
  | "payment_store_unavailable"
  | "paypal_not_configured"
  | "paypal_unsupported_environment"
  | "paypal_auth_failed"
  | "paypal_unavailable"
  | "paypal_malformed_response"
  | "paypal_capture_failed"
  | "paypal_timeout"
  | "internal_error";

/** Sanitized, typed failure — safe to log and map to HTTP statuses. */
export class PayPalCaptureError extends Error {
  readonly code: PayPalCaptureErrorCode;
  /** Safe PayPal capture/order status, when one was parsed. */
  readonly captureStatus?: string;
  /** Upstream HTTP status when the failure came from a PayPal response. */
  readonly upstreamStatus?: number;

  constructor(
    code: PayPalCaptureErrorCode,
    message: string,
    options: { captureStatus?: string; upstreamStatus?: number } = {},
  ) {
    super(message);
    this.name = "PayPalCaptureError";
    this.code = code;
    this.captureStatus = options.captureStatus;
    this.upstreamStatus = options.upstreamStatus;
  }
}

export interface PayPalCaptureResult {
  success: true;
  environment: "sandbox";
  demo: true;
  orderId: string;
  captureId: string;
  status: "COMPLETED";
  amount: { currency: "USD"; value: string };
  referenceId: string;
  /** True when this is an idempotent replay of an earlier verified capture. */
  alreadyCaptured: boolean;
}

/**
 * Per-order serialization inside one Node.js process. The database lease is
 * the cross-instance authority; this lock makes two local HTTP requests share
 * one upstream capture and always re-check ownership separately.
 */
const localLocks = new Map<string, Promise<void>>();

/** Clears in-process capture coordination — test isolation only. */
export function resetPayPalCaptureStateForTests(): void {
  localLocks.clear();
}

async function withOrderLock<T>(
  orderId: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = localLocks.get(orderId) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => gate);
  localLocks.set(orderId, chained);

  await previous.catch(() => {});
  try {
    return await work();
  } finally {
    release();
    if (localLocks.get(orderId) === chained) localLocks.delete(orderId);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function malformedResponse(): PayPalCaptureError {
  return new PayPalCaptureError(
    "paypal_malformed_response",
    "PayPal Sandbox returned an unexpected capture response.",
  );
}

function mapAuthError(error: unknown): never {
  if (error instanceof PayPalAuthError) {
    if (
      error.code === "paypal_not_configured" ||
      error.code === "paypal_unsupported_environment"
    ) {
      throw new PayPalCaptureError(
        error.code,
        error.code === "paypal_not_configured"
          ? "PayPal credentials are not configured."
          : "PAYPAL_ENV must be sandbox.",
        { upstreamStatus: error.upstreamStatus },
      );
    }
    throw new PayPalCaptureError(
      error.code,
      "PayPal Sandbox authentication failed.",
      { upstreamStatus: error.upstreamStatus },
    );
  }
  throw new PayPalCaptureError(
    "paypal_auth_failed",
    "PayPal Sandbox authentication failed.",
  );
}

function statusFailure(
  status: string,
  fallbackMessage: string,
): PayPalCaptureError {
  if (status === "PENDING") {
    return new PayPalCaptureError(
      "capture_pending",
      "PayPal is still processing this capture. Payment is not complete yet.",
      { captureStatus: status },
    );
  }
  if (DENIED_STATUSES.has(status)) {
    return new PayPalCaptureError(
      "capture_denied",
      "PayPal denied this capture. No payment was taken.",
      { captureStatus: status },
    );
  }
  if (APPROVED_STATUSES.has(status)) {
    return new PayPalCaptureError(
      "capture_pending",
      "PayPal has not completed this capture yet. Payment is not complete.",
      { captureStatus: status },
    );
  }
  return new PayPalCaptureError(
    "capture_verification_failed",
    fallbackMessage,
    { captureStatus: status },
  );
}

/** Requests one capture; returns the parsed, still-untrusted response body. */
async function requestCapture(
  orderId: string,
  accessToken: string,
): Promise<unknown> {
  const url = `${SANDBOX_API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        // Stable per order: a retry cannot create a second capture upstream.
        "PayPal-Request-Id": `shopmate-capture-${orderId}`,
      },
      body: "{}",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new PayPalCaptureError(
        "paypal_timeout",
        "PayPal Sandbox did not respond to the capture in time.",
      );
    }
    throw new PayPalCaptureError(
      "paypal_unavailable",
      "Could not reach the PayPal Sandbox capture endpoint.",
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new PayPalCaptureError(
        "paypal_auth_failed",
        "PayPal rejected the sandbox credentials.",
        { upstreamStatus: response.status },
      );
    }
    if (response.status >= 500) {
      throw new PayPalCaptureError(
        "paypal_unavailable",
        "PayPal Sandbox capture endpoint failed.",
        { upstreamStatus: response.status },
      );
    }
    if (response.status === 422) {
      throw new PayPalCaptureError(
        "capture_not_allowed",
        "PayPal did not accept this capture. The order may not be approved yet.",
        { upstreamStatus: response.status },
      );
    }
    throw new PayPalCaptureError(
      "paypal_capture_failed",
      "PayPal Sandbox rejected the capture.",
      { upstreamStatus: response.status },
    );
  }

  try {
    return await response.json();
  } catch {
    throw malformedResponse();
  }
}

/**
 * Extracts safe, typed fields from a PayPal order/capture response. This is
 * used only to persist a reconciliation summary; it never decides success.
 */
function summarizeCaptureResponse(payload: unknown): ProviderCaptureSummary {
  const empty: ProviderCaptureSummary = {
    captureId: null,
    captureStatus: null,
    amountCents: null,
    currency: null,
    referenceId: null,
  };
  if (!isRecord(payload)) return empty;

  const purchaseUnits = payload.purchase_units;
  if (!Array.isArray(purchaseUnits)) return empty;

  for (const candidate of purchaseUnits) {
    if (!isRecord(candidate)) continue;
    const referenceId = readString(candidate.reference_id);
    const payments = candidate.payments;
    const captures =
      isRecord(payments) && Array.isArray(payments.captures)
        ? payments.captures
        : [];
    if (captures.length === 0) continue;

    const capture = captures[0];
    if (!isRecord(capture)) continue;
    const amount = isRecord(capture.amount) ? capture.amount : null;
    const value = amount ? readString(amount.value) : null;

    return {
      captureId: readString(capture.id),
      captureStatus: readString(capture.status)?.toUpperCase() ?? null,
      amountCents: value === null ? null : parseUsdToCents(value),
      currency: amount ? readString(amount.currency_code) : null,
      referenceId,
    };
  }
  return empty;
}

/**
 * Verifies the PayPal capture response against the durable order record.
 * Every branch either returns a verified COMPLETED capture or throws a
 * sanitized typed error; an unverified response can never look like success.
 */
function verifyCaptureResponse(
  payload: unknown,
  expected: StoredPaymentOrder,
): VerifiedCapture {
  if (!isRecord(payload)) throw malformedResponse();

  const orderId = readString(payload.id);
  if (!orderId) throw malformedResponse();
  if (orderId !== expected.paypalOrderId) {
    throw new PayPalCaptureError(
      "order_id_mismatch",
      "PayPal returned a capture for a different order.",
    );
  }

  const orderStatus = readString(payload.status)?.toUpperCase();
  if (!orderStatus) throw malformedResponse();

  const purchaseUnits = payload.purchase_units;
  if (!Array.isArray(purchaseUnits)) {
    throw new PayPalCaptureError(
      "purchase_unit_mismatch",
      "PayPal did not return the expected purchase unit.",
    );
  }

  const unit = purchaseUnits.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.reference_id === expected.referenceId,
  );
  if (!isRecord(unit)) {
    throw new PayPalCaptureError(
      "purchase_unit_mismatch",
      "PayPal did not return the expected purchase unit.",
    );
  }

  const payments = unit.payments;
  const captures =
    isRecord(payments) && Array.isArray(payments.captures)
      ? payments.captures
      : [];

  if (captures.length === 0) {
    throw statusFailure(
      orderStatus,
      "PayPal returned no capture for the expected purchase unit.",
    );
  }
  if (captures.length !== 1) {
    throw new PayPalCaptureError(
      "capture_verification_failed",
      "PayPal returned an unexpected number of captures.",
    );
  }

  const capture = captures[0];
  if (!isRecord(capture)) throw malformedResponse();

  const captureStatus = readString(capture.status)?.toUpperCase();
  if (!captureStatus) throw malformedResponse();

  if (captureStatus !== "COMPLETED") {
    throw statusFailure(
      captureStatus,
      "PayPal did not confirm a completed capture.",
    );
  }

  // A COMPLETED capture inside a non-COMPLETED order is contradictory; fail
  // closed rather than declaring success from a single field.
  if (orderStatus !== "COMPLETED") {
    throw statusFailure(
      orderStatus,
      "PayPal returned an inconsistent order/capture status.",
    );
  }

  const captureId = readString(capture.id);
  if (!captureId) throw malformedResponse();

  const amount = capture.amount;
  if (!isRecord(amount)) {
    throw new PayPalCaptureError(
      "capture_verification_failed",
      "PayPal did not return a verifiable capture amount.",
    );
  }

  const currency = readString(amount.currency_code);
  if (currency !== "USD") {
    throw new PayPalCaptureError(
      "currency_mismatch",
      "The captured currency did not match the server order.",
    );
  }

  const value = readString(amount.value);
  if (value === null) {
    throw new PayPalCaptureError(
      "capture_verification_failed",
      "PayPal returned an unverifiable capture amount.",
    );
  }
  const cents = parseUsdToCents(value);
  if (cents === null) {
    throw new PayPalCaptureError(
      "capture_verification_failed",
      "PayPal returned an unverifiable capture amount.",
    );
  }
  if (cents !== expected.amountCents) {
    throw new PayPalCaptureError(
      "amount_mismatch",
      "The captured amount did not match the server order.",
    );
  }

  return {
    captureId,
    status: "COMPLETED",
    amountCents: cents,
    currency: "USD",
    referenceId: expected.referenceId,
    sellerProtectionStatus: null,
    capturedAtMs: null,
  };
}

function successResult(
  order: StoredPaymentOrder,
  captureId: string,
  amountCents: number,
  alreadyCaptured: boolean,
): PayPalCaptureResult {
  return {
    success: true,
    environment: "sandbox",
    demo: true,
    orderId: order.paypalOrderId,
    captureId,
    status: "COMPLETED",
    amount: { currency: "USD", value: formatCents(amountCents) },
    referenceId: order.referenceId,
    alreadyCaptured,
  };
}

/**
 * Read-only PayPal Orders v2 lookup. This never captures anything: it is the
 * safe way to establish whether an earlier ambiguous capture actually landed.
 */
async function requestOrderStatus(
  orderId: string,
  accessToken: string,
): Promise<unknown> {
  const url = `${SANDBOX_API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new PayPalCaptureError(
      "paypal_unavailable",
      "Could not reach the PayPal Sandbox order status endpoint.",
    );
  }

  if (!response.ok) {
    throw new PayPalCaptureError(
      response.status === 401 || response.status === 403
        ? "paypal_auth_failed"
        : "paypal_unavailable",
      "PayPal Sandbox could not report the order status.",
      { upstreamStatus: response.status },
    );
  }

  try {
    return await response.json();
  } catch {
    throw malformedResponse();
  }
}

function paymentStatusUnknown(): PayPalCaptureError {
  return new PayPalCaptureError(
    "payment_status_unknown",
    "We could not confirm whether PayPal completed this payment. Do not retry. Check the order in PayPal or contact support with this order reference.",
  );
}

function paymentStoreUnavailable(): PayPalCaptureError {
  return new PayPalCaptureError(
    "payment_store_unavailable",
    "Payments are temporarily unavailable. No capture was sent. Try again shortly.",
  );
}

/**
 * A store failure after a capture POST may hide a real outcome. Never turn that
 * into a clean failure or an invitation to retry.
 */
function unknownAfterStoreFailure(error: unknown): never {
  if (error instanceof PaymentStoreError) {
    console.error(
      "[paypal/capture] payment store failed after capture attempt:",
      error.name,
    );
    throw paymentStatusUnknown();
  }
  throw error;
}

/**
 * Establishes the outcome from PayPal's order state. A verified COMPLETED
 * capture is success; a verified non-completed state is reported honestly;
 * anything we cannot verify is `payment_status_unknown`, never a failure.
 */
async function reconcileCapture(
  order: StoredPaymentOrder,
  accessToken: string,
  store: PaymentStore,
): Promise<PayPalCaptureResult> {
  let payload: unknown;
  try {
    payload = await requestOrderStatus(order.paypalOrderId, accessToken);
  } catch {
    await store
      .markCaptureInDoubt({
        orderId: order.paypalOrderId,
        issueType: "CAPTURE_OUTCOME_UNKNOWN",
        errorCode: "payment_status_unknown",
        nowMs: Date.now(),
      })
      .catch((error) => {
        console.error(
          "[paypal/capture] could not persist unknown outcome:",
          error instanceof Error ? error.name : "unknown",
        );
      });
    throw paymentStatusUnknown();
  }

  const summary = summarizeCaptureResponse(payload);
  let verified: VerifiedCapture;
  try {
    verified = verifyCaptureResponse(payload, order);
  } catch (error) {
    if (!(error instanceof PayPalCaptureError)) {
      throw paymentStatusUnknown();
    }

    if (error.code === "capture_pending") {
      await store
        .markCapturePending({
          orderId: order.paypalOrderId,
          summary,
          errorCode: error.code,
          nowMs: Date.now(),
        })
        .catch(unknownAfterStoreFailure);
      throw error;
    }

    if (error.code === "capture_denied") {
      await store
        .markCaptureFailed({
          orderId: order.paypalOrderId,
          summary,
          providerStatus: "DENIED",
          errorCode: error.code,
          nowMs: Date.now(),
        })
        .catch(unknownAfterStoreFailure);
      throw error;
    }

    if (error.code === "paypal_malformed_response") {
      await store
        .markCaptureInDoubt({
          orderId: order.paypalOrderId,
          issueType: "CAPTURE_OUTCOME_UNKNOWN",
          errorCode: "payment_status_unknown",
          nowMs: Date.now(),
        })
        .catch(unknownAfterStoreFailure);
      throw paymentStatusUnknown();
    }

    if (VERIFICATION_MISMATCH_CODES.has(error.code)) {
      await store
        .markReconciliationRequired({
          orderId: order.paypalOrderId,
          issueType:
            summary.captureStatus === "COMPLETED"
              ? "COMPLETED_CAPTURE_UNVERIFIED"
              : "CAPTURE_VERIFICATION_MISMATCH",
          errorCode: error.code,
          summary,
          nowMs: Date.now(),
        })
        .catch(unknownAfterStoreFailure);
      throw error;
    }

    throw paymentStatusUnknown();
  }

  try {
    const completed = await store.completeCapture({
      orderId: order.paypalOrderId,
      capture: verified,
      nowMs: Date.now(),
    });
    if (!completed.capture || completed.conflictReason) {
      throw paymentStatusUnknown();
    }
    return successResult(
      completed.order,
      completed.capture.paypalCaptureId,
      completed.capture.amountCents,
      true,
    );
  } catch (error) {
    throw unknownAfterStoreFailure(error);
  }
}

async function performCapture(
  order: StoredPaymentOrder,
  leaseOwner: string,
  accessToken: string,
  store: PaymentStore,
): Promise<PayPalCaptureResult> {
  let sent: boolean;
  try {
    sent = await store.markCaptureRequestSent({
      orderId: order.paypalOrderId,
      leaseOwner,
      nowMs: Date.now(),
    });
  } catch (error) {
    // The request has not been sent yet; a store outage is safe to retry.
    if (error instanceof PaymentStoreError) throw paymentStoreUnavailable();
    throw error;
  }
  if (!sent) {
    // Another process owns the lease. Never POST without a durable claim.
    throw new PayPalCaptureError(
      "capture_pending",
      "This capture is already being processed. Retry shortly.",
      { captureStatus: order.status },
    );
  }

  let payload: unknown;
  try {
    payload = await requestCapture(order.paypalOrderId, accessToken);
  } catch (error) {
    if (
      !(error instanceof PayPalCaptureError) ||
      !RECONCILABLE_CAPTURE_ERRORS.has(error.code)
    ) {
      throw error;
    }
    await store
      .markCaptureInDoubt({
        orderId: order.paypalOrderId,
        issueType: "CAPTURE_OUTCOME_UNKNOWN",
        errorCode: error.code,
        nowMs: Date.now(),
      })
      .catch(unknownAfterStoreFailure);
    return reconcileCapture(order, accessToken, store);
  }

  const summary = summarizeCaptureResponse(payload);
  let verified: VerifiedCapture;
  try {
    verified = verifyCaptureResponse(payload, order);
  } catch (error) {
    if (!(error instanceof PayPalCaptureError)) throw error;

    if (error.code === "capture_pending") {
      await store
        .markCapturePending({
          orderId: order.paypalOrderId,
          summary,
          errorCode: error.code,
          nowMs: Date.now(),
        })
        .catch(unknownAfterStoreFailure);
      throw error;
    }

    if (error.code === "capture_denied") {
      await store
        .markCaptureFailed({
          orderId: order.paypalOrderId,
          summary,
          providerStatus: "DENIED",
          errorCode: error.code,
          nowMs: Date.now(),
        })
        .catch(unknownAfterStoreFailure);
      throw error;
    }

    if (!RECONCILABLE_CAPTURE_ERRORS.has(error.code)) throw error;

    await store
      .markCaptureInDoubt({
        orderId: order.paypalOrderId,
        issueType: "CAPTURE_OUTCOME_UNKNOWN",
        errorCode: error.code,
        nowMs: Date.now(),
      })
      .catch(unknownAfterStoreFailure);
    return reconcileCapture(order, accessToken, store);
  }

  try {
    const completed = await store.completeCapture({
      orderId: order.paypalOrderId,
      leaseOwner,
      capture: verified,
      nowMs: Date.now(),
    });
    if (!completed.capture || completed.conflictReason) {
      throw paymentStatusUnknown();
    }
    return successResult(
      completed.order,
      completed.capture.paypalCaptureId,
      completed.capture.amountCents,
      false,
    );
  } catch (error) {
    throw unknownAfterStoreFailure(error);
  }
}

function notAllowed(order: StoredPaymentOrder): PayPalCaptureError {
  if (order.status === "EXPIRED") {
    return new PayPalCaptureError(
      "order_not_found",
      "This sandbox order is no longer available. Start a new checkout.",
    );
  }
  if (order.status === "FAILED") {
    if (order.providerOrderStatus === "DENIED") {
      return new PayPalCaptureError(
        "capture_denied",
        "PayPal denied this capture. No payment was taken.",
        { captureStatus: "DENIED" },
      );
    }
    return new PayPalCaptureError(
      "capture_verification_failed",
      "This capture did not complete. No payment was taken.",
    );
  }
  return new PayPalCaptureError(
    "payment_status_unknown",
    "We could not confirm whether PayPal completed this payment. Do not retry.",
  );
}

async function captureLocked(
  orderId: string,
  captureToken: string,
  store: PaymentStore,
  guestOwnerHash?: string | null,
  referenceIdHint?: string | null,
): Promise<PayPalCaptureResult> {
  let order = await store.getOrderByPayPalId(orderId);
  if (!order) {
    // If no referenceId hint was provided, or if the hint doesn't match the captureToken HMAC,
    // do not make outbound calls to PayPal (avoids DoS / probing unknown orders).
    if (!referenceIdHint) {
      throw new PayPalCaptureError(
        "order_not_found",
        "This sandbox order is no longer available. Start a new checkout.",
      );
    }

    // Cryptographic capability pre-check before any outbound call
    const expectedCaptureToken = deriveCaptureToken(orderId, referenceIdHint);
    if (
      !captureTokenMatches(hashCaptureToken(expectedCaptureToken), captureToken)
    ) {
      throw new PayPalCaptureError(
        "invalid_capture_token",
        "The capture token is missing or invalid.",
      );
    }

    // Attempt safe recovery from PayPal Orders v2 endpoint.
    // In serverless environments or container recycles without distributed storage,
    // the in-memory store may not have the order created on another instance.
    let accessToken: string;
    try {
      accessToken = await getPayPalAccessToken();
    } catch (error) {
      mapAuthError(error);
    }

    let payload: unknown;
    try {
      payload = await requestOrderStatus(orderId, accessToken);
    } catch {
      throw new PayPalCaptureError(
        "order_not_found",
        "This sandbox order is no longer available. Start a new checkout.",
      );
    }

    if (!isRecord(payload)) {
      throw new PayPalCaptureError(
        "order_not_found",
        "This sandbox order is no longer available. Start a new checkout.",
      );
    }

    const payloadId = readString(payload.id);
    if (!payloadId || payloadId !== orderId) {
      throw new PayPalCaptureError(
        "order_not_found",
        "This sandbox order is no longer available. Start a new checkout.",
      );
    }

    const purchaseUnits = payload.purchase_units;
    if (!Array.isArray(purchaseUnits) || purchaseUnits.length === 0) {
      throw new PayPalCaptureError(
        "order_not_found",
        "This sandbox order is no longer available. Start a new checkout.",
      );
    }

    const unit = purchaseUnits[0];
    if (!isRecord(unit)) {
      throw new PayPalCaptureError(
        "order_not_found",
        "This sandbox order is no longer available. Start a new checkout.",
      );
    }

    const referenceId = readString(unit.reference_id);
    if (!referenceId || referenceId !== referenceIdHint) {
      throw new PayPalCaptureError(
        "order_not_found",
        "This sandbox order is no longer available. Start a new checkout.",
      );
    }

    const amountRecord = isRecord(unit.amount) ? unit.amount : null;
    const value = amountRecord ? readString(amountRecord.value) : null;
    const currency = amountRecord
      ? readString(amountRecord.currency_code)
      : null;
    if (currency !== "USD" || value === null) {
      throw new PayPalCaptureError(
        "currency_mismatch",
        "The captured currency did not match the server order.",
      );
    }

    const amountCents = parseUsdToCents(value);
    if (amountCents === null || amountCents <= 0) {
      throw new PayPalCaptureError(
        "capture_verification_failed",
        "PayPal returned an unverifiable capture amount.",
      );
    }

    const orderStatus =
      readString(payload.status)?.toUpperCase() ?? "CREATED";

    const now = Date.now();
    order = await store.createOrder({
      paypalOrderId: orderId,
      referenceId,
      amountCents,
      currency: "USD",
      status: "CREATED",
      captureTokenHash: hashCaptureToken(captureToken),
      cartFingerprint: "restored-via-paypal-reconciliation",
      guestOwnerHash: guestOwnerHash ?? null,
      idempotencyKey: null,
      approvalUrl: null,
      providerOrderStatus: orderStatus,
      createdAtMs: now,
      expiresAtMs: now + 10_800_000,
    });

    if (orderStatus === "COMPLETED") {
      const recoveryLeaseOwner = randomUUID();
      await store.claimCapture({
        orderId,
        leaseOwner: recoveryLeaseOwner,
        nowMs: Date.now(),
        leaseMs: CAPTURE_LEASE_MS,
      });
      return reconcileCapture(order, accessToken, store);
    }
  }

  if (
    order.guestOwnerHash &&
    guestOwnerHash &&
    order.guestOwnerHash !== guestOwnerHash
  ) {
    throw new PayPalCaptureError(
      "order_not_found",
      "This sandbox order is no longer available. Start a new checkout.",
    );
  }
  if (order.guestOwnerHash && !guestOwnerHash) {
    throw new PayPalCaptureError(
      "order_not_found",
      "This sandbox order is no longer available. Start a new checkout.",
    );
  }
  if (!captureTokenMatches(order.captureTokenHash, captureToken)) {
    throw new PayPalCaptureError(
      "invalid_capture_token",
      "The capture token is missing or invalid.",
    );
  }
  if (order.status === "COMPLETED") {
    const capture = await store.getCaptureByOrderId(orderId);
    if (capture) {
      return successResult(
        order,
        capture.paypalCaptureId,
        capture.amountCents,
        true,
      );
    }
    let accessToken: string;
    try {
      accessToken = await getPayPalAccessToken();
    } catch (error) {
      mapAuthError(error);
    }
    return reconcileCapture(order, accessToken, store);
  }

  // Fetch the access token before claiming: missing credentials must not leave
  // the order stuck in CAPTURE_IN_PROGRESS.
  let accessToken: string;
  try {
    accessToken = await getPayPalAccessToken();
  } catch (error) {
    mapAuthError(error);
  }

  const leaseOwner = randomUUID();
  const claim = await store.claimCapture({
    orderId,
    leaseOwner,
    nowMs: Date.now(),
    leaseMs: CAPTURE_LEASE_MS,
  });

  switch (claim.kind) {
    case "not_found":
      throw new PayPalCaptureError(
        "order_not_found",
        "This sandbox order is no longer available. Start a new checkout.",
      );
    case "already_completed":
      return successResult(
        claim.order,
        claim.capture.paypalCaptureId,
        claim.capture.amountCents,
        true,
      );
    case "expired":
      throw notAllowed(claim.order);
    case "not_allowed":
      if (claim.order.status === "COMPLETED") {
        return reconcileCapture(claim.order, accessToken, store);
      }
      throw notAllowed(claim.order);
    case "in_progress":
      throw new PayPalCaptureError(
        "capture_pending",
        "This capture is already being processed. Payment is not complete yet.",
        { captureStatus: claim.order.status },
      );
    case "in_doubt":
    case "reconcile_only":
      return reconcileCapture(claim.order, accessToken, store);
    case "claimed":
      return performCapture(claim.order, leaseOwner, accessToken, store);
  }
}

/**
 * Captures an approved sandbox order after verifying the durable server-side
 * record and ownership token. Duplicate/concurrent requests in one process are
 * serialized; across processes the database lease prevents a second capture.
 */
export async function capturePayPalOrder(
  orderId: string,
  captureToken: string,
  options: {
    guestOwnerHash?: string | null;
    referenceId?: string | null;
  } = {},
): Promise<PayPalCaptureResult> {
  if (!isValidPayPalOrderId(orderId)) {
    throw new PayPalCaptureError(
      "invalid_order_id",
      "The PayPal order id is not valid.",
    );
  }
  if (!isValidCaptureToken(captureToken)) {
    throw new PayPalCaptureError(
      "invalid_capture_token",
      "The capture token is missing or invalid.",
    );
  }

  const store = getPaymentStore();
  if (store.kind === "unavailable") throw paymentStoreUnavailable();

  try {
    return await withOrderLock(orderId, () =>
      captureLocked(
        orderId,
        captureToken,
        store,
        options.guestOwnerHash,
        options.referenceId,
      ),
    );
  } catch (error) {
    if (error instanceof PaymentStoreError) {
      throw paymentStoreUnavailable();
    }
    throw error;
  }
}
