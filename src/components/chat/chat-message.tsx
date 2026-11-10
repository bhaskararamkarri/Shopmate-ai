"use client";

import { TriangleAlert } from "lucide-react";
import { cn } from "cn";
import type { ChatMessage, Product } from "@/types";
import { getDemoProduct } from "@/lib/demo-catalog";
import { CompactProductCard } from "@/components/shop/product-card";
import { Button } from "@/components/ui/button";
import { TypingDots } from "@/components/chat/typing-dots";
import { ShopMateLogo } from "@/components/brand/logo";

export interface UiMessage extends ChatMessage {
  /** Shown while the assistant reply is still composing. */
  pending?: boolean;
  /** Set when the reply failed; the row offers a retry. */
  error?: string;
  /** Query to re-run on retry. */
  retryQuery?: string;
}

function Avatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-xl border border-primary/20 bg-secondary text-primary shadow-2xs",
        className,
      )}
    >
      <ShopMateLogo variant="icon" size="sm" className="size-5" />
    </span>
  );
}

/**
 * Resolves the product records attached to a reply. Current messages carry
 * their own `products`; legacy persisted messages reference demo-only ids.
 */
function resolveMessageProducts(message: UiMessage): Product[] {
  if (message.products && message.products.length > 0) {
    return message.products;
  }
  return (message.productRefs ?? [])
    .map((id) => getDemoProduct(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
}

/**
 * Stitch message row.
 * User messages sit inside crisp Deep Indigo bubbles (#131627);
 * Assistant responses sit inside Tier-1 pure white cards with inline product shortlists.
 */
export function ChatMessageItem({
  message,
  onRetry,
}: {
  message: UiMessage;
  onRetry?: (query: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end" role="listitem" aria-label="You">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#131627] px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-xs sm:max-w-[75%]">
          {message.content}
        </div>
      </div>
    );
  }

  const products = resolveMessageProducts(message);
  const failed = Boolean(message.error);

  return (
    <div className="flex gap-3" role="listitem" aria-label="ShopMate assistant">
      <Avatar
        className={
          failed
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : undefined
        }
      />
      <div className="stitch-tier-1 min-w-0 max-w-full flex-1 space-y-3.5 rounded-2xl border border-border bg-card px-4 py-4 sm:px-5">
        {message.pending && message.content === "" ? (
          <TypingDots />
        ) : (
          <div className="space-y-3">
            {message.content.split("\n\n").map((paragraph, index) => (
              <p
                key={index}
                className="text-[15px] leading-relaxed text-foreground"
              >
                {paragraph}
              </p>
            ))}
          </div>
        )}

        {message.intent && message.intent.clarifications.length > 0 ? (
          <div className="rounded-xl border border-primary/15 bg-secondary/75 px-3.5 py-2.5">
            <p className="text-[13px] font-semibold text-foreground">
              To narrow this down:
            </p>
            <ul className="mt-1.5 space-y-1">
              {message.intent.clarifications.map((question) => (
                <li
                  key={question}
                  className="text-[13px] leading-relaxed text-muted-foreground"
                >
                  • {question}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {failed && onRetry && message.retryQuery ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-2.5">
            <TriangleAlert
              className="size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted-foreground">
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

        {products.length > 0 ? (
          <ul
            className="grid gap-3 sm:grid-cols-2"
            aria-label="Recommended products"
          >
            {products.map((product) => (
              <li key={product.id} className="min-w-0">
                <CompactProductCard product={product} />
              </li>
            ))}
          </ul>
        ) : null}

        {products.length > 1 ? (
          <p className="border-t border-border pt-3 text-[13px] leading-relaxed text-muted-foreground">
            Pin a few of these with <strong className="font-semibold text-foreground">Compare</strong>, then open{" "}
            <strong className="font-semibold text-primary">Product Matrix</strong> to inspect every documented specification side by side.
          </p>
        ) : null}

        {message.agentMeta ? (
          <p className="border-t border-border pt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {message.agentMeta.mode === "keyword_fallback"
              ? "Keyword fallback (AI not configured)"
              : `AI agent${message.agentMeta.model ? ` · ${message.agentMeta.model}` : ""}`}
            {" · Catalog: "}
            {message.agentMeta.catalog.source === "channel3"
              ? "live Channel3"
              : "demo fallback"}
            {message.agentMeta.catalog.fallback
              ? ` (${message.agentMeta.catalog.fallback})`
              : ""}
            {message.agentMeta.toolsUsed.length > 0
              ? ` · Tools: ${message.agentMeta.toolsUsed.join(", ")}`
              : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
