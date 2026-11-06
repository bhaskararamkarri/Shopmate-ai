import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  GUEST_SESSION_COOKIE_NAME,
  GUEST_SESSION_TTL_MS,
  GuestSessionConfigError,
  createGuestSessionCookie,
  extractGuestSessionCookie,
  getGuestSessionCookieOptions,
  hashGuestSession,
  isGuestSessionConfigured,
  serializeGuestSessionCookie,
  verifyGuestSessionCookie,
  verifyGuestSessionFromRequest,
} from "@/lib/payments/guest-session";

const TEST_SECRET =
  "test-secret-at-least-32-chars-long-0123456789abcdef0123456789";

describe("guest-session module (Milestone 1)", () => {
  beforeEach(() => {
    process.env.SHOPMATE_GUEST_SESSION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.SHOPMATE_GUEST_SESSION_SECRET;
  });

  describe("createGuestSessionCookie", () => {
    it("generates a 4-part signed cookie string with 256-bit entropy", () => {
      const { cookieValue, session } = createGuestSessionCookie();
      expect(typeof cookieValue).toBe("string");

      const parts = cookieValue.split(".");
      expect(parts).toHaveLength(4);

      const [sessionId, createdAtStr, expiresAtStr, signature] = parts;
      expect(sessionId).toMatch(/^[0-9a-f]{64}$/);
      expect(signature).toMatch(/^[0-9a-f]{64}$/);

      const createdAtMs = Number(createdAtStr);
      const expiresAtMs = Number(expiresAtStr);
      expect(Number.isSafeInteger(createdAtMs)).toBe(true);
      expect(Number.isSafeInteger(expiresAtMs)).toBe(true);
      expect(expiresAtMs - createdAtMs).toBe(GUEST_SESSION_TTL_MS);

      expect(session.sessionId).toBe(sessionId);
      expect(session.createdAtMs).toBe(createdAtMs);
      expect(session.expiresAtMs).toBe(expiresAtMs);
    });

    it("respects custom ttlMs parameter", () => {
      const customTtl = 3600_000; // 1 hour
      const { session } = createGuestSessionCookie(customTtl);
      expect(session.expiresAtMs - session.createdAtMs).toBe(customTtl);
    });

    it("fails closed with GuestSessionConfigError if secret is unconfigured", () => {
      delete process.env.SHOPMATE_GUEST_SESSION_SECRET;
      expect(() => createGuestSessionCookie()).toThrow(GuestSessionConfigError);
    });
  });

  describe("verifyGuestSessionCookie", () => {
    it("successfully verifies a genuine cookie and returns verified session with owner hash", () => {
      const { cookieValue, session } = createGuestSessionCookie();
      const result = verifyGuestSessionCookie(cookieValue);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.session.sessionId).toBe(session.sessionId);
      expect(result.session.guestOwnerHash).toBe(hashGuestSession(session.sessionId));
      expect(result.session.guestOwnerHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("rejects a cookie with a tampered session ID", () => {
      const { cookieValue } = createGuestSessionCookie();
      const [id, created, expires, sig] = cookieValue.split(".");
      const tamperedId = id.endsWith("a") ? `${id.slice(0, -1)}b` : `${id.slice(0, -1)}a`;
      const tamperedCookie = `${tamperedId}.${created}.${expires}.${sig}`;

      const result = verifyGuestSessionCookie(tamperedCookie);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("session_tampered");
      expect(result.status).toBe(401);
    });

    it("rejects a cookie with tampered expiration timestamp", () => {
      const { cookieValue } = createGuestSessionCookie();
      const [id, created, expires, sig] = cookieValue.split(".");
      // Attacker tries to extend expiry by 1 hour without updating signature
      const tamperedExpires = String(Number(expires) + 3600_000);
      const tamperedCookie = `${id}.${created}.${tamperedExpires}.${sig}`;

      const result = verifyGuestSessionCookie(tamperedCookie);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("session_tampered");
      expect(result.status).toBe(401);
    });

    it("rejects a cookie with tampered signature", () => {
      const { cookieValue } = createGuestSessionCookie();
      const [id, created, expires, sig] = cookieValue.split(".");
      const tamperedSig = sig.endsWith("0") ? `${sig.slice(0, -1)}1` : `${sig.slice(0, -1)}0`;
      const tamperedCookie = `${id}.${created}.${expires}.${tamperedSig}`;

      const result = verifyGuestSessionCookie(tamperedCookie);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("session_tampered");
      expect(result.status).toBe(401);
    });

    it("rejects a cookie forged with a different secret", () => {
      const { cookieValue } = createGuestSessionCookie();
      const [id, created, expires] = cookieValue.split(".");
      const forgedSig = createHmac("sha256", "different-secret-000000000000000000000")
        .update(`${id}.${created}.${expires}`, "utf8")
        .digest("hex");
      const forgedCookie = `${id}.${created}.${expires}.${forgedSig}`;

      const result = verifyGuestSessionCookie(forgedCookie);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("session_tampered");
      expect(result.status).toBe(401);
    });

    it("rejects an expired cookie", () => {
      const now = Date.now();
      const pastCreated = now - 25 * 60 * 60 * 1000;
      const { cookieValue } = createGuestSessionCookie(24 * 60 * 60 * 1000, {
        nowMs: pastCreated,
      });

      const result = verifyGuestSessionCookie(cookieValue, now);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("session_expired");
      expect(result.status).toBe(401);
    });

    it("rejects a cookie with future timestamp exceeding clock drift allowance", () => {
      const now = Date.now();
      const futureCreated = now + 5 * 60 * 1000; // 5 minutes in future (max drift is 1 min)
      const { cookieValue } = createGuestSessionCookie(24 * 60 * 60 * 1000, {
        nowMs: futureCreated,
      });

      const result = verifyGuestSessionCookie(cookieValue, now);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("session_malformed");
      expect(result.status).toBe(401);
    });

    it("rejects malformed and missing cookies", () => {
      expect(verifyGuestSessionCookie(undefined).ok).toBe(false);
      expect(verifyGuestSessionCookie(null).ok).toBe(false);
      expect(verifyGuestSessionCookie("").ok).toBe(false);
      expect(verifyGuestSessionCookie("   ").ok).toBe(false);
      expect(verifyGuestSessionCookie("not.a.valid.format").ok).toBe(false);
      expect(verifyGuestSessionCookie("a.b.c.d").ok).toBe(false);

      const missingResult = verifyGuestSessionCookie("");
      expect(missingResult.ok).toBe(false);
      if (!missingResult.ok) {
        expect(missingResult.error).toBe("session_missing");
        expect(missingResult.status).toBe(401);
      }
    });

    it("fails closed returning HTTP 503 when secret is unconfigured", () => {
      const { cookieValue } = createGuestSessionCookie();
      delete process.env.SHOPMATE_GUEST_SESSION_SECRET;

      const result = verifyGuestSessionCookie(cookieValue);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("session_secret_missing");
      expect(result.status).toBe(503);
    });
  });

  describe("hashGuestSession", () => {
    it("produces deterministic 64-hex SHA-256 hashes", () => {
      const id = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const h1 = hashGuestSession(id);
      const h2 = hashGuestSession(id);

      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
      expect(h1).not.toBe(id);
    });

    it("produces distinct hashes for different session IDs", () => {
      const id1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const id2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
      expect(hashGuestSession(id1)).not.toBe(hashGuestSession(id2));
    });

    it("throws TypeError on non-string or empty inputs", () => {
      expect(() => hashGuestSession("")).toThrow(TypeError);
      expect(() => hashGuestSession(null as unknown as string)).toThrow(TypeError);
      expect(() => hashGuestSession(undefined as unknown as string)).toThrow(TypeError);
    });
  });

  describe("cookie options & serialization", () => {
    it("returns standard security options for guest cookie", () => {
      const opts = getGuestSessionCookieOptions();
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe("lax");
      expect(opts.path).toBe("/");
      expect(opts.maxAge).toBe(86400);
    });

    it("serializes cookie with HttpOnly, SameSite=Lax, Path=/, Max-Age", () => {
      const token = "mock-token-payload";
      const cookie = serializeGuestSessionCookie(token, false);

      expect(cookie).toContain(`${GUEST_SESSION_COOKIE_NAME}=${token}`);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Max-Age=86400");
      expect(cookie).not.toContain("Secure");
    });

    it("includes Secure flag when requested or in production", () => {
      const token = "mock-token-payload";
      const cookie = serializeGuestSessionCookie(token, true);
      expect(cookie).toContain("Secure");
    });
  });

  describe("request extraction & verification helpers", () => {
    it("extracts session from standard Request with Cookie header", () => {
      const { cookieValue } = createGuestSessionCookie();
      const req = new Request("http://localhost/api/paypal/orders", {
        headers: { cookie: `foo=bar; ${GUEST_SESSION_COOKIE_NAME}=${cookieValue}; baz=qux` },
      });

      const extracted = extractGuestSessionCookie(req);
      expect(extracted).toBe(cookieValue);

      const verified = verifyGuestSessionFromRequest(req);
      expect(verified.ok).toBe(true);
      if (verified.ok) {
        expect(verified.session.sessionId).toBe(cookieValue.split(".")[0]);
      }
    });

    it("extracts session from Headers object", () => {
      const { cookieValue } = createGuestSessionCookie();
      const headers = new Headers();
      headers.set("cookie", `${GUEST_SESSION_COOKIE_NAME}=${cookieValue}`);

      expect(extractGuestSessionCookie(headers)).toBe(cookieValue);
    });

    it("extracts session from mock NextRequest cookies object", () => {
      const { cookieValue } = createGuestSessionCookie();
      const mockNextReq = {
        cookies: {
          get: (name: string) =>
            name === GUEST_SESSION_COOKIE_NAME ? { value: cookieValue } : undefined,
        },
      };

      expect(extractGuestSessionCookie(mockNextReq)).toBe(cookieValue);
    });

    it("returns session_missing when request has no cookie header", () => {
      const req = new Request("http://localhost/api/paypal/orders");
      expect(extractGuestSessionCookie(req)).toBeNull();

      const verified = verifyGuestSessionFromRequest(req);
      expect(verified.ok).toBe(false);
      if (!verified.ok) {
        expect(verified.error).toBe("session_missing");
        expect(verified.status).toBe(401);
      }
    });

    it("checks isGuestSessionConfigured helper correctly", () => {
      expect(isGuestSessionConfigured()).toBe(true);
      delete process.env.SHOPMATE_GUEST_SESSION_SECRET;
      expect(isGuestSessionConfigured()).toBe(false);
    });
  });
});
