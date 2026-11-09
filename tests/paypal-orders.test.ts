/**
 * PayPal Sandbox Create Order regression tests (Phase 5.2).
 *
 * The catalog provider and all PayPal HTTP responses are mocked. Tests pin:
 * server-side re-pricing (client prices are never trusted), validation
 * (empty cart, quantities, currency, demo amount cap), PayPal Orders v2
 * payload shape, sanitized error mapping, idempotency, and a safe response
 * payload that never contains tokens or credentials.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog/provider", () => ({
  getCatalogProduct: vi.fn(),
}));

import { getCatalogProduct } from "@/lib/catalog/provider";
import { CatalogError } from "@/lib/catalog/types";
import type { Product } from "@/types";
import { resetPayPalTokenCache } from "@/lib/paypal/auth";
import {
  clearPayPalIdempotencyCacheForTests,
  MAX_DEMO_TOTAL_USD,
  resetPayPalOrderCaches,
} from "@/lib/paypal/orders";

import {
  createGuestSessionCookie,
  GUEST_SESSION_COOKIE_NAME,
} from "@/lib/payments/guest-session";
import { resetPaymentRateLimiterForTests } from "@/lib/payments/rate-limit";

const ENV_KEYS = [
  "PAYPAL_ENV",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "SHOPMATE_GUEST_SESSION_SECRET",
] as const;
const FAKE_CREDS = {
  PAYPAL_ENV: "sandbox",
  PAYPAL_CLIENT_ID: "test-client-id",
  PAYPAL_CLIENT_SECRET: "test-client-secret",
  SHOPMATE_GUEST_SESSION_SECRET:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

function setEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    if (overrides[key] === undefined) {
      if (key === "SHOPMATE_GUEST_SESSION_SECRET") {
        process.env[key] = FAKE_CREDS[key];
      } else {
        delete process.env[key];
      }
    } else {
      process.env[key] = overrides[key];
    }
  }
}

function product(seed: { id: string; price: number } & Partial<Product>): Product {
  return {
    name: `Product ${seed.id}`,
    description: "",
    currency: "USD",
    availability: "in_stock",
    images: [],
    ratings: 0,
    reviews: 0,
    category: "Test",
    brand: "TestBrand",
    specs: {},
    source: "demo",
    demo: true,
    ...seed,
  };
}

const HEADPHONES = product({ id: "demo-headphones", price: 199.99, name: "Aurora Headphones" });
const CABLE = product({ id: "demo-cable", price: 12.5, name: "USB-C Cable" });

const TOKEN_RESPONSE = {
  access_token: "test-access-token",
  token_type: "Bearer",
  expires_in: 32400,
};

const APPROVE_URL =
  "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T";

const ORDER_RESPONSE = {
  id: "5O190127TN364715T",
  status: "CREATED",
  links: [
    { href: APPROVE_URL, rel: "approve", method: "GET" },
    {
      href: "https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T",
      rel: "self",
      method: "GET",
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

/** Routes the token and order calls; records every request in order. */
function installPayPalFetch(handlers?: {
  token?: () => Response | Promise<Response>;
  order?: () => Response | Promise<Response>;
}): FetchCall[] {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    if (url.includes("/v1/oauth2/token")) {
      return handlers?.token ? handlers.token() : jsonResponse(TOKEN_RESPONSE);
    }
    if (url.includes("/v2/checkout/orders")) {
      return handlers?.order ? handlers.order() : jsonResponse(ORDER_RESPONSE, 201);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

function orderCalls(calls: FetchCall[]): FetchCall[] {
  return calls.filter((call) => call.url.includes("/v2/checkout/orders"));
}

let sessionCookie: string | undefined;

async function postRoute(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const { POST } = await import("@/app/api/paypal/orders/route");
  const reqHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...headers,
  };
  if (!reqHeaders.cookie) {
    if (!sessionCookie) {
      const guest = createGuestSessionCookie(undefined, { nowMs: Date.now() });
      sessionCookie = `${GUEST_SESSION_COOKIE_NAME}=${guest.cookieValue}`;
    }
    reqHeaders.cookie = sessionCookie;
  }
  const response = await POST(
    new Request("http://localhost/api/paypal/orders", {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify(body),
    }),
  );
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    sessionCookie = setCookie.split(";")[0];
  }
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    headers: response.headers,
  };
}

