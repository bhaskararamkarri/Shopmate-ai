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
import { resolveClientIp } from "@/lib/agent/client-ip";
import { checkPaymentRateLimit } from "@/lib/payments/rate-limit";
import {
  getOrIssueGuestSession,
  requireGuestSession,
  GUEST_SESSION_COOKIE_NAME,
  GuestSessionConfigError,
} from "@/lib/payments/guest-session";

/** The largest valid order request is only a few hundred bytes. */
const MAX_BODY_BYTES = 32 * 1024;

function tooLarge(): NextResponse {
  return failure("invalid_request", "Request body too large.", 413);
}

function verifySameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const hostHeader = (
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      ""
    ).toLowerCase();
    if (!hostHeader) return true;
    return originHost === hostHeader;
  } catch {
    return false;
  }
}

/**
 * Reads the body while counting real bytes. `Content-Length` is only a hint:
 * it can be absent (chunked) or lie, so the stream is the authority.
 * Returns null when the limit is exceeded.
 */
async function readBodyWithLimit(
  request: Request,
): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const STATUS_BY_CODE: Record<PayPalOrderErrorCode, number> = {
  empty_cart: 400,
  invalid_request: 400,
  invalid_amount: 400,
  unsupported_currency: 400,
  amount_too_large: 400,
  item_not_found: 404,
  idempotency_conflict: 409,
  idempotency_in_progress: 429,
  payment_store_unavailable: 503,
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
  retryAfterMs?: number,
  setCookieHeader?: string,
): NextResponse {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfterMs !== undefined) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(retryAfterMs / 1000)));
  }
  if (setCookieHeader) {
    headers["Set-Cookie"] = setCookieHeader;
  }
  return NextResponse.json(
    { success: false, error, message },
    { status, headers },
  );
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json(
      { success: false, error: "forbidden", message: "Cross-origin request rejected." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  // An honest Content-Length can reject early, but it is never trusted alone:
  // the stream is counted below so chunked or lying headers cannot bypass it.
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return tooLarge();
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return failure(
      "invalid_request",
      "Content-Type must be application/json.",
      400,
    );
  }

  // Guest Session Resolution
  const cookieHeader = request.headers.get("cookie");
  const hasGuestCookie = Boolean(
    cookieHeader && cookieHeader.includes(GUEST_SESSION_COOKIE_NAME),
  );

  let guestOwnerHash: string;
  let setCookieHeader: string | undefined;

  if (hasGuestCookie) {
    const required = requireGuestSession(request);
    if (!required.ok) {
      if (required.error === "unconfigured") {
        return NextResponse.json(
          {
            success: false,
            error: "session_secret_missing",
            message: "Guest session secret not configured.",
          },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: "invalid_guest_session",
          message: "Invalid or expired guest session.",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    guestOwnerHash = required.session.ownerHash;
  } else {
    try {
      const issued = getOrIssueGuestSession(request);
      guestOwnerHash = issued.session.ownerHash;
      setCookieHeader = issued.setCookie;
    } catch (err) {
      if (err instanceof GuestSessionConfigError) {
        return NextResponse.json(
          {
            success: false,
            error: "session_secret_missing",
            message: "Guest session secret not configured.",
          },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
      throw err;
    }
  }

  // Dedicated Payment Rate Limiting (Tier 1: Guest Session, Tier 2: IP)
  const clientIp = resolveClientIp(request.headers);
  const rateLimit = checkPaymentRateLimit(guestOwnerHash, clientIp, "orders");
  if (!rateLimit.allowed) {
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "Retry-After": String(rateLimit.retryAfterSec),
    };
    if (setCookieHeader) {
      headers["Set-Cookie"] = setCookieHeader;
    }
    return NextResponse.json(
      {
        success: false,
        error: "rate_limited",
        message: "Too many payment requests. Try again shortly.",
      },
      { status: 429, headers },
    );
  }

  let bodyBytes: Uint8Array | null;
  try {
    bodyBytes = await readBodyWithLimit(request);
  } catch {
    return failure("invalid_request", "Could not read the request body.", 400);
  }
  if (!bodyBytes) return tooLarge();

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(new TextDecoder().decode(bodyBytes));
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
      undefined,
      setCookieHeader,
    );
  }

  const rawKey = request.headers.get("idempotency-key");
  const idempotencyKey = rawKey === null ? undefined : rawKey.trim();
  if (idempotencyKey !== undefined && !isValidIdempotencyKey(idempotencyKey)) {
    return failure(
      "invalid_request",
      "Idempotency-Key must be 8–108 URL-safe characters (A-Z, a-z, 0-9, ., _, -).",
      400,
      undefined,
      setCookieHeader,
    );
  }

  try {
    const result = await createPayPalOrder(parsed.data, {
      idempotencyKey,
      guestOwnerHash,
    });
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (setCookieHeader) {
      headers["Set-Cookie"] = setCookieHeader;
    }
    return NextResponse.json(result, {
      status: 201,
      headers,
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
      return failure(
        error.code,
        error.message,
        status,
        error.retryAfterMs,
        setCookieHeader,
      );
    }

    console.error(
      "[/api/paypal/orders] unexpected error:",
      error instanceof Error ? error.stack : error,
    );
    return failure(
      "internal_error",
      "Unexpected server error.",
      500,
      undefined,
      setCookieHeader,
    );
  }
}
