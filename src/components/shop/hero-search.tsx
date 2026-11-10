"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DEFAULT_SHOPPING_PROMPTS = [
  "Noise-canceling headphones under $250",
  "Multi-device mechanical keyboard",
  "Long-battery fitness tracker",
  "Handheld 4K creator camera",
];

/**
 * Stitch Tier-3 glass omni-search bar on the homepage.
 * Submits navigate directly into `/chat?q=...`.
 */
export function HeroSearch({
  prompts,
  className,
  idPrefix = "hero",
  placeholder = "Describe what you need, your budget, or key specs...",
  ctaText = "Run Analysis",
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
    <div className={cn("space-y-4", className)}>
      <form
        role="search"
        aria-label="ShopMate AI natural language shopping search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className="stitch-tier-3 flex flex-col gap-2 rounded-2xl border border-input/90 bg-card/90 p-2 backdrop-blur-xl sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-primary"
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
            className="h-12 border-0 bg-transparent pl-11 pr-11 text-base shadow-none focus-visible:ring-0"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 grid h-6 min-w-6 -translate-y-1/2 select-none place-items-center rounded-md border border-border bg-muted px-1.5 font-mono text-[11px] leading-none text-muted-foreground"
          >
            /
          </kbd>
        </div>
        <Button
          type="submit"
          className="h-12 rounded-xl px-6 text-sm font-semibold shadow-sm sm:w-auto"
          disabled={value.trim().length === 0}
        >
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          <span>{ctaText}</span>
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Try asking:
        </span>
        {chips.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => submit(prompt)}
            className="inline-flex min-h-8 items-center rounded-full border border-border bg-card px-3 py-1 text-left text-xs font-medium text-muted-foreground shadow-2xs transition-all hover:border-primary/40 hover:bg-secondary hover:text-primary"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