/**
 * Builds a request whose body arrives as a chunked stream. Passing a stream
 * means the Request does not carry a Content-Length header, so the route must
 * count real bytes to enforce its limit.
 */
function postStreamRequest(
  payload: string,
  headers: Record<string, string> = {},
): Request {
  const bytes = new TextEncoder().encode(payload);
  const chunkSize = 1024;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
      }
      controller.close();
    },
  });

  return new Request("http://localhost/api/paypal/orders", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: stream,
    duplex: "half",
  } as RequestInit);
}

async function postRawRoute(
  request: Request,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { POST } = await import("@/app/api/paypal/orders/route");
  const response = await POST(request);
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

function uniqueOrderFetch(): FetchCall[] {
  let created = 0;
  return installPayPalFetch({
    order: () => {
      created += 1;
      return jsonResponse(
        {
          ...ORDER_RESPONSE,
          id: `ORDER${String(created).padStart(12, "0")}`,
        },
        201,
      );
    },
  });
}

beforeEach(() => {
  sessionCookie = undefined;
  resetPaymentRateLimiterForTests();
  resetPayPalTokenCache();
  resetPayPalOrderCaches();
  setEnv(FAKE_CREDS);
  vi.mocked(getCatalogProduct).mockReset();
  vi.mocked(getCatalogProduct).mockImplementation(async (id: string) => {
    const found = [HEADPHONES, CABLE].find((candidate) => candidate.id === id);
    return found ? { product: found, source: "demo" as const } : null;
  });
});

afterEach(() => {
  vi.useRealTimers();
  setEnv({});
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createPayPalOrder — valid order", () => {
  it("creates a labelled demo order with server-recalculated totals", async () => {
    const calls = installPayPalFetch();

    const { status, body, headers } = await postRoute({
      items: [
        { productId: HEADPHONES.id, quantity: 2 },
        { productId: CABLE.id, quantity: 1 },
      ],
    });

    // 199.99 * 2 + 12.50 = 412.48, recomputed from the catalog.
    expect(status).toBe(201);
    expect(headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      success: true,
      environment: "sandbox",
      demo: true,
      orderId: "5O190127TN364715T",
      status: "CREATED",
      amount: { currency: "USD", value: "412.48" },
      approveUrl: APPROVE_URL,
    });
    // The browser receives an opaque capability for the server-side capture
    // registry — never a PayPal credential.
    expect(String(body.captureToken)).toMatch(/^[A-Za-z0-9-]{16,128}$/);

    const [order] = orderCalls(calls);
    expect(order).toBeDefined();
    expect(order!.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(order!.init?.method).toBe("POST");
    const headersSent = order!.init?.headers as Record<string, string>;
    expect(headersSent.Authorization).toBe("Bearer test-access-token");
    expect(headersSent["Content-Type"]).toBe("application/json");

    const payload = JSON.parse(String(order!.init?.body)) as {
      intent: string;
      purchase_units: {
        reference_id: string;
        description: string;
        amount: { currency_code: string; value: string };
      }[];
      application_context?: { shipping_preference?: string; brand_name?: string };
    };
    expect(payload.intent).toBe("CAPTURE");
    expect(payload.purchase_units).toHaveLength(1);
    expect(payload.purchase_units[0]!.amount).toEqual({
      currency_code: "USD",
      value: "412.48",
    });
    // Clearly labelled as a ShopMate sandbox demo — never a retailer purchase.
    expect(payload.purchase_units[0]!.description).toContain("Sandbox demo");
    expect(payload.purchase_units[0]!.description.toLowerCase()).toContain("not a retailer");
    expect(payload.purchase_units[0]!.reference_id).toMatch(/^shopmate-demo-/);
    expect(payload.application_context?.shipping_preference).toBe("NO_SHIPPING");
  });

  it("ignores tampered client prices and totals", async () => {
    const calls = installPayPalFetch();

    const { status, body } = await postRoute({
      items: [
        {
          productId: HEADPHONES.id,
          quantity: 1,
          unitPrice: 0.01,
          price: 0.01,
          lineTotal: 0.01,
        },
      ],
      total: 0.01,
      amount: 0.01,
    });

    expect(status).toBe(201);
    expect(body.amount).toEqual({ currency: "USD", value: "199.99" });

    const [order] = orderCalls(calls);
    const payload = JSON.parse(String(order!.init?.body));
    // No client-supplied price leaked into the PayPal request.
    expect(JSON.stringify(payload)).not.toContain("0.01");
  });
});

describe("createPayPalOrder — validation", () => {
  it("rejects an empty cart", async () => {
    const calls = installPayPalFetch();
    const { status, body } = await postRoute({ items: [] });
    expect(status).toBe(400);
    expect(body).toMatchObject({ success: false, error: "empty_cart" });
    expect(calls).toHaveLength(0);
  });

  it("rejects invalid quantities", async () => {
    installPayPalFetch();
    for (const quantity of [0, -2, 1.5, 100]) {
      const { status, body } = await postRoute({
        items: [{ productId: HEADPHONES.id, quantity }],
      });
      expect(status).toBe(400);
      expect(body).toMatchObject({ success: false, error: "invalid_request" });
    }
  });

  it("rejects catalog products whose price is not a positive amount", async () => {
    installPayPalFetch();
    vi.mocked(getCatalogProduct).mockImplementation(async () => ({
      product: product({ id: "demo-broken", price: 0 }),
      source: "demo" as const,
    }));

    const { status, body } = await postRoute({
      items: [{ productId: "demo-broken", quantity: 1 }],
    });
    expect(status).toBe(400);
    expect(body).toMatchObject({ success: false, error: "invalid_amount" });
  });

  it("rejects totals above the demo amount cap", async () => {
    const calls = installPayPalFetch();
    const quantity = Math.ceil((MAX_DEMO_TOTAL_USD / HEADPHONES.price) * 100); // safely above cap
    const { status, body } = await postRoute({
      items: [{ productId: HEADPHONES.id, quantity: Math.min(quantity, 99) }],
    });
    expect(quantity).toBeGreaterThan(2);
    expect(status).toBe(400);
    expect(body).toMatchObject({ success: false, error: "amount_too_large" });
    expect(orderCalls(calls)).toHaveLength(0);
  });

  it("accepts an $849.99 single appliance order without hitting the amount cap", async () => {
    const calls = installPayPalFetch();
    vi.mocked(getCatalogProduct).mockImplementation(async () => ({
      product: product({ id: "live-washer-849", price: 849.99, name: "Smart Front Load Washer" }),
      source: "channel3" as const,
    }));

    const { status, body } = await postRoute({
      items: [{ productId: "live-washer-849", quantity: 1 }],
    });
    expect(status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      amount: { currency: "USD", value: "849.99" },
    });
    expect(orderCalls(calls)).toHaveLength(1);
    const orderPayload = JSON.parse(orderCalls(calls)[0]!.init?.body as string);
    expect(orderPayload.purchase_units[0].amount.value).toBe("849.99");
  });

  it("rejects unsupported request and product currencies", async () => {
    installPayPalFetch();

    const badRequest = await postRoute({
      items: [{ productId: HEADPHONES.id, quantity: 1 }],
      currency: "EUR",
    });
    expect(badRequest.status).toBe(400);
    expect(badRequest.body.error).toBe("invalid_request");

    vi.mocked(getCatalogProduct).mockImplementation(async () => ({
      product: product({ id: "demo-euro", price: 10, currency: "EUR" }),
      source: "demo" as const,
    }));
    const badProduct = await postRoute({
      items: [{ productId: "demo-euro", quantity: 1 }],
    });
    expect(badProduct.status).toBe(400);
    expect(badProduct.body.error).toBe("unsupported_currency");
  });

  it("reports unresolvable products without inventing a price", async () => {
    installPayPalFetch();
    vi.mocked(getCatalogProduct).mockImplementation(async () => null);
    const { status, body } = await postRoute({
      items: [{ productId: "demo-missing", quantity: 1 }],
    });
    expect(status).toBe(404);
    expect(body).toMatchObject({ success: false, error: "item_not_found" });
  });
});

