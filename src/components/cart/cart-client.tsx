"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shop/empty-state";
import { ProductImage } from "@/components/shop/product-image";
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

function CheckoutPipeline({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { num: 1, label: "Review Cart" },
    { num: 2, label: "PayPal Sandbox Auth" },
    { num: 3, label: "Confirmed Receipt" },
  ] as const;

  return (
    <ol
      aria-label="Checkout progress"
      className="flex flex-wrap items-center gap-2 text-xs font-medium"
    >
      {steps.map((s, idx) => {
        const done = step > s.num || (step === 3 && s.num === 3);
        const current = step === s.num && step !== 3;
        return (
          <li key={s.num} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                done
                  ? "border-emerald-500/25 bg-emerald-500/10 text-[#047857] font-semibold"
                  : current
                    ? "border-primary/30 bg-secondary text-primary font-semibold"
                    : "border-border bg-card text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-4 place-items-center rounded-full font-mono text-[10px] font-bold",
                  done
                    ? "bg-emerald-600 text-white"
                    : current
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {done ? "✓" : s.num}
              </span>
              <span>{s.label}</span>
            </span>
            {idx < steps.length - 1 ? (
              <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function CartClient() {
  const { cartItems, cartCount, setQuantity, removeFromCart, clearCart } =
    useShop();
  const [completedPayment, setCompletedPayment] =
    useState<CompletedPayment | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

  function copyId(label: string, val: string) {
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedKey(label);
    window.setTimeout(() => setCopiedKey(null), 1500);
  }

  if (completedPayment) {
    const totalPurchasedQty = completedPayment.purchasedItems.reduce(
      (acc, i) => acc + i.quantity,
      0,
    );

    return (
      <div className="mx-auto w-full max-w-[1320px] space-y-6 px-4 py-8 md:px-6 md:py-10 lg:px-8">
        <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in duration-300">
          <div className="flex justify-center">
            <CheckoutPipeline step={3} />
          </div>

          {/* Stitch Payment Result & Confirmation Card */}
          <div className="stitch-tier-2 rounded-2xl border border-emerald-500/30 bg-card p-6 sm:p-9">
            <div className="flex flex-col items-center text-center">
              <div className="flex size-16 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-[#047857]">
                <CheckCircle2 className="size-8" />
              </div>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-[#047857]">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                PAYPAL SANDBOX VERIFIED
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Sandbox Payment Confirmed
              </h1>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                PayPal verified a COMPLETED capture for this demo checkout. Your
                order and capture references are recorded below.
              </p>
            </div>

            {/* Transaction Ledger Box */}
            <div className="mt-8 space-y-3.5 rounded-2xl border border-border bg-background p-5">
              <div className="flex items-center justify-between border-b border-border pb-3 text-sm">
                <span className="text-muted-foreground">Payment Status</span>
                <span className="flex items-center gap-1.5 font-semibold text-[#047857]">
                  <CheckCircle2 className="size-4" />
                  COMPLETED
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 border-b border-border pb-3 text-sm">
                <span className="text-muted-foreground">Order Reference</span>
                <div className="flex items-center gap-1.5">
                  <code className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                    {completedPayment.orderId}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyId("order", completedPayment.orderId)}
                    aria-label="Copy Order Reference"
                    className="grid size-7 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
                  >
                    {copiedKey === "order" ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-b border-border pb-3 text-sm">
                <span className="text-muted-foreground">PayPal Capture ID</span>
                <div className="flex items-center gap-1.5">
                  <code className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                    {completedPayment.captureId}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyId("capture", completedPayment.captureId)}
                    aria-label="Copy PayPal Capture ID"
                    className="grid size-7 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
                  >
                    {copiedKey === "capture" ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3 text-sm">
                <span className="text-muted-foreground">Captured Time</span>
                <span className="font-mono text-xs text-foreground">
                  {completedPayment.capturedAt}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="font-semibold text-foreground">Verified Total</span>
                <span className="font-mono text-2xl font-bold tabular-nums text-primary">
                  ${completedPayment.amount.value} {completedPayment.amount.currency}
                </span>
              </div>
            </div>

            {completedPayment.purchasedItems.length > 0 ? (
              <div className="mt-6 rounded-2xl border border-border bg-background p-5">
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  Purchased Demo Items ({totalPurchasedQty})
                </h2>
                <ul className="divide-y divide-border text-sm">
                  {completedPayment.purchasedItems.map((item) => (
                    <li
                      key={item.product.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <ProductImage
                          product={item.product}
                          variant="mini"
                          className="size-11 shrink-0 rounded-lg"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">
                            {item.product.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Qty: {item.quantity}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono font-semibold tabular-nums text-foreground">
                        ${(item.product.price * item.quantity).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-[#78350F]">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#B45309]" />
              <p>
                <strong>Demo transaction:</strong> No real funds were charged,
                and no items will be shipped. This sandbox checkout verified
                server-side pricing and PayPal order capture end to end.
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
                <Link href="/chat">Launch AI Workspace</Link>
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
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1320px] px-4 py-8 md:px-6 md:py-12 lg:px-8">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Everything you add — from the discovery catalog, comparison matrix, or AI workspace — lands here ready for PayPal Sandbox checkout."
        >
          <Button asChild>
            <Link href="/">Browse discovery catalog</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/chat">Ask the assistant</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-8 px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <div className="space-y-4 border-b border-border pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Link href="/" className="hover:text-foreground">
              Discovery
            </Link>
            <ChevronRight className="size-3.5" aria-hidden="true" />
            <span className="font-medium text-foreground">Shopping Cart</span>
          </nav>
          <CheckoutPipeline step={1} />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Shopping Cart &amp; Checkout
              </h1>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-xs font-semibold text-primary">
                {cartCount} {cartCount === 1 ? "item" : "items"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Adjust quantities before completing a server-verified PayPal Sandbox approval.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href="/">
              Continue shopping
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <ul aria-label="Cart items" className="space-y-3.5">
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
    </div>
  );
}
