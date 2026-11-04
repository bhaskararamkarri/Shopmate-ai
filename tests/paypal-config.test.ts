/**
 * PayPal Sandbox public configuration endpoint tests (Phase 5.3).
 *
 * The endpoint exists so the browser can receive the public sandbox Client ID
 * needed to load the JavaScript SDK. These tests pin that the Client Secret
 * and every other credential never appear in the response.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route calls connection() to opt into request-time rendering. Calling the
// handler directly in a unit test has no Next request scope, so stub the
// framework marker while preserving the real NextResponse implementation.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn(async () => {}) };
});

import { GET } from "@/app/api/paypal/config/route";

const ENV_KEYS = ["PAYPAL_ENV", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] as const;

const FAKE_CREDS = {
  PAYPAL_ENV: "sandbox",
  PAYPAL_CLIENT_ID: "test-client-id",
  PAYPAL_CLIENT_SECRET: "test-client-secret",
};

function setEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

beforeEach(() => {
  setEnv(FAKE_CREDS);
});

afterEach(() => {
  setEnv({});
});

describe("GET /api/paypal/config", () => {
  it("returns only the public sandbox client id and currency", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      success: true,
      environment: "sandbox",
      configured: true,
      clientId: "test-client-id",
      currency: "USD",
    });
    expect(Object.keys(body).sort()).toEqual(
      ["clientId", "configured", "currency", "environment", "success"].sort(),
    );

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("test-client-secret");
    expect(serialized).not.toContain("PAYPAL_CLIENT_SECRET");
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("Authorization");
  });

  it("rejects missing credentials without exposing configuration", async () => {
    setEnv({ PAYPAL_ENV: "sandbox" });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      success: false,
      environment: "sandbox",
      configured: false,
      error: "paypal_not_configured",
    });
    expect(body).not.toHaveProperty("clientId");
    expect(JSON.stringify(body)).not.toContain("test-client-secret");
  });

  it("rejects unsupported environments (sandbox only)", async () => {
    setEnv({ ...FAKE_CREDS, PAYPAL_ENV: "production" });
    const response = await GET();
    expect(response.status).toBe(503);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      success: false,
      environment: "sandbox",
      configured: false,
      error: "paypal_unsupported_environment",
    });
    expect(body).not.toHaveProperty("clientId");
  });
});
