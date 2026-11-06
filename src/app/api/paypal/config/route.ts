/**
 * ShopMate AI — public PayPal Sandbox configuration (Phase 5.3).
 *
 * GET /api/paypal/config
 *
 * The PayPal JavaScript SDK needs the sandbox Client ID in the browser. A
 * Client ID is public by design; the Client Secret and OAuth access tokens are
 * server-only. This endpoint therefore returns exactly the public fields the
 * checkout component needs and nothing else.
 */
import { connection, NextResponse } from "next/server";
import { getPayPalConfig } from "@/lib/paypal/auth";
import { getOrIssueGuestSession } from "@/lib/payments/guest-session";

export async function GET(request?: Request) {
  // Configuration is read at request time so a deployment never serves a
  // Client ID captured during the build. `connection()` is the supported
  // opt-out under this app's cacheComponents configuration.
  await connection();

  const result = getPayPalConfig();

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        environment: "sandbox",
        configured: false,
        error: result.code,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  try {
    const req = request ?? new Request("http://localhost/api/paypal/config");
    const session = getOrIssueGuestSession(req);
    if (session.setCookie) {
      headers["Set-Cookie"] = session.setCookie;
    }
  } catch {
    // Fail-open for the config probe if guest session secret is missing in dev
  }

  // Explicit field allow-list: never spread `result.config` (it also holds
  // the client secret).
  return NextResponse.json(
    {
      success: true,
      environment: result.config.environment,
      configured: true,
      clientId: result.config.clientId,
      currency: "USD",
    },
    { status: 200, headers },
  );
}
