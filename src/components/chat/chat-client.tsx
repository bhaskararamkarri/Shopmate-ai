"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BotMessageSquare, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/shop/loading-state";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessageItem } from "@/components/chat/chat-message";
import { DEMO_PROMPTS } from "@/lib/demo-catalog";
import { buildAssistantReply } from "@/lib/mock-assistant";
import { chatStore, newMessageId } from "@/lib/chat-store";

/** Mock "thinking" latency, so the interaction reads like the real thing. */
const REPLY_DELAY_MS = 1100;

function scrollToBottom(node: HTMLElement | null) {
  if (!node) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  node.scrollTo({ top: node.scrollHeight, behavior: reduce ? "auto" : "smooth" });
}

/**
 * Frontend-only chat experience. A deterministic mock responder stands in for
 * the Phase 3 AI layer; replies draw only from the demo catalog.
 */
export function ChatClient({ initialQuery }: { initialQuery?: string }) {
  const messages = useSyncExternalStore(
    chatStore.subscribe,
    chatStore.getSnapshot,
    chatStore.getServerSnapshot,
  );
  const [pending, setPending] = useState(false);
  const replyTimerRef = useRef<number | null>(null);
  const autoSentRef = useRef(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const send = useCallback((text: string) => {
    const query = text.trim();
    if (!query) return;

    chatStore.append({
      id: newMessageId(),
      role: "user",
      content: query,
      createdAt: new Date().toISOString(),
    });
    setPending(true);

    if (replyTimerRef.current !== null) {
      window.clearTimeout(replyTimerRef.current);
    }
    replyTimerRef.current = window.setTimeout(() => {
      replyTimerRef.current = null;
      const reply = buildAssistantReply(query);
      chatStore.append({
        id: newMessageId(),
        role: "assistant",
        content: reply.content,
        createdAt: new Date().toISOString(),
        productRefs: reply.productRefs,
      });
      setPending(false);
    }, REPLY_DELAY_MS);
  }, []);

  const clearConversation = useCallback(() => {
    if (replyTimerRef.current !== null) {
      window.clearTimeout(replyTimerRef.current);
      replyTimerRef.current = null;
    }
    setPending(false);
    chatStore.replaceAll([]);
  }, []);

  // Hydrate the conversation after mount (session-scoped persistence).
  useEffect(() => {
    chatStore.hydrate();
  }, []);

  // Honor a deep-linked query (?q=...) once per mount.
  useEffect(() => {
    if (autoSentRef.current || !initialQuery || initialQuery.trim().length === 0) {
      return;
    }
    autoSentRef.current = true;
    // Deferred one tick so the effect body stays a pure external-system update.
    const start = window.setTimeout(() => send(initialQuery), 0);
    return () => window.clearTimeout(start);
  }, [initialQuery, send]);

  useEffect(() => {
    scrollToBottom(scrollerRef.current);
  }, [messages, pending]);

  useEffect(() => {
    return () => {
      if (replyTimerRef.current !== null) {
        window.clearTimeout(replyTimerRef.current);
      }
    };
  }, []);

  const showEmptyState = messages.length === 0 && !pending;

  return (
    <section
      aria-label="AI shopping chat"
      className="flex h-[calc(100svh-4rem)] w-full flex-col"
    >
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
              AI Shopping Assistant
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Demo assistant · mock catalog · no live AI or retailer feed
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearConversation}
            aria-label="Clear conversation"
          >
            <Eraser aria-hidden="true" />
            Clear
          </Button>
        </div>
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-6 md:px-6"
      >
        {showEmptyState ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-4 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <BotMessageSquare className="size-6" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
              What are you shopping for?
            </h2>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              Describe the thing you need in plain language. The demo assistant
              answers with ranked picks pulled from the mock catalog.
            </p>
            <ul className="mt-7 grid w-full gap-2 sm:grid-cols-2">
              {DEMO_PROMPTS.map((prompt) => (
                <li key={prompt}>
                  <button
                    type="button"
                    onClick={() => send(prompt)}
                    className="h-full w-full rounded-xl border border-border bg-card px-4 py-3 text-left text-sm leading-snug text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {prompt}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-7 text-[13px] text-muted-foreground">
              Mock responses only — replies, prices and listings are demo data,
              not live inventory.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            {messages.map((message) => (
              <ChatMessageItem key={message.id} message={message} />
            ))}
            {pending ? (
              <LoadingState variant="chat-bubble" className="mx-auto w-full max-w-2xl" />
            ) : null}
          </div>
        )}
      </div>

      <footer className="border-t border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-6">
          <ChatInput pending={pending} onSubmit={send} />
          <p className="mt-2 text-center text-[13px] text-muted-foreground">
            Frontier-model and catalog integration arrive in Phase 3.
          </p>
        </div>
      </footer>
    </section>
  );
}
