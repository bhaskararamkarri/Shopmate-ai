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
  error: PayPalCaptureErrorCode,
  message: string,
  status: number,
  captureStatus?: string,
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      environment: "sandbox",
      demo: true,
      error,
      message,
      ...(captureStatus ? { status: captureStatus } : {}),
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;

  const rawToken = request.headers.get("x-shopmate-capture-token");
  const captureToken = rawToken === null ? "" : rawToken.trim();
  if (!isValidCaptureToken(captureToken)) {
    return failure(
      "invalid_capture_token",
      "The capture token is missing or invalid.",
      403,
    );
  }

  try {
    const result = await capturePayPalOrder(orderId, captureToken);
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PayPalCaptureError) {
      const status = STATUS_BY_CODE[error.code] ?? 500;
      if (status >= 500) {
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
