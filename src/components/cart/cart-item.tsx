"use client";

import { Bookmark, Check, Minus, Plus, X } from "lucide-react";
import type { CartItem } from "@/types";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shop/product-image";
import { ProductProvenanceBadge } from "@/components/shop/product-provenance-badge";
import { formatMoney } from "@/lib/format";
import { useCompare } from "@/lib/store";
import { cn } from "cn";

const MAX_QUANTITY = 99;

/**
 * Stitch Tier-1 cart item row with `#FAFAFC` media well, category tag,
 * top specification pills, recessed `#f5f2ff` quantity stepper, Save to Compare,
 * and right-aligned tabular line subtotal.
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
  const { isComparing, canToggleCompare, toggleCompare } = useCompare();
  const comparing = isComparing(product.id);
  const canCompare = canToggleCompare(product.id);

  const lineTotal = product.price * quantity;
  const specEntries = Object.entries(product.specs ?? {}).slice(0, 2);

  return (
    <li className="stitch-tier-1 rounded-2xl border border-border-subtle bg-surface-card p-4 transition-all hover:border-primary/25 hover:shadow-md sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <div className="relative shrink-0 self-start">
          <ProductImage
            product={product}
            variant="thumb"
            className="size-24 rounded-xl border border-border-subtle bg-canvas-bg p-1 sm:size-28"
          />
          <span className="absolute bottom-1.5 right-1.5 rounded bg-surface-card/95 px-1.5 py-0.5 font-heading text-[9px] font-semibold uppercase tracking-wide text-text-muted shadow-xs">
            {product.category}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <ProductProvenanceBadge product={product} showMerchant={false} />
                <span className="font-heading text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {product.brand}
                </span>
                {product.source === "channel3" &&
                product.availability === "in_stock" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary-container/50 px-2 py-0.5 font-heading text-[10px] font-semibold text-on-secondary-container">
                    <span className="size-1.5 rounded-full bg-secondary" />
                    In Stock
                  </span>
                ) : null}
              </div>

              <h2 className="font-heading text-[16px] font-semibold leading-snug tracking-tight text-on-surface sm:text-[18px]">
                {product.name}
              </h2>

              {specEntries.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {specEntries.map(([label, value]) => (
                    <span
                      key={label}
                      className="rounded-md bg-surface-container-low px-2 py-0.5 font-sans text-[11px] text-on-surface-variant"
                    >
                      <span className="text-text-muted">{label}:</span> {value}
                    </span>
                  ))}
                </div>
              ) : product.description ? (
                <p className="line-clamp-1 text-xs text-text-muted">
                  {product.description}
                </p>
              ) : null}
            </div>

            <div className="shrink-0 text-right">
              <div className="font-heading text-[17px] font-semibold tracking-tight tabular-nums text-on-surface sm:text-[19px]">
                {formatMoney(lineTotal, product.currency)}
              </div>
              <span className="font-mono text-[11px] tabular-nums text-text-muted">
                Unit: {formatMoney(product.price, product.currency)}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
            <div
              className="inline-flex h-9 items-center rounded-xl bg-surface-container-low p-0.5 shadow-inner"
              role="group"
              aria-label={`Quantity for ${product.name}`}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-8 rounded-lg text-on-surface hover:bg-surface-card"
                disabled={quantity <= 1}
                onClick={() => onSetQuantity(product.id, quantity - 1)}
                aria-label={`Decrease quantity of ${product.name}`}
              >
                <Minus className="size-3.5" aria-hidden="true" />
              </Button>
              <span
                aria-live="polite"
                className="w-9 text-center font-mono text-sm font-semibold tabular-nums text-on-surface"
              >
                {quantity}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-8 rounded-lg text-on-surface hover:bg-surface-card"
                disabled={quantity >= MAX_QUANTITY}
                onClick={() => onSetQuantity(product.id, quantity + 1)}
                aria-label={`Increase quantity of ${product.name}`}
              >
                <Plus className="size-3.5" aria-hidden="true" />
              </Button>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                disabled={!comparing && !canCompare}
                onClick={() => toggleCompare(product.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium transition-colors disabled:opacity-45",
                  comparing
                    ? "bg-primary-fixed/60 text-primary"
                    : "text-text-muted hover:text-primary",
                )}
              >
                {comparing ? (
                  <>
                    <Check className="size-3.5" aria-hidden="true" />
                    <span>In Compare</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="size-3.5" aria-hidden="true" />
                    <span>Save to Compare</span>
                  </>
                )}
              </button>

              <span className="text-border-strong" aria-hidden="true">
                |
              </span>

              <button
                type="button"
                aria-label={`Remove ${product.name} from cart`}
                onClick={() => onRemove(product.id)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-text-muted transition-colors hover:bg-error-container/40 hover:text-error"
              >
                <X className="size-3.5" aria-hidden="true" />
                <span>Remove</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
