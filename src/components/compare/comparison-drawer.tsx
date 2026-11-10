"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { useShop } from "@/lib/store";
import { buildComparisonMatrix } from "@/lib/compare/compare-matrix";
import { formatMoney } from "@/lib/format";
import { ProductImage } from "@/components/shop/product-image";
import { ProductProvenanceBadge } from "@/components/shop/product-provenance-badge";

/**
 * Persistent Sliding Comparison Drawer (Stitch Screen 12).
 *
 * Floats above mobile bottom nav (`bottom-20 lg:bottom-3`) whenever 1–4 items
 * are pinned, with stacked thumbnails, Quick Verdict summary, and expandable
 * Side-by-Side Spec Breakdown cards.
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
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 px-3 lg:bottom-3 lg:px-6"
    >
      <div className="pointer-events-auto relative mx-auto max-w-[1360px] overflow-hidden rounded-2xl border border-white/15 bg-brand-deep-indigo/95 text-white shadow-[0_16px_50px_rgba(19,22,39,0.42)] backdrop-blur-2xl transition-all duration-300">
        {/* Ambient Accents */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-12 -top-12 size-44 rounded-full bg-primary-container/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-12 -right-12 size-44 rounded-full bg-secondary/20 blur-3xl"
        />

        {/* Peek Strip */}
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
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-container"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary-container/40 bg-primary-container/25 text-primary-fixed-dim">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                compare_arrows
              </span>
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-heading text-sm font-semibold tracking-tight text-white">
                  Instant Comparison Matrix
                </span>
                <span className="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
                  {compareProducts.length}/4 Selected
                </span>
              </div>
              <p className="mt-0.5 hidden truncate text-xs text-white/65 sm:block">
                {expanded
                  ? "Click to collapse live spec breakdown"
                  : "Click to inspect specs side by side or open the full matrix"}
              </p>
            </div>

            {/* Stacked Circular Thumbnails */}
            <div className="hidden -space-x-2 pr-1 md:flex" aria-hidden="true">
              {compareProducts.map((product) => (
                <div
                  key={product.id}
                  className="size-8 overflow-hidden rounded-full border-2 border-brand-deep-indigo bg-white p-0.5 shadow-xs"
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
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                {expanded ? "expand_more" : "keyboard_arrow_up"}
              </span>
            </span>
          </button>

          {/* Direct Action Controls */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={clearCompare}
              aria-label="Clear comparison selections"
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                refresh
              </span>
              <span className="hidden sm:inline">Clear</span>
            </button>

            <Link
              href="/compare"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary-container px-3.5 font-heading text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary"
            >
              <span>Launch Matrix</span>
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                arrow_forward
              </span>
            </Link>
          </div>
        </div>

        {/* Expanded Peek Panel (Stitch 12 Side-by-Side Spec Breakdown + Quick Verdict) */}
        {expanded ? (
          <div
            id="shopmate-comparison-drawer-panel"
            className="relative z-10 max-h-[65vh] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-secondary-fixed">
                  speed
                </span>
                <span className="font-heading text-sm font-semibold text-white">
                  Side-by-Side Spec Breakdown
                </span>
                <span className="hidden font-mono text-xs text-white/60 sm:inline">
                  Verified Catalog Data
                </span>
              </div>
              <button
                type="button"
                aria-label="Minimize comparison drawer"
                onClick={() => setExpanded(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  expand_more
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
              {/* Product Spec Cards */}
              <div
                className={cn(
                  "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-8",
                  compareProducts.length >= 3 && "xl:grid-cols-2",
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
                                <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                                  close
                                </span>
                              </button>
                            </div>
                            <h4 className="mt-1 truncate font-heading text-sm font-semibold text-white">
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
                            <span className="rounded-full bg-primary-container/40 px-2 py-0.5 font-semibold text-primary-fixed">
                              {insight.badge}
                            </span>
                          ) : (
                            product.brand
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCompare(product.id)}
                          className="font-medium text-primary-fixed-dim underline-offset-2 hover:text-white hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Quick Verdict Card (Stitch 12) */}
              <div className="flex flex-col justify-between rounded-xl border border-primary-container/40 bg-primary-container/20 p-4 lg:col-span-4">
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary-fixed">
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                      psychology
                    </span>
                    <span>ShopMate AI Quick Verdict</span>
                  </div>

                  {priceInfo.hasCurrencyMismatch ? (
                    <p className="text-xs leading-relaxed text-amber-200">
                      Mixed currencies detected ({priceInfo.currencies.join(", ")}). Price range omitted without an authoritative FX rate.
                    </p>
                  ) : compareProducts.length > 1 &&
                    priceInfo.minPrice !== undefined &&
                    priceInfo.maxPrice !== undefined ? (
                    <div className="space-y-2.5 text-xs leading-relaxed text-white/85">
                      <p>
                        Comparing{" "}
                        <strong className="text-white">
                          {compareProducts.length} items
                        </strong>{" "}
                        across{" "}
                        <strong className="font-mono text-white">
                          {formatMoney(priceInfo.minPrice, currency)} –{" "}
                          {formatMoney(priceInfo.maxPrice, currency)}
                        </strong>
                        {priceInfo.formattedDelta
                          ? ` (${priceInfo.formattedDelta} spread).`
                          : "."}
                      </p>
                      <div className="rounded-lg bg-black/30 p-2.5">
                        <div className="mb-1 flex justify-between font-mono text-[11px]">
                          <span className="text-white/75">Spec Variance</span>
                          <span className="font-semibold text-secondary-fixed">
                            {matrix.differingSpecsCount}/{matrix.totalSpecsCount} specs differ
                          </span>
                        </div>
                        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full bg-primary-container"
                            style={{
                              width: `${
                                matrix.totalSpecsCount > 0
                                  ? Math.round(
                                      (matrix.differingSpecsCount /
                                        matrix.totalSpecsCount) *
                                        100,
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed text-white/80">
                      Add one more item to generate a side-by-side price range and spec variance summary.
                    </p>
                  )}
                </div>

                <Link
                  href="/compare"
                  className="mt-4 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary-container text-xs font-semibold text-white shadow transition-colors hover:bg-primary"
                >
                  <span>Full Comparison Matrix</span>
                  <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                    open_in_new
                  </span>
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