describe("createPayPalOrder — upstream failures", () => {
  it("returns 503 when PayPal credentials are missing", async () => {
    const calls = installPayPalFetch();
    setEnv({ PAYPAL_ENV: "sandbox" });
    const { status, body } = await postRoute({
      items: [{ productId: HEADPHONES.id, quantity: 1 }],
    });
    expect(status).toBe(503);
    expect(body).toMatchObject({ success: false, error: "paypal_not_configured" });
    expect(calls).toHaveLength(0);
  });

  it("maps a PayPal 401 to paypal_auth_failed", async () => {
    installPayPalFetch({
      token: () => jsonResponse({ error: "invalid_client" }, 401),
    });
    const { status, body } = await postRoute({
      items: [{ productId: HEADPHONES.id, quantity: 1 }],
    });
    expect(status).toBe(502);
    expect(body).toMatchObject({ success: false, error: "paypal_auth_failed" });
  });

  it("maps a PayPal 5xx to paypal_unavailable", async () => {
    installPayPalFetch({
      order: () => jsonResponse({ name: "INTERNAL_SERVER_ERROR" }, 500),
    });
    const { status, body } = await postRoute({
      items: [{ productId: HEADPHONES.id, quantity: 1 }],
    });
    expect(status).toBe(502);
    expect(body).toMatchObject({ success: false, error: "paypal_unavailable" });
  });

  it("maps a PayPal timeout to 504", async () => {
    installPayPalFetch({
      order: () => {
        const timeout = new Error("The operation was aborted due to timeout");
        timeout.name = "TimeoutError";
        throw timeout;
      },
    });
    const { status, body } = await postRoute({
      items: [{ productId: HEADPHONES.id, quantity: 1 }],
    });
    expect(status).toBe(504);
    expect(body).toMatchObject({ success: false, error: "paypal_timeout" });
  });

  it("rejects malformed PayPal order responses", async () => {
    installPayPalFetch({
      order: () => jsonResponse({ status: "CREATED" }, 201),
    });
    const { status, body } = await postRoute({
      items: [{ productId: HEADPHONES.id, quantity: 1 }],
    });
    expect(status).toBe(502);
    expect(body).toMatchObject({ success: false, error: "paypal_malformed_response" });
  });

  it("rejects a PayPal order id that cannot be captured safely", async () => {
    installPayPalFetch({
      order: () => jsonResponse({ id: "bad order id!", status: "CREATED" }, 201),
    });
    const { status, body } = await postRoute({
      items: [{ productId: HEADPHONES.id, quantity: 1 }],
    });
    expect(status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      error: "paypal_malformed_response",
    });
  });

  it("maps catalog failures without substituting prices", async () => {
    installPayPalFetch();
    vi.mocked(getCatalogProduct).mockRejectedValue(
      new CatalogError("timeout", "catalog timed out"),
    );
    const timeout = await postRoute({
      items: [{ productId: "demo-live", quantity: 1 }],
    });
    expect(timeout.status).toBe(504);
    expect(timeout.body.error).toBe("catalog_timeout");

    vi.mocked(getCatalogProduct).mockRejectedValue(
      new CatalogError("provider_error", "catalog failed", 500),
    );
    const failure = await postRoute({
      items: [{ productId: "demo-live", quantity: 1 }],
    });
    expect(failure.status).toBe(502);
    expect(failure.body.error).toBe("catalog_unavailable");
  });
});

