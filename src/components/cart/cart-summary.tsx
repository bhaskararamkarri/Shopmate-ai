"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash } from "lucide-react";
import { cn } from "cn";
import type { CartItem } from "@/types";
import { Button } from "@/components/ui/button";
import { PayPalCheckout } from "@/components/cart/paypal-checkout";
import { formatMoney } from "@/lib/format";

/**
 * Cart totals panel. Every number here is a frontend display value only —
 * the PayPal order endpoint recalculates and validates the final amount
 * server-side. The checkout itself is a labeled PayPal Sandbox demo.
 */
export function CartSummary({
  items,
  onClearCart,
  className,
}: {
  items: CartItem[];
  onClearCart: () => void;
  className?: string;
}) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );
  // Remount the checkout when the cart changes so a new order starts from a
  // clean buyer-approval state.
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
        "self-start rounded-xl border border-border bg-card p-6 lg:sticky lg:top-24",
        className,
      )}
    >
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        Order summary
      </h2>

      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Items</dt>
          <dd className="font-medium tabular-nums text-foreground">{itemCount}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Shipping</dt>
          <dd className="text-muted-foreground">No shipping — demo transaction</dd>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <dt className="text-[15px] font-semibold text-foreground">
            Estimated total
          </dt>
          <dd className="text-[17px] font-semibold tabular-nums text-foreground">
            {formatMoney(subtotal)}
          </dd>
        </div>
      </dl>

      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        Final amount is recalculated and validated on the server by PayPal order
        creation.
      </p>

      <PayPalCheckout
        key={checkoutKey}
        items={items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        }))}
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
