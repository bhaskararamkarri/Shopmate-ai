"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "cn";

const DEFAULT_SHOPPING_PROMPTS = [
  { label: "Noise-canceling headphones under $250", icon: "headphones" },
  { label: "Multi-device mechanical keyboard", icon: "keyboard" },
  { label: "Long-battery fitness tracker", icon: "watch" },
  { label: "Handheld 4K creator camera", icon: "photo_camera" },
] as const;

/**
 * Stitch Tier-3 Glass Omni-Search Bar (`03` Mobile, `06` Desktop).
 * Submits natural-language criteria directly to `/chat?q=...`.
 */
export function HeroSearch({
  prompts,
  className,
  idPrefix = "hero",
  placeholder = "Ask anything (e.g. Compare ANC headphones under $250 for travel)...",
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

  const chips = prompts
    ? prompts.map((label) => ({ label, icon: "auto_awesome" }))
    : DEFAULT_SHOPPING_PROMPTS;

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
    <div className={cn("w-full", className)}>
      <form
        role="search"
        aria-label="ShopMate AI natural language shopping search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className="stitch-tier-3 relative rounded-2xl border border-outline-variant/40 bg-surface-card/95 p-2 backdrop-blur-xl transition-all"
      >
        {/* Top Input Bar */}
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-primary-container">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[20px]"
            >
              smart_toy
            </span>
          </div>

          <label htmlFor={`${idPrefix}-search`} className="sr-only">
            {placeholder}
          </label>
          <input
            id={`${idPrefix}-search`}
            ref={inputRef}
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-on-surface placeholder:text-text-muted focus:outline-none sm:text-[15px]"
          />

          {/* Decision Engine Status Chip */}
          <div className="hidden items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-1 font-heading text-[11px] font-semibold whitespace-nowrap text-on-surface-variant md:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-container" />
            <span>Decision Engine</span>
          </div>

          {value.length > 0 ? (
            <button
              type="button"
              aria-label="Clear search query"
              onClick={() => setValue("")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                close
              </span>
            </button>
          ) : (
            <kbd
              aria-hidden="true"
              className="pointer-events-none hidden h-6 min-w-6 select-none place-items-center rounded border border-border-subtle bg-surface-container-low px-1.5 font-mono text-[11px] text-text-muted sm:grid"
            >
              /
            </kbd>
          )}

          {/* Submit CTA (compact circle on mobile 03, pill on desktop 06) */}
          <button
            type="submit"
            disabled={value.trim().length === 0}
            aria-label="Synthesize shopping recommendation"
            className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary-container px-3 font-heading text-xs font-semibold text-on-primary shadow-sm transition-all hover:bg-primary disabled:cursor-not-allowed disabled:opacity-45 sm:px-4"
          >
            <span className="hidden sm:inline">Synthesize</span>
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[17px]"
            >
              arrow_forward
            </span>
          </button>
        </div>

        {/* Integrated Suggested Prompts Row */}
        <div className="mt-1.5 flex items-center gap-2 overflow-x-auto border-t border-border-subtle/80 px-2 pb-1 pt-2 no-scrollbar sm:flex-wrap sm:overflow-visible">
          <span className="shrink-0 font-heading text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Suggested:
          </span>
          {chips.map((prompt) => (
            <button
              key={prompt.label}
              type="button"
              onClick={() => submit(prompt.label)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-container-low px-2.5 py-1 font-mono text-[11px] font-medium text-on-surface-variant transition-colors hover:bg-primary-fixed hover:text-primary"
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[14px] text-primary"
              >
                {prompt.icon}
              </span>
              <span>{prompt.label}</span>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
