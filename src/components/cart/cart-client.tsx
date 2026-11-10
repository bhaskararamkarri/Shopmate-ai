"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Compass,
  Copy,
  FlaskConical,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shop/empty-state";
import { ProductImage } from "@/components/shop/product-image";
import { CartItemRow } from "@/components/cart/cart-item";
import { CartSummary } from "@/components/cart/cart-summary";
import type {
  CheckoutPhase,
  PayPalCaptureSuccessEvent,
} from "@/components/cart/paypal-checkout";
import { useShop } from "@/lib/store";
import { DEMO_PRODUCTS } from "@/lib/demo-catalog";
import { formatMoney } from "@/lib/format";

function CheckoutPipeline({
  step,
  sessionLabel,
}: {
  step: 1 | 2 | 3;
  sessionLabel?: string;
}) {
  const steps = [
    { num: 1, label: "1. Review Cart", icon: ShoppingBag },
    { num: 2, label: "2. PayPal Sandbox Auth", icon: Wallet },
    { num: 3, label: "3. Instant Confirmation", icon: CheckCircle2 },
  ] as const;

  return (
    <div className="hidden flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-4 lg:flex">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-heading text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Checkout Pipeline
        </span>
        <span className="text-text-muted">/</span>
        <span className="font-mono text-xs font-medium text-primary">
          {sessionLabel ? `Order ${sessionLabel}` : "Live Sandbox Session"}
        </span>
        <span className="size-1.5 rounded-full bg-secondary animate-pulse" />
      </div>

      <ol
        aria-label="Checkout progress"
        className="flex flex-wrap items-center gap-3 text-xs font-medium"
      >
        {steps.map((s, idx) => {
          const Icon = s.icon;
          const active = step === s.num;
          const done = step > s.num || (step === 3 && s.num === 3);
          return (
            <li key={s.num} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
                  done
                    ? "bg-secondary-container/45 font-semibold text-on-secondary-fixed"
                    : active
                      ? "bg-primary-fixed/65 font-semibold text-primary"
                      : "text-text-muted opacity-70",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                <span>{s.label}</span>
              </div>
              {idx < steps.length - 1 ? (
                <div
                  aria-hidden="true"
                  className={cn(
                    "h-0.5 w-6 rounded",
                    done ? "bg-secondary/50" : "bg-primary/20",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function CartClient() {
  const {
    cartItems,
    cartCount,
    addToCart,
    setQuantity,
    removeFromCart,
    clearCart,
    activeReceipt,
    setActiveReceipt,
    clearActiveReceipt,
  } = useShop();

  const [checkoutPhase, setCheckoutPhase] = useState<CheckoutPhase>("loading");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const pipelineStep: 1 | 2 | 3 = activeReceipt
    ? 3
    : checkoutPhase === "creating" ||
        checkoutPhase === "approval" ||
        checkoutPhase === "capturing"
      ? 2
      : 1;

  function handleCaptureSuccess(result: PayPalCaptureSuccessEvent) {
    setActiveReceipt({
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

  function handleRestoreDemoCart() {
    clearActiveReceipt();
    addToCart("demo-aurora-headphones");
    addToCart("demo-bloom-earbuds");
  }

  function copyId(label: string, val: string) {
    if (typeof navigator !== "undefined") {
      navigator.clipboard?.writeText(val).catch(() => {});
    }
    setCopiedKey(label);
    window.setTimeout(() => setCopiedKey(null), 1500);
  }

  /* ── Screen 05: Payment Result & Confirmation ─────────────────────────────── */
  if (activeReceipt) {
    const totalPurchasedQty = activeReceipt.purchasedItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    const itemsSubtotal = activeReceipt.purchasedItems.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    );
    const setupGuidePrompt =
      activeReceipt.purchasedItems.length > 0
        ? `Give me a quick setup and care guide for ${activeReceipt.purchasedItems
            .map((item) => item.product.name)
            .join(" and ")}`
        : "Help me research and compare my next setup in ShopMate";

    return (
      <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 md:px-6 lg:px-8">
        <CheckoutPipeline step={3} sessionLabel={activeReceipt.orderId} />

        <div className="mx-auto max-w-xl space-y-4 sm:space-y-5">
          {/* Sandbox Simulation Mode Pill Banner */}
          <div className="stitch-tier-1 flex items-center gap-2.5 rounded-xl border border-tertiary-fixed-dim/50 bg-tertiary-fixed/40 px-3.5 py-2.5">
            <div className="grid size-6 shrink-0 place-items-center rounded-full bg-tertiary text-on-tertiary">
              <FlaskConical className="size-3.5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-[11px] font-semibold uppercase tracking-wider text-on-tertiary-fixed">
                SANDBOX SIMULATION MODE
              </p>
              <p className="truncate text-xs text-on-tertiary-fixed-variant">
                PayPal Testnet active · No real monetary funds deducted
              </p>
            </div>
          </div>

          {/* Primary Confirmation Card */}
          <div className="stitch-tier-2 flex flex-col items-center rounded-2xl border border-border-subtle bg-surface-card p-6 text-center sm:p-8">
            <div className="relative mb-4 flex size-16 items-center justify-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-secondary-container/40 opacity-25" />
              <div className="flex size-16 items-center justify-center rounded-full bg-secondary-fixed/50 text-secondary shadow-inner">
                <CheckCircle2 className="size-8" aria-hidden="true" />
              </div>
            </div>

            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-secondary-container/60 px-2.5 py-0.5">
              <span className="size-1.5 rounded-full bg-secondary" />
              <span className="font-heading text-[11px] font-semibold uppercase tracking-wide text-on-secondary-container">
                CAPTURED &amp; SETTLED
              </span>
            </div>

            <h1 className="font-heading text-2xl font-bold tracking-tight text-on-surface sm:text-[28px]">
              Payment Confirmed &amp; Captured
            </h1>
            <p className="mt-1.5 max-w-sm text-sm text-text-muted">
              Your sandbox purchase was completed and verified via server-side
              PayPal Sandbox capture.
            </p>

            {/* Total Authorized & Billed Well */}
            <div className="mt-5 mb-5 flex w-full flex-col items-center rounded-xl bg-surface-container-low px-4 py-3.5">
              <span className="font-heading text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Total Authorized &amp; Billed
              </span>
              <div className="mt-0.5 flex items-baseline gap-1.5 font-heading text-3xl font-bold tracking-tight tabular-nums text-on-surface sm:text-4xl">
                <span>${activeReceipt.amount.value}</span>
                <span className="font-mono text-xs font-medium text-text-muted">
                  {activeReceipt.amount.currency}
                </span>
              </div>
            </div>

            {/* Order Metadata Rows */}
            <div className="flex w-full flex-col gap-2 text-left text-xs sm:text-[13px]">
              <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low/70 px-3 py-2">
                <span className="text-text-muted">Order Reference</span>
                <div className="flex items-center gap-1.5">
                  <code className="font-mono font-semibold text-on-surface">
                    {activeReceipt.orderId}
                  </code>
                  <button
                    type="button"
                    aria-label="Copy Order Reference"
                    onClick={() => copyId("order", activeReceipt.orderId)}
                    className="rounded p-1 text-text-muted transition-colors hover:bg-surface-card hover:text-primary"
                  >
                    {copiedKey === "order" ? (
                      <Check className="size-3.5 text-secondary" aria-hidden="true" />
                    ) : (
                      <Copy className="size-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low/70 px-3 py-2">
                <span className="text-text-muted">PayPal Capture ID</span>
                <div className="flex items-center gap-1.5">
                  <code className="max-w-[190px] truncate font-mono font-semibold text-on-surface">
                    {activeReceipt.captureId}
                  </code>
                  <button
                    type="button"
                    aria-label="Copy PayPal Capture ID"
                    onClick={() => copyId("capture", activeReceipt.captureId)}
                    className="rounded p-1 text-text-muted transition-colors hover:bg-surface-card hover:text-primary"
                  >
                    {copiedKey === "capture" ? (
                      <Check className="size-3.5 text-secondary" aria-hidden="true" />
                    ) : (
                      <Copy className="size-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low/70 px-3 py-2">
                <span className="text-text-muted">Merchant</span>
                <span className="font-medium text-on-surface">
                  ShopMate AI Sandbox
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low/70 px-3 py-2">
                <span className="text-text-muted">Timestamp</span>
                <span className="font-mono text-on-surface">
                  {activeReceipt.capturedAt}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low/70 px-3 py-2">
                <span className="text-text-muted">Payment Method</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-on-surface">
                  <Wallet className="size-3.5 text-primary" aria-hidden="true" />
                  PayPal Sandbox
                </span>
              </div>
            </div>
          </div>

          {/* Dispatched Items Breakdown Card */}
          {activeReceipt.purchasedItems.length > 0 ? (
            <div className="stitch-tier-1 space-y-3 rounded-2xl border border-border-subtle bg-surface-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-base font-semibold text-on-surface">
                  Items in Sandbox Dispatch
                </h2>
                <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 font-mono text-[11px] font-semibold text-on-surface-variant">
                  {totalPurchasedQty}{" "}
                  {totalPurchasedQty === 1 ? "Product" : "Products"}
                </span>
              </div>

              <ul className="space-y-2.5">
                {activeReceipt.purchasedItems.map((item) => (
                  <li
                    key={item.product.id}
                    className="flex items-center gap-3 rounded-xl bg-surface-container-low/60 p-2.5"
                  >
                    <ProductImage
                      product={item.product}
                      variant="mini"
                      className="size-12 shrink-0 rounded-lg bg-surface-card"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-heading text-sm font-medium text-on-surface">
                        {item.product.name}
                      </p>
                      <p className="font-mono text-xs text-text-muted">
                        Qty: {item.quantity} · {item.product.brand}
                      </p>
                    </div>
                    <div className="shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-on-surface">
                      {formatMoney(item.product.price * item.quantity)}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="space-y-1.5 border-t border-border-subtle pt-3 text-xs">
                <div className="flex justify-between text-text-muted">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(itemsSubtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Fulfillment</span>
                  <span className="font-mono font-medium text-secondary">
                    Demo Transaction ($0.00)
                  </span>
                </div>
                <div className="flex justify-between pt-1 text-sm font-semibold text-on-surface">
                  <span>Total Captured</span>
                  <span className="font-mono text-primary">
                    ${activeReceipt.amount.value} {activeReceipt.amount.currency}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Confirmation Navigation CTAs */}
          <div className="space-y-2.5">
            <Button
              asChild
              size="lg"
              className="h-12 w-full rounded-xl font-heading text-[15px] shadow-md"
            >
              <Link href="/" onClick={() => clearActiveReceipt()}>
                <Compass className="size-4" aria-hidden="true" />
                Back to Discovery
              </Link>
            </Button>

            <Button
              asChild
              variant="secondary"
              size="lg"
              className="h-11 w-full rounded-xl font-heading text-[14px]"
            >
              <Link href="/chat" onClick={() => clearActiveReceipt()}>
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                Start New Shopping Research
              </Link>
            </Button>

            <Link
              href={`/chat?q=${encodeURIComponent(setupGuidePrompt)}`}
              onClick={() => clearActiveReceipt()}
              className="stitch-tier-1 flex items-center justify-between gap-3 rounded-xl border border-primary/15 bg-gradient-to-r from-primary-fixed/40 to-surface-container-low p-3.5 transition-shadow hover:shadow-md"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-on-primary">
                  <Bot className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-heading text-sm font-medium text-on-surface">
                    Ask ShopMate AI for setup guide
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    Instant pairing, care notes &amp; workspace suggestions
                  </p>
                </div>
              </div>
              <ArrowRight
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
            </Link>

            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => clearActiveReceipt()}
                className="text-text-muted hover:text-on-surface"
              >
                Start new cart
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Screen 04: Quiet Empty Cart State ────────────────────────────────────── */
  if (cartItems.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 py-8 md:px-6 md:py-12 lg:px-8">
        <EmptyState
          icon={ShoppingBag}
          title="Your Cart is Quiet"
          description="Everything you add from Discovery, AI Workspace, or the Product Comparison Matrix lands here ready for server-verified PayPal Sandbox checkout."
        >
          <Button asChild>
            <Link href="/">Browse Discovery</Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleRestoreDemoCart}
          >
            Restore Demo Cart
          </Button>
          <Button asChild variant="outline">
            <Link href="/chat">Ask AI Assistant</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  /* ── Screens 04 & 09: Active Shopping Cart & PayPal Checkout ──────────────── */
  const cartProductIds = new Set(cartItems.map((item) => item.product.id));
  const upgrades = DEMO_PRODUCTS.filter(
    (product) => !cartProductIds.has(product.id),
  ).slice(0, 2);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 pb-24 md:px-6 lg:px-8 lg:pb-12">
      <CheckoutPipeline step={pipelineStep} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left Column: Cart Header, Items, AI Order Optimization & Upgrades */}
        <div className="space-y-5 lg:col-span-8">
          <div className="stitch-tier-1 flex items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-2xl font-bold tracking-tight text-on-surface sm:text-[28px]">
                Shopping Cart
              </h1>
              <span className="rounded-full bg-primary-fixed px-2.5 py-0.5 font-mono text-xs font-semibold text-on-primary-fixed">
                {cartCount} {cartCount === 1 ? "item" : "items"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => clearCart()}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-error-container/40 hover:text-error"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              <span>Clear All</span>
            </button>
          </div>

          <ul aria-label="Cart items" className="space-y-4">
            {cartItems.map((item) => (
              <CartItemRow
                key={item.product.id}
                item={item}
                onSetQuantity={setQuantity}
                onRemove={removeFromCart}
              />
            ))}
          </ul>

          {/* Honest AI Order Optimization Card */}
          <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-r from-primary-fixed/45 via-surface-container-low to-surface-card p-5 shadow-xs">
            <div className="flex items-start gap-3.5">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-container text-on-primary shadow-sm">
                <Sparkles className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-base font-semibold text-on-surface">
                    AI Order Optimization
                  </h2>
                  <span className="rounded-full bg-secondary-container/65 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-on-secondary-fixed">
                    $0.00 Fulfillment · Server-Calculated USD Total
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-on-surface-variant sm:text-sm">
                  Quantities submitted at checkout are priced authoritatively by
                  ShopMate&apos;s server catalog before PayPal order creation.
                  No sales tax, freight surcharge, or real card settlement
                  occurs in this Sandbox flow.
                </p>
              </div>
            </div>
          </div>

          {/* Complementary Upgrades picked dynamically from demo catalog */}
          {upgrades.length > 0 ? (
            <section
              aria-label="Frequently Complemented Upgrades"
              className="stitch-tier-1 rounded-2xl border border-border-subtle bg-surface-card p-5"
            >
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-base font-semibold text-on-surface">
                  Frequently Complemented Upgrades
                </h2>
                <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
                  Catalog Suggestions
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {upgrades.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low p-3 transition-colors hover:bg-surface-container"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ProductImage
                        product={product}
                        variant="mini"
                        className="size-12 shrink-0 rounded-lg bg-surface-card"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-heading text-sm font-semibold text-on-surface">
                          {product.name}
                        </p>
                        <p className="font-mono text-xs text-text-muted">
                          {formatMoney(product.price, product.currency)} ·{" "}
                          {product.brand}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label={`Add upgrade ${product.name}`}
                      onClick={() => addToCart(product.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border-subtle bg-surface-card px-2.5 py-1.5 font-heading text-xs font-semibold text-primary shadow-2xs transition-colors hover:bg-primary hover:text-on-primary"
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      <span>Add</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* Right Column: Sticky Order Summary & Live PayPal Checkout */}
        <div className="lg:col-span-4">
          <CartSummary
            items={cartItems}
            onClearCart={clearCart}
            onCaptureSuccess={handleCaptureSuccess}
            onPhaseChange={setCheckoutPhase}
          />
        </div>
      </div>
    </div>
  );
}
