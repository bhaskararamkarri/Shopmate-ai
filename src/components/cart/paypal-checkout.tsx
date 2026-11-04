"use client";

/**
 * ShopMate AI — PayPal Sandbox checkout buttons (Phase 5.3).
 *
 * The browser sends only product ids and quantities to the server. The server
 * re-prices the cart and creates the PayPal order; this component never sends
 * or trusts a price. Buyer approval stops at an explicit "capture pending"
 * state — Phase 5.3 does not capture payments and never claims an order is paid
 * or complete.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Clock, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  | "approved"
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
  const record = value as { success?: unknown; orderId?: unknown };
  return (
    record.success === true &&
    typeof record.orderId === "string" &&
    record.orderId.trim().length > 0
  );
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
  const [sdk, setSdk] = useState<PayPalSdk | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef(items);
  const submittingRef = useRef(false);
  const approvedRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

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
    setMessage("");
    submittingRef.current = false;
    approvedRef.current = false;
    idempotencyKeyRef.current = null;
    setRetryToken((token) => token + 1);
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

          setPhase("approval");
          return payload.orderId.trim();
        } catch (error) {
          submittingRef.current = false;
          setPhase("error");
          setMessage(
            "We couldn't create the PayPal order. No payment was taken. Please try again.",
          );
          throw error instanceof Error
            ? error
            : new Error("PayPal order creation failed.");
        }
      },
      onApprove: (data) => {
        // Buyer approval only. No capture call is made in Phase 5.3.
        approvedRef.current = true;
        submittingRef.current = false;
        setOrderId(data.orderID);
        setMessage("");
        setPhase("approved");
      },
      onCancel: () => {
        submittingRef.current = false;
        approvedRef.current = false;
        idempotencyKeyRef.current = createCheckoutKey();
        setPhase("cancelled");
      },
      onError: () => {
        submittingRef.current = false;
        approvedRef.current = false;
        idempotencyKeyRef.current = createCheckoutKey();
        setPhase("error");
        setMessage(
          "The PayPal checkout couldn't be completed. No payment was taken. Please try again.",
        );
      },
      onClick: (_data, actions) => {
        if (submittingRef.current || approvedRef.current) {
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

  const buttonsHidden = phase === "approved";

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

        {phase === "approved" && (
          <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-[12px] leading-relaxed text-sky-950 dark:text-sky-100">
            <p className="flex items-center gap-1.5 font-semibold">
              <Clock aria-hidden="true" className="size-4" />
              Payment approved — capture pending
            </p>
            <p className="mt-1">
              PayPal approved this sandbox order. ShopMate has not captured the
              payment, so this order is not complete.
            </p>
            <p className="mt-1">
              No money has moved and no goods will ship. Capture is Phase 5.4.
            </p>
            {orderId && (
              <p className="mt-2 text-[11px] text-sky-900/80 dark:text-sky-100/80">
                Sandbox order ID: <code className="font-mono">{orderId}</code>
              </p>
            )}
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
