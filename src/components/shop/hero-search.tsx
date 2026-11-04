"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_PROMPTS } from "@/lib/demo-catalog";

/**
 * Plain-language product search used on the homepage and in the closing CTA.
 * Submits navigate to the chat page with the query prefilled.
 */
export function HeroSearch({
  prompts,
  className,
  idPrefix = "hero",
}: {
  prompts?: string[];
  className?: string;
  idPrefix?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const chips = (prompts ?? DEMO_PROMPTS).slice(0, 3);

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
    <div className={cn("space-y-3", className)}>
      <form
        role="search"
        aria-label="ShopMate AI shopping search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <label htmlFor={`${idPrefix}-search`} className="sr-only">
            Describe what you are shopping for
          </label>
          <Input
            id={`${idPrefix}-search`}
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Describe what you are shopping for"
            autoComplete="off"
            className="h-12 rounded-xl pl-11 pr-10 text-base"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-3.5 top-1/2 grid h-5 min-w-5 -translate-y-1/2 select-none place-items-center rounded-md border border-border bg-secondary px-1 font-mono text-[13px] leading-none text-muted-foreground"
          >
            /
          </kbd>
        </div>
        <Button
          type="submit"
          className="h-12 rounded-xl px-6 sm:w-auto"
          disabled={value.trim().length === 0}
        >
          Ask ShopMate
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {chips.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => submit(prompt)}
            className="inline-flex min-h-8 w-max items-center rounded-lg border border-border bg-card px-3 py-1 text-center text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
