"use client";

import type { CSSProperties } from "react";
import { AlertTriangle, Check, ShoppingCart, Trash } from "lucide-react";
import { cn } from "cn";
import type { Product, ProductRecommendationInsight } from "@/types";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shop/product-image";
import { ProductProvenanceBadge } from "@/components/shop/product-provenance-badge";
import { formatMoney } from "@/lib/format";
import { useCart } from "@/lib/store";
import { buildComparisonMatrix } from "@/lib/compare/compare-matrix";
import {
  computeUnitSafeLead,
  groupComparisonSpecRows,
} from "@/lib/compare/spec-groups";

interface ComparisonTableProps {
  products: Product[];
  onRemove: (productId: string) => void;
  showDifferencesOnly?: boolean;
}

function renderVerdictLabel(insight?: ProductRecommendationInsight) {
  if (!insight?.badge) return null;
  if (insight.badge === "Best Overall") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary-fixed px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-primary-fixed">
        Best Overall
      </span>
    );
  }
  if (insight.badge === "Best Value") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-secondary-container">
        Best Value
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
      {insight.badge}
    </span>
  );
}

/**
 * Stitch Categorized Comparison Matrix (Desktop 08 & Mobile 01).
 * Uses a sticky product deck, categorized white cards with lavender-tint
 * banners, proportional SPEC LEAD bars for unit-safe comparisons, and explicit
 * "Not documented" handling for missing records.
 */
