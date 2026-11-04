/**
 * PayPal Sandbox OAuth regression tests (Phase 5).
 *
 * Live API responses are mocked here: these tests pin configuration
 * validation, Basic-auth token exchange, error mapping, in-memory caching /
 * refresh, and — critically — that no secret or access token can ever reach a
 * client response or a client bundle.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkPayPalConnection,
  getPayPalAccessToken,
  getPayPalConfig,
  PayPalAuthError,
  resetPayPalTokenCache,
} from "@/lib/paypal/auth";

const ENV_KEYS = ["PAYPAL_ENV", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] as const;

const FAKE_CREDS = {
  PAYPAL_ENV: "sandbox",
  PAYPAL_CLIENT_ID: "test-client-id",
  PAYPAL_CLIENT_SECRET: "test-client-secret",
};

function setEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
}

function tokenBody(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "test-access-token",
    token_type: "Bearer",
    expires_in: 32400,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The exact Basic header the service must send for the fake credentials. */
const EXPECTED_BASIC = `Basic ${Buffer.from(
  `${FAKE_CREDS.PAYPAL_CLIENT_ID}:${FAKE_CREDS.PAYPAL_CLIENT_SECRET}`,
  "utf8",
).toString("base64")}`;

beforeEach(() => {
  resetPayPalTokenCache();
  setEnv(FAKE_CREDS);
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(tokenBody())));
});

afterEach(() => {
  setEnv({});
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PayPal configuration", () => {
  it("reports unconfigured when credentials are missing", async () => {
    setEnv({ PAYPAL_ENV: "sandbox" });
    const result = getPayPalConfig();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("paypal_not_configured");

    const status = await checkPayPalConnection();
    expect(status.status).toBe(503);
    expect(status.body).toEqual({
      success: false,
      environment: "sandbox",
      configured: false,
      authenticated: false,
      error: "paypal_not_configured",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects unsupported environments (sandbox only)", async () => {
    setEnv({ ...FAKE_CREDS, PAYPAL_ENV: "production" });
    const result = getPayPalConfig();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("paypal_unsupported_environment");

    const status = await checkPayPalConnection();
    expect(status.status).toBe(503);
    expect(status.body.error).toBe("paypal_unsupported_environment");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only credential as missing", () => {
    setEnv({ ...FAKE_CREDS, PAYPAL_CLIENT_SECRET: "   " });
    expect(getPayPalConfig().ok).toBe(false);
  });
});

describe("OAuth token exchange", () => {
  it("authenticates with HTTP Basic auth and grant_type=client_credentials", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(tokenBody()));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPayPalAccessToken()).resolves.toBe("test-access-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(EXPECTED_BASIC);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.body).toBe("grant_type=client_credentials");
  });

  it("maps invalid credentials (401) to paypal_auth_failed without leaking secrets", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { error: "invalid_client", error_description: "Client Authentication failed" },
        401,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getPayPalAccessToken()).rejects.toMatchObject({
      name: "PayPalAuthError",
      code: "paypal_auth_failed",
      upstreamStatus: 401,
    });

    // The thrown message and any logging must never contain credentials or
    // the raw upstream description.
    await getPayPalAccessToken().catch((error: unknown) => {
      const message = String((error as Error).message);
      expect(message).not.toContain(FAKE_CREDS.PAYPAL_CLIENT_SECRET);
      expect(message).not.toContain(FAKE_CREDS.PAYPAL_CLIENT_ID);
      expect(message).not.toContain("Client Authentication failed");
    });
    expect(errorSpy).not.toHaveBeenCalled();

    const status = await checkPayPalConnection();
    expect(status.status).toBe(502);
    expect(status.body).toEqual({
      success: false,
      environment: "sandbox",
      configured: true,
      authenticated: false,
      error: "paypal_auth_failed",
    });
  });

  it("maps network failures to paypal_unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(getPayPalAccessToken()).rejects.toMatchObject({
      code: "paypal_unavailable",
    });
    const status = await checkPayPalConnection();
    expect(status.status).toBe(502);
    expect(status.body.error).toBe("paypal_unavailable");
  });

  it("maps timeouts to paypal_timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const timeout = new Error("The operation was aborted due to timeout");
        timeout.name = "TimeoutError";
        throw timeout;
      }),
    );
    await expect(getPayPalAccessToken()).rejects.toMatchObject({
      code: "paypal_timeout",
    });
    const status = await checkPayPalConnection();
    expect(status.status).toBe(504);
    expect(status.body.error).toBe("paypal_timeout");
  });

  it("rejects malformed token responses", async () => {
    // Missing access_token.
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ expires_in: 32400 })));
    await expect(getPayPalAccessToken()).rejects.toMatchObject({
      code: "paypal_malformed_response",
    });

    // Non-numeric expires_in.
    resetPayPalTokenCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(tokenBody({ expires_in: "soon" }))),
    );
    await expect(getPayPalAccessToken()).rejects.toMatchObject({
      code: "paypal_malformed_response",
    });

    // Non-JSON body.
    resetPayPalTokenCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 })),
    );
    await expect(getPayPalAccessToken()).rejects.toMatchObject({
      code: "paypal_malformed_response",
    });
  });
});

