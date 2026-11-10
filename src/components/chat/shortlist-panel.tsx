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
import { cn } from "cn";
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
  const { compareIds, toggleCompare, isComparing, canToggleCompare } = useCompare();
  const [justAddedCartId, setJustAddedCartId] = useState<string | null>(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);

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
      className="flex h-full w-full flex-col overflow-y-auto bg-card p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-secondary text-primary">
            <Award className="size-3.5" aria-hidden="true" />
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Live Shortlist
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-[11px] font-semibold">
            {products.length} {products.length === 1 ? "item" : "items"}
          </Badge>
          {compareIds.length > 0 ? (
            <Link
              href="/compare"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            >
              Matrix ({compareIds.length})
              <ArrowRight className="size-3" />
            </Link>
          ) : products.length > 1 ? (
            <Link
              href={`/compare?ids=${products
                .slice(0, 4)
                .map((p) => p.id)
                .join(",")}`}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            >
              Compare
              <ArrowRight className="size-3" />
            </Link>
          ) : null}
        </div>
      </div>

      {/* Content */}
      <div className="mt-4 flex-1 space-y-4">
        {pending && products.length === 0 ? (
          <div className="space-y-3 py-2">
            <div className="h-44 animate-pulse rounded-2xl border border-border bg-muted/60" />
            <div className="h-44 animate-pulse rounded-2xl border border-border bg-muted/60" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-input bg-background p-6 text-center">
            <div className="grid size-12 place-items-center rounded-2xl border border-primary/15 bg-secondary text-primary">
              <Sparkles className="size-5" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              No products shortlisted yet
            </h3>
            <p className="mt-1 max-w-[230px] text-xs leading-relaxed text-muted-foreground">
              Describe your needs in chat or refine requirements on the left to inspect verified picks here.
            </p>
          </div>
        ) : (
          <ul className="space-y-3.5">
            {products.map((product) => {
              const insight = insightMap.get(product.id);
              const badge = insight?.badge;
              const inCart = isInCart(product.id);
              const isAddedJustNow = justAddedCartId === product.id;
              const comparing = isComparing(product.id);
              const canCompare = canToggleCompare(product.id);
              const isExpanded = expandedDetailsId === product.id;
              const isTopPick = badge === "Best Overall";

              return (
                <li
                  key={product.id}
                  className={cn(
                    "stitch-tier-1 group relative flex flex-col rounded-2xl border bg-background p-3.5 transition-all hover:border-primary/40 hover:shadow-[0_10px_25px_-5px_rgba(23,23,33,0.06)]",
                    isTopPick ? "border-border border-l-2 border-l-primary" : "border-border",
                  )}
                >
                  {/* Badge Row */}
                  <div className="flex items-center justify-between gap-2 pb-2.5">
                    {badge ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
                          badge === "Best Overall"
                            ? "border-amber-500/25 bg-amber-500/10 text-[#B45309]"
                            : badge === "Best Value"
                              ? "border-emerald-500/25 bg-emerald-500/10 text-[#047857]"
                              : "border-primary/25 bg-secondary text-primary",
                        )}
                      >
                        <Award className="size-3 shrink-0" />
                        {badge}
                      </span>
                    ) : (
                      <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {product.brand || "Catalog Option"}
                      </span>
                    )}

                    <ProductProvenanceBadge product={product} showMerchant={false} />
                  </div>

                  {/* Product Info Row */}
                  <div className="flex gap-3">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-card">
                      <ProductImage product={product} variant="thumb" className="size-full rounded-none border-0" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
                        {product.name}
                      </h4>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="font-mono text-sm font-bold text-foreground">
                          {formatMoney(product.price, product.currency || "USD")}
                        </span>
                        {product.merchant ? (
                          <span className="truncate text-[11px] text-muted-foreground">
                            via {product.merchant}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Decision Insight: Why this matches */}
                  {insight?.whyItMatches ? (
                    <div className="mt-3 rounded-xl border border-border bg-card p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground">Why it fits: </span>
                      {insight.whyItMatches}
                    </div>
                  ) : null}

                  {/* Failed Requirements Notice */}
                  {insight?.failedRequirements && insight.failedRequirements.length > 0 ? (
                    <div className="mt-2 rounded-xl border border-destructive/25 bg-destructive/10 p-2 text-[11px] leading-relaxed text-destructive">
                      <span className="font-semibold">Unmet requirement: </span>
                      {insight.failedRequirements[0]}
                    </div>
                  ) : null}

                  {/* Decision Insight: Key Trade-off */}
                  {insight?.tradeOffs && insight.tradeOffs.length > 0 ? (
                    <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-2 text-[11px] leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-[#B45309]">Trade-off: </span>
                      {insight.tradeOffs[0]}
                    </div>
                  ) : null}

                  {/* Primary Action Buttons (positioned prominently before specs drawer for clean tab order & QA consistency) */}
                  <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={inCart || isAddedJustNow ? "secondary" : "default"}
                      onClick={() => handleAddToCart(product.id)}
                      className="h-8 flex-1 text-xs font-semibold"
                    >
                      {isAddedJustNow ? (
                        <>
                          <Check className="mr-1 size-3.5 text-emerald-600" />
                          Added!
                        </>
                      ) : inCart ? (
                        <>
                          <ShoppingCart className="mr-1 size-3.5 text-primary" />
                          In Cart
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="mr-1 size-3.5" />
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
                      className={cn(
                        "h-8 px-2.5 text-xs font-medium",
                        comparing && "border-primary/40 bg-accent text-accent-foreground font-semibold",
                      )}
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

                  {/* Expandable Deep Breakdown */}
                  {insight ? (
                    <div className="mt-2 border-t border-border/70 pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDetailsId(isExpanded ? null : product.id)
                        }
                        className="flex w-full items-center justify-between text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <span>
                          {isExpanded ? "Hide details" : "View specifications & checks"}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                      </button>

                      {isExpanded ? (
                        <div className="mt-2 space-y-2 text-[11px]">
                          {insight.requirementsSatisfied.length > 0 ? (
                            <div>
                              <p className="font-semibold text-foreground">
                                Satisfied requirements:
                              </p>
                              <ul className="mt-1 space-y-0.5 text-[#047857]">
                                {insight.requirementsSatisfied.map((item, idx) => (
                                  <li key={idx} className="flex items-start gap-1">
                                    <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {insight.failedRequirements &&
                          insight.failedRequirements.length > 0 ? (
                            <div>
                              <p className="font-semibold text-destructive">
                                Unmet mandatory criteria:
                              </p>
                              <ul className="mt-1 space-y-0.5 text-destructive">
                                {insight.failedRequirements.map((item, idx) => (
                                  <li key={idx} className="flex items-start gap-1">
                                    <span className="font-bold">✕</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {insight.missingOrUnverified.length > 0 ? (
                            <div>
                              <p className="font-semibold text-foreground">
                                Missing / Unverified:
                              </p>
                              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                {insight.missingOrUnverified.map((item, idx) => (
                                  <li key={idx} className="flex items-start gap-1">
                                    <HelpCircle className="mt-0.5 size-3 shrink-0 text-muted-foreground/80" />
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {insight.whoShouldChoose ? (
                            <div className="rounded-lg bg-secondary/80 p-2">
                              <span className="font-semibold text-foreground">
                                Who should buy:{" "}
                              </span>
                              <span className="text-muted-foreground">
                                {insight.whoShouldChoose}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
