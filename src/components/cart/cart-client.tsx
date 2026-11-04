"use client";

import Link from "next/link";
import { ArrowUpRight, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shop/empty-state";
import { CartItemRow } from "@/components/cart/cart-item";
import { CartSummary } from "@/components/cart/cart-summary";
import { useShop } from "@/lib/store";

export function CartClient() {
  const { cartItems, cartCount, setQuantity, removeFromCart, clearCart } =
    useShop();

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
        <CartSummary items={cartItems} onClearCart={clearCart} />
      </div>
    </>
  );
}
