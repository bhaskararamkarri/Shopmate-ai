/**
 * ShopMate AI — PayPal Sandbox Create Order service (Phase 5.2).
 *
 * Server-side only. The browser sends cart lines (product id + quantity); the
 * server re-resolves every product through the catalog and computes the amount
 * itself. Client-supplied prices or totals are never read — the Zod schema
 * strips unknown fields before this module sees the request.
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
export const MAX_DEMO_TOTAL_USD = 500;

const MAX_TOTAL_CENTS = MAX_DEMO_TOTAL_USD * 100;
const MAX_LINES = 20;
const MAX_QUANTITY = 99;

/** Same id pattern the product detail route accepts (demo and live ids). */
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Idempotency-Key: URL-safe, bounded, long enough to be meaningful. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._-]{8,108}$/;

const IDEMPOTENCY_TTL_MS = 10 * 60_000;
const MAX_IDEMPOTENCY_ENTRIES = 500;

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

  constructor(
    code: PayPalOrderErrorCode,
    message: string,
    upstreamStatus?: number,
  ) {
    super(message);
    this.name = "PayPalOrderError";
    this.code = code;
    this.upstreamStatus = upstreamStatus;
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
  /** Present only when PayPal returned a safe https approval link. */
  approveUrl?: string;
}

interface MergedLine {
  productId: string;
  quantity: number;
}

interface IdempotencyEntry {
  fingerprint: string;
  result: PayPalOrderResult;
  expiresAt: number;
}

const idempotencyCache = new Map<string, IdempotencyEntry>();

/** Clears in-memory idempotency state — test isolation only. */
export function resetPayPalOrderCaches(): void {
  idempotencyCache.clear();
}

/** True when the header value is a usable Idempotency-Key. */
export function isValidIdempotencyKey(value: string): boolean {
  return IDEMPOTENCY_KEY_PATTERN.test(value);
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

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
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

/**
 * Creates a ShopMate Sandbox demonstration order.
 *
 * Throws `PayPalOrderError` for every expected failure; unexpected failures
 * intentionally propagate so the route can return a generic 500.
 */
export async function createPayPalOrder(
  request: PayPalOrderRequest,
  options: { idempotencyKey?: string } = {},
): Promise<PayPalOrderResult> {
  if (request.items.length === 0) {
    throw new PayPalOrderError("empty_cart", "Your cart is empty.");
  }

  const lines = mergeLines(request.items);
  const requestFingerprint = fingerprint(lines);
  const idempotencyKey = options.idempotencyKey;

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

  if (idempotencyKey) {
    const cached = idempotencyCache.get(idempotencyKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.fingerprint !== requestFingerprint) {
        throw new PayPalOrderError(
          "idempotency_conflict",
          "This Idempotency-Key was already used with a different cart.",
        );
      }
      return cached.result;
    }
    if (cached) idempotencyCache.delete(idempotencyKey);
  }

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

    const product = found.product;
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

  let accessToken: string;
  try {
    accessToken = await getPayPalAccessToken();
  } catch (error) {
    mapAuthError(error);
  }

  const amountValue = formatCents(totalCents);
  const referenceId = `shopmate-demo-${randomUUID()}`;

  const order = await requestPayPalOrder({
    accessToken,
    amountValue,
    referenceId,
    idempotencyKey,
  });

  const result: PayPalOrderResult = {
    success: true,
    environment: "sandbox",
    demo: true,
    orderId: order.id,
    status: order.status,
    amount: { currency: "USD", value: amountValue },
    referenceId,
    ...(order.approveUrl ? { approveUrl: order.approveUrl } : {}),
  };

  if (idempotencyKey) {
    if (idempotencyCache.size >= MAX_IDEMPOTENCY_ENTRIES) {
      const oldest = idempotencyCache.keys().next().value;
      if (oldest !== undefined) idempotencyCache.delete(oldest);
    }
    idempotencyCache.set(idempotencyKey, {
      fingerprint: requestFingerprint,
      result,
      expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
    });
  }

  return result;
}
