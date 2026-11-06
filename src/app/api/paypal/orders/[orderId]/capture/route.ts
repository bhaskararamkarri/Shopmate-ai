/**
 * ShopMate AI — capture an approved PayPal Sandbox order (Phase 5.4).
 *
 * POST /api/paypal/orders/[orderId]/capture
 *
 * The request body is deliberately ignored: authoritative amounts and currency
 * live only in the server-side pending-order registry. The opaque
 * `X-ShopMate-Capture-Token` header proves this browser created the order.
 *
 * Success (HTTP 200) is returned only for a verified COMPLETED capture whose
 * order id, purchase-unit reference, currency, and exact amount all match the
 * server-created order. Everything else is a sanitized failure.
 *
 * Access tokens, credentials, Authorization headers, and raw PayPal payloads
 * never leave this handler and are never logged.
 */
import { NextResponse } from "next/server";
import {
  capturePayPalOrder,
  isValidCaptureToken,
  PayPalCaptureError,
  type PayPalCaptureErrorCode,
} from "@/lib/paypal/capture";
import { requireGuestSession } from "@/lib/payments/guest-session";
import { resolveClientIp } from "@/lib/agent/client-ip";
import { checkPaymentRateLimit } from "@/lib/payments/rate-limit";

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

const STATUS_BY_CODE: Record<PayPalCaptureErrorCode, number> = {
  invalid_order_id: 400,
  invalid_capture_token: 403,
  order_not_found: 404,
  capture_not_allowed: 409,
  capture_pending: 202,
  capture_denied: 402,
  order_id_mismatch: 409,
  purchase_unit_mismatch: 409,
  amount_mismatch: 409,
  currency_mismatch: 409,
  capture_verification_failed: 409,
  payment_status_unknown: 409,
  payment_store_unavailable: 503,
  paypal_not_configured: 503,
  paypal_unsupported_environment: 503,
  paypal_auth_failed: 502,
  paypal_unavailable: 502,
  paypal_malformed_response: 502,
  paypal_capture_failed: 502,
  paypal_timeout: 504,
  internal_error: 500,
};

function failure(
  error: PayPalCaptureErrorCode | "guest_session_required" | "invalid_guest_session" | "session_secret_missing" | "rate_limited" | "forbidden",
  message: string,
  status: number,
  captureStatus?: string,
  retryAfterSec?: number,
): NextResponse {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfterSec !== undefined) {
    headers["Retry-After"] = String(retryAfterSec);
  }
  return NextResponse.json(
    {
      success: false,
      environment: "sandbox",
      demo: true,
      error,
      message,
      ...(captureStatus ? { status: captureStatus } : {}),
    },
    { status, headers },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  if (!verifySameOrigin(request)) {
    return failure("forbidden", "Cross-origin request rejected.", 403);
  }

  const { orderId } = await params;

  // Strict Guest Session Validation
  const guestResult = requireGuestSession(request);
  if (!guestResult.ok) {
    if (guestResult.error === "missing") {
      return failure(
        "guest_session_required",
        "A valid guest session cookie is required to capture an order.",
        401,
      );
    }
    if (guestResult.error === "unconfigured") {
      return failure(
        "session_secret_missing",
        "Guest session secret is not configured.",
        503,
      );
    }
    return failure(
      "invalid_guest_session",
      "Guest session is invalid or expired. Start a new checkout.",
      401,
    );
  }

  // Rate Limiting (Tier 1: Guest Session, Tier 2: IP)
  const clientIp = resolveClientIp(request.headers);
  const rateLimit = checkPaymentRateLimit(
    guestResult.session.ownerHash,
    clientIp,
    "capture",
  );
  if (!rateLimit.allowed) {
    return failure(
      "rate_limited",
      "Too many capture attempts. Try again shortly.",
      429,
      undefined,
      rateLimit.retryAfterSec,
    );
  }

  const rawToken = request.headers.get("x-shopmate-capture-token");
  const captureToken = rawToken === null ? "" : rawToken.trim();
  const rawReferenceId = request.headers.get("x-shopmate-reference-id");
  const referenceId = rawReferenceId === null ? null : rawReferenceId.trim();

  if (!isValidCaptureToken(captureToken)) {
    return failure(
      "invalid_capture_token",
      "The capture token is missing or invalid.",
      403,
    );
  }

  try {
    const result = await capturePayPalOrder(orderId, captureToken, {
      guestOwnerHash: guestResult.session.ownerHash,
      referenceId,
    });
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PayPalCaptureError) {
      const status = STATUS_BY_CODE[error.code] ?? 500;
      if (status >= 500 || error.code === "payment_status_unknown") {
        // Sanitized diagnostic only: typed code plus upstream status. Never
        // tokens, credentials, request headers, or upstream payloads.
        console.error(
          "[/api/paypal/orders/[orderId]/capture] capture failed:",
          typeof error.upstreamStatus === "number"
            ? `${error.code} (upstream HTTP ${error.upstreamStatus})`
            : error.code,
        );
      }
      return failure(error.code, error.message, status, error.captureStatus);
    }

    console.error(
      "[/api/paypal/orders/[orderId]/capture] unexpected error:",
      error instanceof Error ? error.name : "unknown",
    );
    return failure("internal_error", "Unexpected server error.", 500);
  }
}
