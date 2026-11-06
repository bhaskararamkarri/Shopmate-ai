/**
 * ShopMate AI — dedicated in-memory payment rate limiter (Milestone 1).
 *
 * Implements a bounded, two-tier rate limiter protecting payment endpoints:
 *   - Tier 1 (Primary): Verified guest session identity (`guest:${guestOwnerHash}`)
 *     Default: 10 requests / minute
 *   - Tier 2 (Secondary): Caller IP address (`ip:${clientIp}`)
 *     Default: 20 requests / minute
 *
 * Security & Isolation Invariants:
 *   - Strictly isolated from chat rate limiter (separate module, distinct memory map)
 *   - Bounded memory storage (MAX_PAYMENT_KEYS = 2000) with oldest-entry eviction on overflow
 *   - Process-local, zero external dependencies (no Redis)
 *   - Returns HTTP 429 Retry-After metadata and failure reasons
 *   - Server-only execution guard
 */

// Hard guard: server-only code must fail loudly if imported in client bundles.
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/payments/rate-limit is server-only; do not import it from client code",
  );
}

/** Hard cap on tracked payment keys; eviction bounds memory under attack. */
export const MAX_PAYMENT_KEYS = 2000;

/** Default rate limit thresholds. */
export const DEFAULT_GUEST_LIMIT = 10;
export const DEFAULT_IP_LIMIT = 20;
export const DEFAULT_PAYMENT_WINDOW_MS = 60_000;

export interface WindowState {
  /** Window start epoch timestamp in milliseconds. */
  start: number;
  /** Request count observed within this window. */
  count: number;
}

export interface PaymentRateLimitOptions {
  /** Maximum allowed requests per window for the guest session. */
  guestLimit?: number;
  /** Maximum allowed requests per window for the caller IP. */
  ipLimit?: number;
  /** Length of the sliding/fixed window in milliseconds. */
  windowMs?: number;
}

export interface PaymentRateLimitResult {
  /** True when the request is allowed (and counted). */
  allowed: boolean;
  /** Seconds until the current window resets; >= 1 when blocked. */
  retryAfterSec: number;
  /** Reason for rejection if throttled. */
  reason?: "guest_limit" | "ip_limit";
}

/** Dedicated memory map strictly isolated from chat rate limiting. */
const paymentWindows = new Map<string, WindowState>();

/** Clears all tracked payment windows — test isolation only. */
export function resetPaymentRateLimiterForTests(): void {
  paymentWindows.clear();
}

/** Returns the current number of tracked keys — test verification only. */
export function getPaymentRateLimiterKeyCount(): number {
  return paymentWindows.size;
}

/**
 * Evicts the oldest entry based on window start time when the map reaches capacity.
 */
function evictOldestEntry(): void {
  let oldestKey: string | null = null;
  let oldestStart = Number.POSITIVE_INFINITY;

  for (const [key, state] of paymentWindows) {
    if (state.start < oldestStart) {
      oldestStart = state.start;
      oldestKey = key;
    }
  }

  if (oldestKey !== null) {
    paymentWindows.delete(oldestKey);
  }
}

/**
 * Retrieves or initializes the window state for a key, evicting the oldest key
 * if capacity is exceeded.
 */
function getOrCreateWindowState(
  key: string,
  now: number,
  windowMs: number,
): WindowState {
  let state = paymentWindows.get(key);

  if (!state || now - state.start >= windowMs) {
    if (!paymentWindows.has(key) && paymentWindows.size >= MAX_PAYMENT_KEYS) {
      evictOldestEntry();
    }
    state = { start: now, count: 0 };
    paymentWindows.set(key, state);
  }

  return state;
}

/**
 * Checks and updates rate limits for a payment operation across guest and IP tiers.
 *
 * @param guestOwnerHash Verified SHA-256 hash of the guest session ID
 * @param clientIp Caller IP address resolved from trusted request headers
 * @param endpointOrOptions Optional endpoint tag ("orders" | "capture") or custom options
 * @param maybeOptions Optional configuration overrides
 */
export function checkPaymentRateLimit(
  guestOwnerHash: string,
  clientIp: string,
  endpointOrOptions?: "orders" | "capture" | PaymentRateLimitOptions,
  maybeOptions?: PaymentRateLimitOptions,
): PaymentRateLimitResult {
  let endpoint: "orders" | "capture" | undefined;
  let options: PaymentRateLimitOptions | undefined;

  if (typeof endpointOrOptions === "string") {
    endpoint = endpointOrOptions;
    options = maybeOptions;
  } else if (endpointOrOptions && typeof endpointOrOptions === "object") {
    options = endpointOrOptions;
  } else if (maybeOptions && typeof maybeOptions === "object") {
    options = maybeOptions;
  }

  const envGuestLimit = Number(process.env.SHOPMATE_PAYMENT_RATE_LIMIT_GUEST);
  const envIpLimit = Number(process.env.SHOPMATE_PAYMENT_RATE_LIMIT_IP);

  const guestLimit =
    options?.guestLimit ??
    (Number.isFinite(envGuestLimit) && envGuestLimit > 0
      ? envGuestLimit
      : DEFAULT_GUEST_LIMIT);

  const ipLimit =
    options?.ipLimit ??
    (Number.isFinite(envIpLimit) && envIpLimit > 0
      ? envIpLimit
      : DEFAULT_IP_LIMIT);

  const windowMs = options?.windowMs ?? DEFAULT_PAYMENT_WINDOW_MS;
  const now = Date.now();

  const safeGuest = guestOwnerHash?.trim() || "anonymous";
  const safeIp = clientIp?.trim() || "unknown";

  const guestKey = endpoint
    ? `guest:${endpoint}:${safeGuest}`
    : `guest:${safeGuest}`;
  const ipKey = `ip:${safeIp}`;

  // 1. Evaluate Guest Tier
  const guestState = getOrCreateWindowState(guestKey, now, windowMs);
  const guestResetInMs = guestState.start + windowMs - now;
  const guestRetryAfter = Math.max(1, Math.ceil(guestResetInMs / 1000));

  if (guestState.count >= guestLimit) {
    return {
      allowed: false,
      retryAfterSec: guestRetryAfter,
      reason: "guest_limit",
    };
  }

  // 2. Evaluate IP Tier
  const ipState = getOrCreateWindowState(ipKey, now, windowMs);
  const ipResetInMs = ipState.start + windowMs - now;
  const ipRetryAfter = Math.max(1, Math.ceil(ipResetInMs / 1000));

  if (ipState.count >= ipLimit) {
    return {
      allowed: false,
      retryAfterSec: ipRetryAfter,
      reason: "ip_limit",
    };
  }

  // 3. Both tiers permitted: atomically increment counters
  guestState.count += 1;
  ipState.count += 1;

  return {
    allowed: true,
    retryAfterSec: Math.max(guestRetryAfter, ipRetryAfter),
  };
}