describe("createPayPalOrder — safe responses", () => {
  it("returns only the safe fields the frontend needs", async () => {
    installPayPalFetch();
    const { status, body } = await postRoute({
      items: [{ productId: CABLE.id, quantity: 1 }],
    });

    expect(status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(
      [
        "success",
        "environment",
        "demo",
        "orderId",
        "status",
        "amount",
        "approveUrl",
        "referenceId",
        "captureToken",
      ].sort(),
    );

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("test-access-token");
    expect(serialized).not.toContain(FAKE_CREDS.PAYPAL_CLIENT_SECRET);
    expect(serialized).not.toContain(FAKE_CREDS.PAYPAL_CLIENT_ID);
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("Authorization");
  });
});

describe("createPayPalOrder — idempotency", () => {
  const KEY = "order-key-12345678";

  it("replays the same order for a repeated Idempotency-Key", async () => {
    const calls = installPayPalFetch();
    const body = { items: [{ productId: HEADPHONES.id, quantity: 1 }] };

    const first = await postRoute(body, { "idempotency-key": KEY });
    const second = await postRoute(body, { "idempotency-key": KEY });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.orderId).toBe(first.body.orderId);
    expect(orderCalls(calls)).toHaveLength(1);

    // The key is forwarded to PayPal for upstream deduplication too.
    const headersSent = orderCalls(calls)[0]!.init?.headers as Record<string, string>;
    expect(headersSent["PayPal-Request-Id"]).toBe(KEY);
  });

  it("rejects the same key with a different payload", async () => {
    const calls = installPayPalFetch();
    await postRoute({ items: [{ productId: HEADPHONES.id, quantity: 1 }] }, {
      "idempotency-key": KEY,
    });

    const conflicting = await postRoute(
      { items: [{ productId: CABLE.id, quantity: 1 }] },
      { "idempotency-key": KEY },
    );

    expect(conflicting.status).toBe(409);
    expect(conflicting.body).toMatchObject({
      success: false,
      error: "idempotency_conflict",
    });
    expect(orderCalls(calls)).toHaveLength(1);
  });

  it("creates separate orders for different keys and for no key", async () => {
    const calls = installPayPalFetch();
    const body = { items: [{ productId: CABLE.id, quantity: 1 }] };

    await postRoute(body, { "idempotency-key": "key-aaaaaaaa" });
    await postRoute(body, { "idempotency-key": "key-bbbbbbbb" });
    await postRoute(body);

    expect(orderCalls(calls)).toHaveLength(3);
  });

  it("rejects malformed Idempotency-Key headers", async () => {
    const calls = installPayPalFetch();
    const { status, body } = await postRoute(
      { items: [{ productId: CABLE.id, quantity: 1 }] },
      { "idempotency-key": "bad key!" },
    );
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });
});

