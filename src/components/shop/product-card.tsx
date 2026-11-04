"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, GitCompareArrows, ShoppingCart } from "lucide-react";
import { cn } from "cn";
import type { Product } from "@/types";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shop/product-image";
import { ProductProvenanceBadge } from "@/components/shop/product-provenance-badge";
import { isSafeHttpUrl } from "@/lib/catalog/url";
import { formatMoney } from "@/lib/format";
import { useShop } from "@/lib/store";

const COMPARE_ACTIVE_CLASSES =
  "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary";

/**
 * Detailed product tile used in grids: describes the record, and exposes the
 * two demo actions that matter in Phase 2 — add to cart and comparison.
 */
/** Live offer buy link kept to validated http(s) URLs only. */
function buyLinked(product: Product): { href: string; domain: string } | null {
  const url = product.buyUrl;
  if (!url || product.source !== "channel3" || !isSafeHttpUrl(url)) return null;
  return { href: url, domain: product.merchant ?? product.brand };
}

export function ProductCard({ product }: { product: Product }) {
  const { addToCart, isInCart, toggleCompare, isComparing, canToggleCompare } =
    useShop();
  const [justAdded, setJustAdded] = useState(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, []);

  const inCart = isInCart(product.id);
  const comparing = isComparing(product.id);
  const compareAllowed = canToggleCompare(product.id);
  const buyLink = buyLinked(product);
  const onSale =
    product.compareAtPrice !== undefined && product.compareAtPrice > product.price;

  function handleAdd() {
    addToCart(product.id);
    setJustAdded(true);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setJustAdded(false), 1600);
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors duration-300 hover:border-ring/40">
      <div className="relative overflow-hidden">
        <ProductImage
          product={product}
          variant="banner"
          imageClassName="transition-transform duration-500 motion-safe:group-hover:scale-[1.07]"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[13px] text-muted-foreground">
            {product.category || product.brand}
          </p>
          <ProductProvenanceBadge product={product} showMerchant={false} className="shrink-0" />
        </div>
        <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
          {product.name}
        </h3>
        <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {product.description}
        </p>
        <div className="mt-auto pt-2">
          {buyLink ? (
            <a
              href={buyLink.href}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              className="inline-flex items-center gap-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              See at {buyLink.domain}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>
        <p className="text-[15px] font-semibold tabular-nums text-foreground">
          {formatMoney(product.price, product.currency)}
          {onSale ? (
            <span className="ml-1.5 text-[13px] font-normal text-muted-foreground line-through">
              {formatMoney(product.compareAtPrice!, product.currency)}
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex items-center gap-2 p-4 pt-1">
        <Button
          type="button"
          size="sm"
          variant={inCart ? "secondary" : "default"}
          className="flex-1"
          onClick={handleAdd}
        >
          {inCart || justAdded ? (
            <Check data-icon="inline-start" aria-hidden />
          ) : (
            <ShoppingCart data-icon="inline-start" aria-hidden />
          )}
          {inCart || justAdded ? "In cart" : "Add to cart"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(comparing && COMPARE_ACTIVE_CLASSES)}
          disabled={!compareAllowed}
          title={
            compareAllowed
              ? "Pin this product for side-by-side comparison"
              : "Up to four products can be compared at once"
          }
          aria-pressed={comparing}
          aria-label={
            comparing
              ? `Remove ${product.name} from comparison`
              : `Add ${product.name} to comparison`
          }
          onClick={() => toggleCompare(product.id)}
        >
          <GitCompareArrows aria-hidden />
          {comparing ? "Comparing" : "Compare"}
        </Button>
      </div>
    </article>
  );
}

/** Compact horizontal card used inside chat replies. */
export function CompactProductCard({ product }: { product: Product }) {
  const { addToCart, isInCart } = useShop();
  const buyLink = buyLinked(product);
  const onSale =
    product.compareAtPrice !== undefined && product.compareAtPrice > product.price;

  function handleAdd() {
    addToCart(product.id);
  }

  return (
    <article className="flex gap-3 rounded-xl border border-border bg-card p-3">
      <ProductImage product={product} variant="thumb" className="size-20 shrink-0 self-start rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-sm font-semibold leading-snug tracking-tight text-foreground">
            {product.name}
          </h4>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {onSale ? (
              <span className="mr-1 text-[11px] font-normal text-muted-foreground line-through">
                {formatMoney(product.compareAtPrice!, product.currency)}
              </span>
            ) : null}
            {formatMoney(product.price, product.currency)}
          </p>
        </div>
        <p className="min-w-0 truncate text-[13px] text-muted-foreground">
          {product.brand} · {product.category || "product"}
        </p>
        <div className="mt-1.5 flex min-w-0 items-center gap-2">
          <ProductProvenanceBadge product={product} className="shrink-0" />
          {buyLink ? (
            <a
              href={buyLink.href}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              className="inline-flex min-w-0 items-center gap-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <span className="truncate">{buyLink.domain}</span>
              <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
            </a>
          ) : null}
        </div>
        <div className="mt-auto flex items-center gap-1.5 pt-2.5">
          <Button
            type="button"
            size="sm"
            variant={isInCart(product.id) ? "secondary" : "default"}
            className="h-7 px-2.5 text-[13px]"
            onClick={handleAdd}
          >
            {isInCart(product.id) ? (
              <Check data-icon="inline-start" aria-hidden />
            ) : (
              <ShoppingCart data-icon="inline-start" aria-hidden />
            )}
            {isInCart(product.id) ? "In cart" : "Add"}
          </Button>
          <ProductCompareToggle product={product} />
        </div>
      </div>
    </article>
  );
}

/** Icon-only comparison toggle for tight layouts. */
export function ProductCompareToggle({ product }: { product: Product }) {
  const { toggleCompare, isComparing, canToggleCompare } = useShop();
  const comparing = isComparing(product.id);
  const compareAllowed = canToggleCompare(product.id);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn("px-2", comparing && COMPARE_ACTIVE_CLASSES)}
      disabled={!compareAllowed}
      title={
        compareAllowed
          ? "Pin this product for side-by-side comparison"
          : "Up to four products can be compared at once"
      }
      aria-pressed={comparing}
      aria-label={comparing ? `Remove ${product.name} from comparison` : `Add ${product.name} to comparison`}
      onClick={() => toggleCompare(product.id)}
    >
      <GitCompareArrows aria-hidden />
      <span aria-hidden="true">{comparing ? "Comparing" : "Compare"}</span>
    </Button>
  );
}
