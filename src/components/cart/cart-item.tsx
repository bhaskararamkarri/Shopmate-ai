"use client";

import { Minus, Plus, Trash } from "lucide-react";
import type { CartItem } from "@/types";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shop/product-image";
import { formatMoney } from "@/lib/format";

const MAX_QUANTITY = 99;

/**
 * One cart line: drawn product tile, editable quantity stepper, remove
 * control and the line total (display value).
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
    <li className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
      <ProductImage product={product} variant="thumb" className="size-20 shrink-0 rounded-lg" />

      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
          {product.name}
        </h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {product.brand} · {product.category}
        </p>
        <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">
          {formatMoney(product.price, product.currency)} each
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div
          className="inline-flex h-9 items-center rounded-lg border border-border bg-background"
          role="group"
          aria-label={`Quantity for ${product.name}`}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-md"
            disabled={quantity <= 1}
            onClick={() => onSetQuantity(product.id, quantity - 1)}
            aria-label={`Decrease quantity of ${product.name}`}
          >
            <Minus aria-hidden="true" />
          </Button>
          <span
            aria-live="polite"
            className="w-9 text-center text-sm font-medium tabular-nums text-foreground"
          >
            {quantity}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-md"
            disabled={quantity >= MAX_QUANTITY}
            onClick={() => onSetQuantity(product.id, quantity + 1)}
            aria-label={`Increase quantity of ${product.name}`}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>

        <p className="w-20 shrink-0 text-right text-[15px] font-semibold tabular-nums text-foreground">
          {formatMoney(lineTotal, product.currency)}
        </p>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Remove ${product.name} from cart`}
          onClick={() => onRemove(product.id)}
        >
          <Trash aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
