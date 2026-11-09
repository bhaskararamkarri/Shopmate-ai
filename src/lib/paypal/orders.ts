/**
 * ShopMate AI — PayPal Sandbox Create Order service (Phase 6B).
 *
 * Server-side only. The browser sends cart lines (product id + quantity); the
 * server re-resolves every product through the catalog and computes the amount
 * itself. Client-supplied prices or totals are never read — the Zod schema
 * strips unknown fields before this module sees the request.
 *
 * Phase 6B replaces the process-local caches with a transactional payment
 * store. The Idempotency-Key reservation, the PayPal order, and the
 * authoritative amount now commit together, so a restart or a second instance
 * can replay or deduplicate correctly.
 *
 * The order is an explicitly labelled ShopMate Sandbox demonstration
 * transaction. It does not pay a retailer and does not fulfil a Channel3
 * purchase: Channel3 listings are informational, not purchasable here.
 *
 * Flow (PayPal Orders v2):
 *   POST https://api-m.sandbox.paypal.com/v2/checkout/orders
 *   Authorization: Bearer <token from ./auth>
 *   body: { intent: "CAPTURE", purchase_units: [...] }
 *
 * No access token, client credential, Authorization header, or raw upstream
 * payload is ever returned or logged.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCatalogProduct } from "@/lib/catalog/provider";
import { CatalogError } from "@/lib/catalog/types";
import {
  deriveCaptureToken,
  hashCaptureToken,
} from "@/lib/payments/capture-token";
import { PaymentStoreError } from "@/lib/payments/errors";
import { formatCents } from "@/lib/payments/money";
import { getPaymentStore, resetPaymentStoreForTests } from "@/lib/payments/store";
import type {
  NewPaymentOrder,
  StoredPaymentOrder,
} from "@/lib/payments/types";
import { getPayPalAccessToken, getPayPalConfig, PayPalAuthError } from "./auth";

// Hard guard: a client bundle that somehow imports this module fails loudly
// at module evaluation instead of shipping the secret-reading code.
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/paypal/orders is server-only; do not import it from client code",
  );
}

/** Sandbox-only API base, matching the OAuth service. */
const SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";
const ORDERS_URL = `${SANDBOX_API_BASE}/v2/checkout/orders`;

/** Bounded outbound request time; order creation normally answers quickly. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Demo transaction ceiling — a guard rail, not a real purchasing limit. */
export const MAX_DEMO_TOTAL_USD = 5_000;

const MAX_TOTAL_CENTS = MAX_DEMO_TOTAL_USD * 100;
const MAX_LINES = 20;
const MAX_QUANTITY = 99;

/** Shared 30-minute demo capability window. */
export const PAYPAL_ORDER_TTL_MS = 30 * 60_000;

/** How long one create-order attempt may hold the idempotency lease. */
const CREATE_PROCESSING_LEASE_MS = 20_000;

/** Ambiguous PayPal failures become retryable after this short window. */
const AMBIGUOUS_RETRY_MS = 15_000;

/** Same id pattern the product detail route accepts (demo and live ids). */
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Idempotency-Key: URL-safe, bounded, long enough to be meaningful. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._-]{8,108}$/;

/**
 * PayPal order ids are opaque alphanumeric identifiers (the sandbox commonly
 * returns 17 characters). The capture route validates this again before it
 * ever looks up a pending order or calls PayPal.
 */
const PAYPAL_ORDER_ID_PATTERN = /^[A-Za-z0-9._-]{10,36}$/;

export const PayPalOrderItemSchema = z.object({
  productId: z
    .string()
    .regex(PRODUCT_ID_PATTERN, "productId contains unsupported characters"),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
});

export const PayPalOrderRequestSchema = z.object({
  // Empty arrays are accepted here so the service can report `empty_cart`
  // rather than a generic schema failure.
  items: z.array(PayPalOrderItemSchema).max(MAX_LINES),
  // Only USD is supported for the initial demo.
  currency: z.literal("USD").optional(),
});

export type PayPalOrderRequest = z.infer<typeof PayPalOrderRequestSchema>;

export type PayPalOrderErrorCode =
  | "empty_cart"
  | "invalid_request"
  | "invalid_amount"
  | "unsupported_currency"
  | "amount_too_large"
  | "item_not_found"
  | "idempotency_conflict"
  | "idempotency_in_progress"
  | "payment_store_unavailable"
  | "paypal_not_configured"
  | "paypal_unsupported_environment"
  | "paypal_auth_failed"
  | "paypal_unavailable"
  | "paypal_malformed_response"
  | "paypal_order_failed"
  | "paypal_timeout"
  | "catalog_unavailable"
  | "catalog_timeout"
  | "internal_error";

