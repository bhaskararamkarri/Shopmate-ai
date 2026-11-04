"use client";

import { cn } from "cn";

/** Three-dot "assistant is thinking" indicator, fully static under reduced motion. */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 py-1", className)}
      role="status"
      aria-label="Assistant is thinking"
    >
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="motion-safe:animate-pulse size-1.5 rounded-full bg-foreground/40"
            style={{ animationDelay: `${dot * 160}ms` }}
          />
        ))}
      </span>
    </span>
  );
}
