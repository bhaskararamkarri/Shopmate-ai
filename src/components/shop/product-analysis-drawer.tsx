"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { Product } from "@/types";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shop/product-image";
import { ProductProvenanceBadge } from "@/components/shop/product-provenance-badge";
import { isSafeHttpUrl } from "@/lib/catalog/url";
import { formatMoney } from "@/lib/format";
import { useShop } from "@/lib/store";

export interface ProductAnalysisDrawerProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}

export function ProductAnalysisDrawer({
  product,
  open,
  onClose,
}: ProductAnalysisDrawerProps) {
  const { addToCart, isInCart, toggleCompare, isComparing, canToggleCompare } =
    useShop();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !product) {
    return null;
  }

  const inCart = isInCart(product.id);
  const comparing = isComparing(product.id);
  const compareAllowed = canToggleCompare(product.id);
  const specEntries = Object.entries(product.specs ?? {});
  const onSale =
    product.compareAtPrice !== undefined && product.compareAtPrice > product.price;
  const discountPct = onSale
    ? Math.round(
        ((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100,
      )
    : 0;
  const safeOfferUrl =
    product.source === "channel3" &&
    product.buyUrl &&
    isSafeHttpUrl(product.buyUrl)
      ? product.buyUrl
      : null;
  const liveInStock =
    product.source === "channel3" && product.availability === "in_stock";

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-brand-deep-indigo/45 backdrop-blur-xs"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-drawer-title"
        className="stitch-tier-3 flex h-full w-full max-w-lg flex-col bg-surface-card text-on-surface shadow-2xl"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-fixed text-primary">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                analytics
              </span>
            </span>
            <div>
              <p className="font-heading text-[11px] font-semibold uppercase tracking-wider text-primary">
                Catalog Specification Analysis
              </p>
              <p className="text-xs text-text-muted">
                Verified record inspection
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close product analysis"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
              close
            </span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Media Stage */}
          <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-canvas-bg p-4">
            <ProductImage
              product={product}
              variant="banner"
              className="mx-auto max-h-56"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <ProductProvenanceBadge product={product} showMerchant={false} />
              <div className="flex items-center gap-1.5">
                {liveInStock ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary-container/60 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-on-secondary-container">
                    <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                    In Stock
                  </span>
                ) : null}
                <span className="rounded-full bg-surface-container-low px-2.5 py-0.5 text-[11px] font-medium text-text-muted">
                  {product.category || product.brand}
                </span>
              </div>
            </div>
          </div>

          {/* Identity & Price */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-heading text-xs font-semibold uppercase tracking-wider text-text-muted">
                {product.brand}
              </span>
              {product.merchant ? (
                <span className="rounded-md bg-surface-container-low px-2 py-0.5 font-mono text-[11px] text-on-surface-variant">
                  {product.merchant}
                </span>
              ) : null}
            </div>

            <h2
              id="analysis-drawer-title"
              className="mt-1 font-heading text-2xl font-bold tracking-tight text-on-surface"
            >
              {product.name}
            </h2>

            <div className="mt-2.5 flex flex-wrap items-baseline gap-2.5">
              <span className="font-heading text-2xl font-bold tabular-nums text-on-surface">
                {formatMoney(product.price, product.currency)}
              </span>
              {onSale ? (
                <span className="text-sm text-text-muted line-through tabular-nums">
                  {formatMoney(product.compareAtPrice!, product.currency)}
                </span>
              ) : null}
              {discountPct >= 1 ? (
                <span className="rounded-full bg-secondary-container px-2 py-0.5 font-heading text-xs font-semibold text-on-secondary-container">
                  -{discountPct}%
                </span>
              ) : null}
            </div>

            <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
              {product.description}
            </p>

            {safeOfferUrl ? (
              <div className="mt-3">
                <a
                  href={safeOfferUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow sponsored"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                >
                  <span>See at {product.merchant ?? product.brand}</span>
                  <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                    open_in_new
                  </span>
                </a>
              </div>
            ) : null}
          </div>

          {/* Full Specifications Table */}
          <div className="rounded-2xl border border-border-subtle bg-surface-container-low p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Documented Specifications ({specEntries.length})
              </h3>
              <span className="font-mono text-[11px] text-text-muted">
                {product.source === "channel3" ? "Channel3 Feed" : "Demo Catalog"}
              </span>
            </div>

            {specEntries.length > 0 ? (
              <dl className="divide-y divide-border-subtle/80 text-xs">
                {specEntries.map(([specKey, specVal]) => (
                  <div
                    key={specKey}
                    className="flex items-center justify-between gap-4 py-2"
                  >
                    <dt className="text-text-muted">{specKey}</dt>
                    <dd className="text-right font-mono font-semibold text-on-surface">
                      {specVal}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs italic text-text-muted">
                No structured specification pairs were returned with this record.
              </p>
            )}
          </div>

          {/* Highlighted Attributes (if documented) */}
          {product.attributes && product.attributes.length > 0 ? (
            <div className="space-y-2">
              <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Comparable Signals
              </h3>
              <div className="flex flex-wrap gap-2">
                {product.attributes.map((attr) => (
                  <div
                    key={attr.label}
                    className="rounded-xl border border-border-subtle bg-surface-card px-3 py-1.5 text-xs"
                  >
                    <span className="text-text-muted">{attr.label}: </span>
                    <span className="font-mono font-semibold text-on-surface">
                      {attr.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Sticky Action Footer */}
        <div className="space-y-2.5 border-t border-border-subtle bg-surface-card px-5 py-4 pb-safe">
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              onClick={() => addToCart(product.id)}
              variant={inCart ? "secondary" : "default"}
              className="min-h-[44px] flex-1 gap-1.5 rounded-xl font-heading text-sm font-semibold"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                {inCart ? "check_circle" : "add_shopping_cart"}
              </span>
              <span>{inCart ? "In cart" : "Add to cart"}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={!compareAllowed}
              aria-pressed={comparing}
              onClick={() => toggleCompare(product.id)}
              className="min-h-[44px] gap-1.5 rounded-xl px-4 font-heading text-sm font-semibold"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                {comparing ? "check_box" : "compare_arrows"}
              </span>
              <span>{comparing ? "Compared" : "Compare"}</span>
            </Button>
          </div>

          <Link
            href={`/chat?q=${encodeURIComponent(
              `Evaluate trade-offs and alternatives for ${product.name}`,
            )}`}
            onClick={onClose}
            className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-surface-container-low px-4 text-xs font-semibold text-primary transition-colors hover:bg-primary-fixed"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
              auto_awesome
            </span>
            <span>Ask AI Workspace about this item</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
