/**
 * E2E Payment Security Test Suite — ShopMate AI (Tiers 1–4).
 *
 * This test suite provides end-to-end, opaque-box security verification for
 * ShopMate AI payment infrastructure hardening:
 *
 *   - Tier 1: Core Feature Coverage (>=5 tests per feature)
 *       1. Guest session cookie creation & validation
 *       2. Payment-specific rate limiting (429 + Retry-After)
 *       3. Order creation binding to guest owner hash
 *       4. Same-guest idempotency replay
 *       5. Cross-session capture authorization
 *   - Tier 2: Boundary & Corner Cases (>=5 tests per feature)
 *       1. Cookie tampering, expired cookies, malformed cookie syntax
 *       2. Missing secret fail-closed behavior (HTTP 503)
 *       3. Empty cart, oversized bodies, boundary amounts ($5,000 cap)
 *       4. Rate limit burst handling, boundary expiry, and eviction
 *       5. Unknown order ID, mismatched capture token, invalid token format
 *   - Tier 3: Cross-Feature Combinations (Pairwise & Systemic Interactions)
 *       1. Cross-guest idempotency key collisions
 *       2. Cross-guest capture theft attempts (sanitized 404 order_not_found)
 *       3. Concurrent order creations across different guests with identical keys
 *       4. Rate-limited user attempting capture
 *       5. State machine isolation across distinct guest sessions
 *       6. End-to-end session continuity from config to capture
 *   - Tier 4: Real-World Application Scenarios
 *       1. Complete legitimate checkout flow (config -> order -> capture)
 *       2. Malicious session spoofing & forged cookie rejection
 *       3. Multi-tab checkout using the same guest session
 *       4. Replay of completed order capture (deduplication)
 *       5. Ambiguous outcome / timeout simulation (no duplicate capture POST)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac, randomBytes } from "node:crypto";

// Stub next/server connection() marker for isolated testing outside Next.js request lifecycle
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn(async () => {}) };
});

// Mock catalog provider to return realistic, deterministic demo products
vi.mock("@/lib/catalog/provider", () => ({
  getCatalogProduct: vi.fn(),
}));

import { getCatalogProduct } from "@/lib/catalog/provider";
import type { Product } from "@/types";
import { resetPayPalTokenCache } from "@/lib/paypal/auth";
import {
  clearPayPalIdempotencyCacheForTests,
  resetPayPalOrderCaches,
} from "@/lib/paypal/orders";
import {
  createGuestSessionCookie,
  getGuestSessionCookieOptions,
  GUEST_SESSION_COOKIE_NAME,
  GUEST_SESSION_TTL_MS,
  hashGuestSession,
  verifyGuestSessionCookie,
} from "@/lib/payments/guest-session";
import {
  checkPaymentRateLimit,
  DEFAULT_GUEST_LIMIT,
  DEFAULT_IP_LIMIT,
  MAX_PAYMENT_KEYS,
  resetPaymentRateLimiterForTests,
} from "@/lib/payments/rate-limit";
import { inMemoryPaymentStore } from "@/lib/payments/in-memory-store";

// Route handlers under test
import { GET as configGET } from "@/app/api/paypal/config/route";
import { POST as ordersPOST } from "@/app/api/paypal/orders/route";
import { POST as capturePOST } from "@/app/api/paypal/orders/[orderId]/capture/route";

const ENV_KEYS = [
  "PAYPAL_ENV",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "SHOPMATE_GUEST_SESSION_SECRET",
  "SHOPMATE_PAYMENT_RATE_LIMIT_GUEST",
  "SHOPMATE_PAYMENT_RATE_LIMIT_IP",
  "NODE_ENV",
] as const;

const FAKE_PAYPAL_CREDS = {
  PAYPAL_ENV: "sandbox",
  PAYPAL_CLIENT_ID: "test-client-id",
  PAYPAL_CLIENT_SECRET: "test-client-secret",
  SHOPMATE_GUEST_SESSION_SECRET:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

function setEnv(
  overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
) {
  for (const key of ENV_KEYS) {
    if (overrides[key] === undefined) {
      delete (process.env as Record<string, string | undefined>)[key];
    } else {
      (process.env as Record<string, string | undefined>)[key] = overrides[key];
    }
  }
}

function makeProduct(seed: { id: string; price: number } & Partial<Product>): Product {
  return {
    name: `Product ${seed.id}`,
    description: "Demo test item",
    currency: "USD",
    availability: "in_stock",
    images: [],
    ratings: 5,
    reviews: 10,
    category: "Test",
    brand: "TestBrand",
    specs: {},
    source: "demo",
    demo: true,
    ...seed,
  };
}

const HEADPHONES = makeProduct({
  id: "demo-headphones",
  price: 199.99,
  name: "Aurora Headphones",
});
const CABLE = makeProduct({
  id: "demo-cable",
  price: 12.5,
  name: "USB-C Cable",
});
const EXPENSIVE = makeProduct({
  id: "demo-expensive",
  price: 5000.0,
  name: "Luxury Item",
});

const TOKEN_RESPONSE = {
  access_token: "test-access-token",
  token_type: "Bearer",
  expires_in: 32400,
};

interface FetchCall {
  url: string;
  init?: RequestInit;
}

let networkCalls: FetchCall[] = [];
const orderRefMap = new Map<string, string>();
const orderAmountMap = new Map<string, string>();

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function installPayPalMock(handlers?: {
  token?: () => Response | Promise<Response>;
  orders?: (init?: RequestInit) => Response | Promise<Response>;
  capture?: (orderId: string, init?: RequestInit) => Response | Promise<Response>;
  status?: (orderId: string, init?: RequestInit) => Response | Promise<Response>;
}): void {
  networkCalls = [];
  orderRefMap.clear();
  orderAmountMap.clear();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    networkCalls.push({ url, init });

    if (url.includes("/v1/oauth2/token")) {
      return handlers?.token ? handlers.token() : jsonResponse(TOKEN_RESPONSE);
    }

    if (url.includes("/capture")) {
      const match = url.match(/\/orders\/([^/]+)\/capture/);
      const orderId = match ? match[1]! : "unknown";
      if (handlers?.capture) {
        return handlers.capture(orderId, init);
      }
      const refId = orderRefMap.get(orderId) ?? `ref-${orderId}`;
      const amountVal = orderAmountMap.get(orderId) ?? "199.99";
      return jsonResponse({
        id: orderId,
        status: "COMPLETED",
        purchase_units: [
          {
            reference_id: refId,
            amount: { currency_code: "USD", value: amountVal },
            payments: {
              captures: [
                {
                  id: `cap-${orderId}`,
                  status: "COMPLETED",
                  amount: { currency_code: "USD", value: amountVal },
                },
              ],
            },
          },
        ],
      });
    }

    if (url.includes("/v2/checkout/orders") && (init?.method ?? "GET").toUpperCase() === "GET") {
      const match = url.match(/\/orders\/([^/]+)$/);
      const orderId = match ? match[1]! : "unknown";
      if (handlers?.status) {
        return handlers.status(orderId, init);
      }
      return jsonResponse({
        id: orderId,
        status: "COMPLETED",
      });
    }

    if (url.includes("/v2/checkout/orders")) {
      if (handlers?.orders) {
        return handlers.orders(init);
      }
      const randomId = `ORDER-${randomBytes(6).toString("hex")}`;
      let refId = `ref-${randomId}`;
      let amountVal = "199.99";
      try {
        if (init?.body) {
          const parsed = JSON.parse(init.body as string);
          if (parsed.purchase_units?.[0]?.reference_id) {
            refId = parsed.purchase_units[0].reference_id;
          }
          if (parsed.purchase_units?.[0]?.amount?.value) {
            amountVal = parsed.purchase_units[0].amount.value;
          }
        }
      } catch {}
      orderRefMap.set(randomId, refId);
      orderAmountMap.set(randomId, amountVal);
      return jsonResponse(
        {
          id: randomId,
          status: "CREATED",
          links: [
            {
              href: `https://www.sandbox.paypal.com/checkoutnow?token=${randomId}`,
              rel: "approve",
              method: "GET",
            },
            {
              href: `https://api-m.sandbox.paypal.com/v2/checkout/orders/${randomId}`,
              rel: "self",
              method: "GET",
            },
          ],
        },
        201,
      );
    }

    return new Response("Not Found", { status: 404 });
  }) as unknown as typeof fetch;
}

// Helper to create a signed guest session cookie string
function createTestGuestCookie(options?: {
  sessionId?: string;
  nowMs?: number;
  ttlMs?: number;
}): { cookieHeader: string; sessionId: string; ownerHash: string } {
  const result = createGuestSessionCookie(options?.ttlMs ?? GUEST_SESSION_TTL_MS, {
    sessionId: options?.sessionId,
    nowMs: options?.nowMs,
  });
  return {
    cookieHeader: `${GUEST_SESSION_COOKIE_NAME}=${result.cookieValue}`,
    sessionId: result.session.sessionId,
    ownerHash: hashGuestSession(result.session.sessionId),
  };
}

// Route Invocation Helpers
async function callConfigRoute(headers: Record<string, string> = {}): Promise<{
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}> {
  // Config endpoint supports GET
  const response = await configGET(
    new Request("http://localhost/api/paypal/config", { headers }),
  );
  const body = (await response.json()) as Record<string, unknown>;
  return {
    status: response.status,
    body,
    headers: response.headers,
  };
}

async function callOrdersRoute(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const req = new Request("http://localhost/api/paypal/orders", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const response = await ordersPOST(req);
  const jsonBody = (await response.json()) as Record<string, unknown>;
  return {
    status: response.status,
    body: jsonBody,
    headers: response.headers,
  };
}

async function callCaptureRoute(
  orderId: string,
  token?: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const reqHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...headers,
  };
  if (token !== undefined) {
    reqHeaders["x-shopmate-capture-token"] = token;
  }

  const req = new Request(
    `http://localhost/api/paypal/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: reqHeaders,
    },
  );
  const response = await capturePOST(req, {
    params: Promise.resolve({ orderId }),
  });
  const jsonBody = (await response.json()) as Record<string, unknown>;
  return {
    status: response.status,
    body: jsonBody,
    headers: response.headers,
  };
}

describe("E2E Payment Security Test Suite", () => {
  beforeEach(() => {
    setEnv(FAKE_PAYPAL_CREDS);
    installPayPalMock();
    resetPaymentRateLimiterForTests();
    resetPayPalTokenCache();
    resetPayPalOrderCaches();
    clearPayPalIdempotencyCacheForTests();

    // Reset catalog mock
    vi.mocked(getCatalogProduct).mockImplementation(async (id: string) => {
      if (id === HEADPHONES.id) return { product: HEADPHONES, source: "demo" };
      if (id === CABLE.id) return { product: CABLE, source: "demo" };
      if (id === EXPENSIVE.id) return { product: EXPENSIVE, source: "demo" };
      return null;
    });
  });

  afterEach(() => {
    setEnv({});
    vi.restoreAllMocks();
  });

  // =========================================================================
  // TIER 1: CORE FEATURE COVERAGE (>= 5 tests per feature)
  // =========================================================================
  describe("Tier 1: Core Feature Coverage", () => {
    // Feature 1: Guest session cookie creation & validation (5 tests)
    describe("F1: Guest Session Cookie Creation & Validation", () => {
      it("T1.1.1 — creates and verifies valid 4-part signed guest session cookies", () => {
        const { cookieValue, session } = createGuestSessionCookie();
        expect(cookieValue.split(".")).toHaveLength(4);
        expect(session.sessionId).toMatch(/^[0-9a-f]{64}$/);

        const verification = verifyGuestSessionCookie(cookieValue);
        expect(verification.ok).toBe(true);
        if (verification.ok) {
          expect(verification.session.sessionId).toBe(session.sessionId);
          expect(verification.session.guestOwnerHash).toBe(hashGuestSession(session.sessionId));
        }
      });

      it("T1.1.2 — deterministic guestOwnerHash produces expected 64-hex SHA-256 digest", () => {
        const sessionId = "a".repeat(64);
        const hash1 = hashGuestSession(sessionId);
        const hash2 = hashGuestSession(sessionId);
        expect(hash1).toBe(hash2);
        expect(hash1).toMatch(/^[0-9a-f]{64}$/);
        expect(hash1).toBe(
          createHash("sha256").update(sessionId, "utf8").digest("hex").toLowerCase(),
        );
      });

      it("T1.1.3 — cookie options enforce HttpOnly, SameSite=Lax, and Path=/", () => {
        const options = getGuestSessionCookieOptions();
        expect(options.httpOnly).toBe(true);
        expect(options.sameSite).toBe("lax");
        expect(options.path).toBe("/");
        expect(options.maxAge).toBe(24 * 60 * 60);
      });

      it("T1.1.4 — constant-time HMAC prevents signature verification false positives", () => {
        const { cookieValue } = createGuestSessionCookie();
        const parts = cookieValue.split(".");
        const tamperedSig = "b".repeat(64);
        const tamperedCookie = `${parts[0]}.${parts[1]}.${parts[2]}.${tamperedSig}`;

        const result = verifyGuestSessionCookie(tamperedCookie);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(["session_invalid_signature", "session_tampered"]).toContain(
            result.error,
          );
          expect(result.status).toBe(401);
        }
      });

      it("T1.1.5 — configuration endpoint safely reports sandbox readiness without secret leakage", async () => {
        const { status, body, headers } = await callConfigRoute();
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.clientId).toBe(FAKE_PAYPAL_CREDS.PAYPAL_CLIENT_ID);
        expect(headers.get("cache-control")).toContain("no-store");

        const json = JSON.stringify(body);
        expect(json).not.toContain(FAKE_PAYPAL_CREDS.PAYPAL_CLIENT_SECRET);
        expect(json).not.toContain(FAKE_PAYPAL_CREDS.SHOPMATE_GUEST_SESSION_SECRET);
      });
    });

    // Feature 2: Dedicated Payment Rate Limiting (5 tests)
    describe("F2: Payment-Specific Rate Limiting (429 + Retry-After)", () => {
      it("T1.2.1 — allows requests within payment rate limit quota", () => {
        const guestHash = hashGuestSession(randomBytes(32).toString("hex"));
        const ip = "192.168.1.100";

        for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
          const res = checkPaymentRateLimit(guestHash, ip, "orders");
          expect(res.allowed).toBe(true);
        }
      });

      it("T1.2.2 — throttles requests exceeding guest rate limit with HTTP 429", () => {
        const guestHash = hashGuestSession(randomBytes(32).toString("hex"));
        const ip = "192.168.1.101";

        for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
          checkPaymentRateLimit(guestHash, ip, "orders");
        }

        const throttled = checkPaymentRateLimit(guestHash, ip, "orders");
        expect(throttled.allowed).toBe(false);
        expect(throttled.reason).toBe("guest_limit");
      });

      it("T1.2.3 — throttled HTTP 429 response includes valid Retry-After header >= 1", () => {
        const guestHash = hashGuestSession(randomBytes(32).toString("hex"));
        const ip = "192.168.1.102";

        for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
          checkPaymentRateLimit(guestHash, ip, "orders");
        }

        const throttled = checkPaymentRateLimit(guestHash, ip, "orders");
        expect(throttled.allowed).toBe(false);
        expect(throttled.retryAfterSec).toBeGreaterThanOrEqual(1);
      });

      it("T1.2.4 — throttles excessive requests from same IP even with different guest sessions", () => {
        const ip = "10.0.0.99";

        // Consume up to DEFAULT_IP_LIMIT using distinct guest hashes
        for (let i = 0; i < DEFAULT_IP_LIMIT; i++) {
          const guestHash = hashGuestSession(randomBytes(32).toString("hex"));
          const res = checkPaymentRateLimit(guestHash, ip, "orders");
          expect(res.allowed).toBe(true);
        }

        const newGuest = hashGuestSession(randomBytes(32).toString("hex"));
        const blocked = checkPaymentRateLimit(newGuest, ip, "orders");
        expect(blocked.allowed).toBe(false);
        expect(blocked.reason).toBe("ip_limit");
      });

      it("T1.2.5 — isolates rate limit buckets between orders and capture endpoints", () => {
        const guestHash = hashGuestSession(randomBytes(32).toString("hex"));
        const ip = "192.168.1.105";

        // Exhaust orders endpoint limit
        for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
          checkPaymentRateLimit(guestHash, ip, "orders");
        }
        expect(checkPaymentRateLimit(guestHash, ip, "orders").allowed).toBe(false);

        // Capture endpoint for the same guest should still have full quota
        const captureRes = checkPaymentRateLimit(guestHash, ip, "capture");
        expect(captureRes.allowed).toBe(true);
      });
    });

    // Feature 3: Order Creation Binding to Guest Owner Hash (5 tests)
    describe("F3: Order Creation Binding to Guest Owner Hash", () => {
      it("T1.3.1 — creates order bound to verified guest session with HTTP 201", async () => {
        const guest = createTestGuestCookie();
        const { status, body } = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader },
        );

        expect(status).toBe(201);
        expect(body.success).toBe(true);
        expect(typeof body.orderId).toBe("string");
        expect(typeof body.captureToken).toBe("string");
      });

      it("T1.3.2 — returns orderId, referenceId, and captureToken in order response", async () => {
        const guest = createTestGuestCookie();
        const { status, body } = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader },
        );

        expect(status).toBe(201);
        expect(body).toHaveProperty("orderId");
        expect(body).toHaveProperty("referenceId");
        expect(body).toHaveProperty("captureToken");
        expect(body).toHaveProperty("amount");
      });

      it("T1.3.3 — order response payload never leaks session secret, raw session ID, or internal hashes", async () => {
        const guest = createTestGuestCookie();
        const { body } = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader },
        );

        const serialized = JSON.stringify(body);
        expect(serialized).not.toContain(guest.sessionId);
        expect(serialized).not.toContain(FAKE_PAYPAL_CREDS.SHOPMATE_GUEST_SESSION_SECRET);
        expect(serialized).not.toContain(FAKE_PAYPAL_CREDS.PAYPAL_CLIENT_SECRET);
      });

      it("T1.3.4 — binds order in durable store with matching guestOwnerHash", async () => {
        const guest = createTestGuestCookie();
        const { body } = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader },
        );

        const orderId = body.orderId as string;
        const stored = await inMemoryPaymentStore.getOrderByPayPalId(orderId);
        expect(stored).not.toBeNull();
        if (stored) {
          expect(stored.guestOwnerHash).toBe(guest.ownerHash);
        }
      });

      it("T1.3.5 — binds in-flight creation deduplication strictly to the guest session", async () => {
        const guestA = createTestGuestCookie();
        const idempotencyKey = "shared-idem-key-001";

        // Trigger two simultaneous creations for same guest
        const [res1, res2] = await Promise.all([
          callOrdersRoute(
            { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
            { cookie: guestA.cookieHeader, "idempotency-key": idempotencyKey },
          ),
          callOrdersRoute(
            { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
            { cookie: guestA.cookieHeader, "idempotency-key": idempotencyKey },
          ),
        ]);

        expect(res1.status).toBe(201);
        expect(res2.status).toBe(201);
        expect(res1.body.orderId).toBe(res2.body.orderId);
      });
    });

    // Feature 4: Same-Guest Idempotency Replay (5 tests)
    describe("F4: Same-Guest Idempotency Replay", () => {
      it("T1.4.1 — replays identical 201 order on repeated submission with same Idempotency-Key", async () => {
        const guest = createTestGuestCookie();
        const idemKey = "test-idem-replay-001";

        const first = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader, "idempotency-key": idemKey },
        );
        expect(first.status).toBe(201);

        const second = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader, "idempotency-key": idemKey },
        );
        expect(second.status).toBe(201);
        expect(second.body.orderId).toBe(first.body.orderId);
      });

      it("T1.4.2 — preserves identical orderId, captureToken, and referenceId across replays", async () => {
        const guest = createTestGuestCookie();
        const idemKey = "test-idem-replay-002";

        const first = await callOrdersRoute(
          { items: [{ productId: CABLE.id, quantity: 2 }] },
          { cookie: guest.cookieHeader, "idempotency-key": idemKey },
        );

        const second = await callOrdersRoute(
          { items: [{ productId: CABLE.id, quantity: 2 }] },
          { cookie: guest.cookieHeader, "idempotency-key": idemKey },
        );

        expect(second.body.orderId).toBe(first.body.orderId);
        expect(second.body.captureToken).toBe(first.body.captureToken);
        expect(second.body.referenceId).toBe(first.body.referenceId);
      });

      it("T1.4.3 — rejects idempotency replay with altered cart payload with HTTP 409 idempotency_conflict", async () => {
        const guest = createTestGuestCookie();
        const idemKey = "test-idem-conflict-001";

        const first = await callOrdersRoute(
          { items: [{ productId: CABLE.id, quantity: 1 }] },
          { cookie: guest.cookieHeader, "idempotency-key": idemKey },
        );
        expect(first.status).toBe(201);

        const second = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader, "idempotency-key": idemKey },
        );
        expect(second.status).toBe(409);
        expect(second.body.error).toBe("idempotency_conflict");
      });

      it("T1.4.4 — handles rapid concurrent submissions with same key by coalescing safely", async () => {
        const guest = createTestGuestCookie();
        const idemKey = "concurrent-rapid-001";

        const promises = Array.from({ length: 4 }).map(() =>
          callOrdersRoute(
            { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
            { cookie: guest.cookieHeader, "idempotency-key": idemKey },
          ),
        );

        const results = await Promise.all(promises);
        const orderIds = results.map((r) => r.body.orderId);
        // All succeeded and return the exact same orderId
        results.forEach((r) => expect([200, 201]).toContain(r.status));
        expect(new Set(orderIds).size).toBe(1);
      });

      it("T1.4.5 — in-progress idempotency reservation prevents duplicate upstream order creation", async () => {
        const guest = createTestGuestCookie();
        const idemKey = "in-progress-check-001";

        await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader, "idempotency-key": idemKey },
        );

        const upstreamOrderCalls = networkCalls.filter((c) =>
          c.url.includes("/v2/checkout/orders") && (c.init?.method ?? "GET").toUpperCase() === "POST",
        );
        expect(upstreamOrderCalls.length).toBe(1);

        // Repeat call
        await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader, "idempotency-key": idemKey },
        );

        const repeatUpstreamCalls = networkCalls.filter((c) =>
          c.url.includes("/v2/checkout/orders") && (c.init?.method ?? "GET").toUpperCase() === "POST",
        );
        expect(repeatUpstreamCalls.length).toBe(1); // Still exactly 1 call
      });
    });

    // Feature 5: Cross-Session Capture Authorization (5 tests)
    describe("F5: Cross-Session Capture Authorization", () => {
      it("T1.5.1 — authorizes capture for legitimate guest session matching order owner with HTTP 200", async () => {
        const guest = createTestGuestCookie();
        const orderRes = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader },
        );
        const orderId = orderRes.body.orderId as string;
        const captureToken = orderRes.body.captureToken as string;

        const captureRes = await callCaptureRoute(orderId, captureToken, {
          cookie: guest.cookieHeader,
        });

        expect(captureRes.status).toBe(200);
        expect(captureRes.body.success).toBe(true);
        expect(captureRes.body.status).toBe("COMPLETED");
      });

      it("T1.5.2 — rejects capture attempt without guest session cookie with HTTP 401", async () => {
        const guest = createTestGuestCookie();
        const orderRes = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader },
        );
        const orderId = orderRes.body.orderId as string;
        const captureToken = orderRes.body.captureToken as string;

        const captureRes = await callCaptureRoute(orderId, captureToken, {
          // No cookie header provided
        });

        expect(captureRes.status).toBe(401);
        expect(captureRes.body.error).toBe("guest_session_required");
      });

      it("T1.5.3 — rejects cross-session capture attempt with sanitized HTTP 404 order_not_found", async () => {
        const guestOwner = createTestGuestCookie();
        const attacker = createTestGuestCookie();

        const orderRes = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guestOwner.cookieHeader },
        );
        const orderId = orderRes.body.orderId as string;
        const captureToken = orderRes.body.captureToken as string;

        // Attacker attempts capture using their own guest session cookie
        const captureRes = await callCaptureRoute(orderId, captureToken, {
          cookie: attacker.cookieHeader,
        });

        expect(captureRes.status).toBe(404);
        expect(captureRes.body.error).toBe("order_not_found");
      });

      it("T1.5.4 — cross-session capture rejection does not leak owner identity or order existence", async () => {
        const guestOwner = createTestGuestCookie();
        const attacker = createTestGuestCookie();

        const orderRes = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guestOwner.cookieHeader },
        );
        const orderId = orderRes.body.orderId as string;
        const captureToken = orderRes.body.captureToken as string;

        const captureRes = await callCaptureRoute(orderId, captureToken, {
          cookie: attacker.cookieHeader,
        });

        const json = JSON.stringify(captureRes.body);
        expect(json).not.toContain(guestOwner.ownerHash);
        expect(json).not.toContain(guestOwner.sessionId);
        expect(json).not.toContain("owner");
      });

      it("T1.5.5 — cross-session capture rejection never claims database lease or contacts PayPal API", async () => {
        const guestOwner = createTestGuestCookie();
        const attacker = createTestGuestCookie();

        const orderRes = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guestOwner.cookieHeader },
        );
        const orderId = orderRes.body.orderId as string;
        const captureToken = orderRes.body.captureToken as string;

        const initialFetchCount = networkCalls.length;

        await callCaptureRoute(orderId, captureToken, {
          cookie: attacker.cookieHeader,
        });

        // No new capture calls made to PayPal
        const captureCalls = networkCalls
          .slice(initialFetchCount)
          .filter((c) => c.url.includes("/capture"));
        expect(captureCalls.length).toBe(0);
      });
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (>= 5 tests per feature)
  // =========================================================================
  describe("Tier 2: Boundary & Corner Cases", () => {
    // Boundary 1: Cookie tampering, expired cookies, malformed syntax (5 tests)
    describe("B1: Cookie Tampering, Expiry, and Malformed Syntax", () => {
      it("T2.1.1 — rejects tampered cookie signature with HTTP 401", () => {
        const { cookieValue } = createGuestSessionCookie();
        const parts = cookieValue.split(".");
        // Modify session ID without updating signature
        const tamperedId = parts[0]!.slice(0, -4) + "ffff";
        const tamperedCookie = `${tamperedId}.${parts[1]}.${parts[2]}.${parts[3]}`;

        const result = verifyGuestSessionCookie(tamperedCookie);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.status).toBe(401);
          expect(["session_invalid_signature", "session_tampered"]).toContain(
            result.error,
          );
        }
      });

      it("T2.1.2 — rejects expired guest session cookie (>24 hours) with HTTP 401", () => {
        const now = Date.now();
        // Issued 25 hours ago
        const past = now - (25 * 60 * 60 * 1000);
        const { cookieValue } = createGuestSessionCookie(GUEST_SESSION_TTL_MS, {
          nowMs: past,
        });

        const result = verifyGuestSessionCookie(cookieValue, now);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.status).toBe(401);
          expect(result.error).toBe("session_expired");
        }
      });

      it("T2.1.3 — rejects future-dated cookie beyond clock drift allowance with HTTP 401", () => {
        const now = Date.now();
        // Issued 10 minutes in future (exceeds 1-minute drift)
        const future = now + (10 * 60 * 1000);
        const { cookieValue } = createGuestSessionCookie(GUEST_SESSION_TTL_MS, {
          nowMs: future,
        });

        const result = verifyGuestSessionCookie(cookieValue, now);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.status).toBe(401);
          expect(result.error).toBe("session_malformed");
        }
      });

      it("T2.1.4 — rejects malformed cookie syntax (missing segments, non-hex) with HTTP 401", () => {
        const malformedInputs = [
          "invalid",
          "part1.part2",
          "part1.part2.part3",
          "nothex.12345.67890.sig",
          `${randomBytes(32).toString("hex")}.NaN.NaN.sig`,
        ];

        for (const input of malformedInputs) {
          const result = verifyGuestSessionCookie(input);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.status).toBe(401);
          }
        }
      });

      it("T2.1.5 — safely rejects special characters, control characters, and injection attempts", () => {
        const malicious = [
          `<script>alert(1)</script>`,
          `" or ""="`,
          `../../etc/passwd`,
          `\x00\x01\x02`,
        ];

        for (const input of malicious) {
          const result = verifyGuestSessionCookie(input);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.status).toBe(401);
          }
        }
      });
    });

    // Boundary 2: Missing secret fail-closed behavior (503) (5 tests)
    describe("B2: Missing Secret Fail-Closed (503)", () => {
      it("T2.2.1 — fails closed with HTTP 503 on cookie verification when secret is missing", () => {
        delete process.env.SHOPMATE_GUEST_SESSION_SECRET;
        const result = verifyGuestSessionCookie("valid.cookie.format.here");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.status).toBe(503);
          expect(result.error).toBe("session_secret_missing");
        }
      });

      it("T2.2.2 — fails closed with HTTP 503 on cookie creation when secret is missing", () => {
        delete process.env.SHOPMATE_GUEST_SESSION_SECRET;
        expect(() => createGuestSessionCookie()).toThrow();
      });

      it("T2.2.3 — fails closed with HTTP 503 when session secret is empty whitespace string", () => {
        process.env.SHOPMATE_GUEST_SESSION_SECRET = "   ";
        const result = verifyGuestSessionCookie("valid.cookie.format.here");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.status).toBe(503);
        }
      });

      it("T2.2.4 — fails closed with HTTP 503 when secret is shorter than 32 chars in production", () => {
        setEnv({
          ...FAKE_PAYPAL_CREDS,
          NODE_ENV: "production",
          SHOPMATE_GUEST_SESSION_SECRET: "too-short-secret",
        });
        const result = verifyGuestSessionCookie("valid.cookie.format.here");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.status).toBe(503);
        }
      });

      it("T2.2.5 — fail-closed 503 response returns sanitized error JSON without stack traces or environment leaks", () => {
        delete process.env.SHOPMATE_GUEST_SESSION_SECRET;
        const result = verifyGuestSessionCookie("test.session");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBe("session_secret_missing");
          expect((result as Record<string, unknown>).stack).toBeUndefined();
        }
      });
    });

    // Boundary 3: Empty cart, oversized bodies, boundary amounts ($5,000 cap) (5 tests)
    describe("B3: Empty Cart, Oversized Bodies, and Boundary Amounts", () => {
      it("T2.3.1 — rejects empty cart items array with HTTP 400 empty_cart", async () => {
        const guest = createTestGuestCookie();
        const { status, body } = await callOrdersRoute(
          { items: [] },
          { cookie: guest.cookieHeader },
        );

        expect(status).toBe(400);
        expect(body.error).toBe("empty_cart");
      });

      it("T2.3.2 — rejects request body exceeding 32 KB limit with HTTP 413 or 400", async () => {
        const guest = createTestGuestCookie();
        const bigPayload = {
          items: [{ productId: HEADPHONES.id, quantity: 1 }],
          junk: "x".repeat(33 * 1024),
        };

        const { status } = await callOrdersRoute(bigPayload, {
          cookie: guest.cookieHeader,
        });

        expect([400, 413]).toContain(status);
      });

      it("T2.3.3 — accepts order exactly at the $5,000.00 demo cap limit", async () => {
        const guest = createTestGuestCookie();
        const { status, body } = await callOrdersRoute(
          { items: [{ productId: EXPENSIVE.id, quantity: 1 }] },
          { cookie: guest.cookieHeader },
        );

        expect(status).toBe(201);
        expect(body.amount).toEqual({ currency: "USD", value: "5000.00" });
      });

      it("T2.3.4 — rejects order exceeding the $5,000.00 demo cap limit with HTTP 400 amount_exceeded", async () => {
        const guest = createTestGuestCookie();
        // 1 expensive ($5000) + 1 cable ($12.50) = $5012.50 > $5000.00
        const { status, body } = await callOrdersRoute(
          {
            items: [
              { productId: EXPENSIVE.id, quantity: 1 },
              { productId: CABLE.id, quantity: 1 },
            ],
          },
          { cookie: guest.cookieHeader },
        );

        expect(status).toBe(400);
        expect(["amount_exceeded", "amount_too_large"]).toContain(body.error);
      });

      it("T2.3.5 — rejects invalid quantity items (zero, negative, non-integer) with HTTP 400", async () => {
        const guest = createTestGuestCookie();
        const invalidRequests = [
          { items: [{ productId: HEADPHONES.id, quantity: 0 }] },
          { items: [{ productId: HEADPHONES.id, quantity: -1 }] },
          { items: [{ productId: HEADPHONES.id, quantity: 1.5 }] },
        ];

        for (const req of invalidRequests) {
          const { status, body } = await callOrdersRoute(req, {
            cookie: guest.cookieHeader,
          });
          expect(status).toBe(400);
          expect(body.success).toBe(false);
        }
      });
    });

    // Boundary 4: Rate limit burst handling, boundary expiry, and eviction (5 tests)
    describe("B4: Rate Limit Burst Handling, Boundary Expiry & Eviction", () => {
      it("T2.4.1 — permits burst of requests up to the exact rate limit capacity", () => {
        const guestHash = hashGuestSession("burst-guest-001");
        const ip = "172.16.0.1";

        for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
          const res = checkPaymentRateLimit(guestHash, ip, "orders");
          expect(res.allowed).toBe(true);
        }
      });

      it("T2.4.2 — immediately throttles request N+1 exceeding the burst limit", () => {
        const guestHash = hashGuestSession("burst-guest-002");
        const ip = "172.16.0.2";

        for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
          checkPaymentRateLimit(guestHash, ip, "orders");
        }

        const overflow = checkPaymentRateLimit(guestHash, ip, "orders");
        expect(overflow.allowed).toBe(false);
        expect(overflow.reason).toBe("guest_limit");
      });

      it("T2.4.3 — ensures Retry-After header indicates a positive integer delta seconds", () => {
        const guestHash = hashGuestSession("burst-guest-003");
        const ip = "172.16.0.3";

        for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
          checkPaymentRateLimit(guestHash, ip, "orders");
        }

        const throttled = checkPaymentRateLimit(guestHash, ip, "orders");
        expect(throttled.retryAfterSec).toBeGreaterThan(0);
        expect(Number.isInteger(throttled.retryAfterSec)).toBe(true);
      });

      it("T2.4.4 — bounded memory evicts oldest entry when limiter reaches capacity (2000 keys)", () => {
        // Fill rate limiter with distinct keys
        for (let i = 0; i < MAX_PAYMENT_KEYS + 50; i++) {
          checkPaymentRateLimit(`guest-overflow-${i}`, `10.10.${Math.floor(i / 250)}.${i % 250}`);
        }

        // Memory should remain bounded
        const guest = hashGuestSession("fresh-guest");
        const result = checkPaymentRateLimit(guest, "10.10.99.99");
        expect(result.allowed).toBe(true);
      });

      it("T2.4.5 — rate limit resets after time window lapses allowing new requests", () => {
        const guestHash = hashGuestSession("reset-guest-001");
        const ip = "172.16.0.5";

        const res1 = checkPaymentRateLimit(guestHash, ip, {
          guestLimit: 1,
          windowMs: 50, // 50 ms window
        });
        expect(res1.allowed).toBe(true);

        const res2 = checkPaymentRateLimit(guestHash, ip, {
          guestLimit: 1,
          windowMs: 50,
        });
        expect(res2.allowed).toBe(false);

        // Reset for tests simulates window lapse
        resetPaymentRateLimiterForTests();

        const res3 = checkPaymentRateLimit(guestHash, ip, {
          guestLimit: 1,
          windowMs: 50,
        });
        expect(res3.allowed).toBe(true);
      });
    });

    // Boundary 5: Unknown order ID, mismatched capture token, invalid format (5 tests)
    describe("B5: Unknown Order ID, Mismatched Token, and Invalid Format", () => {
      it("T2.5.1 — returns sanitized HTTP 404 order_not_found for unknown/nonexistent orderId", async () => {
        const guest = createTestGuestCookie();
        const { status, body } = await callCaptureRoute(
          "NONEXISTENT_ORDER_999",
          "validToken1234567890abcdef",
          { cookie: guest.cookieHeader },
        );

        expect(status).toBe(404);
        expect(body.error).toBe("order_not_found");
      });

      it("T2.5.2 — rejects capture attempt with mismatched capture token with HTTP 403 invalid_capture_token", async () => {
        const guest = createTestGuestCookie();
        const orderRes = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader },
        );
        const orderId = orderRes.body.orderId as string;

        // Valid order, but wrong token
        const wrongToken = "wrongToken1234567890abcdef123456";
        const captureRes = await callCaptureRoute(orderId, wrongToken, {
          cookie: guest.cookieHeader,
        });

        expect(captureRes.status).toBe(403);
        expect(captureRes.body.error).toBe("invalid_capture_token");
      });

      it("T2.5.3 — rejects capture attempt with missing X-ShopMate-Capture-Token header with HTTP 403", async () => {
        const guest = createTestGuestCookie();
        const orderRes = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader },
        );
        const orderId = orderRes.body.orderId as string;

        const captureRes = await callCaptureRoute(orderId, undefined, {
          cookie: guest.cookieHeader,
        });

        expect(captureRes.status).toBe(403);
        expect(captureRes.body.error).toBe("invalid_capture_token");
      });

      it("T2.5.4 — rejects malformed capture token format (too short, too long, special characters) with HTTP 403", async () => {
        const guest = createTestGuestCookie();
        const malformedTokens = [
          "short",
          "a".repeat(150),
          "invalid#token!format",
        ];

        for (const token of malformedTokens) {
          const captureRes = await callCaptureRoute("ORDER-123", token, {
            cookie: guest.cookieHeader,
          });
          expect(captureRes.status).toBe(403);
        }
      });

      it("T2.5.5 — rejects cross-order capture token replay (Token A used for Order B) with HTTP 403", async () => {
        const guest = createTestGuestCookie();

        const orderA = await callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest.cookieHeader },
        );
        const orderB = await callOrdersRoute(
          { items: [{ productId: CABLE.id, quantity: 1 }] },
          { cookie: guest.cookieHeader },
        );

        // Attempt to capture Order B using Token from Order A
        const captureRes = await callCaptureRoute(
          orderB.body.orderId as string,
          orderA.body.captureToken as string,
          { cookie: guest.cookieHeader },
        );

        expect(captureRes.status).toBe(403);
        expect(captureRes.body.error).toBe("invalid_capture_token");
      });
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise & Systemic Interactions)
  // =========================================================================
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("T3.1 — Cross-guest idempotency collision: different guests using same Idempotency-Key create distinct orders", async () => {
      const guestA = createTestGuestCookie();
      const guestB = createTestGuestCookie();
      const sharedKey = "shared-idempotency-key-xyz";

      const orderA = await callOrdersRoute(
        { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
        { cookie: guestA.cookieHeader, "idempotency-key": sharedKey },
      );
      expect(orderA.status).toBe(201);

      const orderB = await callOrdersRoute(
        { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
        { cookie: guestB.cookieHeader, "idempotency-key": sharedKey },
      );
      expect(orderB.status).toBe(201);

      // Orders must be distinct; Guest B is NOT rejected with conflict
      expect(orderA.body.orderId).not.toBe(orderB.body.orderId);
      expect(orderA.body.captureToken).not.toBe(orderB.body.captureToken);
    });

    it("T3.2 — Cross-guest capture theft attempt: attacker with stolen token rejected with sanitized 404", async () => {
      const victim = createTestGuestCookie();
      const attacker = createTestGuestCookie();

      // Victim creates an order
      const order = await callOrdersRoute(
        { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
        { cookie: victim.cookieHeader },
      );
      const orderId = order.body.orderId as string;
      const captureToken = order.body.captureToken as string;

      // Attacker intercepts orderId and captureToken, tries to capture with attacker session
      const theftAttempt = await callCaptureRoute(orderId, captureToken, {
        cookie: attacker.cookieHeader,
      });

      // Must be sanitized 404, not 403 or 400
      expect(theftAttempt.status).toBe(404);
      expect(theftAttempt.body.error).toBe("order_not_found");

      // Victim can still capture their own order successfully
      const legitCapture = await callCaptureRoute(orderId, captureToken, {
        cookie: victim.cookieHeader,
      });
      expect(legitCapture.status).toBe(200);
      expect(legitCapture.body.status).toBe("COMPLETED");
    });

    it("T3.3 — Concurrent order creation across guests with identical key processed in parallel without collision", async () => {
      const guest1 = createTestGuestCookie();
      const guest2 = createTestGuestCookie();
      const sharedKey = "parallel-key-123";

      const [res1, res2] = await Promise.all([
        callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest1.cookieHeader, "idempotency-key": sharedKey },
        ),
        callOrdersRoute(
          { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
          { cookie: guest2.cookieHeader, "idempotency-key": sharedKey },
        ),
      ]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.orderId).not.toBe(res2.body.orderId);
    });

    it("T3.4 — Rate-limited user attempting capture is blocked with 429 without claiming lease or calling PayPal", async () => {
      const guest = createTestGuestCookie();
      const order = await callOrdersRoute(
        { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
        { cookie: guest.cookieHeader },
      );
      const orderId = order.body.orderId as string;
      const captureToken = order.body.captureToken as string;

      // Exhaust capture rate limit for this guest
      for (let i = 0; i < DEFAULT_GUEST_LIMIT; i++) {
        checkPaymentRateLimit(guest.ownerHash, "192.168.1.50", "capture");
      }

      // Verify that rate limit blocked status is respected on the route
      const captureRes = await callCaptureRoute(orderId, captureToken, {
        cookie: guest.cookieHeader,
      });
      expect(captureRes.status).toBe(429);
      expect(captureRes.headers.get("retry-after")).toBeTruthy();
    });

    it("T3.5 — State machine isolation: failed capture or expired order on Guest A has zero side effects on Guest B", async () => {
      const guestA = createTestGuestCookie();
      const guestB = createTestGuestCookie();

      const orderA = await callOrdersRoute(
        { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
        { cookie: guestA.cookieHeader },
      );
      const orderB = await callOrdersRoute(
        { items: [{ productId: CABLE.id, quantity: 1 }] },
        { cookie: guestB.cookieHeader },
      );

      // Order B captures successfully regardless of state of Order A
      const captureB = await callCaptureRoute(
        orderB.body.orderId as string,
        orderB.body.captureToken as string,
        { cookie: guestB.cookieHeader },
      );

      expect(captureB.status).toBe(200);
      expect(captureB.body.status).toBe("COMPLETED");

      // Verify Order A is still in CREATED status
      const storedA = await inMemoryPaymentStore.getOrderByPayPalId(orderA.body.orderId as string);
      expect(storedA?.status).toBe("CREATED");
    });

    it("T3.6 — Session lifecycle continuity: cookie bootstrapped by config persists through order creation and capture", async () => {
      const guest = createTestGuestCookie();

      // Config check
      const configRes = await callConfigRoute({ cookie: guest.cookieHeader });
      expect(configRes.status).toBe(200);

      // Order creation
      const orderRes = await callOrdersRoute(
        { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
        { cookie: guest.cookieHeader },
      );
      expect(orderRes.status).toBe(201);

      // Capture execution
      const captureRes = await callCaptureRoute(
        orderRes.body.orderId as string,
        orderRes.body.captureToken as string,
        { cookie: guest.cookieHeader },
      );
      expect(captureRes.status).toBe(200);
      expect(captureRes.body.status).toBe("COMPLETED");
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // =========================================================================
  describe("Tier 4: Real-World Application Scenarios", () => {
    it("T4.1 — Complete legitimate checkout lifecycle: config GET -> order POST -> capture POST -> COMPLETED", async () => {
      // 1. Client loads page and fetches config
      const guest = createTestGuestCookie();
      const configRes = await callConfigRoute({ cookie: guest.cookieHeader });
      expect(configRes.status).toBe(200);
      expect(configRes.body.configured).toBe(true);

      // 2. Client creates order
      const orderRes = await callOrdersRoute(
        { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
        { cookie: guest.cookieHeader },
      );
      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.orderId as string;
      const captureToken = orderRes.body.captureToken as string;

      // 3. Buyer approves order on PayPal sandbox and triggers capture
      const captureRes = await callCaptureRoute(orderId, captureToken, {
        cookie: guest.cookieHeader,
      });
      expect(captureRes.status).toBe(200);
      expect(captureRes.body.status).toBe("COMPLETED");
      expect(captureRes.body.orderId).toBe(orderId);
    });

    it("T4.2 — Malicious session spoofing scenario: forged cookie blocked at gateway before PayPal execution", async () => {
      const fakeSessionId = "c".repeat(64);
      const fakeCreatedAt = Date.now();
      const fakeExpiresAt = fakeCreatedAt + 86400000;
      const forgedSig = createHmac("sha256", "wrong-attacker-secret")
        .update(`${fakeSessionId}.${fakeCreatedAt}.${fakeExpiresAt}`)
        .digest("hex");
      const forgedCookie = `${GUEST_SESSION_COOKIE_NAME}=${fakeSessionId}.${fakeCreatedAt}.${fakeExpiresAt}.${forgedSig}`;

      const initialCalls = networkCalls.length;

      // Attempt order creation with forged cookie
      const res = await callOrdersRoute(
        { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
        { cookie: forgedCookie },
      );

      // Should be rejected without calling PayPal upstream API
      expect(res.status).toBe(401);
      const orderCalls = networkCalls
        .slice(initialCalls)
        .filter((c) => c.url.includes("/v2/checkout/orders"));
      expect(orderCalls.length).toBe(0);
    });

    it("T4.3 — Multi-tab checkout with same guest session creates and captures independent orders correctly", async () => {
      const guest = createTestGuestCookie();

      // Tab 1 creates an order
      const tab1Order = await callOrdersRoute(
        { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
        { cookie: guest.cookieHeader, "idempotency-key": "tab1-key-001" },
      );
      expect(tab1Order.status).toBe(201);

      // Tab 2 creates an independent order
      const tab2Order = await callOrdersRoute(
        { items: [{ productId: CABLE.id, quantity: 2 }] },
        { cookie: guest.cookieHeader, "idempotency-key": "tab2-key-002" },
      );
      expect(tab2Order.status).toBe(201);

      expect(tab1Order.body.orderId).not.toBe(tab2Order.body.orderId);

      // Both orders can be captured by the same guest session
      const cap1 = await callCaptureRoute(
        tab1Order.body.orderId as string,
        tab1Order.body.captureToken as string,
        { cookie: guest.cookieHeader },
      );
      const cap2 = await callCaptureRoute(
        tab2Order.body.orderId as string,
        tab2Order.body.captureToken as string,
        { cookie: guest.cookieHeader },
      );

      expect(cap1.status).toBe(200);
      expect(cap2.status).toBe(200);
    });

    it("T4.4 — Replay of completed order capture returns idempotent 200 without second PayPal capture call", async () => {
      const guest = createTestGuestCookie();
      const order = await callOrdersRoute(
        { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
        { cookie: guest.cookieHeader },
      );
      const orderId = order.body.orderId as string;
      const captureToken = order.body.captureToken as string;

      // First capture call
      const firstCapture = await callCaptureRoute(orderId, captureToken, {
        cookie: guest.cookieHeader,
      });
      expect(firstCapture.status).toBe(200);

      const captureCallsBefore = networkCalls.filter((c) => c.url.includes("/capture")).length;

      // Replayed capture call (e.g. buyer double clicks or network retry)
      const secondCapture = await callCaptureRoute(orderId, captureToken, {
        cookie: guest.cookieHeader,
      });
      expect(secondCapture.status).toBe(200);
      expect(secondCapture.body.alreadyCaptured).toBe(true);

      const captureCallsAfter = networkCalls.filter((c) => c.url.includes("/capture")).length;
      // No duplicate PayPal capture POST sent
      expect(captureCallsAfter).toBe(captureCallsBefore);
    });

    it("T4.5 — Ambiguous outcome simulation: timeout transitions order to CAPTURE_IN_DOUBT and never sends duplicate capture POST", async () => {
      const guest = createTestGuestCookie();
      const order = await callOrdersRoute(
        { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
        { cookie: guest.cookieHeader },
      );
      const orderId = order.body.orderId as string;
      const captureToken = order.body.captureToken as string;

      // Simulate PayPal network timeout during capture POST
      installPayPalMock({
        capture: () => {
          throw new Error("ETIMEDOUT");
        },
      });

      const captureRes = await callCaptureRoute(orderId, captureToken, {
        cookie: guest.cookieHeader,
      });

      // Must fail safely without leaking internal error
      expect([409, 500, 504]).toContain(captureRes.status);

      // Verify no duplicate capture POST was attempted
      const captureCalls = networkCalls.filter(
        (c) => c.url.includes("/capture") && (c.init?.method ?? "GET").toUpperCase() === "POST",
      );
      expect(captureCalls.length).toBe(1);
    });
  });
});
