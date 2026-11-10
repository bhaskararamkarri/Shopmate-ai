"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, ShieldCheck, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shop/empty-state";
import { CartItemRow } from "@/components/cart/cart-item";
import { CartSummary } from "@/components/cart/cart-summary";
import type { PayPalCaptureSuccessEvent } from "@/components/cart/paypal-checkout";
import { useShop } from "@/lib/store";
import type { CartItem } from "@/types";

interface CompletedPayment {
  orderId: string;
  captureId: string;
  amount: { currency: string; value: string };
  purchasedItems: CartItem[];
  capturedAt: string;
}

export function CartClient() {
  const { cartItems, cartCount, setQuantity, removeFromCart, clearCart } =
    useShop();
  const [completedPayment, setCompletedPayment] =
    useState<CompletedPayment | null>(null);

  function handleCaptureSuccess(result: PayPalCaptureSuccessEvent) {
    setCompletedPayment({
      orderId: result.orderId,
      captureId: result.captureId,
      amount: result.amount,
      purchasedItems: [...cartItems],
      capturedAt: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
    clearCart();
  }

  if (completedPayment) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-6 animate-in fade-in duration-300">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-8" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Sandbox Payment Confirmed
            </h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              PayPal verified a completed capture for this demo checkout. Your
              test order reference is recorded below.
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-700 dark:text-sky-300">
              <span className="size-1.5 rounded-full bg-sky-500 animate-pulse" />
              PAYPAL SANDBOX VERIFIED
            </div>
          </div>

          <div className="mt-8 space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between border-b border-border pb-3 text-sm">
              <span className="text-muted-foreground">Payment Status</span>
              <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                COMPLETED
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-3 text-sm">
              <span className="text-muted-foreground">Order Reference</span>
              <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                {completedPayment.orderId}
              </code>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-3 text-sm">
              <span className="text-muted-foreground">PayPal Capture ID</span>
              <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                {completedPayment.captureId}
              </code>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="font-medium text-foreground">Verified Total</span>
              <span className="text-xl font-bold tabular-nums text-foreground">
                ${completedPayment.amount.value} {completedPayment.amount.currency}
              </span>
            </div>
          </div>

          {completedPayment.purchasedItems.length > 0 && (
            <div className="mt-6 rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Purchased Demo Items (
                {completedPayment.purchasedItems.reduce(
                  (acc, i) => acc + i.quantity,
                  0,
                )}
                )
              </h2>
              <ul className="divide-y divide-border text-sm">
                {completedPayment.purchasedItems.map((item) => (
                  <li
                    key={item.product.id}
                    className="flex items-center justify-between py-2.5"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.quantity}
                      </p>
                    </div>
                    <span className="font-medium tabular-nums text-foreground">
                      ${(item.product.price * item.quantity).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-3.5 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
            <p>
              <strong>Demo transaction:</strong> No real funds were charged, and
              no items will be shipped. This sandbox checkout demonstrated
              complete end-to-end payment verification and state durability.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="default" className="gap-1.5">
              <Link href="/">
                Continue shopping
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="default">
              <Link href="/chat">Launch Studio</Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="default"
              onClick={() => setCompletedPayment(null)}
            >
              Start new cart
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Your cart is empty"
        description="Everything you add — from the homepage picks or the assistant's replies — lands here until checkout."
        className="border border-border bg-card"
      >
        <Button asChild>
          <Link href="/">Browse featured picks</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/chat">Ask the assistant</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Your cart
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {cartCount} {cartCount === 1 ? "item" : "items"} · quantities and
            totals update as you shop
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href="/">
            Continue shopping
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ul aria-label="Cart items" className="space-y-3">
          {cartItems.map((item) => (
            <CartItemRow
              key={item.product.id}
              item={item}
              onSetQuantity={setQuantity}
              onRemove={removeFromCart}
            />
          ))}
        </ul>
        <CartSummary
          items={cartItems}
          onClearCart={clearCart}
          onCaptureSuccess={handleCaptureSuccess}
        />
      </div>
    </>
  );
}
