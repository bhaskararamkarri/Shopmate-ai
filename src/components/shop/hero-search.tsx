"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DEFAULT_SHOPPING_PROMPTS = [
  "Noise-canceling headphones < $250",
  "Multi-device mechanical keyboard",
  "Long-battery fitness tracker",
  "Handheld 4K creator camera",
];

/**
 * Plain-language natural-search input used on the homepage and in the closing CTA.
 * Submits navigate to the chat workspace with the query prefilled.
 */
export function HeroSearch({
  prompts,
  className,
  idPrefix = "hero",
  placeholder = "Describe what you need, your budget, or key requirements...",
  ctaText = "Find my best match",
}: {
  prompts?: string[];
  className?: string;
  idPrefix?: string;
  placeholder?: string;
  ctaText?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const chips = prompts ?? DEFAULT_SHOPPING_PROMPTS;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function submit(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/chat?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className={cn("space-y-3.5", className)}>
      <form
        role="search"
        aria-label="ShopMate AI natural language shopping search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className="flex flex-col gap-2.5 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <label htmlFor={`${idPrefix}-search`} className="sr-only">
            {placeholder}
          </label>
          <Input
            id={`${idPrefix}-search`}
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className="h-13 rounded-xl border-border bg-card/80 pl-12 pr-12 text-base shadow-inner backdrop-blur-sm transition-colors focus-visible:border-primary focus-visible:ring-primary/30"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-3.5 top-1/2 grid h-6 min-w-6 -translate-y-1/2 select-none place-items-center rounded-md border border-border bg-secondary px-1.5 font-mono text-[12px] leading-none text-muted-foreground"
          >
            /
          </kbd>
        </div>
        <Button
          type="submit"
          className="h-13 rounded-xl px-7 text-base font-medium shadow-md shadow-primary/20 sm:w-auto"
          disabled={value.trim().length === 0}
        >
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          <span>{ctaText}</span>
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <span className="text-[13px] font-medium text-muted-foreground/80">Try asking:</span>
        {chips.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => submit(prompt)}
            className="inline-flex min-h-8 items-center rounded-lg border border-border bg-card/60 px-3 py-1 text-left text-[13px] text-muted-foreground transition-all hover:border-primary/40 hover:bg-secondary/60 hover:text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
