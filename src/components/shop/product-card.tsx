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
  "border-primary/40 bg-accent text-accent-foreground hover:bg-primary/15 hover:text-primary font-semibold";

/** Live offer buy link kept to validated http(s) URLs only. */
function buyLinked(product: Product): { href: string; domain: string } | null {
  const url = product.buyUrl;
  if (!url || product.source !== "channel3" || !isSafeHttpUrl(url)) return null;
  return { href: url, domain: product.merchant ?? product.brand };
}

/**
 * Stitch Tier-1 detailed product card.
 *
 * Strictly preserves button ordering ("Add to cart" first inside <article>,
 * "Compare" second) and real provenance + spec preview rows (zero fabricated
 * stock, ratings, or discounts).
 */
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
  const specPreview = Object.entries(product.specs ?? {}).slice(0, 3);

  function handleAdd() {
    addToCart(product.id);
    setJustAdded(true);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setJustAdded(false), 1600);
  }

  return (
    <article
      className={cn(
        "stitch-tier-1 group flex h-full flex-col overflow-hidden rounded-2xl border bg-card p-3.5 transition-all duration-300 hover:shadow-[0_10px_25px_-5px_rgba(23,23,33,0.06),0_8px_10px_-6px_rgba(23,23,33,0.04)]",
        comparing
          ? "border-primary/50 ring-2 ring-primary/20"
          : "border-border hover:border-primary/35",
      )}
    >
      {/* Top Provenance & Category Strip */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <ProductProvenanceBadge
          product={product}
          showMerchant={false}
          className="shrink-0"
        />
        <span className="truncate rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {product.category || product.brand}
        </span>
      </div>

      {/* Framed Product Image Well */}
      <div className="relative overflow-hidden rounded-xl">
        <ProductImage
          product={product}
          variant="banner"
          imageClassName="transition-transform duration-500 motion-safe:group-hover:scale-[1.05]"
        />
        {comparing ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-card/95 px-2.5 py-0.5 text-[11px] font-semibold text-primary shadow-xs backdrop-blur-sm"
          >
            <Check className="size-3" />
            Comparing
          </span>
        ) : null}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 pt-3.5">
        <div>
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {product.brand}
          </p>
          <h3 className="mt-0.5 line-clamp-1 text-[16px] font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
            {product.name}
          </h3>
        </div>

        <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {product.description}
        </p>

        {/* Price + Verified Buy Link */}
        <div className="flex flex-wrap items-baseline justify-between gap-2 pt-1">
          <p className="text-[18px] font-bold tracking-tight tabular-nums text-foreground">
            {formatMoney(product.price, product.currency)}
            {onSale ? (
              <span className="ml-1.5 text-[13px] font-normal text-muted-foreground line-through">
                {formatMoney(product.compareAtPrice!, product.currency)}
              </span>
            ) : null}
          </p>
          {buyLink ? (
            <a
              href={buyLink.href}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              See at {buyLink.domain}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>

        {/* Real Spec Preview Strip */}
        {specPreview.length > 0 ? (
          <dl className="mt-auto space-y-1.5 rounded-xl border border-border bg-secondary/70 p-2.5 text-xs">
            {specPreview.map(([specKey, specValue]) => (
              <div
                key={specKey}
                className="flex items-center justify-between gap-2"
              >
                <dt className="truncate text-muted-foreground">{specKey}</dt>
                <dd className="shrink-0 font-mono text-[11px] font-semibold text-foreground">
                  {specValue}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="mt-auto" />
        )}
      </div>

      {/* Action Footer (Add to Cart MUST remain first button in article) */}
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <Button
          type="button"
          size="sm"
          variant={inCart ? "secondary" : "default"}
          className="h-9 flex-1 text-xs font-semibold"
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
          className={cn("h-9 text-xs", comparing && COMPARE_ACTIVE_CLASSES)}
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
    <article className="stitch-tier-1 flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/35">
      <ProductImage
        product={product}
        variant="thumb"
        className="size-20 shrink-0 self-start rounded-lg"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-sm font-semibold leading-snug tracking-tight text-foreground">
            {product.name}
          </h4>
          <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">
            {onSale ? (
              <span className="mr-1 text-[11px] font-normal text-muted-foreground line-through">
                {formatMoney(product.compareAtPrice!, product.currency)}
              </span>
            ) : null}
            {formatMoney(product.price, product.currency)}
          </p>
        </div>
        <p className="min-w-0 truncate text-[12px] text-muted-foreground">
          {product.brand} · {product.category || "product"}
        </p>
        <div className="mt-1.5 flex min-w-0 items-center gap-2">
          <ProductProvenanceBadge product={product} className="shrink-0" />
          {buyLink ? (
            <a
              href={buyLink.href}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              className="inline-flex min-w-0 items-center gap-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
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
            className="h-8 px-2.5 text-xs"
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

/** Compact comparison toggle for tight layouts. */
export function ProductCompareToggle({ product }: { product: Product }) {
  const { toggleCompare, isComparing, canToggleCompare } = useShop();
  const comparing = isComparing(product.id);
  const compareAllowed = canToggleCompare(product.id);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn("h-8 px-2.5 text-xs", comparing && COMPARE_ACTIVE_CLASSES)}
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
      <span aria-hidden="true">{comparing ? "Comparing" : "Compare"}</span>
    </Button>
  );
}
