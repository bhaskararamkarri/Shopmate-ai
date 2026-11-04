/**
 * ShopMate AI — browser-side PayPal JavaScript SDK loader (Phase 5.3).
 *
 * Client-safe module: it never imports the server-only PayPal auth service and
 * only ever receives the public sandbox Client ID. The official PayPal JS SDK
 * is loaded from the sandbox host and its Buttons component is used through
 * `window.paypal`.
 */

const SANDBOX_SDK_URL = "https://www.sandbox.paypal.com/sdk/js";
const SCRIPT_SELECTOR = 'script[data-shopmate-paypal-sdk="true"]';
const LOAD_TIMEOUT_MS = 15_000;

export type PayPalSdkErrorCode = "sdk_load_failed" | "sdk_unavailable";

/** Sanitized SDK failure — safe to show to the buyer. */
export class PayPalSdkError extends Error {
  readonly code: PayPalSdkErrorCode;

  constructor(code: PayPalSdkErrorCode, message: string) {
    super(message);
    this.name = "PayPalSdkError";
    this.code = code;
  }
}

export interface PayPalButtonsStyle {
  layout?: "vertical" | "horizontal";
  shape?: "rect" | "pill";
  label?: "paypal" | "checkout" | "buynow";
  color?: "gold" | "blue" | "silver" | "white" | "black";
  height?: number;
  tagline?: boolean;
}

export interface PayPalApproveData {
  orderID: string;
  payerID?: string;
}

export interface PayPalClickActions {
  reject: () => void;
}

export interface PayPalButtonsConfig {
  style?: PayPalButtonsStyle;
  createOrder: () => Promise<string>;
  onApprove?: (data: PayPalApproveData) => void | Promise<void>;
  onCancel?: (data?: unknown) => void;
  onError?: (error: unknown) => void;
  onClick?: (data: unknown, actions: PayPalClickActions) => void;
}

export interface PayPalButtonsInstance {
  render: (target: HTMLElement | string) => Promise<void>;
  close?: () => Promise<void> | void;
}

export interface PayPalSdk {
  Buttons: (config: PayPalButtonsConfig) => PayPalButtonsInstance;
}

declare global {
  interface Window {
    paypal?: PayPalSdk;
  }
}

/**
 * Builds the official sandbox SDK URL with only public parameters. The Client
 * ID is public; no secret or token is ever part of this URL.
 */
export function buildPayPalSdkUrl(clientId: string): string {
  const trimmed = clientId.trim();
  if (!trimmed) {
    throw new Error("A PayPal Client ID is required to load the SDK.");
  }
  const params = new URLSearchParams({
    "client-id": trimmed,
    currency: "USD",
    intent: "capture",
    components: "buttons",
  });
  return `${SANDBOX_SDK_URL}?${params.toString()}`;
}

/** One in-flight load per client id; concurrent components share it. */
const pendingLoads = new Map<string, Promise<PayPalSdk>>();

/**
 * Clears loader state and removes injected scripts. Test isolation only — the
 * production SDK script is intentionally left in place for the page lifetime.
 */
export function resetPayPalSdkLoaderForTests(): void {
  pendingLoads.clear();
  if (typeof document === "undefined") return;
  document.querySelectorAll<HTMLScriptElement>(SCRIPT_SELECTOR).forEach((script) => {
    script.remove();
  });
}

/**
 * Loads the official PayPal sandbox JS SDK once and resolves with
 * `window.paypal`. Failures are sanitized so callers never surface raw script
 * or network details.
 */
export function loadPayPalSdk(clientId: string): Promise<PayPalSdk> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(
      new PayPalSdkError("sdk_unavailable", "PayPal can only load in the browser."),
    );
  }

  if (window.paypal?.Buttons) {
    return Promise.resolve(window.paypal);
  }

  const existing = pendingLoads.get(clientId);
  if (existing) return existing;

  const promise = new Promise<PayPalSdk>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);

    // A previously loaded script that did not expose window.paypal is stale;
    // remove it and start from a clean script element.
    if (script?.dataset.shopmatePaypalState === "loaded" && !window.paypal) {
      script.remove();
      script = null;
    }

    const needsNewScript = !script;
    if (!script) {
      script = document.createElement("script");
      script.dataset.shopmatePaypalSdk = "true";
      script.async = true;
    }
    const element = script;
    element.dataset.shopmatePaypalState = "loading";

    let settled = false;

    function finish(action: () => void, removeScript: boolean): void {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      element.removeEventListener("load", onLoad);
      element.removeEventListener("error", onError);
      pendingLoads.delete(clientId);
      if (removeScript) element.remove();
      action();
    }

    function onLoad(): void {
      if (window.paypal?.Buttons) {
        element.dataset.shopmatePaypalState = "loaded";
        finish(() => resolve(window.paypal as PayPalSdk), false);
        return;
      }
      element.dataset.shopmatePaypalState = "error";
      finish(
        () =>
          reject(
            new PayPalSdkError(
              "sdk_unavailable",
              "PayPal loaded but did not expose its Buttons component.",
            ),
          ),
        true,
      );
    }

    function onError(): void {
      element.dataset.shopmatePaypalState = "error";
      finish(
        () =>
          reject(
            new PayPalSdkError(
              "sdk_load_failed",
              "The PayPal Sandbox SDK could not be loaded.",
            ),
          ),
        true,
      );
    }

    const timer = window.setTimeout(() => {
      element.dataset.shopmatePaypalState = "error";
      finish(
        () =>
          reject(
            new PayPalSdkError(
              "sdk_load_failed",
              "The PayPal Sandbox SDK took too long to load.",
            ),
          ),
        true,
      );
    }, LOAD_TIMEOUT_MS);

    element.addEventListener("load", onLoad);
    element.addEventListener("error", onError);

    if (needsNewScript) {
      element.src = buildPayPalSdkUrl(clientId);
      document.head.appendChild(element);
    }
  });

  pendingLoads.set(clientId, promise);

  // Do not retain a rejected promise: a later retry should create a fresh
  // script. The caller still receives the original rejection.
  promise.catch(() => {
    if (pendingLoads.get(clientId) === promise) {
      pendingLoads.delete(clientId);
    }
  });

  return promise;
}
