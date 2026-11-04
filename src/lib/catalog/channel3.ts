/**
 * ShopMate AI — Channel3 Product API client (server-side only).
 *
 * Implements the documented v1 contract:
 * - Docs:            https://docs.trychannel3.com
 * - OpenAPI:         https://docs.trychannel3.com/docs/openapi/openapi.json
 * - Search:          POST {base}/v1/search          (1 credit per call)
 * - Product detail:  GET  {base}/v1/products/{id}   (free, always fresh)
 * - Authentication:  `x-api-key` request header
 * - Attribution:     optional `x-user-id` header appended to offer buy URLs
 * - Production base: https://api.trychannel3.com
 *
 * Free tier: 1,000 credits/month (a search costs 1). Default plan rate limits:
 * 10 req/s for search, 10,000 calls/day. A 429 carries `Retry-After: 5`.
 *
 * SECURITY RULES kept here:
 * - The API key lives only in `process.env.CHANNEL3_API_KEY` and is attached
 *   to outbound requests; it is never logged, echoed, or returned.
 * - Outbound calls go to the fixed base URL with a validated id path segment,
 *   so user input can never redirect requests to an arbitrary host.
 * - Every call is bounded by an AbortController timeout.
 *
 * Response JSON is returned as untyped data: all field validation and
 * normalization happens in `normalize.ts`, which treats provider data as
 * untrusted input.
 */
import { CatalogError } from "./types";
import type { CatalogSearchOptions } from "./types";

const DEFAULT_BASE_URL = "https://api.trychannel3.com";

/**
 * Resolves the API base URL. `CHANNEL3_BASE_URL` may override the production
 * host for local testing (e.g. a stub server that never responds, to exercise
 * the timeout path). This is operator configuration on the server — never user
 * input — so it does not create an SSRF surface; non-http(s) or unparseable
 * values fall back to the production URL.
 */
function baseUrl(): string {
  const raw = process.env.CHANNEL3_BASE_URL?.trim();
  if (!raw) return DEFAULT_BASE_URL;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return DEFAULT_BASE_URL;
    }
    return raw.replace(/\/+$/, "");
  } catch {
    return DEFAULT_BASE_URL;
  }
}

/** Outbound timeout: env-overridable, clamped to a safe range. */
const DEFAULT_TIMEOUT_MS = 8_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 20_000;

/** Search result bounds documented by the v1 API (limit: 1–30, default 20). */
export const CHANNEL3_MAX_LIMIT = 30;

function readTimeoutMs(): number {
  const raw = process.env.CHANNEL3_TIMEOUT_MS;
  const parsed = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.round(parsed), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

/** True when a Channel3 API key is configured for server-side use. */
export function isChannel3Configured(): boolean {
  const key = process.env.CHANNEL3_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

function apiKey(): string {
  const key = process.env.CHANNEL3_API_KEY;
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new CatalogError("not_configured", "CHANNEL3_API_KEY is not set");
  }
  return key;
}

/** Maps an HTTP status from Channel3 onto a stable failure reason. */
function errorForStatus(status: number, detail: unknown): CatalogError {
  const providerDetail =
    typeof detail === "string" && detail.length > 0 ? detail : undefined;
  switch (status) {
    case 401:
    // The OpenAPI documents 401 for bad keys, but the live API answers
    // 403 Forbidden ({"message":"Forbidden"}) for invalid keys. Both mean
    // the credential was rejected.
    case 403:
      return new CatalogError(
        "auth_failed",
        providerDetail ?? "Channel3 rejected the API key",
        status,
      );
    case 402:
      return new CatalogError(
        "out_of_credits",
        providerDetail ?? "Channel3 credits are exhausted",
        status,
      );
    case 429:
      return new CatalogError(
        "rate_limited",
        providerDetail ?? "Channel3 rate limit reached",
        status,
      );
    case 404:
      return new CatalogError("provider_error", "Not found", status);
    default:
      return new CatalogError(
        "provider_error",
        providerDetail ?? `Channel3 request failed with status ${status}`,
        status,
      );
  }
}

interface Channel3JsonArgs {
  path: string;
  init?: RequestInit;
  /** 404 is a valid "no product" answer for detail lookups. */
  allowNotFound?: boolean;
}

/**
 * Performs one bounded, authenticated request to the fixed Channel3 base URL
 * and returns the parsed JSON body, or null for an allowed 404.
 */
async function requestJson({
  path,
  init,
  allowNotFound = false,
}: Channel3JsonArgs): Promise<unknown> {
  const url = `${baseUrl()}${path}`;
  const headers: Record<string, string> = {
    "x-api-key": apiKey(),
    accept: "application/json",
  };
  if (init?.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...headers, ...init?.headers },
      signal: AbortSignal.timeout(readTimeoutMs()),
      cache: "no-store",
    });
  } catch (error) {
    // Network failure or timeout. AbortSignal.timeout surfaces as TimeoutError.
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new CatalogError(
      timedOut ? "timeout" : "provider_error",
      timedOut ? "Channel3 request timed out" : "Channel3 request failed",
    );
  }

  if (allowNotFound && response.status === 404) {
    return null;
  }

  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail =
      body !== undefined &&
      body !== null &&
      typeof body === "object" &&
      ("detail" in body || "message" in body)
        ? (body as { detail?: unknown; message?: unknown }).detail ??
          (body as { message?: unknown }).message
        : undefined;
    throw errorForStatus(response.status, detail);
  }
  return body;
}

/**
 * Live catalog search. Costs 1 Channel3 credit per uncached call.
 * The availability filter mirrors the API's own default (`InStock`) so the
 * store surfaces buyable products; stock status is still normalized from the
 * returned offers instead of being assumed.
 */
export async function searchChannel3(
  query: string,
  options: CatalogSearchOptions,
): Promise<unknown> {
  const body: Record<string, unknown> = {
    query,
    limit: Math.min(Math.max(Math.round(options.limit), 1), CHANNEL3_MAX_LIMIT),
    filters: { availability: ["InStock"] },
    config: { mode: "default" },
  };
  return requestJson({
    path: "/v1/search",
    init: {
      method: "POST",
      body: JSON.stringify(body),
      headers: options.userId
        ? { "x-user-id": options.userId }
        : undefined,
    },
  });
}

/**
 * Fetches one product by id from the free, always-fresh detail endpoint.
 * Resolves to null when the id does not exist (404).
 */
export async function getChannel3Product(id: string): Promise<unknown> {
  return requestJson({
    path: `/v1/products/${encodeURIComponent(id)}`,
    allowNotFound: true,
  });
}
