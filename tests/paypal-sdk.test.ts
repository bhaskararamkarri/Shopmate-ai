// @vitest-environment jsdom

/**
 * PayPal JavaScript SDK loader tests (Phase 5.3).
 *
 * The loader must use the official sandbox SDK URL, dedupe concurrent loads,
 * surface a safe failure when the script cannot load, and never touch a
 * client secret (it only receives the public Client ID).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPayPalSdkUrl,
  loadPayPalSdk,
  PayPalSdkError,
  resetPayPalSdkLoaderForTests,
  type PayPalSdk,
} from "@/lib/checkout/paypal-sdk";

const CLIENT_ID = "test-client-id";
const SCRIPT_SELECTOR = 'script[data-shopmate-paypal-sdk="true"]';

function fakeSdk(): PayPalSdk {
  return {
    Buttons: vi.fn(() => ({
      render: vi.fn(async () => {}),
    })),
  };
}

function removeScripts() {
  document.querySelectorAll(SCRIPT_SELECTOR).forEach((script) => script.remove());
}

beforeEach(() => {
  resetPayPalSdkLoaderForTests();
  removeScripts();
  delete window.paypal;
});

afterEach(() => {
  resetPayPalSdkLoaderForTests();
  removeScripts();
  delete window.paypal;
  vi.restoreAllMocks();
});

describe("buildPayPalSdkUrl", () => {
  it("uses the official sandbox SDK and only public parameters", () => {
    const url = new URL(buildPayPalSdkUrl(CLIENT_ID));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://www.sandbox.paypal.com/sdk/js",
    );
    expect(url.searchParams.get("client-id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("currency")).toBe("USD");
    expect(url.searchParams.get("intent")).toBe("capture");
    expect(url.searchParams.get("components")).toBe("buttons");
    expect(url.toString()).not.toContain("secret");
    expect(url.toString()).not.toContain("access_token");
  });

  it("encodes the public client id and rejects an empty one", () => {
    const url = new URL(buildPayPalSdkUrl("client id/with space"));
    expect(url.searchParams.get("client-id")).toBe("client id/with space");
    expect(() => buildPayPalSdkUrl("   ")).toThrow();
  });
});

describe("loadPayPalSdk", () => {
  it("reuses an already available PayPal SDK", async () => {
    const sdk = fakeSdk();
    window.paypal = sdk;

    await expect(loadPayPalSdk(CLIENT_ID)).resolves.toBe(sdk);
    expect(document.querySelector(SCRIPT_SELECTOR)).toBeNull();
  });

  it("injects the sandbox SDK script once and resolves on load", async () => {
    const sdk = fakeSdk();
    const promise = loadPayPalSdk(CLIENT_ID);

    const script = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    expect(script).not.toBeNull();
    expect(script!.src).toBe(buildPayPalSdkUrl(CLIENT_ID));
    expect(script!.async).toBe(true);

    window.paypal = sdk;
    script!.dispatchEvent(new Event("load"));

    await expect(promise).resolves.toBe(sdk);
  });

  it("deduplicates concurrent loads for the same client id", async () => {
    const first = loadPayPalSdk(CLIENT_ID);
    const second = loadPayPalSdk(CLIENT_ID);
    expect(second).toBe(first);

    const script = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)!;
    window.paypal = fakeSdk();
    script.dispatchEvent(new Event("load"));

    await first;
    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1);
  });

  it("maps script errors to sdk_load_failed and cleans up for a retry", async () => {
    const promise = loadPayPalSdk(CLIENT_ID);
    const script = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)!;

    script.dispatchEvent(new Event("error"));

    await expect(promise).rejects.toMatchObject({
      name: "PayPalSdkError",
      code: "sdk_load_failed",
    });
    expect(script.isConnected).toBe(false);

    // A retry creates a fresh script rather than reusing the failed promise.
    const retry = loadPayPalSdk(CLIENT_ID);
    expect(retry).not.toBe(promise);
    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1);

    const retryScript = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)!;
    window.paypal = fakeSdk();
    retryScript.dispatchEvent(new Event("load"));
    await expect(retry).resolves.toBe(window.paypal);
  });

  it("rejects when the script loads without exposing the PayPal SDK", async () => {
    const promise = loadPayPalSdk(CLIENT_ID);
    const script = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)!;
    script.dispatchEvent(new Event("load"));

    await expect(promise).rejects.toMatchObject({
      name: "PayPalSdkError",
      code: "sdk_unavailable",
    });
    expect(script.isConnected).toBe(false);
  });

  it("exposes only a stable, sanitized error code", () => {
    const error = new PayPalSdkError("sdk_load_failed", "PayPal could not load.");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PayPalSdkError");
    expect(error.code).toBe("sdk_load_failed");
    expect(error.message).toBe("PayPal could not load.");
  });
});
