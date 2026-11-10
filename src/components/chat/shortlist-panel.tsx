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
      setJustAddedCartId((curr) => (curr === id ? null : curr));
    }, 1800);
  };

  return (
    <aside
      aria-label="Live product shortlist & decision insights"
      className="flex h-full w-full flex-col overflow-y-auto bg-surface p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-surface-container text-primary">
            <Award className="size-3.5" aria-hidden="true" />
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-on-surface">
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
            <div className="h-44 animate-pulse rounded-2xl border border-border-subtle bg-surface-container-low" />
            <div className="h-44 animate-pulse rounded-2xl border border-border-subtle bg-surface-container-low" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant bg-surface-card p-6 text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-surface-container text-primary">
              <Sparkles className="size-5" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-on-surface">
              No products shortlisted yet
            </h3>
            <p className="mt-1 max-w-[230px] text-xs leading-relaxed text-text-muted">
              Describe your needs in chat or refine requirements in Context to inspect verified picks here.
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
                    "group relative flex flex-col rounded-2xl border bg-surface-card p-3.5 shadow-sm transition-all hover:border-primary/40",
                    isTopPick
                      ? "border-border-subtle border-l-4 border-l-primary-container"
                      : "border-border-subtle border-l-4 border-l-secondary",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 pb-2.5">
                    {badge ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
                          badge === "Best Overall"
                            ? "bg-primary-fixed text-on-primary-fixed"
                            : badge === "Best Value"
                              ? "bg-secondary-container text-on-secondary-container"
                              : "bg-surface-container text-primary",
                        )}
                      >
                        <Award className="size-3 shrink-0" />
                        {badge}
                      </span>
                    ) : (
                      <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                        {product.brand || "Catalog Option"}
                      </span>
                    )}

                    <ProductProvenanceBadge product={product} showMerchant={false} />
                  </div>

                  <div className="flex gap-3">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border-subtle bg-canvas-bg">
                      <ProductImage
                        product={product}
                        variant="thumb"
                        className="size-full rounded-none border-0"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="line-clamp-2 text-xs font-semibold leading-snug text-on-surface">
                        {product.name}
                      </h4>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="font-mono text-sm font-bold text-primary">
                          {formatMoney(product.price, product.currency || "USD")}
                        </span>
                        {product.merchant ? (
                          <span className="truncate text-[11px] text-text-muted">
                            via {product.merchant}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {insight?.whyItMatches ? (
                    <div className="mt-3 rounded-xl bg-surface-container-low p-2.5 text-[11px] leading-relaxed text-on-surface-variant">
                      <span className="font-semibold text-on-surface">Why it fits: </span>
                      {insight.whyItMatches}
                    </div>
                  ) : null}

                  {insight?.failedRequirements && insight.failedRequirements.length > 0 ? (
                    <div className="mt-2 rounded-xl border border-error/25 bg-error-container/60 p-2 text-[11px] leading-relaxed text-on-error-container">
                      <span className="font-semibold">Unmet requirement: </span>
                      {insight.failedRequirements[0]}
                    </div>
                  ) : null}

                  {insight?.tradeOffs && insight.tradeOffs.length > 0 ? (
                    <div className="mt-2 rounded-xl bg-surface-container-highest/70 p-2 text-[11px] leading-relaxed text-on-surface-variant">
                      <span className="font-semibold text-tertiary">Trade-off: </span>
                      {insight.tradeOffs[0]}
                    </div>
                  ) : null}

                  <div className="mt-3 flex items-center gap-2 border-t border-border-subtle pt-2.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={inCart || isAddedJustNow ? "secondary" : "default"}
                      onClick={() => handleAddToCart(product.id)}
                      className="h-8 flex-1 text-xs font-semibold"
                    >
                      {isAddedJustNow ? (
                        <>
                          <Check className="mr-1 size-3.5 text-secondary" />
                          In Cart (Added)
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
                        comparing && "border-primary/40 bg-surface-container text-primary font-semibold",
                      )}
                    >
                      <Scale className="mr-1 size-3" />
                      {comparing ? "Comparing" : "Compare"}
                    </Button>
                  </div>

                  {insight ? (
                    <div className="mt-2 border-t border-border-subtle/80 pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDetailsId(isExpanded ? null : product.id)
                        }
                        className="flex w-full items-center justify-between text-[11px] font-medium text-text-muted transition-colors hover:text-on-surface"
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
                              <p className="font-semibold text-on-surface">
                                Satisfied requirements:
                              </p>
                              <ul className="mt-1 space-y-0.5 text-secondary">
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
                              <p className="font-semibold text-error">
                                Unmet mandatory criteria:
                              </p>
                              <ul className="mt-1 space-y-0.5 text-error">
                                {insight.failedRequirements.map((item, idx) => (
                                  <li key={idx} className="flex items-start gap-1">
                                    <span className="font-bold">x</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {insight.missingOrUnverified.length > 0 ? (
                            <div>
                              <p className="font-semibold text-on-surface">
                                Missing / Unverified:
                              </p>
                              <ul className="mt-1 space-y-0.5 text-text-muted">
                                {insight.missingOrUnverified.map((item, idx) => (
                                  <li key={idx} className="flex items-start gap-1">
                                    <HelpCircle className="mt-0.5 size-3 shrink-0" />
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {insight.whoShouldChoose ? (
                            <div className="rounded-lg bg-surface-container-low p-2">
                              <span className="font-semibold text-on-surface">
                                Who should buy:{" "}
                              </span>
                              <span className="text-text-muted">
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
