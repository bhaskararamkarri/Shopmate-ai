"use client";

import { Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import type { ChatMessage, Product } from "@/types";
import { getDemoProduct } from "@/lib/demo-catalog";
import { CompactProductCard } from "@/components/shop/product-card";
import { Button } from "@/components/ui/button";
import { TypingDots } from "@/components/chat/typing-dots";

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
        "grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary",
        className,
      )}
    >
      <Sparkles className="size-3.5" />
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
 * One conversation row. User messages render as compact inked bubbles;
 * assistant replies render with their attached live or demo product cards.
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
        <div className="max-w-[85%] rounded-xl bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-foreground sm:max-w-[75%]">
          {message.content}
        </div>
      </div>
    );
  }

  const products = resolveMessageProducts(message);
  const failed = Boolean(message.error);

  return (
    <div className="flex gap-3" role="listitem" aria-label="ShopMate assistant">
      <Avatar className={failed ? "bg-destructive/10 text-destructive" : undefined} />
      <div className="min-w-0 max-w-full flex-1 space-y-3 rounded-xl border border-border bg-card px-4 py-3.5">
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

        {failed && onRetry && message.retryQuery ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-destructive/5 px-3 py-2.5">
            <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
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
          <ul className="grid gap-3 sm:grid-cols-2" aria-label="Recommended products">
            {products.map((product) => (
              <li key={product.id} className="min-w-0">
                <CompactProductCard product={product} />
              </li>
            ))}
          </ul>
        ) : null}

        {products.length > 1 ? (
          <p className="border-t border-border pt-3 text-[13px] leading-relaxed text-muted-foreground">
            Pin a few of these with the compare control, then open the
            comparison table to see every spec side by side.
          </p>
        ) : null}
      </div>
    </div>
  );
}