describe("token caching and refresh", () => {
  it("reuses the cached token instead of requesting a new one per call", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(tokenBody()));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getPayPalAccessToken();
    const second = await getPayPalAccessToken();

    expect(first).toBe("test-access-token");
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent token requests", async () => {
    let release: (response: Response) => void = () => {};
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(() => gate);
    vi.stubGlobal("fetch", fetchMock);

    const first = getPayPalAccessToken();
    const second = getPayPalAccessToken();
    release(jsonResponse(tokenBody()));

    await expect(Promise.all([first, second])).resolves.toEqual([
      "test-access-token",
      "test-access-token",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes approximately 60 seconds before expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(tokenBody({ access_token: "token-1", expires_in: 3600 })))
      .mockResolvedValueOnce(jsonResponse(tokenBody({ access_token: "token-2", expires_in: 3600 })));
    vi.stubGlobal("fetch", fetchMock);

    expect(await getPayPalAccessToken()).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 3500s in: still inside the cached lifetime (refresh margin starts at
    // 3540s), so no new request.
    vi.setSystemTime(new Date(Date.now() + 3500 * 1000));
    expect(await getPayPalAccessToken()).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 3600s in: at/after expiry — must refresh.
    vi.setSystemTime(new Date(Date.now() + 100 * 1000));
    expect(await getPayPalAccessToken()).toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("safe status reporting", () => {
  it("returns only safe fields and never secret material", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(tokenBody()));
    vi.stubGlobal("fetch", fetchMock);

    const { status, body } = await checkPayPalConnection();
    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      environment: "sandbox",
      configured: true,
      authenticated: true,
      message: "PayPal Sandbox connection successful",
    });

    const allowedKeys = new Set([
      "success",
      "environment",
      "configured",
      "authenticated",
      "message",
      "error",
    ]);
    for (const key of Object.keys(body)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("test-access-token");
    expect(serialized).not.toContain(FAKE_CREDS.PAYPAL_CLIENT_SECRET);
    expect(serialized).not.toContain(FAKE_CREDS.PAYPAL_CLIENT_ID);
    expect(serialized).not.toContain("Basic ");
    expect(serialized).not.toContain("Bearer");
  });

  it("GET /api/paypal/status returns only safe fields with no-store caching", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(tokenBody())));
    const { GET } = await import("@/app/api/paypal/status/route");

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toEqual({
      success: true,
      environment: "sandbox",
      configured: true,
      authenticated: true,
      message: "PayPal Sandbox connection successful",
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("test-access-token");
    expect(serialized).not.toContain(FAKE_CREDS.PAYPAL_CLIENT_SECRET);
  });

  it("keeps PayPal credentials server-side only (no client imports, no NEXT_PUBLIC vars)", () => {
    const root = process.cwd();
    const srcRoot = path.join(root, "src");
    const files = (fs.readdirSync(srcRoot, { recursive: true }) as string[])
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => /\.(ts|tsx)$/.test(file));

    const offenders: string[] = [];
    for (const relative of files) {
      const source = fs.readFileSync(path.join(srcRoot, relative), "utf8");
      if (/NEXT_PUBLIC_PAYPAL/.test(source)) {
        offenders.push(`${relative}: exposes a NEXT_PUBLIC_PAYPAL_* variable`);
      }
      const isClientModule = /^\s*["']use client["']/m.test(source);
      if (isClientModule && /from\s+["']@\/lib\/paypal/.test(source)) {
        offenders.push(`${relative}: client module imports the server-only PayPal library`);
      }
      if (/from\s+["']@\/lib\/paypal/.test(source) && !/^app[\\/]api[\\/]paypal[\\/]/i.test(relative)) {
        offenders.push(`${relative}: unexpected import of the server-only PayPal library`);
      }
    }
    expect(offenders).toEqual([]);

    // The secret is referenced only inside the server-only auth module.
    const secretRefs = files.filter((file) =>
      fs.readFileSync(path.join(srcRoot, file), "utf8").includes("PAYPAL_CLIENT_SECRET"),
    );
    expect(secretRefs).toEqual(["lib/paypal/auth.ts"]);

    const authSource = fs.readFileSync(path.join(srcRoot, "lib/paypal/auth.ts"), "utf8");
    expect(/^\s*["']use client["']/m.test(authSource)).toBe(false);
    expect(authSource).toContain("server-only");

    const routeSource = fs.readFileSync(
      path.join(srcRoot, "app/api/paypal/status/route.ts"),
      "utf8",
    );
    expect(/^\s*["']use client["']/m.test(routeSource)).toBe(false);
  });
});

describe("PayPalAuthError", () => {
  it("carries a typed sanitized code", () => {
    const error = new PayPalAuthError("paypal_auth_failed", "sanitized", 401);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PayPalAuthError");
    expect(error.code).toBe("paypal_auth_failed");
    expect(error.upstreamStatus).toBe(401);
  });
});
