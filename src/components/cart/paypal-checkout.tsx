"use client";

/**
 * ShopMate AI — PayPal Sandbox checkout buttons (Phase 5.3 + 5.4).
 *
 * The browser sends only product ids and quantities to the server. The server
 * re-prices the cart and creates the PayPal order; this component never sends
 * or trusts a price. Buyer approval is followed by a server-side capture and
 * verification call. Success is shown only when the server returns a verified
 * COMPLETED capture whose amount matches the server-created order.
 *
 * The entire flow is an explicitly labelled sandbox demonstration: no real
 * money moves, no retailer is paid, and no goods are shipped.
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import {
  loadPayPalSdk,
  PayPalSdkError,
  type PayPalSdk,
} from "@/lib/checkout/paypal-sdk";

export interface PayPalCheckoutItem {
  productId: string;
  quantity: number;
}

type CheckoutPhase =
  | "loading"
  | "unavailable"
  | "ready"
  | "creating"
  | "approval"
  | "capturing"
  | "captured"
  | "pending"
  | "capture_error"
  | "cancelled"
  | "error";

interface PublicConfig {
  success: true;
  environment: "sandbox";
  configured: true;
  clientId: string;
  currency: "USD";
}

interface OrderResponse {
  success: true;
  orderId: string;
  captureToken: string;
}

interface CaptureSuccess {
  success: true;
  environment: "sandbox";
  demo: true;
  orderId: string;
  captureId: string;
  status: "COMPLETED";
  amount: { currency: "USD"; value: string };
  referenceId: string;
  alreadyCaptured: boolean;
}

interface CaptureState {
  captureId: string;
  amount: { currency: "USD"; value: string };
}

function isPublicConfig(value: unknown): value is PublicConfig {
  if (!value || typeof value !== "object") return false;
  const record = value as {
    success?: unknown;
    environment?: unknown;
    configured?: unknown;
    clientId?: unknown;
    currency?: unknown;
  };
  return (
    record.success === true &&
    record.environment === "sandbox" &&
    record.configured === true &&
    record.currency === "USD" &&
    typeof record.clientId === "string" &&
    record.clientId.trim().length > 0
  );
}

function isOrderResponse(value: unknown): value is OrderResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as {
    success?: unknown;
    orderId?: unknown;
    captureToken?: unknown;
  };
  return (
    record.success === true &&
    typeof record.orderId === "string" &&
    record.orderId.trim().length > 0 &&
    typeof record.captureToken === "string" &&
    record.captureToken.trim().length > 0
  );
}

/** Success requires the server-verified COMPLETED shape, not just HTTP 200. */
function isCaptureSuccess(
  value: unknown,
  expectedOrderId: string,
): value is CaptureSuccess {
  if (!value || typeof value !== "object") return false;
  const record = value as {
    success?: unknown;
    orderId?: unknown;
    captureId?: unknown;
    status?: unknown;
    amount?: { currency?: unknown; value?: unknown };
  };
  return (
    record.success === true &&
    record.orderId === expectedOrderId &&
    record.status === "COMPLETED" &&
    typeof record.captureId === "string" &&
    record.captureId.trim().length > 0 &&
    !!record.amount &&
    record.amount.currency === "USD" &&
    typeof record.amount.value === "string" &&
    /^\d{1,9}\.\d{2}$/.test(record.amount.value)
  );
}

function captureFailureCode(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { success?: unknown; error?: unknown };
  return record.success === false && typeof record.error === "string"
    ? record.error
    : null;
}

