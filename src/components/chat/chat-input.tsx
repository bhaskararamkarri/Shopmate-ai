"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Stitch Tier-3 floating glass chat composer.
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
    <form
      className={cn(
        "stitch-tier-3 flex items-end gap-2 rounded-2xl border border-input bg-card/95 p-1.5 backdrop-blur-xl",
        className,
      )}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
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
            : "Ask ShopMate what you are shopping for…"
        }
        disabled={pending}
        enterKeyHint="send"
        autoComplete="off"
        className="min-h-11 max-h-40 border-0 bg-transparent py-2.5 shadow-none focus-visible:ring-0"
      />
      <Button
        type="submit"
        size="icon-lg"
        className="shrink-0 rounded-xl shadow-xs"
        disabled={pending || value.trim().length === 0}
        aria-label="Send message"
      >
        <SendHorizontal aria-hidden="true" />
      </Button>
    </form>
  );
}
