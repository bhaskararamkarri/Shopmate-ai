"use client";

import { useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  HelpCircle,
  Scale,
  ShoppingCart,
  TriangleAlert,
} from "lucide-react";
import { cn } from "cn";
import type { ChatMessage, Product, ProductRecommendationInsight } from "@/types";
import { getDemoProduct } from "@/lib/demo-catalog";
import { formatMoney } from "@/lib/format";
import { isSafeHttpUrl } from "@/lib/catalog/url";
import { useCart, useCompare } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shop/product-image";
import { ProductProvenanceBadge } from "@/components/shop/product-provenance-badge";
import { TypingDots } from "@/components/chat/typing-dots";

export interface UiMessage extends ChatMessage {
  /** Shown while the assistant reply is still composing. */
  pending?: boolean;
  /** Set when the reply failed; the row offers a retry. */
  error?: string;
  /** Query to re-run on retry. */
  retryQuery?: string;
}

function resolveMessageProducts(message: UiMessage): Product[] {
  if (message.products && message.products.length > 0) {
    return message.products;
  }
  return (message.productRefs ?? [])
    .map((id) => getDemoProduct(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
}

function formatMessageTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function availabilityLabel(
  availability: Product["availability"],
): string | null {
  if (availability === "in_stock") return "In Stock";
  if (availability === "limited") return "Limited Availability";
  if (availability === "out_of_stock") return "Out of Stock";
  return null;
}

/**
 * Stitch AI Workspace message row (Desktop 07 & Mobile 02).
 * Renders crisp user bubbles, telemetry dividers, white Copilot cards,
 * inline 2-up synthesis product cards, and grounded follow-up exploration paths.
 */
export function ChatMessageItem({
  message,
  onRetry,
  onFollowUp,
}: {
  message: UiMessage;
  onRetry?: (query: string) => void;
  onFollowUp?: (query: string) => void;
}) {
  const { addToCart, isInCart } = useCart();
  const { toggleCompare, isComparing, canToggleCompare } = useCompare();
  const [copied, setCopied] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  if (message.role === "user") {
    const timeLabel = formatMessageTime(message.createdAt);
    return (
      <div className="flex justify-end" role="listitem" aria-label="You">
        <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-brand-deep-indigo px-4 py-3 text-on-primary shadow-sm md:max-w-2xl md:bg-surface-container md:text-on-surface">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-primary-fixed-dim md:text-text-muted">
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              person
            </span>
            <span>You</span>
            {timeLabel ? <span>• {timeLabel}</span> : null}
          </div>
          <p className="text-[14px] leading-relaxed md:text-[15px]">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  const products = resolveMessageProducts(message);
  const failed = Boolean(message.error);
  const insightMap = new Map<string, ProductRecommendationInsight>();
  for (const rec of message.recommendations ?? []) {
    insightMap.set(rec.productId, rec);
  }

  async function handleCopyReply() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      // Ignore clipboard permission failures gracefully
    }
  }

  function handleAddToCart(productId: string) {
    addToCart(productId);
    setJustAddedId(productId);
    setTimeout(() => {
      setJustAddedId((curr) => (curr === productId ? null : curr));
    }, 1500);
  }

  const followUps: string[] = [];
  if (onFollowUp && !failed) {
    if (message.intent?.clarifications && message.intent.clarifications.length > 0) {
      followUps.push(message.intent.clarifications[0]);
    }
    if (products.length > 1) {
      followUps.push(
        `Compare ${products[0].name} and ${products[1].name} trade-offs`,
      );
      followUps.push("Show lower-priced alternatives meeting the same needs");
    } else if (products.length === 1) {
      followUps.push(`What are the alternatives to ${products[0].name}?`);
    }
  }

  const sourceLabel =
    message.agentMeta?.catalog.source === "channel3"
      ? "Live Channel3"
      : "Demo Fallback";

  return (
    <div className="space-y-3" role="listitem" aria-label="ShopMate assistant">
      {/* Telemetry Pipeline Divider Pill */}
      {message.agentMeta ? (
        <div className="flex items-center gap-3">
          <div className="hidden h-px flex-1 bg-surface-container md:block" />
          <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border border-border-subtle bg-surface-container px-3 py-1 text-[11px] font-medium text-on-surface-variant shadow-2xs md:bg-surface-card">
            <span
              className="material-symbols-outlined text-[15px] text-primary"
              aria-hidden="true"
            >
              done_all
            </span>
            <span>
              {products.length > 0
                ? `Analyzed ${products.length} catalog ${products.length === 1 ? "record" : "records"}`
                : "Decision engine turn completed"}
            </span>
            {message.agentMeta.toolsUsed.length > 0 ? (
              <span className="text-text-muted">
                • Tools: {message.agentMeta.toolsUsed.join(", ")}
              </span>
            ) : null}
            <span className="text-text-muted">• Source: {sourceLabel}</span>
          </div>
          <div className="hidden h-px flex-1 bg-surface-container md:block" />
        </div>
      ) : null}

      {/* Assistant Research Copilot Container */}
      <div className="space-y-4 rounded-2xl border border-border-subtle bg-surface-card p-4 shadow-sm md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-xl text-on-primary shadow-xs md:size-9",
                failed ? "bg-error" : "bg-primary",
              )}
              aria-hidden="true"
            >
              <span className="material-symbols-outlined text-[18px]">
                auto_awesome
              </span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-on-surface md:text-base">
                ShopMate Research Copilot
              </span>
              {message.agentMeta ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    message.agentMeta.catalog.source === "channel3"
                      ? "bg-secondary-container/80 text-on-secondary-container"
                      : "bg-tertiary-fixed/80 text-on-tertiary-fixed",
                  )}
                >
                  {sourceLabel}
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyReply}
            aria-label={copied ? "Copied response" : "Copy response"}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-container-low hover:text-on-surface"
          >
            {copied ? (
              <Check className="size-4 text-secondary" />
            ) : (
              <Copy className="size-4" />
            )}
          </button>
        </div>

        {message.pending && message.content === "" ? (
          <TypingDots />
        ) : (
          <div className="space-y-2.5">
            {message.content.split("\n\n").map((paragraph, index) => (
              <p
                key={index}
                className="text-[14px] leading-relaxed text-on-surface md:text-[15px]"
              >
                {paragraph}
              </p>
            ))}
          </div>
        )}

        {message.intent && message.intent.clarifications.length > 0 ? (
          <div className="rounded-xl border border-primary/15 bg-surface-container-low px-3.5 py-2.5">
            <p className="text-[13px] font-semibold text-on-surface">
              To narrow this down:
            </p>
            <ul className="mt-1 space-y-1">
              {message.intent.clarifications.map((question) => (
                <li
                  key={question}
                  className="text-[13px] leading-relaxed text-on-surface-variant"
                >
                  • {question}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {failed && onRetry && message.retryQuery ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-error/25 bg-error-container/50 px-3.5 py-2.5">
            <TriangleAlert
              className="size-4 shrink-0 text-error"
              aria-hidden="true"
            />
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-on-error-container">
              The reply failed. Nothing was added to the cart or comparison.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onRetry(message.retryQuery ?? "")}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {/* Inline 2-Up Stitch Synthesis Cards */}
        {products.length > 0 ? (
          <ul
            aria-label="Recommended products"
            className="grid grid-cols-1 gap-4 lg:grid-cols-2"
          >
            {products.map((product, idx) => {
              const insight = insightMap.get(product.id);
              const badge = insight?.badge;
              const inCart = isInCart(product.id);
              const addedNow = justAddedId === product.id;
              const comparing = isComparing(product.id);
              const canCompare = canToggleCompare(product.id);
              const isExpanded = expandedCardId === product.id;
              const currency = product.currency || "USD";
              const specEntries = Object.entries(product.specs ?? {}).slice(0, 4);
              const hasDiscount =
                typeof product.compareAtPrice === "number" &&
                product.compareAtPrice > product.price;
              const avail = availabilityLabel(product.availability);
              const safeBuyUrl =
                product.source === "channel3" &&
                product.buyUrl &&
                isSafeHttpUrl(product.buyUrl)
                  ? product.buyUrl
                  : null;
              const accentClass =
                badge === "Best Value" || idx % 2 === 1
                  ? "border-l-secondary lg:border-l-border-subtle"
                  : "border-l-primary-container lg:border-l-border-subtle";

              return (
                <li
                  key={product.id}
                  className={cn(
                    "flex min-w-0 flex-col justify-between rounded-xl border border-border-subtle border-l-[5px] bg-surface-card p-4 shadow-sm transition-shadow hover:shadow-md lg:border-l lg:bg-surface-container-low",
                    accentClass,
                  )}
                >
                  <div className="space-y-3">
                    {/* Card Top Row: Recommendation Badge + Provenance */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {badge ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide",
                            badge === "Best Overall"
                              ? "bg-secondary-container text-on-secondary-container"
                              : badge === "Best Value"
                                ? "bg-primary-fixed text-on-primary-fixed"
                                : "bg-surface-container-high text-primary",
                          )}
                        >
                          <span
                            className="material-symbols-outlined text-[13px]"
                            aria-hidden="true"
                          >
                            verified
                          </span>
                          <span>{badge}</span>
                        </span>
                      ) : (
                        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                          {product.brand || product.category}
                        </span>
                      )}

                      <ProductProvenanceBadge
                        product={product}
                        showMerchant={false}
                      />
                    </div>

                    {/* Product Media + Identity + Price */}
                    <div className="flex gap-3.5">
                      <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-border-subtle bg-canvas-bg p-1 md:size-24">
                        <ProductImage
                          product={product}
                          variant="thumb"
                          className="size-full rounded-lg border-0"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-on-surface md:text-base">
                          {product.name}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-baseline gap-2">
                          <span className="font-mono text-lg font-bold text-primary md:text-xl">
                            {formatMoney(product.price, currency)}
                          </span>
                          {hasDiscount ? (
                            <span className="font-mono text-xs text-text-muted line-through">
                              {formatMoney(product.compareAtPrice!, currency)}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-muted">
                          {product.merchant ? (
                            <span className="inline-flex items-center gap-1 truncate">
                              <span
                                className="material-symbols-outlined text-[13px] text-tertiary"
                                aria-hidden="true"
                              >
                                storefront
                              </span>
                              <span>{product.merchant}</span>
                            </span>
                          ) : null}
                          {avail ? (
                            <span
                              className={cn(
                                "font-semibold",
                                product.availability === "in_stock"
                                  ? "text-secondary"
                                  : product.availability === "out_of_stock"
                                    ? "text-error"
                                    : "text-tertiary",
                              )}
                            >
                              {avail}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* 2x2 Recessed Spec Tiles */}
                    {specEntries.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {specEntries.map(([specKey, specValue]) => (
                          <div
                            key={specKey}
                            className="rounded-lg bg-surface-container-low p-2 lg:bg-surface-card"
                          >
                            <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                              {specKey}
                            </span>
                            <span className="block truncate text-xs font-semibold text-on-surface">
                              {specValue}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg bg-surface-container-low px-3 py-2 text-[11px] text-text-muted lg:bg-surface-card">
                        Detailed technical specifications are unlisted for this item.
                      </div>
                    )}

                    {/* Failed Requirement Alert (if present) */}
                    {insight?.failedRequirements &&
                    insight.failedRequirements.length > 0 ? (
                      <div className="rounded-lg border border-error/25 bg-error-container/55 px-3 py-2 text-xs leading-relaxed text-on-error-container">
                        <span className="font-semibold">Unmet criterion: </span>
                        {insight.failedRequirements.join(" · ")}
                      </div>
                    ) : null}

                    {/* Key Trade-off or Why-It-Matches Callout */}
                    {insight?.tradeOffs && insight.tradeOffs.length > 0 ? (
                      <div className="flex items-start gap-2 rounded-lg bg-surface-container-highest/65 px-3 py-2 text-xs leading-relaxed text-on-surface-variant lg:bg-surface-card">
                        <span
                          className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-tertiary"
                          aria-hidden="true"
                        >
                          info
                        </span>
                        <p>
                          <strong className="font-semibold text-on-surface">
                            Key Trade-off:{" "}
                          </strong>
                          {insight.tradeOffs[0]}
                        </p>
                      </div>
                    ) : insight?.whyItMatches ? (
                      <div className="flex items-start gap-2 rounded-lg bg-surface-container-highest/65 px-3 py-2 text-xs leading-relaxed text-on-surface-variant lg:bg-surface-card">
                        <span
                          className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-primary"
                          aria-hidden="true"
                        >
                          check_circle
                        </span>
                        <p>
                          <strong className="font-semibold text-on-surface">
                            Why it fits:{" "}
                          </strong>
                          {insight.whyItMatches}
                        </p>
                      </div>
                    ) : null}

                    {/* Expandable Deep Verification Checks */}
                    {insight &&
                    (insight.requirementsSatisfied.length > 0 ||
                      insight.missingOrUnverified.length > 0 ||
                      insight.whoShouldChoose ||
                      safeBuyUrl) ? (
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCardId(isExpanded ? null : product.id)
                          }
                          className="flex w-full items-center justify-between text-[11px] font-medium text-text-muted transition-colors hover:text-on-surface"
                        >
                          <span>
                            {isExpanded
                              ? "Hide verification checks"
                              : "Specifications & verification checks"}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                        </button>

                        {isExpanded ? (
                          <div className="mt-2 space-y-2 rounded-lg bg-surface-container-low p-2.5 text-[11px] lg:bg-surface-card">
                            {insight.requirementsSatisfied.length > 0 ? (
                              <div>
                                <p className="font-semibold text-on-surface">
                                  Satisfied:
                                </p>
                                <ul className="mt-0.5 space-y-0.5 text-secondary">
                                  {insight.requirementsSatisfied.map((req, i) => (
                                    <li key={i} className="flex items-start gap-1">
                                      <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
                                      <span>{req}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {insight.missingOrUnverified.length > 0 ? (
                              <div>
                                <p className="font-semibold text-on-surface">
                                  Unverified / Missing:
                                </p>
                                <ul className="mt-0.5 space-y-0.5 text-text-muted">
                                  {insight.missingOrUnverified.map((req, i) => (
                                    <li key={i} className="flex items-start gap-1">
                                      <HelpCircle className="mt-0.5 size-3 shrink-0" />
                                      <span>{req}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {insight.whoShouldChoose ? (
                              <p className="text-on-surface-variant">
                                <strong className="text-on-surface">
                                  Best suited for:{" "}
                                </strong>
                                {insight.whoShouldChoose}
                              </p>
                            ) : null}

                            {safeBuyUrl ? (
                              <a
                                href={safeBuyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                              >
                                View merchant listing
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {/* Action CTA Footer */}
                  <div className="mt-4 flex items-center gap-2 border-t border-border-subtle pt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant={inCart || addedNow ? "secondary" : "default"}
                      onClick={() => handleAddToCart(product.id)}
                      className={cn(
                        "h-10 flex-1 rounded-xl text-xs font-semibold shadow-sm",
                        !inCart &&
                          !addedNow &&
                          "bg-primary text-on-primary hover:bg-surface-tint",
                      )}
                    >
                      {addedNow ? (
                        <>
                          <Check className="mr-1.5 size-3.5 text-secondary" />
                          In Cart (Added)
                        </>
                      ) : inCart ? (
                        <>
                          <ShoppingCart className="mr-1.5 size-3.5 text-primary" />
                          In Cart
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="mr-1.5 size-3.5" />
                          Add to Cart ({formatMoney(product.price, currency)})
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
                        "h-10 rounded-xl px-3 text-xs font-medium",
                        comparing
                          ? "border-primary/40 bg-primary-fixed text-on-primary-fixed font-semibold"
                          : "bg-surface-container lg:bg-surface-card",
                      )}
                    >
                      <Scale className="mr-1 size-3.5 text-primary" />
                      {comparing ? "Comparing" : "Compare"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {/* Comparison Guidance Note */}
        {products.length > 1 ? (
          <p className="border-t border-border-subtle pt-3 text-xs text-text-muted">
            Select <strong className="font-semibold text-on-surface">Compare</strong> on any picks to inspect documented specifications side by side in{" "}
            <strong className="font-semibold text-primary">Product Matrix</strong>.
          </p>
        ) : null}

        {/* Grounded Suggested Exploration Paths */}
        {followUps.length > 0 ? (
          <div className="space-y-2 border-t border-border-subtle pt-3">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Suggested Exploration Paths
            </span>
            <div className="flex flex-wrap gap-2">
              {followUps.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onFollowUp?.(prompt)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-low px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container hover:text-primary"
                >
                  <span
                    className="material-symbols-outlined text-[15px] text-primary"
                    aria-hidden="true"
                  >
                    psychology_alt
                  </span>
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