export function ComparisonTable({
  products,
  onRemove,
  showDifferencesOnly = false,
}: ComparisonTableProps) {
  const { addToCart, isInCart } = useCart();
  const matrix = buildComparisonMatrix(products);

  const filteredRows = showDifferencesOnly
    ? matrix.specRows.filter((row) => row.isDifferent)
    : matrix.specRows;
  const specGroups = groupComparisonSpecRows(filteredRows);

  const deckColumnsStyle = {
    "--compare-cols": String(Math.max(1, Math.min(products.length, 4))),
  } as CSSProperties;

  return (
    <div className="space-y-6">
      {matrix.priceComparison.hasCurrencyMismatch &&
      matrix.priceComparison.currencyWarning ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-tertiary-fixed-dim/60 bg-tertiary-fixed/45 p-4 text-sm text-on-tertiary-fixed">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-tertiary" />
          <div>
            <p className="font-semibold">Currency Difference Notice</p>
            <p className="mt-0.5 text-xs leading-relaxed text-on-tertiary-fixed-variant">
              {matrix.priceComparison.currencyWarning}
            </p>
          </div>
        </div>
      ) : null}

      {/* Sticky Product Header Deck (08 Desktop & 01 Mobile) */}
      <div className="sticky top-16 z-20 rounded-2xl bg-surface/95 py-2 backdrop-blur-md">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-stretch">
          <div className="hidden flex-col justify-end rounded-xl p-3 lg:col-span-3 lg:flex">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Catalog Matrix
            </span>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight text-on-surface">
              Direct Head-to-Head
            </h2>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-text-muted">
              <span className="size-2 rounded-full bg-secondary" aria-hidden="true" />
              <span>{filteredRows.length} specs evaluated</span>
            </div>
          </div>

          <div
            style={deckColumnsStyle}
            className={cn(
              "grid gap-3 lg:col-span-9",
              products.length === 1
                ? "grid-cols-1 sm:grid-cols-2"
                : "grid-cols-2 lg:[grid-template-columns:repeat(var(--compare-cols),minmax(0,1fr))]",
            )}
          >
            {products.map((product) => {
              const insight = matrix.insights.get(product.id);
              const inCart = isInCart(product.id);

              return (
                <article
                  key={product.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-border-subtle bg-surface-card p-3 shadow-sm md:p-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {renderVerdictLabel(insight)}
                        <ProductProvenanceBadge
                          product={product}
                          showMerchant={false}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="size-7 shrink-0 text-text-muted hover:bg-error-container/60 hover:text-error"
                        aria-label={`Remove ${product.name} from comparison`}
                        onClick={() => onRemove(product.id)}
                      >
                        <Trash className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>

                    <div className="flex items-start gap-2.5 md:gap-3">
                      <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-canvas-bg md:size-16">
                        <ProductImage
                          product={product}
                          variant="thumb"
                          className="size-full rounded-none border-0"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                          {product.brand}
                        </span>
                        <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-on-surface md:text-sm">
                          {product.name}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                          <span className="font-mono text-sm font-bold text-primary md:text-base">
                            {formatMoney(product.price, product.currency)}
                          </span>
                          {product.merchant ? (
                            <span className="truncate text-[11px] text-text-muted">
                              {product.merchant}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant={inCart ? "secondary" : "default"}
                    className={cn(
                      "h-9 w-full gap-1.5 rounded-lg text-xs font-semibold",
                      !inCart && "bg-primary text-on-primary hover:bg-surface-tint",
                    )}
                    onClick={() => addToCart(product.id)}
                  >
                    {inCart ? (
                      <>
                        <Check className="size-3.5 text-secondary" aria-hidden="true" />
                        In cart
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="size-3.5" aria-hidden="true" />
                        Add to cart
                      </>
                    )}
                  </Button>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      {/* Categorized Specification Groups */}
      {specGroups.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface-card p-8 text-center text-sm text-text-muted shadow-sm">
          No differing specifications found. All documented specs match across these picks.
        </div>
      ) : (
        <div className="space-y-5">
          {specGroups.map((group) => (
            <section
              key={group.id}
              aria-label={group.title}
              className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-card shadow-sm"
            >
              {/* Category Header Banner */}
              <div className="flex items-center gap-3 bg-surface-container-low px-4 py-3 md:px-6">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-card text-primary shadow-2xs">
                  <span
                    className="material-symbols-outlined text-[18px]"
                    aria-hidden="true"
                  >
                    {group.icon}
                  </span>
                </span>
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface md:text-sm">
                    {group.title}
                  </h3>
                  <p className="truncate text-[11px] text-text-muted">
                    {group.subtitle}
                  </p>
                </div>
              </div>

              {/* Specification Rows */}
              <div className="divide-y divide-border-subtle">
                {group.rows.map((row) => {
                  const lead = computeUnitSafeLead(row, products);

                  return (
                    <div
                      key={row.key}
                      className={cn(
                        "px-4 py-3.5 transition-colors md:px-6",
                        lead
                          ? "bg-primary-fixed/15"
                          : row.isDifferent
                            ? "hover:bg-surface-container-low/50"
                            : "bg-surface-card",
                      )}
                    >
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-center lg:gap-4">
                        {/* Spec Label Column */}
                        <div className="flex flex-wrap items-center justify-between gap-2 lg:col-span-3 lg:flex-col lg:items-start lg:gap-1">
                          <span className="text-sm font-semibold text-on-surface">
                            {row.key}
                          </span>
                          {row.isDifferent ? (
                            <span className="inline-flex rounded-full bg-tertiary-fixed/75 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-tertiary-fixed">
                              Differs
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-medium text-text-muted">
                              Identical
                            </span>
                          )}
                        </div>

                        {/* Product Cells */}
                        <div
                          style={deckColumnsStyle}
                          className={cn(
                            "grid gap-2.5 lg:col-span-9",
                            products.length === 1
                              ? "grid-cols-1"
                              : "grid-cols-2 lg:[grid-template-columns:repeat(var(--compare-cols),minmax(0,1fr))]",
                          )}
                        >
                          {products.map((product) => {
                            const specVal = row.values[product.id];
                            const isWinner =
                              lead?.winnerIds.includes(product.id) ?? false;
                            const ratio =
                              lead?.ratioByProductId[product.id] ?? null;

                            return (
                              <div
                                key={product.id}
                                className={cn(
                                  "rounded-xl p-2.5 md:p-3",
                                  isWinner
                                    ? "bg-surface-card ring-1 ring-primary/25 shadow-2xs"
                                    : "bg-surface-container-low/75 lg:bg-transparent",
                                )}
                              >
                                <span className="mb-1 block truncate text-[10px] font-semibold uppercase tracking-wide text-text-muted lg:hidden">
                                  {product.name}
                                </span>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  {specVal?.isMissing ? (
                                    <span className="inline-flex items-center rounded-md border border-border-subtle bg-surface-container px-2 py-0.5 text-xs italic text-text-muted">
                                      Not documented
                                    </span>
                                  ) : (
                                    <span
                                      className={cn(
                                        "font-mono text-xs md:text-sm",
                                        isWinner
                                          ? "font-bold text-primary"
                                          : "font-semibold text-on-surface",
                                      )}
                                    >
                                      {specVal?.value ?? "—"}
                                    </span>
                                  )}

                                  {isWinner ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-primary">
                                      <span
                                        className="material-symbols-outlined text-[12px]"
                                        aria-hidden="true"
                                      >
                                        military_tech
                                      </span>
                                      SPEC LEAD
                                    </span>
                                  ) : null}

                                  {isWinner && lead?.deltaLabel ? (
                                    <span className="font-mono text-[10px] font-semibold text-secondary">
                                      {lead.deltaLabel}
                                    </span>
                                  ) : null}
                                </div>

                                {lead && ratio !== null ? (
                                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
                                    <div
                                      className={cn(
                                        "h-full rounded-full transition-all",
                                        isWinner
                                          ? "bg-primary-container"
                                          : "bg-outline/55",
                                      )}
                                      style={{ width: `${ratio}%` }}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Grounded Verification Assurance Strip */}
      <div className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-card p-3.5 shadow-sm">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary-fixed/45 text-secondary">
          <span
            className="material-symbols-outlined text-[20px]"
            aria-hidden="true"
          >
            verified
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-on-surface">
            Verified Catalog Specifications
          </p>
          <p className="text-xs text-text-muted">
            Attribute comparisons and numeric leads are computed strictly from matching-unit catalog records.
          </p>
        </div>
      </div>
    </div>
  );
}
