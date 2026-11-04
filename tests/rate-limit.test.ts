import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, resetRateLimiter } from "@/lib/agent/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(checkRateLimit("ip-1", { limit: 3, windowMs: 60_000 }).allowed).toBe(
        true,
      );
    }
  });

  it("blocks the request after the limit is exhausted", () => {
    for (let i = 0; i < 3; i += 1) {
      checkRateLimit("ip-2", { limit: 3, windowMs: 60_000 });
    }
    const blocked = checkRateLimit("ip-2", { limit: 3, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("resets after the window passes", () => {
    for (let i = 0; i < 2; i += 1) {
      checkRateLimit("ip-3", { limit: 2, windowMs: 60_000 });
    }
    expect(checkRateLimit("ip-3", { limit: 2, windowMs: 60_000 }).allowed).toBe(
      false,
    );
    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit("ip-3", { limit: 2, windowMs: 60_000 }).allowed).toBe(
      true,
    );
  });

  it("tracks keys independently", () => {
    checkRateLimit("ip-a", { limit: 1, windowMs: 60_000 });
    expect(checkRateLimit("ip-a", { limit: 1, windowMs: 60_000 }).allowed).toBe(
      false,
    );
    expect(checkRateLimit("ip-b", { limit: 1, windowMs: 60_000 }).allowed).toBe(
      true,
    );
  });

  it("reports retryAfterSec relative to the current window", () => {
    for (let i = 0; i < 2; i += 1) {
      checkRateLimit("ip-4", { limit: 2, windowMs: 60_000 });
    }
    vi.advanceTimersByTime(30_000);
    const blocked = checkRateLimit("ip-4", { limit: 2, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(29);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(31);
  });

  it("evicts the oldest key when the bounded map overflows", () => {
    // Fill the map to its bound (1000) with distinct keys, then a new key
    // evicts the oldest (ip-0). The evicted key counts fresh again while the
    // newest still holds its counter.
    for (let i = 0; i < 1000; i += 1) {
      checkRateLimit(`ip-${i}`, { limit: 1, windowMs: 60_000 });
    }
    expect(
      checkRateLimit("ip-1000", { limit: 1, windowMs: 60_000 }).allowed,
    ).toBe(true);
    expect(checkRateLimit("ip-0", { limit: 1, windowMs: 60_000 }).allowed).toBe(
      true,
    );
    expect(
      checkRateLimit("ip-999", { limit: 1, windowMs: 60_000 }).allowed,
    ).toBe(false);
  });
});
