// @vitest-environment jsdom

/**
 * PayPal Checkout component tests (Phase 5.3 + 5.4).
 *
 * The SDK and all HTTP calls are mocked. These tests pin the buyer-facing
 * behaviour: server-created orders from ids/quantities only, a visible demo
 * disclaimer, approval-to-capture flow, COMPLETED-only success, honest
 * pending/denied/error states, cancel handling, SDK failure recovery, and
 * duplicate submission/capture protection.
 */
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// React 19 requires this flag for act(...) outside React Testing Library's
// own render helpers (the tests invoke the SDK callbacks directly).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("@/lib/checkout/paypal-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/checkout/paypal-sdk")>();
  return { ...actual, loadPayPalSdk: vi.fn() };
});

import {
  loadPayPalSdk,
  PayPalSdkError,
  type PayPalButtonsConfig,
  type PayPalSdk,
} from "@/lib/checkout/paypal-sdk";
import { PayPalCheckout } from "@/components/cart/paypal-checkout";

const ITEMS = [{ productId: "demo-aurora-headphones", quantity: 1 }];

const CONFIG_RESPONSE = {
  success: true,
  environment: "sandbox",
  configured: true,
  clientId: "test-client-id",
  currency: "USD",
};

const ORDER_ID = "5O190127TN364715T";
const CAPTURE_ID = "3C679366HH908993F";
const CAPTURE_TOKEN = "capture-token-1234567890";

const ORDER_RESPONSE = {
  success: true,
  environment: "sandbox",
  demo: true,
  orderId: ORDER_ID,
  status: "CREATED",
  amount: { currency: "USD", value: "249.00" },
  referenceId: "shopmate-demo-test",
  captureToken: CAPTURE_TOKEN,
};

