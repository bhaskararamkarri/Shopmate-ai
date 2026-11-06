"use client";

import { Check, ShoppingCart, Trash, Award, Sparkles, Target, AlertTriangle } from "lucide-react";
import { cn } from "cn";
import type { Product, ProductRecommendationInsight } from "@/types";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shop/product-image";
import { formatMoney } from "@/lib/format";
import { useCart } from "@/lib/store";
import { buildComparisonMatrix, type SpecRow } from "@/lib/compare/compare-matrix";

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
  const minWidth = 160 + products.length * 240;

  const displayedRows: SpecRow[] = showDifferencesOnly
    ? matrix.specRows.filter((row) => row.isDifferent)
    : matrix.specRows;

  function renderVerdictBadge(insight?: ProductRecommendationInsight) {
    if (!insight || !insight.badge) return null;

    if (insight.badge === "Best Overall") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/30">
          <Award className="size-3.5" aria-hidden="true" />
          Best Overall
        </span>
      );
    }
    if (insight.badge === "Best Value") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Best Value
        </span>
      );
    }
    if (insight.badge === "Best Fit") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400 border border-indigo-500/30">
          <Target className="size-3.5" aria-hidden="true" />
          Best Fit
        </span>
      );
    }
    return null;
  }

  return (
    <div className="space-y-4">
      {matrix.priceComparison.hasCurrencyMismatch && matrix.priceComparison.currencyWarning ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="font-medium">Currency Difference Notice</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
              {matrix.priceComparison.currencyWarning}
            </p>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card shadow-xs">
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
                className="sticky left-0 z-20 bg-card p-4 align-bottom border-b border-border shadow-[1px_0_0_0] shadow-border"
                style={{ minWidth: 160 }}
              >
                <div className="text-left space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Attribute
                  </span>
                  <p className="text-[11px] text-muted-foreground/80 font-normal">
                    {displayedRows.length} {displayedRows.length === 1 ? "spec" : "specs"} listed
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
                    className="p-4 align-top border-b border-border"
                    style={{ minWidth: 240 }}
                  >
                    <article className="flex flex-col items-start gap-3">
                      <div className="relative">
                        <ProductImage product={product} variant="thumb" className="size-20 rounded-lg" />
                        {product.source === "channel3" ? (
                          <span className="absolute -bottom-1 -right-1 rounded-full bg-emerald-600 px-1.5 py-0.2 text-[10px] font-bold text-white shadow-xs">
                            LIVE
                          </span>
                        ) : null}
                      </div>

                      {renderVerdictBadge(insight)}

                      <div className="space-y-0.5 text-left w-full">
                        <p className="text-sm font-semibold leading-snug tracking-tight text-foreground line-clamp-2">
                          {product.name}
                        </p>
                        <p className="text-[12px] text-muted-foreground">{product.brand}</p>
                      </div>

                      <div className="flex items-baseline gap-2">
                        <span className="text-[16px] font-bold tabular-nums text-foreground">
                          {formatMoney(product.price, product.currency)}
                        </span>
                        {product.ratings > 0 ? (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            ★ {product.ratings.toFixed(1)}
                            {product.reviews > 0 ? ` (${product.reviews})` : ""}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/70 italic">
                            No reviews
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-1 w-full">
                        <Button
                          type="button"
                          size="sm"
                          variant={inCart ? "secondary" : "default"}
                          className="flex-1 gap-1.5 text-xs h-8"
                          onClick={() => addToCart(product.id)}
                        >
                          {inCart ? (
                            <>
                              <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
                              Added
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="size-3.5" aria-hidden="true" />
                              Add to cart
                            </>
                          )}
                        </Button>

                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
                  No differing specifications found. All documented specs are identical.
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
                        ? "bg-amber-500/[0.03] dark:bg-amber-400/[0.02]"
                        : "hover:bg-muted/30",
                    )}
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-t border-border bg-card px-4 py-3 text-left align-top text-[13px] font-medium text-muted-foreground shadow-[1px_0_0_0] shadow-border"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-foreground/90 font-medium">{row.key}</span>
                        {row.isDifferent ? (
                          <span className="text-[10px] font-semibold tracking-wider uppercase text-amber-700 dark:text-amber-400">
                            Differs
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/70">
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
                            "border-t border-border px-4 py-3 align-top text-[13px] leading-relaxed",
                            row.isDifferent ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {specVal?.isMissing ? (
                            <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground/75 italic">
                              Not documented
                            </span>
                          ) : (
                            <span className="font-normal">{specVal?.value ?? "—"}</span>
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
