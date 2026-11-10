"use client";

import { useState } from "react";
import { Check, ExternalLink, GitCompareArrows, ShoppingCart } from "lucide-react";
import { cn } from "cn";
import type { Product } from "@/types";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shop/product-image";
import { ProductProvenanceBadge } from "@/components/shop/product-provenance-badge";
import { ProductAnalysisDrawer } from "@/components/shop/product-analysis-drawer";
import { isSafeHttpUrl } from "@/lib/catalog/url";
import { formatMoney } from "@/lib/format";
import { useShop } from "@/lib/store";

const COMPARE_ACTIVE_CLASSES =
  "border-primary/40 bg-primary-fixed/60 text-primary hover:bg-primary-fixed font-semibold";

/** Live offer buy link kept to validated http(s) URLs only. */
function buyLinked(product: Product): { href: string; domain: string } | null {
  const url = product.buyUrl;
  if (!url || product.source !== "channel3" || !isSafeHttpUrl(url)) return null;
  return { href: url, domain: product.merchant ?? product.brand };
}

function specIconFor(key: string): string {
  const lower = key.toLowerCase();
  if (lower.includes("battery") || lower.includes("power") || lower.includes("charge")) {
    return "battery_charging_full";
  }
  if (lower.includes("bluetooth") || lower.includes("wireless") || lower.includes("connect")) {
    return "bluetooth";
  }
  if (lower.includes("weight") || lower.includes("mass") || lower.includes("size")) {
    return "scale";
  }
  if (lower.includes("noise") || lower.includes("anc") || lower.includes("driver") || lower.includes("audio")) {
    return "graphic_eq";
  }
  if (lower.includes("video") || lower.includes("sensor") || lower.includes("camera") || lower.includes("res")) {
    return "photo_camera";
  }
  if (lower.includes("water") || lower.includes("ip")) {
    return "water_drop";
  }
  return "tune";
}

/**
 * Exact Stitch Discovery Card (`03` Mobile, `11`/`12` Desktop).
 *
 * Uses a single responsive DOM tree:
 * - Compare / Compared pill toggle + desktop hover tooltip ("Added to Matrix · N/4 slots used")
 * - Analysis CTA opening slide-over `ProductAnalysisDrawer` with full specs & Add to Cart
 * - Zero fabricated inventory counts, star ratings, or discount badges.
 */
