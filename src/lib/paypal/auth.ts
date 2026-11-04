/**
 * ShopMate AI — PayPal Sandbox OAuth 2.0 client (Phase 5).
 *
 * Server-side only. This module holds the PayPal client credentials and the
 * in-memory access token; it must never be imported by client components and
 * the token must never be persisted or returned to the browser.
 *
 * Flow (https://developer.paypal.com/api/rest/authentication):
 *   POST https://api-m.sandbox.paypal.com/v1/oauth2/token
 *   Authorization: Basic base64(PAYPAL_CLIENT_ID:PAYPAL_CLIENT_SECRET)
 *   Content-Type: application/x-www-form-urlencoded
 *   body: grant_type=client_credentials
 *
 * The token is cached in process memory and refreshed ~60 s before expiry.
 * No logging of secrets, tokens, headers or raw upstream responses happens
 * here; error messages are fixed, sanitized strings.
 */

// Hard guard: a client bundle that somehow imports this module fails loudly
// at module evaluation instead of shipping the secret-reading code.
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/paypal/auth is server-only; do not import it from client code",
  );
}

/** Only the sandbox environment is supported in Phase 5. */
const SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";
const TOKEN_URL = `${SANDBOX_API_BASE}/v1/oauth2/token`;

/** Bounded outbound request time; PayPal OAuth normally answers in < 1 s. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Refresh this long before the token's stated expiry. */
const REFRESH_MARGIN_MS = 60_000;

export type PayPalEnvironment = "sandbox";

export type PayPalAuthErrorCode =
  | "paypal_not_configured"
  | "paypal_unsupported_environment"
  | "paypal_auth_failed"
  | "paypal_timeout"
  | "paypal_unavailable"
  | "paypal_malformed_response";

export interface PayPalConfig {
  environment: PayPalEnvironment;
  clientId: string;
  clientSecret: string;
}

export type PayPalConfigResult =
  | { ok: true; config: PayPalConfig }
  | { ok: false; code: "paypal_not_configured" | "paypal_unsupported_environment" };

/** Sanitized, typed failure — safe to log and to map to HTTP statuses. */
export class PayPalAuthError extends Error {
  readonly code: PayPalAuthErrorCode;
  /** Upstream HTTP status when the failure came from a PayPal response. */
  readonly upstreamStatus?: number;

  constructor(code: PayPalAuthErrorCode, message: string, upstreamStatus?: number) {
    super(message);
    this.name = "PayPalAuthError";
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolves and validates the PayPal configuration. Only `sandbox` is
 * accepted; an explicitly unsupported value is rejected rather than ignored.
 */
export function getPayPalConfig(): PayPalConfigResult {
  const environment = (readEnv("PAYPAL_ENV") ?? "sandbox").toLowerCase();
  if (environment !== "sandbox") {
    return { ok: false, code: "paypal_unsupported_environment" };
  }
  const clientId = readEnv("PAYPAL_CLIENT_ID");
  const clientSecret = readEnv("PAYPAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return { ok: false, code: "paypal_not_configured" };
  }
  return { ok: true, config: { environment: "sandbox", clientId, clientSecret } };
}

interface CachedToken {
  accessToken: string;
  /** Epoch ms at which PayPal says the token expires. */
  expiresAtMs: number;
}

let cachedToken: CachedToken | null = null;
/** Deduplicates concurrent refreshes so a burst spends one token request. */
let inflight: Promise<string> | null = null;

/** Clears the in-memory token — test isolation only. */
export function resetPayPalTokenCache(): void {
  cachedToken = null;
  inflight = null;
}

async function requestAccessToken(config: PayPalConfig): Promise<string> {
  const basic = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
    "utf8",
  ).toString("base64");

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new PayPalAuthError(
        "paypal_timeout",
        "PayPal Sandbox token request timed out",
      );
    }
    throw new PayPalAuthError(
      "paypal_unavailable",
      "Could not reach the PayPal Sandbox token endpoint",
    );
  }

  if (!response.ok) {
    if (response.status >= 500) {
      throw new PayPalAuthError(
        "paypal_unavailable",
        `PayPal Sandbox token endpoint failed (upstream HTTP ${response.status})`,
        response.status,
      );
    }
    throw new PayPalAuthError(
      "paypal_auth_failed",
      `PayPal rejected the sandbox credentials (upstream HTTP ${response.status})`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new PayPalAuthError(
      "paypal_malformed_response",
      "PayPal Sandbox returned a non-JSON token response",
    );
  }

  const record = (typeof payload === "object" && payload !== null
    ? payload
    : {}) as { access_token?: unknown; expires_in?: unknown };
  const accessToken =
    typeof record.access_token === "string" ? record.access_token.trim() : "";
  const expiresIn =
    typeof record.expires_in === "number"
      ? record.expires_in
      : Number(record.expires_in);

  if (accessToken.length === 0 || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new PayPalAuthError(
      "paypal_malformed_response",
      "PayPal Sandbox token response was missing required fields",
    );
  }

  cachedToken = {
    accessToken,
    expiresAtMs: Date.now() + expiresIn * 1000,
  };
  return accessToken;
}

/**
 * Returns a valid PayPal Sandbox access token, reusing the in-memory cache
 * until ~60 s before expiry. Throws a sanitized `PayPalAuthError` on any
 * configuration, transport, or upstream failure.
 */
export async function getPayPalAccessToken(): Promise<string> {
  const result = getPayPalConfig();
  if (!result.ok) {
    throw new PayPalAuthError(
      result.code,
      result.code === "paypal_not_configured"
        ? "PayPal credentials are not configured"
        : "PAYPAL_ENV must be sandbox",
    );
  }

  if (cachedToken && Date.now() < cachedToken.expiresAtMs - REFRESH_MARGIN_MS) {
    return cachedToken.accessToken;
  }
  if (inflight) return inflight;

  inflight = requestAccessToken(result.config).finally(() => {
    inflight = null;
  });
  return inflight;
}

export interface PayPalStatusBody {
  success: boolean;
  environment: PayPalEnvironment;
  configured: boolean;
  authenticated: boolean;
  message?: string;
  error?: PayPalAuthErrorCode;
}

/**
 * Performs one safe server-side verification: configuration check plus an
 * OAuth handshake. Never returns tokens, credentials, headers, or raw
 * upstream payloads — only the fields in `PayPalStatusBody`.
 */
export async function checkPayPalConnection(): Promise<{
  status: number;
  body: PayPalStatusBody;
}> {
  const config = getPayPalConfig();
  if (!config.ok) {
    return {
      status: 503,
      body: {
        success: false,
        environment: "sandbox",
        configured: false,
        authenticated: false,
        error: config.code,
      },
    };
  }

  try {
    await getPayPalAccessToken();
    return {
      status: 200,
      body: {
        success: true,
        environment: "sandbox",
        configured: true,
        authenticated: true,
        message: "PayPal Sandbox connection successful",
      },
    };
  } catch (error) {
    const code: PayPalAuthErrorCode =
      error instanceof PayPalAuthError ? error.code : "paypal_unavailable";
    const status =
      code === "paypal_timeout"
        ? 504
        : code === "paypal_not_configured" ||
            code === "paypal_unsupported_environment"
          ? 503
          : 502;
    return {
      status,
      body: {
        success: false,
        environment: "sandbox",
        configured: true,
        authenticated: false,
        error: code,
      },
    };
  }
}
