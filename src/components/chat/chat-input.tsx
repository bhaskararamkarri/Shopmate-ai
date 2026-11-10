"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Stitch Tier-3 floating glass omni-prompt dock.
 * Enter sends, Shift+Enter inserts a newline; IME composition is respected.
 */
export function ChatInput({
  pending,
  className,
  onSubmit,
}: {
  pending: boolean;
  className?: string;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!pending) {
      textareaRef.current?.focus();
    }
  }, [pending]);

  function send() {
    const text = value.trim();
    if (!text || pending) return;
    setValue("");
    onSubmit(text);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  }

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      <form
        className="stitch-tier-3 flex flex-col gap-1.5 rounded-2xl border border-border-strong/70 bg-surface-card/95 p-2 shadow-[0_12px_32px_rgba(19,22,39,0.08)] backdrop-blur-xl transition-all focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <div className="flex items-center gap-1.5 px-2 pt-0.5 lg:hidden">
          <span
            className={cn(
              "size-1.5 rounded-full bg-primary",
              pending ? "animate-ping" : "opacity-80",
            )}
            aria-hidden="true"
          />
          <span className="font-mono text-[11px] font-medium text-primary">
            {pending
              ? "ShopMate Engine is evaluating..."
              : "Ask follow-up or provide constraint"}
          </span>
        </div>

        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Message the shopping assistant
          </label>
          <Textarea
            id="chat-input"
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              pending
                ? "ShopMate is evaluating catalog options…"
                : "Ask follow-up, drill into specs, or refine your budget..."
            }
            disabled={pending}
            enterKeyHint="send"
            autoComplete="off"
            className="min-h-10 max-h-36 flex-1 resize-none border-0 bg-surface-container-low/60 px-3 py-2 text-[14px] text-on-surface shadow-none placeholder:text-text-muted focus-visible:ring-0 lg:bg-transparent lg:px-2"
          />

          <div className="hidden items-center gap-1 rounded-lg bg-surface-container px-2.5 py-1.5 text-[11px] font-medium text-on-surface-variant sm:flex">
            <span
              className="material-symbols-outlined text-[14px] text-primary"
              aria-hidden="true"
            >
              tune
            </span>
            <span>Decision Engine</span>
          </div>

          <Button
            type="submit"
            size="icon"
            className="size-10 shrink-0 rounded-xl bg-primary text-on-primary shadow-sm hover:bg-surface-tint disabled:opacity-45"
            disabled={pending || value.trim().length === 0}
            aria-label="Send message"
          >
            <span
              className="material-symbols-outlined text-[20px]"
              aria-hidden="true"
            >
              arrow_upward
            </span>
          </Button>
        </div>

        <div className="hidden items-center justify-between px-2 pb-0.5 text-[11px] text-text-muted sm:flex">
          <span>Press Enter to query ShopMate Engine</span>
          <span>Shift + Enter for multi-line constraints</span>
        </div>
      </form>
    </div>
  );
}
