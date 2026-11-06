import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GUEST_LIMIT,
  DEFAULT_IP_LIMIT,
  MAX_PAYMENT_KEYS,
  checkPaymentRateLimit,
  getPaymentRateLimiterKeyCount,
  resetPaymentRateLimiterForTests,
} from "@/lib/payments/rate-limit";
import {
  checkRateLimit as checkChatRateLimit,
  resetRateLimiter as resetChatRateLimiter,
} from "@/lib/agent/rate-limit";

describe("payments rate-limit module (Milestone 1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPaymentRateLimiterForTests();
    resetChatRateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Tier 1: Guest Session Identity Limiting", () => {
    it("allows requests up to the default guest limit of 10 per minute", () => {
      const guestHash = "a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef";
      const ip = "192.168.1.100";

      for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
        const result = checkPaymentRateLimit(guestHash, ip);
        expect(result.allowed).toBe(true);
        expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
      }
    });

    it("blocks request after guest limit is exhausted with guest_limit reason", () => {
      const guestHash = "a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef";
      const ip = "192.168.1.101";

      for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
        checkPaymentRateLimit(guestHash, ip);
      }

      const blocked = checkPaymentRateLimit(guestHash, ip);
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toBe("guest_limit");
      expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    });

    it("tracks different guest hashes independently", () => {
      const guest1 = "1111111111111111111111111111111111111111111111111111111111111111";
      const guest2 = "2222222222222222222222222222222222222222222222222222222222222222";
      const ip = "192.168.1.102";

      for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
        checkPaymentRateLimit(guest1, ip);
      }

      // Guest 1 is exhausted
      expect(checkPaymentRateLimit(guest1, ip).allowed).toBe(false);
      expect(checkPaymentRateLimit(guest1, ip).reason).toBe("guest_limit");

      // Guest 2 on the same IP is allowed (since IP limit is 20 > 10)
      expect(checkPaymentRateLimit(guest2, ip).allowed).toBe(true);
    });
  });

  describe("Tier 2: IP Abuse Control Limiting", () => {
    it("allows up to default IP limit of 20 requests across distinct guest sessions", () => {
      const ip = "198.51.100.50";

      for (let i = 0; i < DEFAULT_IP_LIMIT; i++) {
        const uniqueGuest = `guest-hash-${i}`.padEnd(64, "0");
        const res = checkPaymentRateLimit(uniqueGuest, ip);
        expect(res.allowed).toBe(true);
      }
    });

    it("blocks multi-session spam from one IP when IP limit is reached with ip_limit reason", () => {
      const ip = "198.51.100.51";

      for (let i = 0; i < DEFAULT_IP_LIMIT; i++) {
        const uniqueGuest = `guest-hash-${i}`.padEnd(64, "0");
        checkPaymentRateLimit(uniqueGuest, ip);
      }

      // 21st request from a fresh guest is blocked by IP tier
      const freshGuest = "fresh-guest-never-seen-before".padEnd(64, "f");
      const blocked = checkPaymentRateLimit(freshGuest, ip);

      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toBe("ip_limit");
      expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    });

    it("tracks different IPs independently", () => {
      const ip1 = "203.0.113.10";
      const ip2 = "203.0.113.20";

      for (let i = 0; i < DEFAULT_IP_LIMIT; i++) {
        const guest = `guest-${i}`.padEnd(64, "a");
        checkPaymentRateLimit(guest, ip1);
      }

      // IP 1 exhausted
      const guestX = "guest-x".padEnd(64, "x");
      expect(checkPaymentRateLimit(guestX, ip1).allowed).toBe(false);
      expect(checkPaymentRateLimit(guestX, ip1).reason).toBe("ip_limit");

      // IP 2 with same guest is allowed
      expect(checkPaymentRateLimit(guestX, ip2).allowed).toBe(true);
    });
  });

  describe("Window Reset and Retry-After Calculations", () => {
    it("resets limits after the window duration has elapsed", () => {
      const guest = "guest-reset-test".padEnd(64, "0");
      const ip = "10.0.0.1";

      for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
        checkPaymentRateLimit(guest, ip);
      }
      expect(checkPaymentRateLimit(guest, ip).allowed).toBe(false);

      // Advance time past the 60s window
      vi.advanceTimersByTime(61_000);

      expect(checkPaymentRateLimit(guest, ip).allowed).toBe(true);
    });

    it("calculates accurate retryAfterSec relative to remaining window time", () => {
      const guest = "guest-retry-calc".padEnd(64, "0");
      const ip = "10.0.0.2";

      for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
        checkPaymentRateLimit(guest, ip);
      }

      // Advance 25 seconds into the 60s window
      vi.advanceTimersByTime(25_000);

      const blocked = checkPaymentRateLimit(guest, ip);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(34);
      expect(blocked.retryAfterSec).toBeLessThanOrEqual(36);
    });
  });

  describe("Custom Configuration Overrides", () => {
    it("honors custom limits and custom windowMs", () => {
      const guest = "custom-opts-guest".padEnd(64, "0");
      const ip = "10.0.0.3";

      const customOpts = {
        guestLimit: 3,
        ipLimit: 5,
        windowMs: 10_000,
      };

      for (let i = 0; i < 3; i++) {
        expect(checkPaymentRateLimit(guest, ip, undefined, customOpts).allowed).toBe(true);
      }

      const blocked = checkPaymentRateLimit(guest, ip, undefined, customOpts);
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toBe("guest_limit");

      // Advance past custom 10s window
      vi.advanceTimersByTime(11_000);

      expect(checkPaymentRateLimit(guest, ip, undefined, customOpts).allowed).toBe(true);
    });
  });

  describe("Endpoint Isolation", () => {
    it("isolates guest limits between orders and capture endpoints", () => {
      const guest = "endpoint-isolation-guest".padEnd(64, "0");
      const ip = "10.0.0.4";

      // Exhaust orders endpoint
      for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
        expect(checkPaymentRateLimit(guest, ip, "orders").allowed).toBe(true);
      }
      expect(checkPaymentRateLimit(guest, ip, "orders").allowed).toBe(false);

      // Capture endpoint for same guest is still allowed
      expect(checkPaymentRateLimit(guest, ip, "capture").allowed).toBe(true);
    });
  });

  describe("Strict Isolation from Chat Rate Limiter", () => {
    it("exhausting chat rate limit does not affect payment rate limiter", () => {
      const ip = "10.0.0.5";
      const guest = "chat-isolation-guest".padEnd(64, "0");

      // Exhaust chat rate limit (10 per min)
      for (let i = 0; i < 10; i++) {
        checkChatRateLimit(ip, { limit: 10, windowMs: 60_000 });
      }
      expect(checkChatRateLimit(ip, { limit: 10, windowMs: 60_000 }).allowed).toBe(false);

      // Payment rate limit for the same IP is still fresh and allowed
      expect(checkPaymentRateLimit(guest, ip).allowed).toBe(true);
    });

    it("exhausting payment rate limit does not affect chat rate limiter", () => {
      const ip = "10.0.0.6";

      // Exhaust payment rate limit on IP (20 per min)
      for (let i = 0; i < DEFAULT_IP_LIMIT; i++) {
        const guest = `guest-${i}`.padEnd(64, "9");
        checkPaymentRateLimit(guest, ip);
      }
      const freshGuest = "fresh-guest".padEnd(64, "8");
      expect(checkPaymentRateLimit(freshGuest, ip).allowed).toBe(false);

      // Chat rate limit for same IP is still allowed
      expect(checkChatRateLimit(ip, { limit: 10, windowMs: 60_000 }).allowed).toBe(true);
    });

    it("resetting payment rate limiter does not reset chat rate limiter", () => {
      const ip = "10.0.0.7";

      for (let i = 0; i < 10; i++) {
        checkChatRateLimit(ip, { limit: 10, windowMs: 60_000 });
      }
      expect(checkChatRateLimit(ip, { limit: 10, windowMs: 60_000 }).allowed).toBe(false);

      resetPaymentRateLimiterForTests();

      // Chat limiter remains blocked
      expect(checkChatRateLimit(ip, { limit: 10, windowMs: 60_000 }).allowed).toBe(false);
    });
  });

  describe("Bounded Storage and Eviction", () => {
    it("enforces MAX_PAYMENT_KEYS bound and evicts oldest entries", () => {
      expect(MAX_PAYMENT_KEYS).toBe(2000);

      // Fill limiter with 1000 pairs of guest + ip keys (total 2000 keys)
      for (let i = 0; i < 1000; i++) {
        const guest = `fill_guest_${i.toString().padStart(6, "0")}`.padEnd(64, "x");
        const ip = `10.${Math.floor(i / 65536)}.${Math.floor((i % 65536) / 256)}.${i % 256}`;
        checkPaymentRateLimit(guest, ip);
      }

      expect(getPaymentRateLimiterKeyCount()).toBe(2000);

      // Adding another entry causes eviction of the oldest entry
      const overflowGuest = "overflow-guest".padEnd(64, "x");
      const overflowIp = "172.16.99.99";
      checkPaymentRateLimit(overflowGuest, overflowIp);

      // Storage remains bounded at or under 2000
      expect(getPaymentRateLimiterKeyCount()).toBeLessThanOrEqual(2000);
    });
  });
});
