"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "cn";
import { useShop } from "@/lib/store";
import { buildComparisonMatrix } from "@/lib/compare/compare-matrix";
import { formatMoney } from "@/lib/format";
import { ProductImage } from "@/components/shop/product-image";
import { ProductProvenanceBadge } from "@/components/shop/product-provenance-badge";

/**
 * Persistent Sliding Comparison Drawer (Stitch Screen 12).
 *
 * Appears as a floating Deep Indigo dock (#131627) whenever 1–4 products are
 * pinned for comparison, letting shoppers peek specs inline or jump directly to
 * `/compare`. Hidden on `/compare` (already viewing the matrix) and `/cart`
 * (checkout focus).
 */
export function ComparisonDrawer() {
  const pathname = usePathname();
  const { compareProducts, toggleCompare, clearCompare } = useShop();
  const [expanded, setExpanded] = useState(false);

  if (
    compareProducts.length === 0 ||
    pathname === "/chat" ||
    pathname === "/compare" ||
    pathname === "/cart"
  ) {
    return null;
  }

  const matrix = buildComparisonMatrix(compareProducts);
  const priceInfo = matrix.priceComparison;
  const currency = priceInfo.currencies[0] ?? "USD";

  return (
    <aside
      aria-label="Pinned product comparison drawer"
      className="pointer-events-none fixed inset-x-0 bottom-3 z-50 px-3 sm:bottom-4 sm:px-6"
    >
      <div className="pointer-events-auto relative mx-auto max-w-[1320px] overflow-hidden rounded-2xl border border-white/15 bg-[#131627]/95 text-white shadow-[0_16px_50px_rgba(19,22,39,0.42)] backdrop-blur-2xl transition-all duration-300">
        {/* Ambient radial accents */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-12 -top-12 size-44 rounded-full bg-[#5B4CF5]/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -bottom-12 size-44 rounded-full bg-emerald-500/15 blur-3xl"
        />

        {/* Peek Bar */}
        <div
          className={cn(
            "relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5",
            expanded && "border-b border-white/10",
          )}
        >
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="shopmate-comparison-drawer-panel"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[#5B4CF5]"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[#5B4CF5]/40 bg-[#5B4CF5]/20 text-[#C4C0FF]">
              <GitCompareArrows className="size-4" aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold tracking-tight text-white">
                  Instant Comparison Matrix
                </span>
                <span className="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
                  {compareProducts.length}/4 Selected
                </span>
              </div>
              <p className="mt-0.5 hidden truncate text-xs text-white/65 sm:block">
                {expanded
                  ? "Click to collapse live comparison peek"
                  : "Click to preview key specs side by side before opening full matrix"}
              </p>
            </div>

            {/* Stacked miniature thumbnails on desktop */}
            <div className="hidden -space-x-2 pr-1 md:flex" aria-hidden="true">
              {compareProducts.map((product) => (
                <div
                  key={product.id}
                  className="size-8 overflow-hidden rounded-full border-2 border-[#131627] bg-white shadow-xs"
                >
                  <ProductImage
                    product={product}
                    variant="mini"
                    className="size-full rounded-none"
                  />
                </div>
              ))}
            </div>

            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20">
              {expanded ? (
                <ChevronDown className="size-4" aria-hidden="true" />
              ) : (
                <ChevronUp className="size-4" aria-hidden="true" />
              )}
            </span>
          </button>

          {/* Direct Action Controls (siblings to button — valid HTML interactivity) */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={clearCompare}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              aria-label="Clear comparison selections"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Clear</span>
            </button>

            <Link
              href="/compare"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#5B4CF5] px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#412CDD]"
            >
              <span>Launch Matrix</span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Expanded Peek Panel */}
        {expanded ? (
          <div
            id="shopmate-comparison-drawer-panel"
            className="relative z-10 max-h-[65vh] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5"
          >
            {/* Honest Summary Bar */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2 text-white/90">
                <Sparkles className="size-3.5 shrink-0 text-[#C4C0FF]" aria-hidden="true" />
                {priceInfo.hasCurrencyMismatch ? (
                  <span className="text-amber-300">
                    Mixed currencies ({priceInfo.currencies.join(", ")}). Price spread hidden without a verified FX rate.
                  </span>
                ) : compareProducts.length > 1 &&
                  priceInfo.minPrice !== undefined &&
                  priceInfo.maxPrice !== undefined ? (
                  <span>
                    Range:{" "}
                    <strong className="font-mono text-white">
                      {formatMoney(priceInfo.minPrice, currency)} –{" "}
                      {formatMoney(priceInfo.maxPrice, currency)}
                    </strong>
                    {priceInfo.formattedDelta
                      ? ` (${priceInfo.formattedDelta} spread)`
                      : ""}
                    {" · "}
                    <span className="text-emerald-300">
                      {matrix.differingSpecsCount} of {matrix.totalSpecsCount} specs differ
                    </span>
                  </span>
                ) : (
                  <span className="text-white/75">
                    Add 1–3 more items to compare verified specifications side by side.
                  </span>
                )}
              </div>
              <span className="font-mono text-[11px] text-white/60">
                Grounded in verified catalog attributes
              </span>
            </div>

            {/* Side-by-Side Product Cards */}
            <div
              className={cn(
                "grid grid-cols-1 gap-3 sm:grid-cols-2",
                compareProducts.length >= 3 && "lg:grid-cols-3",
                compareProducts.length === 4 && "xl:grid-cols-4",
              )}
            >
              {compareProducts.map((product) => {
                const insight = matrix.insights.get(product.id);
                const topSpecs = Object.entries(product.specs ?? {}).slice(0, 4);

                return (
                  <article
                    key={product.id}
                    className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.06] p-3.5 transition-colors hover:bg-white/[0.09]"
                  >
                    <div>
                      <div className="flex items-start gap-3">
                        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-white p-0.5">
                          <ProductImage
                            product={product}
                            variant="mini"
                            className="size-full rounded-md"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <ProductProvenanceBadge
                              product={product}
                              showMerchant={false}
                            />
                            <button
                              type="button"
                              onClick={() => toggleCompare(product.id)}
                              aria-label={`Remove ${product.name} from comparison drawer`}
                              className="grid size-6 shrink-0 place-items-center rounded-md text-white/60 transition-colors hover:bg-white/15 hover:text-white"
                            >
                              <X className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                          <h4 className="mt-1 truncate text-sm font-semibold text-white">
                            {product.name}
                          </h4>
                          <p className="font-mono text-sm font-bold text-white">
                            {formatMoney(product.price, product.currency)}
                          </p>
                        </div>
                      </div>

                      {topSpecs.length > 0 ? (
                        <dl className="mt-3 space-y-1 border-t border-white/10 pt-2.5 text-xs">
                          {topSpecs.map(([label, val]) => (
                            <div
                              key={label}
                              className="flex items-center justify-between gap-3 py-0.5"
                            >
                              <dt className="truncate text-white/65">{label}</dt>
                              <dd className="shrink-0 font-mono text-[11px] font-medium text-white">
                                {val}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="mt-3 border-t border-white/10 pt-2.5 text-xs italic text-white/60">
                          No documented spec rows for this record.
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-[11px]">
                      <span className="truncate text-white/75">
                        {insight?.badge ? (
                          <span className="rounded-full bg-[#5B4CF5]/30 px-2 py-0.5 font-semibold text-[#C4C0FF]">
                            {insight.badge}
                          </span>
                        ) : (
                          product.brand
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCompare(product.id)}
                        className="font-medium text-[#C4C0FF] underline-offset-2 hover:text-white hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
