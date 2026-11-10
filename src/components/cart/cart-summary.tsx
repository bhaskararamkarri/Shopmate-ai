"use client";

import { useState } from "react";
import Link from "next/link";
import { Database, Lock, ShieldCheck, Trash } from "lucide-react";
import { cn } from "cn";
import type { CartItem } from "@/types";
import { Button } from "@/components/ui/button";
import {
  PayPalCheckout,
  type CheckoutPhase,
  type PayPalCaptureSuccessEvent,
} from "@/components/cart/paypal-checkout";
import { formatMoney } from "@/lib/format";

/**
 * Stitch Tier-2 sticky Order Summary card. Display totals here are quotes;
 * `/api/paypal/orders` recomputes prices authoritatively from server catalog
 * records prior to PayPal approval.
 */
export function CartSummary({
  items,
  onClearCart,
  onCaptureSuccess,
  onPhaseChange,
  className,
}: {
  items: CartItem[];
  onClearCart: () => void;
  onCaptureSuccess?: (result: PayPalCaptureSuccessEvent) => void;
  onPhaseChange?: (phase: CheckoutPhase) => void;
  className?: string;
}) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );
  const checkoutKey = items
    .map((item) => `${item.product.id}:${item.quantity}`)
    .join("|");

  function handleClear() {
    if (confirmingClear) {
      onClearCart();
      setConfirmingClear(false);
      return;
    }
    setConfirmingClear(true);
  }

  return (
    <aside
      aria-label="Order summary"
      className={cn(
        "flex flex-col gap-4 lg:sticky lg:top-20",
        className,
      )}
    >
      <div className="stitch-tier-2 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6">
        <div className="flex items-center justify-between border-b border-border-subtle pb-4">
          <h2 className="font-heading text-[18px] font-semibold tracking-tight text-on-surface">
            Order Summary
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary-container/45 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-on-secondary-fixed">
            <ShieldCheck className="size-3.5 text-secondary" aria-hidden="true" />
            Live Quote
          </span>
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-text-muted">Items Subtotal ({itemCount})</dt>
            <dd className="font-mono font-semibold tabular-nums text-on-surface">
              {formatMoney(subtotal)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-muted">Fulfillment</dt>
            <dd className="font-mono text-xs font-semibold text-secondary">
              Demo Transaction ($0.00)
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-border-subtle pt-4">
            <dt>
              <span className="block font-heading text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Estimated Total
              </span>
              <span className="font-mono text-[11px] text-text-muted">
                Server-recalculated on approval
              </span>
            </dt>
            <dd className="text-right font-heading text-2xl font-bold tabular-nums tracking-tight text-on-surface">
              {formatMoney(subtotal)}{" "}
              <span className="text-xs font-normal text-text-muted">USD</span>
            </dd>
          </div>
        </dl>

        <PayPalCheckout
          key={checkoutKey}
          items={items.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          }))}
          onCaptureSuccess={onCaptureSuccess}
          onPhaseChange={onPhaseChange}
        />

        <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-error hover:bg-error-container/40 hover:text-error"
            onClick={handleClear}
          >
            <Trash aria-hidden="true" />
            {confirmingClear ? "Tap again to confirm" : "Clear cart"}
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-primary">
            <Link href="/chat">Ask AI Workspace</Link>
          </Button>
        </div>
      </div>

      {/* Stitch 3-tile guarantee strip */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="stitch-tier-1 flex flex-col items-center gap-1 rounded-xl border border-border-subtle bg-surface-card p-2.5">
          <Lock className="size-4 text-primary" aria-hidden="true" />
          <span className="font-heading text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            No Real Charges
          </span>
        </div>
        <div className="stitch-tier-1 flex flex-col items-center gap-1 rounded-xl border border-border-subtle bg-surface-card p-2.5">
          <Database className="size-4 text-secondary" aria-hidden="true" />
          <span className="font-heading text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Catalog Grounded
          </span>
        </div>
        <div className="stitch-tier-1 flex flex-col items-center gap-1 rounded-xl border border-border-subtle bg-surface-card p-2.5">
          <ShieldCheck className="size-4 text-tertiary" aria-hidden="true" />
          <span className="font-heading text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Server Verified
          </span>
        </div>
      </div>
    </aside>
  );
}