const CAPTURE_RESPONSE = {
  success: true,
  environment: "sandbox",
  demo: true,
  orderId: ORDER_ID,
  captureId: CAPTURE_ID,
  status: "COMPLETED",
  amount: { currency: "USD", value: "249.00" },
  referenceId: "shopmate-demo-test",
  alreadyCaptured: false,
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

function installFetch(handlers?: {
  config?: () => Response | Promise<Response>;
  order?: () => Response | Promise<Response>;
  capture?: () => Response | Promise<Response>;
}): FetchCall[] {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push({ url, init });
    if (url.endsWith("/api/paypal/config")) {
      return handlers?.config ? handlers.config() : jsonResponse(CONFIG_RESPONSE);
    }
    if (url.endsWith("/api/paypal/orders")) {
      return handlers?.order
        ? handlers.order()
        : jsonResponse(ORDER_RESPONSE, 201);
    }
    if (url.includes(`/api/paypal/orders/${ORDER_ID}/capture`)) {
      return handlers?.capture
        ? handlers.capture()
        : jsonResponse(CAPTURE_RESPONSE);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

function captureCalls(calls: FetchCall[]): FetchCall[] {
  return calls.filter((call) => call.url.includes("/capture"));
}

interface FakeSdk {
  sdk: PayPalSdk;
  configs: PayPalButtonsConfig[];
  render: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function installFakeSdk(): FakeSdk {
  const configs: PayPalButtonsConfig[] = [];
  const render = vi.fn(async (target: HTMLElement) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "PayPal";
    button.setAttribute("data-testid", "paypal-button");
    target.appendChild(button);
  });
  const close = vi.fn(async () => {});
  const sdk = {
    Buttons: vi.fn((config: PayPalButtonsConfig) => {
      configs.push(config);
      return { render, close };
    }),
  } as unknown as PayPalSdk;
  return { sdk, configs, render, close };
}

async function renderCheckout() {
  render(<PayPalCheckout items={ITEMS} />);
  return screen.findByTestId("paypal-button");
}

beforeEach(() => {
  vi.mocked(loadPayPalSdk).mockReset();
  delete window.paypal;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("PayPalCheckout — rendering", () => {
  it("loads the official sandbox buttons and shows the demo disclaimer", async () => {
    installFetch();
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    const button = await renderCheckout();

    expect(button).toBeTruthy();
    expect(loadPayPalSdk).toHaveBeenCalledWith("test-client-id");
    expect(fake.configs[0]?.style?.layout).toBe("vertical");
    expect(screen.getByText(/ShopMate Sandbox demonstration/i)).toBeTruthy();
    expect(screen.getByText(/not a real retailer purchase/i)).toBeTruthy();
    expect(screen.getByText(/no goods are shipped/i)).toBeTruthy();
  });

  it("shows an unavailable state when public configuration is missing", async () => {
    installFetch({
      config: () =>
        jsonResponse(
          { success: false, error: "paypal_not_configured" },
          503,
        ),
    });
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    render(<PayPalCheckout items={ITEMS} />);

    expect(await screen.findByText(/PayPal isn't available/i)).toBeTruthy();
    expect(loadPayPalSdk).not.toHaveBeenCalled();
  });

  it("shows a safe retry state when the SDK fails to load", async () => {
    installFetch();
    vi.mocked(loadPayPalSdk).mockRejectedValue(
      new PayPalSdkError("sdk_load_failed", "PayPal could not load."),
    );

    render(<PayPalCheckout items={ITEMS} />);

    expect(await screen.findByText(/PayPal couldn't be loaded/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    expect(screen.getByText(/ShopMate Sandbox demonstration/i)).toBeTruthy();
  });

  it("retries loading the SDK after a failure", async () => {
    installFetch();
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk)
      .mockRejectedValueOnce(
        new PayPalSdkError("sdk_load_failed", "PayPal could not load."),
      )
      .mockResolvedValueOnce(fake.sdk);

    render(<PayPalCheckout items={ITEMS} />);

    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByTestId("paypal-button")).toBeTruthy();
  });
});

describe("PayPalCheckout — order creation", () => {
  it("creates the order from product ids and quantities, never client prices", async () => {
    const calls = installFetch();
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();

    let orderId = "";
    await act(async () => {
      orderId = await fake.configs[0]!.createOrder();
    });
    expect(orderId).toBe(ORDER_ID);

    const orderCall = calls.find((call) =>
      call.url.endsWith("/api/paypal/orders"),
    );
    expect(orderCall).toBeDefined();
    const body = JSON.parse(String(orderCall!.init?.body)) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({
      items: [{ productId: "demo-aurora-headphones", quantity: 1 }],
      currency: "USD",
    });
    expect(JSON.stringify(body)).not.toContain("price");
    expect(JSON.stringify(body)).not.toContain("total");

    const headers = new Headers(orderCall!.init?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("idempotency-key")).toMatch(
      /^[A-Za-z0-9._-]{8,108}$/,
    );
  });

  it("handles order creation failure without claiming a payment", async () => {
    installFetch({
      order: () =>
        jsonResponse(
          { success: false, error: "paypal_unavailable" },
          502,
        ),
    });
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();

    await act(async () => {
      await expect(fake.configs[0]!.createOrder()).rejects.toThrow();
    });
    expect(
      screen.getByText(/couldn't create the PayPal order/i),
    ).toBeTruthy();
    expect(screen.getByText(/no payment was taken/i)).toBeTruthy();
  });

  it("preserves specific backend error message when createOrder fails and onError fires", async () => {
    installFetch({
      order: () =>
        jsonResponse(
          {
            success: false,
            error: "amount_too_large",
            message: "Demo orders are capped at $5,000.",
          },
          400,
        ),
    });
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();

    await act(async () => {
      try {
        await fake.configs[0]!.createOrder();
      } catch (err) {
        fake.configs[0]!.onError?.(err);
      }
    });

    expect(screen.getByText(/Demo orders are capped at \$5,000\./i)).toBeTruthy();
    expect(screen.getByText(/no payment was taken/i)).toBeTruthy();
    expect(
      screen.queryByText(/The PayPal checkout couldn't be completed\./i),
    ).toBeNull();
  });

  it("prevents duplicate order submissions", async () => {
    const calls = installFetch();
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();

    await act(async () => {
      const first = fake.configs[0]!.createOrder();
      const second = fake.configs[0]!.createOrder();
      await expect(second).rejects.toThrow(/already being created/i);
      await expect(first).resolves.toBe(ORDER_ID);
    });

    expect(
      calls.filter((call) => call.url.endsWith("/api/paypal/orders")),
    ).toHaveLength(1);
  });
});

describe("PayPalCheckout — buyer approval, capture and cancellation", () => {
  it("captures after approval and shows success only after verified COMPLETED", async () => {
    const calls = installFetch();
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();
    await act(async () => {
      await fake.configs[0]!.createOrder();
    });
    expect(captureCalls(calls)).toHaveLength(0);

    await act(async () => {
      await fake.configs[0]!.onApprove?.({ orderID: ORDER_ID });
    });

    const captures = captureCalls(calls);
    expect(captures).toHaveLength(1);
    expect(captures[0]!.url).toContain(
      `/api/paypal/orders/${ORDER_ID}/capture`,
    );
    expect(captures[0]!.init?.method).toBe("POST");
    const headers = new Headers(captures[0]!.init?.headers);
    expect(headers.get("x-shopmate-capture-token")).toBe(CAPTURE_TOKEN);
    expect(String(captures[0]!.init?.body ?? "")).not.toContain("249.00");
    expect(String(captures[0]!.init?.body ?? "")).not.toContain("amount");

    expect(screen.getByText(/sandbox payment captured/i)).toBeTruthy();
    expect(screen.getByText(new RegExp(CAPTURE_ID))).toBeTruthy();
    expect(screen.getByText(/ShopMate Sandbox demonstration/i)).toBeTruthy();
    expect(screen.queryByText(/capture pending/i)).toBeNull();
    expect(screen.queryByText(/payment successful/i)).toBeNull();
  });

  it("shows a processing state while capture is in flight", async () => {
    let release: (response: Response) => void = () => {};
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    installFetch({ capture: () => gate });
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();
    await act(async () => {
      await fake.configs[0]!.createOrder();
    });

    let approval: Promise<void> | void;
    await act(async () => {
      approval = fake.configs[0]!.onApprove?.({ orderID: ORDER_ID });
    });

    expect(screen.getByText(/confirming payment/i)).toBeTruthy();
    expect(screen.queryByText(/sandbox payment captured/i)).toBeNull();

    release(jsonResponse(CAPTURE_RESPONSE));
    await act(async () => {
      await approval;
    });
    expect(await screen.findByText(/sandbox payment captured/i)).toBeTruthy();
  });

  it("shows pending capture honestly and never claims success", async () => {
    installFetch({
      capture: () =>
        jsonResponse(
          {
            success: false,
            error: "capture_pending",
            status: "PENDING",
            message: "PayPal is still processing the capture.",
          },
          202,
        ),
    });
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();
    await act(async () => {
      await fake.configs[0]!.createOrder();
    });
    await act(async () => {
      await fake.configs[0]!.onApprove?.({ orderID: ORDER_ID });
    });

    expect(screen.getByText(/capture pending/i)).toBeTruthy();
    expect(screen.getByText(/payment not complete/i)).toBeTruthy();
    expect(screen.queryByText(/sandbox payment captured/i)).toBeNull();
    expect(screen.queryByText(/payment successful/i)).toBeNull();
  });

  it("shows a denied capture honestly and never claims success", async () => {
    installFetch({
      capture: () =>
        jsonResponse(
          {
            success: false,
            error: "capture_denied",
            status: "DENIED",
            message: "PayPal denied the capture.",
          },
          402,
        ),
    });
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();
    await act(async () => {
      await fake.configs[0]!.createOrder();
    });
    await act(async () => {
      await fake.configs[0]!.onApprove?.({ orderID: ORDER_ID });
    });

    expect(screen.getByText(/denied the capture/i)).toBeTruthy();
    expect(screen.getByText(/no payment was taken/i)).toBeTruthy();
    expect(screen.queryByText(/sandbox payment captured/i)).toBeNull();
    expect(screen.queryByText(/payment successful/i)).toBeNull();
  });

  it("prevents duplicate capture requests", async () => {
    let release: (response: Response) => void = () => {};
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const calls = installFetch({ capture: () => gate });
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();
    await act(async () => {
      await fake.configs[0]!.createOrder();
    });

    await act(async () => {
      const first = fake.configs[0]!.onApprove?.({ orderID: ORDER_ID });
      const second = fake.configs[0]!.onApprove?.({ orderID: ORDER_ID });
      release(jsonResponse(CAPTURE_RESPONSE));
      await Promise.all([first, second]);
    });

    expect(captureCalls(calls)).toHaveLength(1);
  });

  it("shows an unknown outcome without ever claiming no payment was taken", async () => {
    installFetch({
      capture: () =>
        jsonResponse(
          {
            success: false,
            error: "payment_status_unknown",
            message:
              "PayPal did not confirm whether this payment completed.",
          },
          409,
        ),
    });
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();
    await act(async () => {
      await fake.configs[0]!.createOrder();
    });
    await act(async () => {
      await fake.configs[0]!.onApprove?.({ orderID: ORDER_ID });
    });

    expect(
      screen.getByText(/couldn't confirm whether PayPal completed this payment/i),
    ).toBeTruthy();
    expect(screen.getByText(/do not retry/i)).toBeTruthy();
    expect(screen.getByText(new RegExp(ORDER_ID))).toBeTruthy();
    expect(screen.queryByText(/no payment was taken/i)).toBeNull();
    expect(screen.queryByText(/sandbox payment captured/i)).toBeNull();
    expect(screen.queryByText(/payment successful/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /try capture again/i }),
    ).toBeNull();
  });

  it("keeps a pending outcome visible when onError or onCancel fires after capture", async () => {
    installFetch({
      capture: () =>
        jsonResponse(
          {
            success: false,
            error: "capture_pending",
            status: "PENDING",
            message: "PayPal is still processing the capture.",
          },
          202,
        ),
    });
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();
    await act(async () => {
      await fake.configs[0]!.createOrder();
    });
    await act(async () => {
      await fake.configs[0]!.onApprove?.({ orderID: ORDER_ID });
    });

    await act(async () => {
      fake.configs[0]!.onError?.(new Error("popup closed after capture"));
      fake.configs[0]!.onCancel?.();
    });

    expect(screen.getByText(/capture pending/i)).toBeTruthy();
    expect(screen.queryByText(/no payment was taken/i)).toBeNull();
    expect(screen.queryByText(/checkout couldn't be completed/i)).toBeNull();
  });

  it("handles buyer cancellation without claiming a payment", async () => {
    installFetch();
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();
    await act(async () => {
      fake.configs[0]!.onCancel?.();
    });

    expect(screen.getByText(/checkout cancelled/i)).toBeTruthy();
    expect(screen.getByText(/no payment was taken/i)).toBeTruthy();
  });

  it("handles popup closure / SDK errors with a safe message", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    installFetch();
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();
    await act(async () => {
      fake.configs[0]!.onError?.(new Error("popup closed"));
    });

    expect(screen.getByText(/checkout couldn't be completed/i)).toBeTruthy();
    expect(screen.getByText(/no payment was taken/i)).toBeTruthy();
    expect(screen.queryByText(/popup closed/i)).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it("logs sanitized onError diagnostics and shows the PayPal reference", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    installFetch();
    const fake = installFakeSdk();
    vi.mocked(loadPayPalSdk).mockResolvedValue(fake.sdk);

    await renderCheckout();
    await act(async () => {
      await fake.configs[0]!.createOrder();
    });

    await act(async () => {
      fake.configs[0]!.onError?.({
        name: "PayPalError",
        message:
          "Authorization: Bearer secret-token " +
          "https://www.sandbox.paypal.com/checkoutweb/genericError" +
          "?code=PAYMENT_DENIED&debug_id=f719139b636c1 " +
          "buyer@example.com",
        details: [
          { issue: "PAYMENT_DENIED", debug_id: "f719139b636c1" },
        ],
      });
    });

    expect(screen.getByText(/checkout couldn't be completed/i)).toBeTruthy();
    expect(screen.getByText(/no payment was taken/i)).toBeTruthy();
    expect(screen.getByText(/PAYMENT_DENIED/)).toBeTruthy();
    expect(screen.getByText(/f719139b636c1/)).toBeTruthy();
    expect(screen.queryByText(/secret-token/)).toBeNull();
    expect(screen.queryByText(/sandbox\.paypal\.com/)).toBeNull();
    expect(screen.queryByText(/buyer@example\.com/)).toBeNull();

    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).toContain("f719139b636c1");
    expect(logged).toContain("PAYMENT_DENIED");
    expect(logged).toContain(ORDER_ID);
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain("sandbox.paypal.com");
    expect(logged).not.toContain("buyer@example.com");
  });
});
