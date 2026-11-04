/**
 * ShopMate AI — PayPal Sandbox connection status (Phase 5).
 *
 * GET /api/paypal/status
 *
 * Server-side only verification: checks configuration and performs one OAuth
 * handshake. The response contains safe status fields exclusively — never the
 * access token, client credentials, Authorization header, or raw upstream
 * payload. The endpoint is dynamic and never cached.
 */
import { NextResponse } from "next/server";
import { checkPayPalConnection } from "@/lib/paypal/auth";

export async function GET() {
  try {
    const { status, body } = await checkPayPalConnection();
    if (!body.success) {
      // Sanitized server-side diagnostic: typed code only, no credentials,
      // headers, or upstream payloads.
      console.error("[api/paypal/status] PayPal sandbox check failed:", body.error);
    }
    return NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    // Defensive: checkPayPalConnection maps its own failures; this guards
    // against unexpected bugs without exposing internals to the client.
    console.error(
      "[api/paypal/status] unexpected error:",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      {
        success: false,
        environment: "sandbox",
        configured: false,
        authenticated: false,
        error: "paypal_unavailable",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
