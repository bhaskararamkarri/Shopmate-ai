"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Award,
  Check,
  CheckCircle2,
  HelpCircle,
  Scale,
  ShoppingCart,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/shop/product-image";
import { ProductProvenanceBadge } from "@/components/shop/product-provenance-badge";
import { formatMoney } from "@/lib/format";
import { useCart, useCompare } from "@/lib/store";
import type { Product, ProductRecommendationInsight } from "@/types";

interface ShortlistPanelProps {
  products: Product[];
  recommendations?: ProductRecommendationInsight[];
  pending?: boolean;
}

export function ShortlistPanel({
  products,
  recommendations = [],
  pending = false,
}: ShortlistPanelProps) {
  const { addToCart, isInCart } = useCart();
  const { toggleCompare, isComparing, canToggleCompare } = useCompare();
  const [justAddedCartId, setJustAddedCartId] = useState<string | null>(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);

  // Map recommendation insights by productId for fast lookup
  const insightMap = new Map<string, ProductRecommendationInsight>();
  for (const rec of recommendations) {
    insightMap.set(rec.productId, rec);
  }

  const handleAddToCart = (id: string) => {
    addToCart(id);
    setJustAddedCartId(id);
    setTimeout(() => {
      setJustAddedCartId(null);
    }, 1800);
  };

  return (
    <aside
      aria-label="Live product shortlist & decision insights"
      className="flex h-full w-full flex-col overflow-y-auto border-border bg-card/60 p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Award className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Live Shortlist
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[11px] font-medium">
            {products.length} {products.length === 1 ? "item" : "items"}
          </Badge>
          {products.length > 1 && (
            <Link
              href={`/compare?ids=${products.slice(0, 4).map((p) => p.id).join(",")}`}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            >
              Compare
              <ArrowRight className="size-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mt-4 flex-1 space-y-4">
        {pending && products.length === 0 ? (
          <div className="space-y-4 py-4">
            <div className="h-44 animate-pulse rounded-xl border border-border bg-muted/40" />
            <div className="h-44 animate-pulse rounded-xl border border-border bg-muted/40" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <h3 className="mt-3 text-sm font-medium text-foreground">
              No products shortlisted yet
            </h3>
            <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-muted-foreground">
              Ask ShopMate for recommendations or adjust requirements to see evaluated options here.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {products.map((product) => {
              const insight = insightMap.get(product.id);
              const badge = insight?.badge;
              const inCart = isInCart(product.id);
              const isAddedJustNow = justAddedCartId === product.id;
              const comparing = isComparing(product.id);
              const canCompare = canToggleCompare(product.id);
              const isExpanded = expandedDetailsId === product.id;

              return (
                <li
                  key={product.id}
                  className="group relative flex flex-col rounded-xl border border-border bg-background p-3.5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
                >
                  {/* Badge Row */}
                  <div className="flex items-center justify-between gap-2 pb-2">
                    {badge ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${
                          badge === "Best Overall"
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                            : badge === "Best Value"
                            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                            : "bg-blue-100 text-blue-900 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
                        }`}
                      >
                        <Award className="size-3 shrink-0" />
                        {badge}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {product.brand || "Catalog Option"}
                      </span>
                    )}

                    <ProductProvenanceBadge product={product} showMerchant={false} />
                  </div>

                  {/* Product Info Row */}
                  <div className="flex gap-3">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/20">
                      <ProductImage product={product} variant="thumb" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
                        {product.name}
                      </h4>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-sm font-bold text-foreground">
                          {formatMoney(product.price, product.currency || "USD")}
                        </span>
                        {product.merchant && (
                          <span className="text-[11px] text-muted-foreground truncate">
                            via {product.merchant}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Decision Insight: Why this matches */}
                  {insight?.whyItMatches && (
                    <div className="mt-3 rounded-lg bg-secondary/40 p-2 text-[11px] leading-relaxed text-secondary-foreground">
                      <span className="font-semibold text-foreground">Why it fits: </span>
                      {insight.whyItMatches}
                    </div>
                  )}

                  {/* Failed Requirements Notice */}
                  {insight?.failedRequirements && insight.failedRequirements.length > 0 && (
                    <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] leading-relaxed text-destructive">
                      <span className="font-semibold">Unmet requirement: </span>
                      {insight.failedRequirements[0]}
                    </div>
                  )}

                  {/* Decision Insight: Key Trade-off */}
                  {insight?.tradeOffs && insight.tradeOffs.length > 0 && (
                    <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground">Trade-off: </span>
                      {insight.tradeOffs[0]}
                    </div>
                  )}

                  {/* Expandable Deep Breakdown */}
                  {insight && (
                    <div className="mt-2 pt-1 border-t border-border/60">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDetailsId(isExpanded ? null : product.id)
                        }
                        className="flex w-full items-center justify-between text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        <span>{isExpanded ? "Hide details" : "View specifications & checks"}</span>
                        {isExpanded ? (
                          <ChevronUp className="size-3" />
                        ) : (
                          <ChevronDown className="size-3" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-2 text-[11px]">
                          {/* Requirements satisfied */}
                          {insight.requirementsSatisfied.length > 0 && (
                            <div>
                              <p className="font-semibold text-foreground">Satisfied requirements:</p>
                              <ul className="mt-1 space-y-0.5 text-emerald-700 dark:text-emerald-400">
                                {insight.requirementsSatisfied.map((item, idx) => (
                                  <li key={idx} className="flex items-start gap-1">
                                    <CheckCircle2 className="size-3 mt-0.5 shrink-0" />
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Requirements not met */}
                          {insight.failedRequirements && insight.failedRequirements.length > 0 && (
                            <div>
                              <p className="font-semibold text-destructive">Unmet mandatory criteria:</p>
                              <ul className="mt-1 space-y-0.5 text-destructive">
                                {insight.failedRequirements.map((item, idx) => (
                                  <li key={idx} className="flex items-start gap-1">
                                    <span className="font-bold">✕</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Honest Missing Attributes */}
                          {insight.missingOrUnverified.length > 0 && (
                            <div>
                              <p className="font-semibold text-foreground">Missing / Unverified:</p>
                              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                {insight.missingOrUnverified.map((item, idx) => (
                                  <li key={idx} className="flex items-start gap-1">
                                    <HelpCircle className="size-3 mt-0.5 shrink-0 text-muted-foreground/80" />
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Who should choose */}
                          {insight.whoShouldChoose && (
                            <div className="rounded-md bg-accent/40 p-1.5">
                              <span className="font-semibold text-foreground">Who should buy: </span>
                              <span className="text-muted-foreground">{insight.whoShouldChoose}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="mt-3 flex items-center gap-2 pt-2 border-t border-border">
                    <Button
                      type="button"
                      size="sm"
                      variant={inCart || isAddedJustNow ? "secondary" : "default"}
                      onClick={() => handleAddToCart(product.id)}
                      className="h-7 flex-1 text-xs font-medium"
                    >
                      {isAddedJustNow ? (
                        <>
                          <Check className="mr-1 size-3 text-emerald-600" />
                          Added!
                        </>
                      ) : inCart ? (
                        <>
                          <ShoppingCart className="mr-1 size-3 text-primary" />
                          In Cart
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="mr-1 size-3" />
                          Add to Cart
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!comparing && !canCompare}
                      onClick={() => toggleCompare(product.id)}
                      className={`h-7 px-2.5 text-xs font-medium ${
                        comparing ? "border-primary bg-primary/10 text-primary font-semibold" : ""
                      }`}
                      title={
                        !comparing && !canCompare
                          ? "Maximum 4 products in comparison"
                          : comparing
                          ? "Remove from comparison"
                          : "Add to side-by-side comparison"
                      }
                    >
                      <Scale className="mr-1 size-3" />
                      {comparing ? "Comparing" : "Compare"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
