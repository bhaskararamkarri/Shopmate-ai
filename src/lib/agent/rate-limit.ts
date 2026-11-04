/**
 * ShopMate AI — in-memory fixed-window rate limiter (Phase 4).
 *
 * Protects the /api/chat endpoint (and the Channel3 credits it spends) from
 * request storms: each key — the caller's IP — gets `limit` requests per
 * `windowMs`. The map is bounded so an attacker rotating spoofed IPs cannot
 * grow memory without limit; the oldest entry is evicted at the bound.
 *
 * Single-process only: acceptable for this deployment, and deliberately not
 * a distributed limiter — no external state store is in scope for Phase 4.
 */

/** Hard cap on tracked keys; eviction keeps memory bounded. */
const MAX_KEYS = 1000;

interface WindowState {
  /** Window start epoch ms. */
  start: number;
  /** Requests seen in this window. */
  count: number;
}

const windows = new Map<string, WindowState>();

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** True when the request is allowed (and counted). */
  allowed: boolean;
  /** Seconds until the current window resets; ≥ 1 when blocked. */
  retryAfterSec: number;
}

/** Clears all tracked windows — test isolation only. */
export function resetRateLimiter(): void {
  windows.clear();
}

export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const { limit, windowMs } = options;

  let state = windows.get(key);
  if (!state || now - state.start >= windowMs) {
    // Evict the oldest entry when at capacity, before inserting a new key.
    if (!windows.has(key) && windows.size >= MAX_KEYS) {
      let oldestKey: string | null = null;
      let oldestStart = Number.POSITIVE_INFINITY;
      for (const [existingKey, existing] of windows) {
        if (existing.start < oldestStart) {
          oldestStart = existing.start;
          oldestKey = existingKey;
        }
      }
      if (oldestKey !== null) windows.delete(oldestKey);
    }
    state = { start: now, count: 0 };
    windows.set(key, state);
  }

  const resetInMs = state.start + windowMs - now;
  const retryAfterSec = Math.max(1, Math.ceil(resetInMs / 1000));

  if (state.count >= limit) {
    return { allowed: false, retryAfterSec };
  }

  state.count += 1;
  return { allowed: true, retryAfterSec };
}
