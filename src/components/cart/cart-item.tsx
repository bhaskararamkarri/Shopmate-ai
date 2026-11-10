"use client";

import { Minus, Plus, Trash } from "lucide-react";
import type { CartItem } from "@/types";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shop/product-image";
import { ProductProvenanceBadge } from "@/components/shop/product-provenance-badge";
import { formatMoney } from "@/lib/format";

const MAX_QUANTITY = 99;

/**
 * Stitch Tier-1 cart item row with inset image frame, provenance tag,
 * quantity pill stepper, and line subtotal.
 */
export function CartItemRow({
  item,
  onSetQuantity,
  onRemove,
}: {
  item: CartItem;
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}) {
  const { product, quantity } = item;
  const lineTotal = product.price * quantity;

  return (
    <li className="stitch-tier-1 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30 sm:flex-row sm:items-center sm:p-5">
      <ProductImage
        product={product}
        variant="thumb"
        className="size-20 shrink-0 rounded-xl"
      />

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <ProductProvenanceBadge product={product} showMerchant={false} />
          <span className="text-xs text-muted-foreground">
            {product.brand} · {product.category}
          </span>
        </div>
        <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
          {product.name}
        </h3>
        <p className="font-mono text-[12px] tabular-nums text-muted-foreground">
          {formatMoney(product.price, product.currency)} each
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border pt-3 sm:justify-end sm:border-t-0 sm:pt-0">
        <div
          className="inline-flex h-9 items-center rounded-xl border border-border bg-secondary/70 p-0.5"
          role="group"
          aria-label={`Quantity for ${product.name}`}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 rounded-lg hover:bg-card"
            disabled={quantity <= 1}
            onClick={() => onSetQuantity(product.id, quantity - 1)}
            aria-label={`Decrease quantity of ${product.name}`}
          >
            <Minus className="size-3.5" aria-hidden="true" />
          </Button>
          <span
            aria-live="polite"
            className="w-9 text-center font-mono text-sm font-semibold tabular-nums text-foreground"
          >
            {quantity}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 rounded-lg hover:bg-card"
            disabled={quantity >= MAX_QUANTITY}
            onClick={() => onSetQuantity(product.id, quantity + 1)}
            aria-label={`Increase quantity of ${product.name}`}
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </Button>
        </div>

        <p className="w-24 shrink-0 text-right font-mono text-[16px] font-bold tabular-nums text-foreground">
          {formatMoney(lineTotal, product.currency)}
        </p>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Remove ${product.name} from cart`}
          onClick={() => onRemove(product.id)}
        >
          <Trash aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