function captureFailureMessage(code: string | null): string {
  switch (code) {
    case "capture_denied":
      return "PayPal denied the capture. No payment was taken.";
    case "order_not_found":
      return "This sandbox order is no longer available. No payment was taken. Start a new checkout.";
    case "invalid_capture_token":
      return "This checkout could not be verified. No payment was taken. Start a new checkout.";
    case "amount_mismatch":
    case "currency_mismatch":
    case "order_id_mismatch":
    case "purchase_unit_mismatch":
    case "capture_verification_failed":
      return "PayPal's capture did not match the server order. No payment is confirmed.";
    case "paypal_timeout":
      return "PayPal did not respond in time. The capture is unconfirmed; no payment is assumed.";
    case "paypal_unavailable":
      return "PayPal is temporarily unavailable. The capture is unconfirmed; no payment is assumed.";
    case "capture_not_allowed":
      return "PayPal did not accept this capture. No payment was taken. Start a new checkout.";
    default:
      return "PayPal did not confirm the capture. No payment is confirmed.";
  }
}

/** Client-only idempotency key for the create-order request. */
function createCheckoutKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `shopmate-${cryptoApi.randomUUID()}`;
  }
  return `shopmate-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

export function PayPalCheckout({ items }: { items: PayPalCheckoutItem[] }) {
  const [phase, setPhase] = useState<CheckoutPhase>("loading");
  const [message, setMessage] = useState("");
  const [orderId, setOrderId] = useState<string>();
  const [capture, setCapture] = useState<CaptureState | null>(null);
  const [sdk, setSdk] = useState<PayPalSdk | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef(items);
  const submittingRef = useRef(false);
  const approvedRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const captureTokenRef = useRef<string | null>(null);
  const createdOrderIdRef = useRef<string | null>(null);
  const captureInFlightRef = useRef(false);
  const capturedRef = useRef(false);

  // Keep the latest ids/quantities available to the PayPal callbacks without
  // re-rendering the Buttons frame on every parent render.
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  function currentIdempotencyKey(): string {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createCheckoutKey();
    }
    return idempotencyKeyRef.current;
  }

  // A failed config/SDK load can be retried from the UI. Reset here (an event
  // handler, not an effect) so the next effect run starts from a clean state.
  function handleRetry(): void {
    setPhase("loading");
    setSdk(null);
    setOrderId(undefined);
    setCapture(null);
    setMessage("");
    submittingRef.current = false;
    approvedRef.current = false;
    captureInFlightRef.current = false;
    capturedRef.current = false;
    idempotencyKeyRef.current = null;
    captureTokenRef.current = null;
    createdOrderIdRef.current = null;
    setRetryToken((token) => token + 1);
  }

  /**
   * Called only after the buyer approves. The server owns verification; this
   * function shows success only for a COMPLETED, amount-checked response.
   */
  async function captureApprovedOrder(captureOrderId: string): Promise<void> {
    if (captureInFlightRef.current || capturedRef.current) return;

    const expectedOrderId = createdOrderIdRef.current;
    const captureToken = captureTokenRef.current;
    if (
      !expectedOrderId ||
      !captureToken ||
      captureOrderId !== expectedOrderId
    ) {
      setPhase("capture_error");
      setMessage(
        "The PayPal approval did not match this ShopMate order. No capture was attempted.",
      );
      return;
    }

    approvedRef.current = true;
    submittingRef.current = false;
    captureInFlightRef.current = true;
    setOrderId(expectedOrderId);
    setMessage("");
    setPhase("capturing");

    try {
      const response = await fetch(
        `/api/paypal/orders/${encodeURIComponent(expectedOrderId)}/capture`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "X-ShopMate-Capture-Token": captureToken,
          },
        },
      );
      const payload: unknown = await response.json().catch(() => null);

      if (response.ok && isCaptureSuccess(payload, expectedOrderId)) {
        capturedRef.current = true;
        setCapture({ captureId: payload.captureId, amount: payload.amount });
        setPhase("captured");
        return;
      }

      const code = captureFailureCode(payload);
      if (response.status === 202 && code === "capture_pending") {
        setPhase("pending");
        setMessage(
          "PayPal is still processing this capture. Payment is not complete yet.",
        );
        return;
      }

      setPhase("capture_error");
      setMessage(captureFailureMessage(code));
    } catch {
      setPhase("capture_error");
      setMessage(
        "We couldn't confirm the payment capture. No payment is confirmed. Please try again.",
      );
    } finally {
      captureInFlightRef.current = false;
    }
  }

  function handleCaptureRetry(): void {
    if (orderId) void captureApprovedOrder(orderId);
  }

  // Public config → official sandbox SDK. The endpoint returns only the public
  // Client ID; the secret never reaches this component.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch("/api/paypal/config", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !isPublicConfig(payload)) {
          throw new Error("PayPal public configuration is unavailable.");
        }

        const loaded = await loadPayPalSdk(payload.clientId);
        if (cancelled) return;
        setSdk(loaded);
        setPhase("ready");
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setPhase("unavailable");
        setMessage(
          error instanceof PayPalSdkError
            ? "PayPal couldn't be loaded. The sandbox checkout is unavailable right now."
            : "PayPal isn't available right now. The sandbox checkout is not configured.",
        );
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [retryToken]);

  // Render the official Buttons component once per SDK instance. Callbacks
  // read the latest cart through itemsRef, so changing quantities does not
  // require re-rendering the PayPal frame.
  useEffect(() => {
    if (!sdk || !containerRef.current) return;
    const container = containerRef.current;
    let cancelled = false;

    const buttons = sdk.Buttons({
      style: {
        layout: "vertical",
        shape: "rect",
        label: "paypal",
        height: 48,
      },
      createOrder: async () => {
        if (approvedRef.current) {
          throw new Error("This sandbox order has already been approved.");
        }
        if (submittingRef.current) {
          throw new Error("A PayPal order is already being created.");
        }

        submittingRef.current = true;
        setPhase("creating");
        setMessage("");
        setCapture(null);

        try {
          const response = await fetch("/api/paypal/orders", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": currentIdempotencyKey(),
            },
            body: JSON.stringify({
              items: itemsRef.current.map(({ productId, quantity }) => ({
                productId,
                quantity,
              })),
              currency: "USD",
            }),
          });
          const payload: unknown = await response.json().catch(() => null);
          if (!response.ok || !isOrderResponse(payload)) {
            throw new Error("PayPal order creation failed.");
          }

          const nextOrderId = payload.orderId.trim();
          createdOrderIdRef.current = nextOrderId;
          captureTokenRef.current = payload.captureToken.trim();
          setOrderId(nextOrderId);
          setPhase("approval");
          return nextOrderId;
        } catch (error) {
          submittingRef.current = false;
          captureTokenRef.current = null;
          createdOrderIdRef.current = null;
          setPhase("error");
          setMessage(
            "We couldn't create the PayPal order. No payment was taken. Please try again.",
          );
          throw error instanceof Error
            ? error
            : new Error("PayPal order creation failed.");
        }
      },
      onApprove: (data) => captureApprovedOrder(data.orderID),
      onCancel: () => {
        if (captureInFlightRef.current || capturedRef.current) return;
        submittingRef.current = false;
        approvedRef.current = false;
        captureTokenRef.current = null;
        createdOrderIdRef.current = null;
        idempotencyKeyRef.current = createCheckoutKey();
        setPhase("cancelled");
      },
      onError: () => {
        if (captureInFlightRef.current || capturedRef.current) return;
        submittingRef.current = false;
        approvedRef.current = false;
        captureTokenRef.current = null;
        createdOrderIdRef.current = null;
        idempotencyKeyRef.current = createCheckoutKey();
        setPhase("error");
        setMessage(
          "The PayPal checkout couldn't be completed. No payment was taken. Please try again.",
        );
      },
      onClick: (_data, actions) => {
        if (
          submittingRef.current ||
          approvedRef.current ||
          captureInFlightRef.current ||
          capturedRef.current
        ) {
          actions.reject();
        }
      },
    });

    Promise.resolve(buttons.render(container)).catch(() => {
      if (cancelled) return;
      setSdk(null);
      setPhase("unavailable");
      setMessage(
        "PayPal couldn't be displayed. The sandbox checkout is unavailable right now.",
      );
    });

    return () => {
      cancelled = true;
      try {
        void buttons.close?.();
      } catch {
        // SDK cleanup must never break unmount.
      }
      container.innerHTML = "";
    };
  }, [sdk]);

  const buttonsHidden =
    phase === "capturing" ||
    phase === "captured" ||
    phase === "pending" ||
    phase === "capture_error";

  const capturedAmount = capture
    ? formatMoney(Number(capture.amount.value), capture.amount.currency)
    : null;

  return (
    <section
      aria-label="PayPal Sandbox checkout"
      className="mt-5 border-t border-border pt-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Pay with PayPal
        </h3>
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Sandbox
        </span>
      </div>

      <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-950 dark:text-amber-100">
        <p className="font-semibold">ShopMate Sandbox demonstration</p>
        <p className="mt-1">
          This is not a real retailer purchase. No goods are shipped. You are
          approving a test transaction only.
        </p>
      </div>

      {phase === "loading" && (
        <p
          role="status"
          className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground"
        >
          <ShieldCheck aria-hidden="true" className="size-4" />
          Loading PayPal Sandbox…
        </p>
      )}

      {phase === "unavailable" && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive"
        >
          <p className="flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{message}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 gap-1.5"
            onClick={handleRetry}
          >
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}

      {sdk && (
        <div
          ref={containerRef}
          data-testid="paypal-buttons"
          aria-hidden={buttonsHidden}
          className={buttonsHidden ? "hidden" : "mt-3 min-h-12"}
        />
      )}

      <div aria-live="polite" className="mt-3">
        {phase === "creating" && (
          <p className="text-[13px] text-muted-foreground">
            Creating a ShopMate sandbox order…
          </p>
        )}

        {phase === "approval" && (
          <p className="text-[13px] text-muted-foreground">
            PayPal window open — complete the sandbox approval.
          </p>
        )}

        {phase === "capturing" && (
          <p
            role="status"
            className="flex items-center gap-2 text-[13px] text-muted-foreground"
          >
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Confirming payment with PayPal…
          </p>
        )}

        {phase === "captured" && capture && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-[12px] leading-relaxed text-emerald-950 dark:text-emerald-100">
            <p className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Sandbox payment captured
            </p>
            <p className="mt-1">
              PayPal verified a COMPLETED capture for this demo order. No real
              money moved and no goods will ship.
            </p>
            <p className="mt-1">
              Captured amount: {capturedAmount} ({capture.amount.currency})
            </p>
            <p className="mt-2 text-[11px] text-emerald-900/80 dark:text-emerald-100/80">
              Capture ID: <code className="font-mono">{capture.captureId}</code>
              {orderId && (
                <>
                  {" "}
                  · Order ID: <code className="font-mono">{orderId}</code>
                </>
              )}
            </p>
          </div>
        )}

        {phase === "pending" && (
          <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-[12px] leading-relaxed text-sky-950 dark:text-sky-100">
            <p className="flex items-center gap-1.5 font-semibold">
              <Clock aria-hidden="true" className="size-4" />
              Capture pending — payment not complete
            </p>
            <p className="mt-1">
              PayPal is still processing this capture. ShopMate has not verified
              a completed payment, so do not treat this order as paid.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 gap-1.5"
              onClick={handleCaptureRetry}
            >
              <RefreshCw aria-hidden="true" />
              Check capture again
            </Button>
          </div>
        )}

        {phase === "capture_error" && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive"
          >
            <p className="flex items-start gap-2">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span>{message}</span>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 gap-1.5"
              onClick={handleCaptureRetry}
            >
              <RefreshCw aria-hidden="true" />
              Try capture again
            </Button>
          </div>
        )}

        {phase === "cancelled" && (
          <p role="status" className="text-[13px] text-muted-foreground">
            Checkout cancelled — no payment was taken.
          </p>
        )}

        {phase === "error" && (
          <p role="alert" className="text-[13px] text-destructive">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