export function ProductCard({ product }: { product: Product }) {
  const { toggleCompare, isComparing, canToggleCompare, compareIds } = useShop();
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const comparing = isComparing(product.id);
  const compareAllowed = canToggleCompare(product.id);
  const specPreview = Object.entries(product.specs ?? {}).slice(0, 3);
  const onSale =
    product.compareAtPrice !== undefined && product.compareAtPrice > product.price;
  const discountPct = onSale
    ? Math.round(
        ((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100,
      )
    : 0;
  const liveInStock =
    product.source === "channel3" && product.availability === "in_stock";

  return (
    <>
      <article
        className={cn(
          "stitch-tier-1 group relative flex h-full flex-col justify-between rounded-2xl border bg-surface-card p-3.5 sm:p-4 transition-all duration-300 sm:hover:-translate-y-1 sm:hover:shadow-lg",
          comparing
            ? "border-primary/40 ring-2 ring-primary/30"
            : "border-border-subtle hover:border-outline-variant/60",
        )}
      >
        <div>
          {/* Top Provenance & Category Strip */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <ProductProvenanceBadge
              product={product}
              showMerchant={false}
              className="shrink-0"
            />
            <span className="truncate rounded-md bg-surface-container-low px-2 py-0.5 font-heading text-[11px] font-medium text-text-muted">
              {product.merchant ?? product.category ?? product.brand}
            </span>
          </div>

          {/* Responsive Body: horizontal thumb+meta on mobile (03), vertical showcase on sm+ (11/12) */}
          <div className="flex gap-3 sm:block">
            {/* Media Well */}
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-canvas-bg p-1.5 sm:mb-4 sm:h-44 sm:w-full sm:p-2">
              <ProductImage
                product={product}
                variant="banner"
                className="h-full w-full"
                imageClassName="transition-transform duration-500 motion-safe:group-hover:scale-105"
              />

              {/* Desktop Top-Right Matrix Badge Pill (11/12) */}
              <button
                type="button"
                aria-label={`Quick toggle comparison for ${product.name}`}
                aria-pressed={comparing}
                disabled={!compareAllowed}
                onClick={() => toggleCompare(product.id)}
                className={cn(
                  "absolute right-2 top-2 hidden items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold backdrop-blur-md shadow-2xs transition-all sm:inline-flex",
                  comparing
                    ? "border-primary/30 bg-primary-fixed text-primary"
                    : "border-border-strong bg-surface-card/90 text-text-muted hover:bg-surface-card hover:text-on-surface",
                  !compareAllowed && "opacity-50 cursor-not-allowed",
                )}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                  {comparing ? "check_box" : "check_box_outline_blank"}
                </span>
                <span aria-hidden="true">{comparing ? "Pinned" : "Pin"}</span>
              </button>

              {/* Desktop Bottom-Left Availability / Catalog Pill */}
              <div className="absolute bottom-2 left-2 hidden items-center gap-1 rounded bg-surface-card/90 px-2 py-0.5 font-mono text-[11px] shadow-2xs backdrop-blur-xs sm:inline-flex">
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    liveInStock ? "bg-secondary" : "bg-primary-container",
                  )}
                />
                <span className={liveInStock ? "font-medium text-secondary" : "font-medium text-on-surface-variant"}>
                  {liveInStock ? "In Stock" : product.category || "Catalog Spec"}
                </span>
              </div>
            </div>

            {/* Product Details */}
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate font-heading text-[11px] font-medium uppercase tracking-wider text-text-muted">
                {product.brand}
              </p>
              <h3 className="mt-0.5 line-clamp-1 font-heading text-[16px] font-semibold leading-snug tracking-tight text-on-surface transition-colors group-hover:text-primary sm:text-[18px]">
                {product.name}
              </h3>
              <p className="mt-0.5 hidden line-clamp-2 text-[13px] leading-relaxed text-text-muted sm:block">
                {product.description}
              </p>

              {/* Price Row */}
              <div className="my-1.5 flex flex-wrap items-baseline gap-2 sm:my-2.5">
                <span className="font-heading text-[18px] font-bold tracking-tight tabular-nums text-on-surface sm:text-[22px]">
                  {formatMoney(product.price, product.currency)}
                </span>
                {onSale ? (
                  <span className="text-[13px] text-text-muted line-through tabular-nums">
                    {formatMoney(product.compareAtPrice!, product.currency)}
                  </span>
                ) : null}
                {discountPct >= 1 ? (
                  <span className="rounded-full bg-secondary-container px-1.5 py-0.5 font-heading text-[11px] font-semibold text-on-secondary-container">
                    -{discountPct}%
                  </span>
                ) : null}
              </div>

              {/* Recessed Specification Box */}
              {specPreview.length > 0 ? (
                <dl className="mt-auto flex flex-col gap-1.5 rounded-xl bg-surface-container-low p-2.5 text-xs sm:p-3">
                  {specPreview.map(([specKey, specValue]) => (
                    <div
                      key={specKey}
                      className="flex items-center justify-between gap-2"
                    >
                      <dt className="flex min-w-0 items-center gap-1 truncate text-text-muted">
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[14px] text-primary/70"
                        >
                          {specIconFor(specKey)}
                        </span>
                        <span className="truncate">{specKey}</span>
                      </dt>
                      <dd className="shrink-0 font-mono text-[11px] font-semibold text-on-surface">
                        {specValue}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="mt-auto" />
              )}
            </div>
          </div>
        </div>

        {/* Exact Stitch Two-Button Footer ([Compare / Compared | Analysis >]) */}
        <div className="relative mt-3 flex items-center gap-2 pt-2">
          <div className="group/cmp relative flex-1">
            <button
              type="button"
              disabled={!compareAllowed}
              aria-pressed={comparing}
              title={
                compareAllowed
                  ? "Toggle side-by-side matrix selection"
                  : "Up to four products can be compared at once"
              }
              onClick={() => toggleCompare(product.id)}
              className={cn(
                "flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 font-heading text-xs font-medium transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
                comparing
                  ? COMPARE_ACTIVE_CLASSES
                  : "border-transparent bg-surface-container text-on-surface hover:border-outline-variant/40 hover:bg-surface-container-high",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "material-symbols-outlined text-[16px]",
                  comparing ? "text-primary" : "text-text-muted",
                )}
              >
                {comparing ? "check_box" : "check_box_outline_blank"}
              </span>
              <span>{comparing ? "Compared" : "Compare"}</span>
            </button>

            {/* Stitch 12 Desktop Hover Tooltip */}
            {comparing ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-full left-0 z-40 mb-2 hidden w-56 rounded-xl border border-white/10 bg-brand-deep-indigo/95 p-2.5 text-left text-xs text-white opacity-0 shadow-2xl backdrop-blur-md transition-opacity duration-200 sm:block sm:group-hover/cmp:opacity-100"
              >
                <div className="mb-0.5 flex items-center gap-1.5 font-semibold text-secondary-fixed">
                  <span className="material-symbols-outlined text-[15px]">
                    layers
                  </span>
                  <span>
                    Added to Matrix · {compareIds.length}/4 slots used
                  </span>
                </div>
                <p className="text-[11px] leading-snug text-white/75">
                  Expand the comparison dock below or launch the full matrix.
                </p>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setAnalysisOpen(true)}
            className="flex min-h-[38px] flex-1 items-center justify-center gap-1 rounded-lg bg-primary-container px-3 font-heading text-xs font-semibold text-on-primary shadow-xs transition-all hover:bg-primary active:scale-95"
          >
            <span>Analysis</span>
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
              chevron_right
            </span>
          </button>
        </div>
      </article>

      <ProductAnalysisDrawer
        product={product}
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
      />
    </>
  );
}

/** Compact horizontal card used inside mobile Shortlist panel. */
export function CompactProductCard({ product }: { product: Product }) {
  const { addToCart, isInCart } = useShop();
  const buyLink = buyLinked(product);
  const onSale =
    product.compareAtPrice !== undefined && product.compareAtPrice > product.price;

  return (
    <article className="stitch-tier-1 flex gap-3 rounded-xl border border-border-subtle bg-surface-card p-3 transition-colors hover:border-primary/35">
      <ProductImage
        product={product}
        variant="thumb"
        className="size-20 shrink-0 self-start rounded-lg bg-canvas-bg"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-sm font-semibold leading-snug tracking-tight text-on-surface">
            {product.name}
          </h4>
          <p className="shrink-0 text-sm font-bold tabular-nums text-on-surface">
            {onSale ? (
              <span className="mr-1 text-[11px] font-normal text-text-muted line-through">
                {formatMoney(product.compareAtPrice!, product.currency)}
              </span>
            ) : null}
            {formatMoney(product.price, product.currency)}
          </p>
        </div>
        <p className="min-w-0 truncate text-[12px] text-text-muted">
          {product.brand} · {product.category || "product"}
        </p>
        <div className="mt-1.5 flex min-w-0 items-center gap-2">
          <ProductProvenanceBadge product={product} className="shrink-0" />
          {buyLink ? (
            <a
              href={buyLink.href}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              className="inline-flex min-w-0 items-center gap-0.5 text-[11px] text-text-muted underline-offset-2 hover:text-primary hover:underline"
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
            onClick={() => addToCart(product.id)}
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
