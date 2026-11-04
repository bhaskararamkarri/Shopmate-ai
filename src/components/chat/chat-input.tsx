"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Chat composer. Enter sends, Shift+Enter adds a newline; IME-composing
 * input is never treated as a submit.
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
      className={cn("flex items-end gap-2", className)}
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
        placeholder={pending ? "ShopMate is replying…" : "Describe what you are shopping for…"}
        disabled={pending}
        enterKeyHint="send"
        autoComplete="off"
        className="min-h-11 max-h-40 rounded-xl py-2.5"
      />
      <Button
        type="submit"
        size="icon-lg"
        className="shrink-0 rounded-xl"
        disabled={pending || value.trim().length === 0}
        aria-label="Send message"
      >
        <SendHorizontal aria-hidden="true" />
      </Button>
    </form>
  );
}