describe("createPayPalOrder — concurrent idempotency", () => {
  const KEY = "concurrent-key-12345678";

  it("deduplicates concurrent requests with the same key and cart", async () => {
    const calls = installPayPalFetch();
    const body = { items: [{ productId: HEADPHONES.id, quantity: 1 }] };

    const [first, second] = await Promise.all([
      postRoute(body, { "idempotency-key": KEY }),
      postRoute(body, { "idempotency-key": KEY }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.orderId).toBe(first.body.orderId);
    expect(second.body.captureToken).toBe(first.body.captureToken);
    expect(second.body.referenceId).toBe(first.body.referenceId);
    expect(orderCalls(calls)).toHaveLength(1);
  });

  it("rejects concurrent requests with the same key and a different cart", async () => {
    const calls = installPayPalFetch();

    const [first, second] = await Promise.all([
      postRoute(
        { items: [{ productId: HEADPHONES.id, quantity: 1 }] },
        { "idempotency-key": KEY },
      ),
      postRoute(
        { items: [{ productId: CABLE.id, quantity: 1 }] },
        { "idempotency-key": KEY },
      ),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
    const conflict = first.status === 409 ? first : second;
    expect(conflict.body).toMatchObject({
      success: false,
      error: "idempotency_conflict",
    });
    expect(orderCalls(calls)).toHaveLength(1);
  });

  it("recovers the registered order when the idempotency cache is lost", async () => {
    const calls = installPayPalFetch();
    const body = { items: [{ productId: HEADPHONES.id, quantity: 1 }] };

    const first = await postRoute(body, { "idempotency-key": KEY });
    clearPayPalIdempotencyCacheForTests();

    const replay = await postRoute(body, { "idempotency-key": KEY });

    expect(replay.status).toBe(201);
    expect(replay.body.orderId).toBe(first.body.orderId);
    expect(replay.body.captureToken).toBe(first.body.captureToken);
    expect(replay.body.referenceId).toBe(first.body.referenceId);
    expect(orderCalls(calls)).toHaveLength(1);
  });
});

describe("createPayPalOrder — expiry consistency", () => {
  const KEY = "expiry-key-12345678";
  const BODY = { items: [{ productId: HEADPHONES.id, quantity: 1 }] };

  it("still replays a key after 11 minutes, matching the registry window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const calls = uniqueOrderFetch();

    const first = await postRoute(BODY, { "idempotency-key": KEY });

    vi.setSystemTime(new Date("2026-01-01T00:11:00.000Z"));
    const second = await postRoute(BODY, { "idempotency-key": KEY });

    expect(second.status).toBe(201);
    expect(second.body.orderId).toBe(first.body.orderId);
    expect(second.body.captureToken).toBe(first.body.captureToken);
    expect(orderCalls(calls)).toHaveLength(1);
  });

  it("creates a fresh order after 31 minutes, when the registry entry expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const calls = uniqueOrderFetch();

    const first = await postRoute(BODY, { "idempotency-key": KEY });

    vi.setSystemTime(new Date("2026-01-01T00:31:00.000Z"));
    const second = await postRoute(BODY, { "idempotency-key": KEY });

    expect(second.status).toBe(201);
    expect(second.body.orderId).not.toBe(first.body.orderId);
    expect(orderCalls(calls)).toHaveLength(2);
  });

  it("rejects an expired-key request whose cart conflicts with a live registry record", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    uniqueOrderFetch();

    await postRoute(BODY, { "idempotency-key": KEY });
    clearPayPalIdempotencyCacheForTests();

    // Same key, live registry entry, different cart: still a conflict.
    const conflicting = await postRoute(
      { items: [{ productId: CABLE.id, quantity: 1 }] },
      { "idempotency-key": KEY },
    );

    expect(conflicting.status).toBe(409);
    expect(conflicting.body.error).toBe("idempotency_conflict");
  });
});

describe("createPayPalOrder — request body size", () => {
  it("rejects an oversized chunked body with 413", async () => {
    const calls = installPayPalFetch();
    const payload = JSON.stringify({
      items: [{ productId: HEADPHONES.id, quantity: 1 }],
      padding: "x".repeat(33 * 1024),
    });

    const result = await postRawRoute(postStreamRequest(payload));

    expect(result.status).toBe(413);
    expect(result.body.success).toBe(false);
    expect(result.body.error).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });

  it("rejects an oversized body whose Content-Length header lies", async () => {
    const calls = installPayPalFetch();
    const payload = JSON.stringify({
      items: [{ productId: HEADPHONES.id, quantity: 1 }],
      padding: "x".repeat(33 * 1024),
    });

    const result = await postRawRoute(
      postStreamRequest(payload, { "content-length": "10" }),
    );

    expect(result.status).toBe(413);
    expect(result.body.success).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("accepts a chunked body that stays under the limit", async () => {
    const calls = installPayPalFetch();
    const payload = JSON.stringify({
      items: [{ productId: HEADPHONES.id, quantity: 1 }],
    });

    const result = await postRawRoute(postStreamRequest(payload));

    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);
    expect(orderCalls(calls)).toHaveLength(1);
  });
});
