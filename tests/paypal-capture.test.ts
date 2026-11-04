/**
 * PayPal Sandbox Capture API tests (Phase 5.4).
 *
 * These tests create a real (mocked-transport) order through the Phase 5.2
 * route, then exercise POST /api/paypal/orders/[orderId]/capture. They pin:
 * server-side order/amount ownership, capture-token ownership checks,
 * COMPLETED-only success, pending/denied/not-approved handling, duplicate
 * capture deduplication, upstream failure mapping, and sanitized responses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog/provider", () => ({
  getCatalogProduct: vi.fn(),
}));

import { getCatalogProduct } from "@/lib/catalog/provider";
import type { Product } from "@/types";
import { resetPayPalTokenCache } from "@/lib/paypal/auth";
import { resetPayPalOrderCaches } from "@/lib/paypal/orders";

const ENV_KEYS = ["PAYPAL_ENV", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] as const;
const FAKE_CREDS = {
  PAYPAL_ENV: "sandbox",
  PAYPAL_CLIENT_ID: "test-client-id",
  PAYPAL_CLIENT_SECRET: "test-client-secret",
};

const ORDER_ID = "5O190127TN364715T";
const CAPTURE_ID = "3C679366HH908993F";

const PRODUCT: Product = {
  id: "demo-headphones",
  name: "Aurora Headphones",
  description: "",
  price: 199.99,
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
};

const TOKEN_RESPONSE = {
  access_token: "test-access-token",
  token_type: "Bearer",
  expires_in: 32400,
};

const ORDER_RESPONSE = { id: ORDER_ID, status: "CREATED" };

function setEnv(
  overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
) {
  for (const key of ENV_KEYS) {
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
}

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

interface Seed {
  orderId: string;
  captureToken: string;
  referenceId: string;
  amountValue: string;
}

let seeded: Seed | null = null;
let calls: FetchCall[] = [];

function captureBody(
  overrides: {
    orderId?: string;
    orderStatus?: string;
    referenceId?: string;
    captureStatus?: string;
    currency?: string;
    value?: string;
    captures?: unknown[];
  } = {},
): Record<string, unknown> {
  if (!seeded) throw new Error("seed the order first");
  const capture = {
    id: CAPTURE_ID,
    status: overrides.captureStatus ?? "COMPLETED",
    amount: {
      currency_code: overrides.currency ?? "USD",
      value: overrides.value ?? seeded.amountValue,
    },
  };
  return {
    id: overrides.orderId ?? seeded.orderId,
    status: overrides.orderStatus ?? "COMPLETED",
    purchase_units: [
      {
        reference_id: overrides.referenceId ?? seeded.referenceId,
        payments: { captures: overrides.captures ?? [capture] },
      },
    ],
  };
}

function installFetch(handlers?: {
  token?: () => Response | Promise<Response>;
  order?: () => Response | Promise<Response>;
  capture?: () => Response | Promise<Response>;
}): FetchCall[] {
  calls = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push({ url, init });
    if (url.includes("/v1/oauth2/token")) {
      return handlers?.token ? handlers.token() : jsonResponse(TOKEN_RESPONSE);
    }
    if (url.includes("/capture")) {
      return handlers?.capture
        ? handlers.capture()
        : jsonResponse(captureBody());
    }
    if (url.includes("/v2/checkout/orders")) {
      return handlers?.order
        ? handlers.order()
        : jsonResponse(ORDER_RESPONSE, 201);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

function captureCalls(): FetchCall[] {
  return calls.filter((call) => call.url.includes("/capture"));
}

async function seedOrder(): Promise<Seed> {
  const { POST } = await import("@/app/api/paypal/orders/route");
  const response = await POST(
    new Request("http://localhost/api/paypal/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [{ productId: PRODUCT.id, quantity: 1 }],
      }),
    }),
  );
  const body = (await response.json()) as {
    orderId: string;
    captureToken: string;
    referenceId: string;
    amount: { value: string };
  };
  expect(response.status).toBe(201);
  expect(typeof body.captureToken).toBe("string");
  expect(body.captureToken).toMatch(/^[A-Za-z0-9-]{16,128}$/);

  seeded = {
    orderId: body.orderId,
    captureToken: body.captureToken,
    referenceId: body.referenceId,
    amountValue: body.amount.value,
  };
  return seeded;
}

interface CaptureHttpResult {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}

async function callCapture(
  orderId: string,
  token?: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<CaptureHttpResult> {
  const { POST } = await import(
    "@/app/api/paypal/orders/[orderId]/capture/route"
  );
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...options.headers,
  };
  if (token !== undefined) headers["x-shopmate-capture-token"] = token;

  const response = await POST(
    new Request(
      `http://localhost/api/paypal/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: "POST",
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      },
    ),
    { params: Promise.resolve({ orderId }) },
  );

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    headers: response.headers,
  };
}

beforeEach(() => {
  resetPayPalTokenCache();
  resetPayPalOrderCaches();
  seeded = null;
  calls = [];
  setEnv(FAKE_CREDS);
  vi.mocked(getCatalogProduct).mockReset();
  vi.mocked(getCatalogProduct).mockResolvedValue({
    product: PRODUCT,
    source: "demo",
  });
});

afterEach(() => {
  setEnv({});
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/paypal/orders/[orderId]/capture — success", () => {
  it("captures and verifies a COMPLETED payment against the server order", async () => {
    installFetch();
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken);

    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(result.body).toMatchObject({
      success: true,
      environment: "sandbox",
      demo: true,
      orderId: ORDER_ID,
      captureId: CAPTURE_ID,
      status: "COMPLETED",
      amount: { currency: "USD", value: "199.99" },
      referenceId: order.referenceId,
      alreadyCaptured: false,
    });

    const [capture] = captureCalls();
    expect(capture).toBeDefined();
    expect(capture!.url).toBe(
      `https://api-m.sandbox.paypal.com/v2/checkout/orders/${ORDER_ID}/capture`,
    );
    expect(capture!.init?.method).toBe("POST");
    const sent = capture!.init?.headers as Record<string, string>;
    expect(sent.Authorization).toBe("Bearer test-access-token");
    expect(sent["Content-Type"]).toBe("application/json");
    expect(sent["PayPal-Request-Id"]).toMatch(/^[A-Za-z0-9._-]{8,108}$/);
    expect(String(capture!.init?.body ?? "")).not.toContain("199.99");
  });

  it("ignores browser-supplied amounts and currencies", async () => {
    installFetch();
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken, {
      body: { amount: { value: "0.01", currency: "EUR" }, status: "COMPLETED" },
    });

    expect(result.status).toBe(200);
    expect(result.body.amount).toEqual({ currency: "USD", value: "199.99" });
    expect(JSON.stringify(result.body)).not.toContain("0.01");
    expect(JSON.stringify(result.body)).not.toContain("EUR");
  });

  it("returns only safe capture fields, never tokens or credentials", async () => {
    installFetch();
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken);
    const serialized = JSON.stringify(result.body);

    expect(Object.keys(result.body).sort()).toEqual(
      [
        "success",
        "environment",
        "demo",
        "orderId",
        "captureId",
        "status",
        "amount",
        "referenceId",
        "alreadyCaptured",
      ].sort(),
    );
    expect(serialized).not.toContain(order.captureToken);
    expect(serialized).not.toContain(FAKE_CREDS.PAYPAL_CLIENT_SECRET);
    expect(serialized).not.toContain(FAKE_CREDS.PAYPAL_CLIENT_ID);
    expect(serialized).not.toContain("test-access-token");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("Authorization");
  });
});

describe("POST /api/paypal/orders/[orderId]/capture — verification", () => {
  it("rejects an amount mismatch", async () => {
    installFetch({ capture: () => jsonResponse(captureBody({ value: "0.01" })) });
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken);

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      success: false,
      error: "amount_mismatch",
    });
  });

  it("rejects a currency mismatch", async () => {
    installFetch({
      capture: () => jsonResponse(captureBody({ currency: "EUR" })),
    });
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken);

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      success: false,
      error: "currency_mismatch",
    });
  });

  it("rejects a PayPal order id mismatch", async () => {
    installFetch({
      capture: () =>
        jsonResponse(captureBody({ orderId: "DIFFERENTORDER123456" })),
    });
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken);

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      success: false,
      error: "order_id_mismatch",
    });
  });

  it("rejects a purchase-unit reference mismatch", async () => {
    installFetch({
      capture: () =>
        jsonResponse(captureBody({ referenceId: "shopmate-demo-other" })),
    });
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken);

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      success: false,
      error: "purchase_unit_mismatch",
    });
  });

  it("does not report success for an APPROVED-only order", async () => {
    installFetch({
      capture: () =>
        jsonResponse(
          captureBody({ orderStatus: "APPROVED", captures: [] }),
        ),
    });
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken);

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      success: false,
      error: "capture_not_allowed",
    });
    expect(JSON.stringify(result.body)).not.toContain("COMPLETED");
  });
});

describe("POST /api/paypal/orders/[orderId]/capture — honest statuses", () => {
  it("returns 202 for a PENDING capture without claiming success", async () => {
    installFetch({
      capture: () =>
        jsonResponse(
          captureBody({ orderStatus: "PENDING", captureStatus: "PENDING" }),
          201,
        ),
    });
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken);

    expect(result.status).toBe(202);
    expect(result.body).toMatchObject({
      success: false,
      error: "capture_pending",
      status: "PENDING",
    });
    expect(JSON.stringify(result.body)).not.toContain('"success":true');
  });

  it("returns 402 for a DENIED capture without claiming success", async () => {
    installFetch({
      capture: () =>
        jsonResponse(
          captureBody({ orderStatus: "COMPLETED", captureStatus: "DENIED" }),
        ),
    });
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken);

    expect(result.status).toBe(402);
    expect(result.body).toMatchObject({
      success: false,
      error: "capture_denied",
      status: "DENIED",
    });
  });
});

describe("POST /api/paypal/orders/[orderId]/capture — idempotency", () => {
  it("replays a verified capture without calling PayPal again", async () => {
    installFetch();
    const order = await seedOrder();

    const first = await callCapture(order.orderId, order.captureToken);
    const second = await callCapture(order.orderId, order.captureToken);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      success: true,
      alreadyCaptured: true,
      captureId: CAPTURE_ID,
    });
    expect(captureCalls()).toHaveLength(1);
  });

  it("deduplicates concurrent capture requests", async () => {
    let release: (response: Response) => void = () => {};
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    installFetch({ capture: () => gate });
    const order = await seedOrder();

    const first = callCapture(order.orderId, order.captureToken);
    const second = callCapture(order.orderId, order.captureToken);
    release(jsonResponse(captureBody()));

    const [a, b] = await Promise.all([first, second]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.success).toBe(true);
    expect(b.body.success).toBe(true);
    expect(captureCalls()).toHaveLength(1);
  });
});

describe("POST /api/paypal/orders/[orderId]/capture — ownership", () => {
  it("rejects a malformed order id before any outbound call", async () => {
    installFetch();
    const result = await callCapture("not-a-valid-order!", "a".repeat(32));

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      success: false,
      error: "invalid_order_id",
    });
    expect(calls).toHaveLength(0);
  });

  it("rejects a missing capture token", async () => {
    installFetch();
    const order = await seedOrder();

    const result = await callCapture(order.orderId);

    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({
      success: false,
      error: "invalid_capture_token",
    });
    expect(captureCalls()).toHaveLength(0);
  });

  it("rejects a token that does not belong to the order", async () => {
    installFetch();
    const order = await seedOrder();

    const result = await callCapture(order.orderId, "wrong-token-1234567890");

    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({
      success: false,
      error: "invalid_capture_token",
    });
    expect(captureCalls()).toHaveLength(0);
  });

  it("rejects an order this server did not create", async () => {
    installFetch();
    const result = await callCapture("9ABCDEFGHIJKLMNOP", "a".repeat(32));

    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({
      success: false,
      error: "order_not_found",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("POST /api/paypal/orders/[orderId]/capture — upstream failures", () => {
  it("returns 503 when PayPal credentials are missing", async () => {
    installFetch();
    const order = await seedOrder();
    setEnv({ PAYPAL_ENV: "sandbox" });

    const result = await callCapture(order.orderId, order.captureToken);

    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({
      success: false,
      error: "paypal_not_configured",
    });
    expect(captureCalls()).toHaveLength(0);
  });

  it("maps a PayPal 401 to paypal_auth_failed", async () => {
    installFetch({
      capture: () => jsonResponse({ name: "AUTHENTICATION_FAILURE" }, 401),
    });
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken);

    expect(result.status).toBe(502);
    expect(result.body).toMatchObject({
      success: false,
      error: "paypal_auth_failed",
    });
  });

  it("maps a PayPal 5xx to paypal_unavailable without leaking details", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    installFetch({
      capture: () =>
        jsonResponse(
          { name: "INTERNAL_SERVER_ERROR", details: "raw upstream detail" },
          500,
        ),
    });
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken);

    expect(result.status).toBe(502);
    expect(result.body).toMatchObject({
      success: false,
      error: "paypal_unavailable",
    });
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("raw upstream detail");
    expect(logged).not.toContain(FAKE_CREDS.PAYPAL_CLIENT_SECRET);
    expect(logged).not.toContain("test-access-token");
  });

  it("maps a PayPal timeout to 504", async () => {
    installFetch({
      capture: () => {
        const timeout = new Error("The operation was aborted due to timeout");
        timeout.name = "TimeoutError";
        throw timeout;
      },
    });
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken);

    expect(result.status).toBe(504);
    expect(result.body).toMatchObject({
      success: false,
      error: "paypal_timeout",
    });
  });

  it("rejects a malformed capture response safely", async () => {
    installFetch({
      capture: () => jsonResponse({ id: ORDER_ID, status: "COMPLETED" }),
    });
    const order = await seedOrder();

    const result = await callCapture(order.orderId, order.captureToken);

    expect([409, 502]).toContain(result.status);
    expect(result.body.success).toBe(false);
    expect(String(result.body.message).toLowerCase()).not.toContain(
      "raw upstream",
    );
  });
});
