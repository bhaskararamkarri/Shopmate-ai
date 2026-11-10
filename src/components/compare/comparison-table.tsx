"use client";

import {
  AlertTriangle,
  Award,
  Check,
  ShoppingCart,
  Sparkles,
  Target,
  Trash,
} from "lucide-react";
import { cn } from "cn";
import type { Product, ProductRecommendationInsight } from "@/types";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shop/product-image";
import { ProductProvenanceBadge } from "@/components/shop/product-provenance-badge";
import { formatMoney } from "@/lib/format";
import { useCart } from "@/lib/store";
import {
  buildComparisonMatrix,
  type SpecRow,
} from "@/lib/compare/compare-matrix";

interface ComparisonTableProps {
  products: Product[];
  onRemove: (productId: string) => void;
  showDifferencesOnly?: boolean;
}

export function ComparisonTable({
  products,
  onRemove,
  showDifferencesOnly = false,
}: ComparisonTableProps) {
  const { addToCart, isInCart } = useCart();
  const matrix = buildComparisonMatrix(products);
  const minWidth = 180 + products.length * 240;

  const displayedRows: SpecRow[] = showDifferencesOnly
    ? matrix.specRows.filter((row) => row.isDifferent)
    : matrix.specRows;

  function renderVerdictBadge(insight?: ProductRecommendationInsight) {
    if (!insight || !insight.badge) return null;

    if (insight.badge === "Best Overall") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-[#B45309]">
          <Award className="size-3.5" aria-hidden="true" />
          Best Overall
        </span>
      );
    }
    if (insight.badge === "Best Value") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-[#047857]">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Best Value
        </span>
      );
    }
    if (insight.badge === "Best Fit") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-secondary px-2.5 py-0.5 text-xs font-semibold text-primary">
          <Target className="size-3.5" aria-hidden="true" />
          Best Fit
        </span>
      );
    }
    return null;
  }

  return (
    <div className="space-y-4">
      {matrix.priceComparison.hasCurrencyMismatch &&
      matrix.priceComparison.currencyWarning ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-[#78350F]">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#B45309]" />
          <div>
            <p className="font-semibold">Currency Difference Notice</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[#92400E]">
              {matrix.priceComparison.currencyWarning}
            </p>
          </div>
        </div>
      ) : null}

      <div className="stitch-tier-1 overflow-x-auto overscroll-x-contain rounded-2xl border border-border bg-card">
        <table
          className="w-full border-separate border-spacing-0"
          style={{ minWidth }}
        >
          <caption className="sr-only">
            Side-by-side attribute comparison of shortlisted products
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 border-b border-border bg-card p-5 text-left align-bottom shadow-[1px_0_0_0_#EEEEF2]"
                style={{ minWidth: 180 }}
              >
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Specification
                  </span>
                  <p className="font-mono text-[11px] font-normal text-muted-foreground">
                    {displayedRows.length}{" "}
                    {displayedRows.length === 1 ? "spec" : "specs"} shown
                  </p>
                </div>
              </th>
              {products.map((product) => {
                const insight = matrix.insights.get(product.id);
                const inCart = isInCart(product.id);

                return (
                  <th
                    key={product.id}
                    scope="col"
                    className="border-b border-border p-5 text-left align-top"
                    style={{ minWidth: 240 }}
                  >
                    <article className="flex flex-col items-start gap-3">
                      <div className="flex w-full items-start justify-between gap-2">
                        <ProductImage
                          product={product}
                          variant="thumb"
                          className="size-20 rounded-xl"
                        />
                        <ProductProvenanceBadge
                          product={product}
                          showMerchant={false}
                        />
                      </div>

                      {renderVerdictBadge(insight)}

                      <div className="w-full space-y-0.5 text-left">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight text-foreground">
                          {product.name}
                        </p>
                        <p className="text-[12px] font-normal text-muted-foreground">
                          {product.brand}
                        </p>
                      </div>

                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[17px] font-bold tabular-nums text-foreground">
                          {formatMoney(product.price, product.currency)}
                        </span>
                        {product.ratings > 0 ? (
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">
                            ★ {product.ratings.toFixed(1)}
                            {product.reviews > 0 ? ` (${product.reviews})` : ""}
                          </span>
                        ) : (
                          <span className="text-[11px] font-normal italic text-muted-foreground">
                            No reviews
                          </span>
                        )}
                      </div>

                      <div className="flex w-full items-center gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={inCart ? "secondary" : "default"}
                          className="h-8 flex-1 gap-1.5 text-xs font-semibold"
                          onClick={() => addToCart(product.id)}
                        >
                          {inCart ? (
                            <>
                              <Check
                                className="size-3.5 text-emerald-600"
                                aria-hidden="true"
                              />
                              In cart
                            </>
                          ) : (
                            <>
                              <ShoppingCart
                                className="size-3.5"
                                aria-hidden="true"
                              />
                              Add to cart
                            </>
                          )}
                        </Button>

                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove ${product.name} from comparison`}
                          onClick={() => onRemove(product.id)}
                        >
                          <Trash className="size-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </article>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={products.length + 1}
                  className="p-8 text-center text-sm text-muted-foreground"
                >
                  No differing specifications found. All documented specs match across these picks.
                </td>
              </tr>
            ) : (
              displayedRows.map((row) => {
                return (
                  <tr
                    key={row.key}
                    className={cn(
                      "transition-colors",
                      row.isDifferent
                        ? "bg-primary/[0.03] hover:bg-primary/[0.05]"
                        : "hover:bg-muted/40",
                    )}
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-t border-border bg-card px-5 py-3.5 text-left align-top text-[13px] font-medium text-muted-foreground shadow-[1px_0_0_0_#EEEEF2]"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-foreground">
                          {row.key}
                        </span>
                        {row.isDifferent ? (
                          <span className="inline-flex w-fit rounded-full bg-amber-500/10 px-2 py-0.2 text-[10px] font-semibold uppercase tracking-wider text-[#B45309]">
                            Differs
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-muted-foreground">
                            Identical
                          </span>
                        )}
                      </div>
                    </th>
                    {products.map((product) => {
                      const specVal = row.values[product.id];
                      return (
                        <td
                          key={product.id}
                          className={cn(
                            "border-t border-border px-5 py-3.5 align-top text-[13px] leading-relaxed",
                            row.isDifferent
                              ? "font-medium text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {specVal?.isMissing ? (
                            <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-normal italic text-muted-foreground">
                              Not documented
                            </span>
                          ) : (
                            <span className="font-mono text-[12px]">
                              {specVal?.value ?? "—"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