/** Sanitized, typed failure — safe to log and to map to HTTP statuses. */
export class PayPalOrderError extends Error {
  readonly code: PayPalOrderErrorCode;
  /** Upstream HTTP status when the failure came from a PayPal response. */
  readonly upstreamStatus?: number;
  /** Safe retry hint for an in-flight idempotent request. */
  readonly retryAfterMs?: number;

  constructor(
    code: PayPalOrderErrorCode,
    message: string,
    upstreamStatus?: number,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "PayPalOrderError";
    this.code = code;
    this.upstreamStatus = upstreamStatus;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface PayPalOrderResult {
  success: true;
  environment: "sandbox";
  /** Always true: this is a labelled ShopMate sandbox demonstration. */
  demo: true;
  orderId: string;
  status: string;
  amount: { currency: "USD"; value: string };
  referenceId: string;
  /**
   * Opaque, order-scoped capability proving this browser started this exact
   * server-created order. Required by the capture endpoint; it is not a PayPal
   * credential and carries no secret. The database stores only its hash.
   */
  captureToken: string;
  /** Present only when PayPal returned a safe https approval link. */
  approveUrl?: string;
}

interface MergedLine {
  productId: string;
  quantity: number;
}

interface InFlightCreate {
  fingerprint: string;
  promise: Promise<PayPalOrderResult>;
}

/**
 * Same-process coalescing only. The durable reservation in Postgres is the
 * authority across instances; this map simply lets two concurrent browser
 * requests share the first request's result instead of making the second wait
 * for a retry window.
 */
const inFlightCreates = new Map<string, InFlightCreate>();

/** Clears process-local coordination state — test isolation only. */
export function resetPayPalOrderCaches(): void {
  inFlightCreates.clear();
  resetPaymentStoreForTests();
}

/**
 * Kept for compatibility with the Phase 5 tests. With a durable store there is
 * no separate fast cache to clear: the store itself is the single source of
 * truth, so a replay after this call still finds the original order.
 */
export function clearPayPalIdempotencyCacheForTests(): void {
  // Intentionally empty.
}

/** True when the header value is a usable Idempotency-Key. */
export function isValidIdempotencyKey(value: string): boolean {
  return IDEMPOTENCY_KEY_PATTERN.test(value);
}

/** True when the value is a syntactically usable PayPal order id. */
export function isValidPayPalOrderId(value: string): boolean {
  return PAYPAL_ORDER_ID_PATTERN.test(value);
}

/** Merges duplicate product lines and enforces the per-product ceiling. */
function mergeLines(items: PayPalOrderRequest["items"]): MergedLine[] {
  const quantities = new Map<string, number>();
  for (const item of items) {
    const next = (quantities.get(item.productId) ?? 0) + item.quantity;
    if (next > MAX_QUANTITY) {
      throw new PayPalOrderError(
        "invalid_request",
        `Quantity for one product cannot exceed ${MAX_QUANTITY}.`,
      );
    }
    quantities.set(item.productId, next);
  }
  return [...quantities.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

/** Canonical payload fingerprint: order of lines does not matter. */
function fingerprint(lines: MergedLine[]): string {
  return JSON.stringify(lines.map((line) => [line.productId, line.quantity]));
}

function malformedResponse(): PayPalOrderError {
  return new PayPalOrderError(
    "paypal_malformed_response",
    "PayPal Sandbox returned an unexpected order response.",
  );
}

function mapAuthError(error: unknown): never {
  if (error instanceof PayPalAuthError) {
    if (
      error.code === "paypal_not_configured" ||
      error.code === "paypal_unsupported_environment"
    ) {
      throw new PayPalOrderError(
        error.code,
        error.code === "paypal_not_configured"
          ? "PayPal credentials are not configured."
          : "PAYPAL_ENV must be sandbox.",
        error.upstreamStatus,
      );
    }
    throw new PayPalOrderError(
      error.code,
      "PayPal Sandbox authentication failed.",
      error.upstreamStatus,
    );
  }
  throw new PayPalOrderError(
    "paypal_auth_failed",
    "PayPal Sandbox authentication failed.",
  );
}

interface CreatedOrder {
  id: string;
  status: string;
  approveUrl?: string;
}

/**
 * Creates one PayPal Orders v2 order. The amount is calculated by the caller
 * from catalog data — never from the request.
 */
async function requestPayPalOrder(params: {
  accessToken: string;
  amountValue: string;
  referenceId: string;
  idempotencyKey?: string;
}): Promise<CreatedOrder> {
  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: params.referenceId,
        description:
          "ShopMate Sandbox demo order — not a retailer purchase. No goods are shipped.",
        amount: {
          currency_code: "USD",
          value: params.amountValue,
        },
      },
    ],
    application_context: {
      brand_name: "ShopMate AI",
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
    },
  };

  let response: Response;
  try {
    response = await fetch(ORDERS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(params.idempotencyKey
          ? { "PayPal-Request-Id": params.idempotencyKey }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new PayPalOrderError(
        "paypal_timeout",
        "PayPal Sandbox did not respond in time.",
      );
    }
    throw new PayPalOrderError(
      "paypal_unavailable",
      "Could not reach the PayPal Sandbox order endpoint.",
    );
  }

  if (!response.ok) {
    const suffix = `(upstream HTTP ${response.status})`;
    if (response.status === 401 || response.status === 403) {
      throw new PayPalOrderError(
        "paypal_auth_failed",
        `PayPal rejected the sandbox credentials ${suffix}.`,
        response.status,
      );
    }
    if (response.status >= 500) {
      throw new PayPalOrderError(
        "paypal_unavailable",
        `PayPal Sandbox order endpoint failed ${suffix}.`,
        response.status,
      );
    }
    throw new PayPalOrderError(
      "paypal_order_failed",
      `PayPal Sandbox rejected the order ${suffix}.`,
      response.status,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw malformedResponse();
  }

  if (typeof body !== "object" || body === null) {
    throw malformedResponse();
  }

  const record = body as { id?: unknown; status?: unknown; links?: unknown };
  if (typeof record.id !== "string" || record.id.trim().length === 0) {
    throw malformedResponse();
  }

  const id = record.id.trim();
  if (!isValidPayPalOrderId(id)) {
    throw malformedResponse();
  }
  const status =
    typeof record.status === "string" && record.status.trim().length > 0
      ? record.status.trim()
      : "CREATED";

  // Only a safe https approval link ever leaves this module; PayPal's other
  // links (self, capture, ...) are intentionally discarded.
  let approveUrl: string | undefined;
  if (Array.isArray(record.links)) {
    for (const link of record.links) {
      if (typeof link !== "object" || link === null) continue;
      const { href, rel } = link as { href?: unknown; rel?: unknown };
      if (rel !== "approve" && rel !== "payer-action") continue;
      if (typeof href !== "string") continue;
      try {
        const parsed = new URL(href);
        if (parsed.protocol === "https:") {
          approveUrl = href;
          break;
        }
      } catch {
        // Ignore malformed links rather than failing the whole order.
      }
    }
  }

  return { id, status, approveUrl };
}

function idempotencyConflict(): PayPalOrderError {
  return new PayPalOrderError(
    "idempotency_conflict",
    "This Idempotency-Key was already used with a different cart.",
  );
}

function paymentStoreUnavailable(): PayPalOrderError {
  return new PayPalOrderError(
    "payment_store_unavailable",
    "Payments are temporarily unavailable. No order was created. Try again shortly.",
  );
}

/** Rebuilds the exact safe response from the durable order record. */
function resultFromStoredOrder(order: StoredPaymentOrder): PayPalOrderResult {
  const captureToken = deriveCaptureToken(
    order.paypalOrderId,
    order.referenceId,
  );
  if (hashCaptureToken(captureToken) !== order.captureTokenHash) {
    // Never hand the browser a capability the database would reject.
    throw new PayPalOrderError(
      "internal_error",
      "Payment capability configuration changed. Start a new checkout.",
    );
  }
  return {
    success: true,
    environment: "sandbox",
    demo: true,
    orderId: order.paypalOrderId,
    status: order.providerOrderStatus ?? order.status,
    amount: { currency: "USD", value: formatCents(order.amountCents) },
    referenceId: order.referenceId,
    captureToken,
    ...(order.approvalUrl ? { approveUrl: order.approvalUrl } : {}),
  };
}

/** Reads the catalog and computes the authoritative total. */
async function priceCart(lines: MergedLine[]): Promise<number> {
  let totalCents = 0;

  for (const line of lines) {
    let found: Awaited<ReturnType<typeof getCatalogProduct>>;
    try {
      found = await getCatalogProduct(line.productId);
    } catch (error) {
      if (error instanceof CatalogError) {
        if (error.reason === "timeout") {
          throw new PayPalOrderError(
            "catalog_timeout",
            "The product catalog timed out. Try again shortly.",
            error.status,
          );
        }
        throw new PayPalOrderError(
          "catalog_unavailable",
          "The product catalog is temporarily unavailable. Try again shortly.",
          error.status,
        );
      }
      throw new PayPalOrderError(
        "catalog_unavailable",
        "The product catalog is temporarily unavailable. Try again shortly.",
      );
    }

    if (!found) {
      throw new PayPalOrderError(
        "item_not_found",
        "One or more cart items are no longer available.",
      );
    }

    const product =
      "product" in found && (found as { product?: unknown }).product
        ? (found as { product: { currency: string; price: number } }).product
        : (found as unknown as { currency: string; price: number });
    if (product.currency.toUpperCase() !== "USD") {
      throw new PayPalOrderError(
        "unsupported_currency",
        "Only USD demo orders are supported.",
      );
    }

    const unitCents = Math.round(product.price * 100);
    if (
      !Number.isFinite(product.price) ||
      !Number.isFinite(unitCents) ||
      unitCents <= 0
    ) {
      throw new PayPalOrderError(
        "invalid_amount",
        "A cart item has an invalid price.",
      );
    }

    const lineCents = unitCents * line.quantity;
    if (!Number.isSafeInteger(lineCents)) {
      throw new PayPalOrderError(
        "invalid_amount",
        "A cart item has an invalid price.",
      );
    }

    totalCents += lineCents;
    if (!Number.isSafeInteger(totalCents)) {
      throw new PayPalOrderError(
        "amount_too_large",
        `Demo orders are capped at $${MAX_DEMO_TOTAL_USD}.`,
      );
    }
    if (totalCents > MAX_TOTAL_CENTS) {
      throw new PayPalOrderError(
        "amount_too_large",
        `Demo orders are capped at $${MAX_DEMO_TOTAL_USD}.`,
      );
    }
  }

  if (totalCents <= 0) {
    throw new PayPalOrderError(
      "invalid_amount",
      "The order total must be greater than zero.",
    );
  }

  return totalCents;
}

interface PreparedOrder {
  newOrder: NewPaymentOrder;
  captureToken: string;
  createdAtMs: number;
}

/** Creates the upstream order and prepares the row to persist. */
async function createUpstreamOrder(
  lines: MergedLine[],
  requestFingerprint: string,
  idempotencyKey: string | undefined,
  guestOwnerHash?: string | null,
): Promise<PreparedOrder> {
  const totalCents = await priceCart(lines);
  const amountValue = formatCents(totalCents);

  let accessToken: string;
  try {
    accessToken = await getPayPalAccessToken();
  } catch (error) {
    mapAuthError(error);
  }

  const referenceId = `shopmate-demo-${randomUUID()}`;
  const order = await requestPayPalOrder({
    accessToken,
    amountValue,
    referenceId,
    idempotencyKey,
  });

  const captureToken = deriveCaptureToken(order.id, referenceId);
  const createdAtMs = Date.now();

  const newOrder: NewPaymentOrder = {
    paypalOrderId: order.id,
    referenceId,
    amountCents: totalCents,
    currency: "USD",
    status: "CREATED",
    captureTokenHash: hashCaptureToken(captureToken),
    cartFingerprint: requestFingerprint,
    guestOwnerHash: guestOwnerHash ?? null,
    idempotencyKey: idempotencyKey ?? null,
    approvalUrl: order.approveUrl ?? null,
    providerOrderStatus: order.status,
    createdAtMs,
    expiresAtMs: createdAtMs + PAYPAL_ORDER_TTL_MS,
  };

  return { newOrder, captureToken, createdAtMs };
}

/**
 * Failures that leave the PayPal outcome uncertain. The reservation stays
 * PROCESSING with a retry window instead of becoming a definitive FAILED.
 */
const AMBIGUOUS_CREATE_CODES = new Set<PayPalOrderErrorCode>([
  "paypal_timeout",
  "paypal_unavailable",
  "paypal_malformed_response",
]);

function classifyCreateFailure(error: unknown): {
  code: string;
  retryable: boolean;
  retryAfterMs: number;
} {
  if (error instanceof PayPalOrderError) {
    return {
      code: error.code,
      retryable: AMBIGUOUS_CREATE_CODES.has(error.code),
      retryAfterMs: AMBIGUOUS_RETRY_MS,
    };
  }
  if (error instanceof PaymentStoreError) {
    // The order may already exist upstream; do not mark the reservation failed.
    return {
      code: error.code,
      retryable: true,
      retryAfterMs: AMBIGUOUS_RETRY_MS,
    };
  }
  // An unexpected error after an outbound attempt is treated as ambiguous.
  return {
    code: "internal_error",
    retryable: true,
    retryAfterMs: AMBIGUOUS_RETRY_MS,
  };
}

async function createWithoutKey(
  lines: MergedLine[],
  requestFingerprint: string,
  guestOwnerHash?: string | null,
): Promise<PayPalOrderResult> {
  const prepared = await createUpstreamOrder(
    lines,
    requestFingerprint,
    undefined,
    guestOwnerHash,
  );
  try {
    const stored = await getPaymentStore().createOrder(prepared.newOrder);
    return resultFromStoredOrder(stored);
  } catch (error) {
    if (error instanceof PaymentStoreError) {
      throw paymentStoreUnavailable();
    }
    throw error;
  }
}

async function createReservedOrder(
  lines: MergedLine[],
  requestFingerprint: string,
  idempotencyKey: string,
  reservationId: string,
  guestOwnerHash?: string | null,
): Promise<PayPalOrderResult> {
  const store = getPaymentStore();
  try {
    const prepared = await createUpstreamOrder(
      lines,
      requestFingerprint,
      idempotencyKey,
      guestOwnerHash,
    );
    const completed = await store.completeCreateOrder({
      reservationId,
      order: prepared.newOrder,
      nowMs: prepared.createdAtMs,
    });
    if (completed.kind === "conflict") throw idempotencyConflict();
    return resultFromStoredOrder(completed.order);
  } catch (error) {
    const failure = classifyCreateFailure(error);
    try {
      await store.failCreateOrder({
        reservationId,
        errorCode: failure.code,
        retryable: failure.retryable,
        retryAfterMs: failure.retryAfterMs,
        nowMs: Date.now(),
      });
    } catch (storeError) {
      // A store outage must not hide the original sanitized failure.
      console.error(
        "[paypal/orders] could not record create-order failure:",
        storeError instanceof Error ? storeError.name : "unknown",
      );
    }
    throw error;
  }
}

/**
 * Creates a ShopMate Sandbox demonstration order.
 *
 * Throws `PayPalOrderError` for every expected failure; unexpected failures
 * intentionally propagate so the route can return a generic 500.
 */
export async function createPayPalOrder(
  request: PayPalOrderRequest,
  options: { idempotencyKey?: string; guestOwnerHash?: string | null } = {},
): Promise<PayPalOrderResult> {
  if (request.items.length === 0) {
    throw new PayPalOrderError("empty_cart", "Your cart is empty.");
  }

  const lines = mergeLines(request.items);
  const requestFingerprint = fingerprint(lines);
  const idempotencyKey = options.idempotencyKey;
  const guestOwnerHash = options.guestOwnerHash ?? null;

  // Configuration is checked before any catalog or PayPal work. Missing
  // credentials must never spend Channel3 credits or make an outbound call.
  const config = getPayPalConfig();
  if (!config.ok) {
    throw new PayPalOrderError(
      config.code,
      config.code === "paypal_not_configured"
        ? "PayPal credentials are not configured."
        : "PAYPAL_ENV must be sandbox.",
    );
  }

  const store = getPaymentStore();
  if (store.kind === "unavailable") throw paymentStoreUnavailable();

  if (!idempotencyKey) {
    return createWithoutKey(lines, requestFingerprint, guestOwnerHash);
  }

  // Coalesce identical in-process requests before touching the durable lease.
  const inFlightKey = `${guestOwnerHash ?? "all"}:${idempotencyKey}`;
  const running = inFlightCreates.get(inFlightKey);
  if (running) {
    if (running.fingerprint !== requestFingerprint) throw idempotencyConflict();
    return running.promise;
  }

  const promise = (async () => {
    const nowMs = Date.now();
    const reservation = await store.reserveCreateOrder({
      scope: "create_order",
      idempotencyKey,
      cartFingerprint: requestFingerprint,
      guestOwnerHash,
      nowMs,
      expiresAtMs: nowMs + PAYPAL_ORDER_TTL_MS,
      processingLeaseMs: CREATE_PROCESSING_LEASE_MS,
    });

    switch (reservation.kind) {
      case "replay":
        return resultFromStoredOrder(reservation.order);
      case "conflict":
        throw idempotencyConflict();
      case "in_progress":
        throw new PayPalOrderError(
          "idempotency_in_progress",
          "An identical order is already being created. Retry shortly.",
          undefined,
          reservation.retryAfterMs,
        );
      case "reserved":
        return createReservedOrder(
          lines,
          requestFingerprint,
          idempotencyKey,
          reservation.reservation.id,
          guestOwnerHash,
        );
    }
  })().finally(() => {
    if (inFlightCreates.get(inFlightKey)?.promise === promise) {
      inFlightCreates.delete(inFlightKey);
    }
  });

  inFlightCreates.set(inFlightKey, {
    fingerprint: requestFingerprint,
    promise,
  });
  return promise;
}
