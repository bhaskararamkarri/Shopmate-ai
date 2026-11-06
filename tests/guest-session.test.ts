/**
 * Phase 6C — Secure Guest Session Unit Tests.
 *
 * Verifies:
 * - Session token generation and cryptographic HMAC signature.
 * - Validation of valid sessions.
 * - Rejection of tampered, malformed, or forged signatures.
 * - Rejection of expired sessions.
 * - Rejection of future timestamps exceeding clock drift.
 * - Deterministic one-way hashing of session IDs (SHA-256).
 * - Cookie serialization with HttpOnly, SameSite=Lax, Path=/, and Secure in production.
 * - Fail-closed behavior when the secret is unconfigured in production.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGuestSessionToken,
  getOrIssueGuestSession,
  hashGuestSession,
  parseGuestSessionToken,
  requireGuestSession,
  serializeGuestSessionCookie,
  GUEST_SESSION_COOKIE_NAME,
} from "@/lib/payments/guest-session";

const TEST_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("guest-session — token creation and parsing", () => {
  beforeEach(() => {
    process.env.SHOPMATE_GUEST_SESSION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.SHOPMATE_GUEST_SESSION_SECRET;
  });

  it("creates a signed guest session token and parses it successfully", () => {
    const token = createGuestSessionToken();
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const parsed = parseGuestSessionToken(token);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    expect(parsed.sessionId).toMatch(/^[0-9a-f]{32}$/);
    expect(parsed.ownerHash).toBe(hashGuestSession(parsed.sessionId));
  });

  it("rejects a token with a tampered session id or timestamp", () => {
    const token = createGuestSessionToken();
    const [id, ts, sig] = token.split(".");

    // Tampered session ID
    const tamperedId = `${id.slice(0, -1)}x`;
    expect(parseGuestSessionToken(`${tamperedId}.${ts}.${sig}`).valid).toBe(false);

    // Tampered timestamp
    const tamperedTs = String(Number(ts) + 1000);
    expect(parseGuestSessionToken(`${id}.${tamperedTs}.${sig}`).valid).toBe(false);

    // Tampered signature
    const tamperedSig = sig.endsWith("a") ? `${sig.slice(0, -1)}b` : `${sig.slice(0, -1)}a`;
    expect(parseGuestSessionToken(`${id}.${ts}.${tamperedSig}`).valid).toBe(false);
  });

  it("rejects an expired guest session token", () => {
    const now = Date.now();
    const expiredTs = now - 25 * 60 * 60 * 1000; // 25 hours ago (TTL is 24h)
    const token = createGuestSessionToken({ nowMs: expiredTs });

    const parsed = parseGuestSessionToken(token, now);
    expect(parsed.valid).toBe(false);
    if (parsed.valid) return;
    expect(parsed.reason).toBe("expired");
  });

  it("rejects a token with a timestamp too far in the future", () => {
    const now = Date.now();
    const futureTs = now + 5 * 60 * 1000; // 5 minutes in future (drift allowed is max 1 min)
    const token = createGuestSessionToken({ nowMs: futureTs });

    const parsed = parseGuestSessionToken(token, now);
    expect(parsed.valid).toBe(false);
    if (parsed.valid) return;
    expect(parsed.reason).toBe("future_timestamp");
  });

  it("rejects malformed token strings", () => {
    expect(parseGuestSessionToken("").valid).toBe(false);
    expect(parseGuestSessionToken("invalid-token").valid).toBe(false);
    expect(parseGuestSessionToken("part1.part2").valid).toBe(false);
    expect(parseGuestSessionToken("part1.part2.part3.part4").valid).toBe(false);
  });
});

describe("guest-session — hashing", () => {
  it("produces deterministic 64-character hex SHA-256 hashes", () => {
    const id = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    const hash1 = hashGuestSession(id);
    const hash2 = hashGuestSession(id);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash1).not.toBe(id);
  });

  it("produces distinct hashes for different session IDs", () => {
    const id1 = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    const id2 = "b1b2c3d4e5f60718293a4b5c6d7e8f91";
    expect(hashGuestSession(id1)).not.toBe(hashGuestSession(id2));
  });
});

describe("guest-session — cookie serialization", () => {
  it("serializes cookie with HttpOnly, SameSite=Lax, Path=/", () => {
    const token = "mock-token-abc";
    const cookie = serializeGuestSessionCookie(token, false);
    expect(cookie).toContain(`${GUEST_SESSION_COOKIE_NAME}=${token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=");
    expect(cookie).not.toContain("Secure");
  });

  it("includes Secure flag when secure=true or in production", () => {
    const token = "mock-token-abc";
    const cookie = serializeGuestSessionCookie(token, true);
    expect(cookie).toContain("Secure");
  });
});

describe("guest-session — request helpers", () => {
  beforeEach(() => {
    process.env.SHOPMATE_GUEST_SESSION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.SHOPMATE_GUEST_SESSION_SECRET;
  });

  it("getOrIssueGuestSession reuses a valid session cookie", () => {
    const token = createGuestSessionToken();
    const req = new Request("http://localhost/api/paypal/orders", {
      headers: { cookie: `${GUEST_SESSION_COOKIE_NAME}=${token}` },
    });

    const result = getOrIssueGuestSession(req);
    expect(result.session).toBeDefined();
    expect(result.isNew).toBe(false);
    expect(result.setCookie).toBeUndefined();
    expect(result.session.ownerHash).toBe(hashGuestSession(token.split(".")[0]!));
  });

  it("getOrIssueGuestSession issues a new session if cookie is missing", () => {
    const req = new Request("http://localhost/api/paypal/orders");
    const result = getOrIssueGuestSession(req);
    expect(result.session).toBeDefined();
    expect(result.isNew).toBe(true);
    expect(result.setCookie).toBeDefined();
    expect(result.setCookie).toContain(GUEST_SESSION_COOKIE_NAME);
  });

  it("getOrIssueGuestSession issues a new session if cookie is tampered", () => {
    const req = new Request("http://localhost/api/paypal/orders", {
      headers: { cookie: `${GUEST_SESSION_COOKIE_NAME}=bad-tampered-token` },
    });
    const result = getOrIssueGuestSession(req);
    expect(result.session).toBeDefined();
    expect(result.isNew).toBe(true);
    expect(result.setCookie).toBeDefined();
  });

  it("requireGuestSession returns ok for a valid session", () => {
    const token = createGuestSessionToken();
    const req = new Request("http://localhost/api/paypal/orders/123/capture", {
      headers: { cookie: `${GUEST_SESSION_COOKIE_NAME}=${token}` },
    });
    const result = requireGuestSession(req);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.ownerHash).toBe(hashGuestSession(token.split(".")[0]!));
  });

  it("requireGuestSession returns error if session is missing or invalid", () => {
    const emptyReq = new Request("http://localhost/api/paypal/orders/123/capture");
    const emptyResult = requireGuestSession(emptyReq);
    expect(emptyResult.ok).toBe(false);
    if (emptyResult.ok) return;
    expect(emptyResult.error).toBe("missing");

    const badReq = new Request("http://localhost/api/paypal/orders/123/capture", {
      headers: { cookie: `${GUEST_SESSION_COOKIE_NAME}=tampered.token.here` },
    });
    const badResult = requireGuestSession(badReq);
    expect(badResult.ok).toBe(false);
    if (badResult.ok) return;
    expect(badResult.error).toBe("invalid");
  });

  it("fails closed in production if SHOPMATE_GUEST_SESSION_SECRET is missing", () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      delete process.env.SHOPMATE_GUEST_SESSION_SECRET;

      const req = new Request("http://localhost/api/paypal/orders");
      expect(() => getOrIssueGuestSession(req)).toThrow(/SHOPMATE_GUEST_SESSION_SECRET/);

      const captureReq = new Request("http://localhost/api/paypal/orders/123/capture");
      const result = requireGuestSession(captureReq);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("unconfigured");
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
    }
  });
});
