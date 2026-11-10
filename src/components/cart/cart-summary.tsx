"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Trash } from "lucide-react";
import { cn } from "cn";
import type { CartItem } from "@/types";
import { Button } from "@/components/ui/button";
import {
  PayPalCheckout,
  type PayPalCaptureSuccessEvent,
} from "@/components/cart/paypal-checkout";
import { formatMoney } from "@/lib/format";

/**
 * Stitch Tier-2 sticky Order Summary panel. Every value here is a frontend
 * display estimate — the PayPal order endpoint recalculates and validates the
 * final amount server-side.
 */
export function CartSummary({
  items,
  onClearCart,
  onCaptureSuccess,
  className,
}: {
  items: CartItem[];
  onClearCart: () => void;
  onCaptureSuccess?: (result: PayPalCaptureSuccessEvent) => void;
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
        "stitch-tier-2 self-start rounded-2xl border border-input bg-card p-6 lg:sticky lg:top-24",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-base font-bold tracking-tight text-foreground">
          Order Summary
        </h2>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-[#047857]">
          <ShieldCheck className="size-3" aria-hidden="true" />
          Server-Verified
        </span>
      </div>

      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Items ({itemCount})</dt>
          <dd className="font-mono font-semibold tabular-nums text-foreground">
            {formatMoney(subtotal)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Fulfillment</dt>
          <dd className="text-xs font-medium text-muted-foreground">
            No shipping — demo transaction
          </dd>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3.5">
          <dt className="text-[15px] font-semibold text-foreground">
            Estimated total
          </dt>
          <dd className="font-mono text-xl font-bold tabular-nums text-foreground">
            {formatMoney(subtotal)}
          </dd>
        </div>
      </dl>

      <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
        Final payable amount is recalculated and verified on the server before
        PayPal Sandbox order approval.
      </p>

      <PayPalCheckout
        key={checkoutKey}
        items={items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        }))}
        onCaptureSuccess={onCaptureSuccess}
      />

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleClear}
        >
          <Trash aria-hidden="true" />
          {confirmingClear ? "Tap again to confirm" : "Clear cart"}
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/chat">Ask the assistant</Link>
        </Button>
      </div>
    </aside>
  );
}
