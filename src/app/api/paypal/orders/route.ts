/**
 * ShopMate AI — create a PayPal Sandbox order (POST /api/paypal/orders).
 *
 * Request body:
 *   { "items": [{ "productId": "demo-...", "quantity": 1 }], "currency": "USD" }
 *
 * Every price and the final total are recomputed server-side from the catalog;
 * client-supplied prices/totals are stripped by the Zod schema and ignored.
 * The created order is explicitly a ShopMate Sandbox demonstration — it does
 * not pay a retailer or fulfil a Channel3 purchase listing.
 *
 * Responses contain only the safe order fields the frontend needs. Access
 * tokens, credentials, Authorization headers, and raw PayPal payloads never
 * leave this handler and are never logged.
 */
import { NextResponse } from "next/server";
import {
  createPayPalOrder,
  isValidIdempotencyKey,
  PayPalOrderError,
  PayPalOrderRequestSchema,
  type PayPalOrderErrorCode,
} from "@/lib/paypal/orders";

/** The largest valid order request is only a few hundred bytes. */
const MAX_BODY_BYTES = 32 * 1024;

const STATUS_BY_CODE: Record<PayPalOrderErrorCode, number> = {
  empty_cart: 400,
  invalid_request: 400,
  invalid_amount: 400,
  unsupported_currency: 400,
  amount_too_large: 400,
  item_not_found: 404,
  idempotency_conflict: 409,
  paypal_not_configured: 503,
  paypal_unsupported_environment: 503,
  paypal_auth_failed: 502,
  paypal_unavailable: 502,
  paypal_malformed_response: 502,
  paypal_order_failed: 502,
  paypal_timeout: 504,
  catalog_unavailable: 502,
  catalog_timeout: 504,
  internal_error: 500,
};

function failure(
  error: PayPalOrderErrorCode,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json(
    { success: false, error, message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  // Bound the body before parsing it. Route handlers have no default cap.
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return failure("invalid_request", "Request body too large.", 400);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return failure(
      "invalid_request",
      "Content-Type must be application/json.",
      400,
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return failure("invalid_request", "Body must be JSON.", 400);
  }

  const parsed = PayPalOrderRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return failure(
      "invalid_request",
      parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; "),
      400,
    );
  }

  const rawKey = request.headers.get("idempotency-key");
  const idempotencyKey = rawKey === null ? undefined : rawKey.trim();
  if (idempotencyKey !== undefined && !isValidIdempotencyKey(idempotencyKey)) {
    return failure(
      "invalid_request",
      "Idempotency-Key must be 8–108 URL-safe characters (A-Z, a-z, 0-9, ., _, -).",
      400,
    );
  }

  try {
    const result = await createPayPalOrder(parsed.data, { idempotencyKey });
    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PayPalOrderError) {
      const status = STATUS_BY_CODE[error.code] ?? 500;
      if (status >= 500) {
        // Sanitized diagnostic only: typed code plus upstream status. Never
        // tokens, credentials, request headers, or upstream payloads.
        console.error(
          "[/api/paypal/orders] order failed:",
          typeof error.upstreamStatus === "number"
            ? `${error.code} (upstream HTTP ${error.upstreamStatus})`
            : error.code,
        );
      }
      return failure(error.code, error.message, status);
    }

    console.error(
      "[/api/paypal/orders] unexpected error:",
      error instanceof Error ? error.name : "unknown",
    );
    return failure("internal_error", "Unexpected server error.", 500);
  }
}
