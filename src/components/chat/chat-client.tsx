"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BotMessageSquare, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/shop/loading-state";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessageItem } from "@/components/chat/chat-message";
import { DEMO_PROMPTS } from "@/lib/demo-catalog";
import {
  chatStore,
  getConversationId,
  newMessageId,
  resetConversationId,
  type UiMessage,
} from "@/lib/chat-store";
import { registerProducts } from "@/lib/store";
import { sendChatMessage } from "@/lib/chat-api";
import { buildHistory } from "@/lib/chat-history";
import type { ShoppingIntentSummary } from "@/types";
import type { ChatApiFailure, ChatApiSuccess } from "@/lib/agent/chat-contract";

/** Maps a typed API failure to an honest assistant row, with retry where useful. */
function failureReply(failure: ChatApiFailure, query: string) {
  if (failure.error === "rate_limited") {
    const wait = failure.retryAfterSec ?? 60;
    return {
      content: `You're sending messages faster than the chat allows — give it about ${wait}s and try again. Nothing was searched in the meantime.`,
      error: "request_failed" as const,
      retryQuery: query,
    };
  }
  if (failure.error === "ai_unavailable") {
    return {
      content:
        failure.message ??
        "The AI service couldn't complete that turn. Nothing was fabricated to fill the gap — try again shortly.",
      error: "request_failed" as const,
      retryQuery: query,
    };
  }
  return {
    content:
      failure.message ??
      "That request was rejected as invalid. Try a short, plain product description.",
  };
}

function scrollToBottom(node: HTMLElement | null) {
  if (!node) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  node.scrollTo({ top: node.scrollHeight, behavior: reduce ? "auto" : "smooth" });
}

/**
 * Chat experience backed by the AI shopping agent (POST /api/chat). Replies
 * carry grounded product records ranked by the deterministic engine; the
 * agent's provenance (mode, model, catalog source) travels with every reply
 * and failed requests surface a retry instead of a fabricated answer.
 */
export function ChatClient({ initialQuery }: { initialQuery?: string }) {
  const messages = useSyncExternalStore(
    chatStore.subscribe,
    chatStore.getSnapshot,
    chatStore.getServerSnapshot,
  );
  const [pending, setPending] = useState(false);
  const sendSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const autoSentRef = useRef(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const intentRef = useRef<ShoppingIntentSummary | null>(null);

  const send = useCallback(async (text: string) => {
    const query = text.trim();
    if (!query) return;

    // A newer send supersedes an in-flight one: bump the sequence, abort its
    // fetch, and let the old continuation no-op.
    sendSeqRef.current += 1;
    const sendId = sendSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // History must be captured BEFORE the user message is appended: the
    // message travels separately as `message`, and including it in both
    // places would send the identical turn to the model twice.
    const history = buildHistory(chatStore.getSnapshot());
    chatStore.append({
      id: newMessageId(),
      role: "user",
      content: query,
      createdAt: new Date().toISOString(),
    });
    setPending(true);

    let result: ChatApiSuccess | ChatApiFailure;
    try {
      result = await sendChatMessage({
        conversationId: getConversationId(),
        history,
        message: query,
        intent: intentRef.current ?? undefined,
        signal: controller.signal,
      });
    } catch {
      if (sendSeqRef.current !== sendId) return;
      setPending(false);
      chatStore.append({
        id: newMessageId(),
        role: "assistant",
        content:
          "Something went wrong reaching the shopping agent, so there is nothing to show for that. No results were substituted — try again in a moment.",
        createdAt: new Date().toISOString(),
        error: "request_failed",
        retryQuery: query,
      });
      return;
    }

    if (sendSeqRef.current !== sendId) return;
    setPending(false);

    if (!result.success) {
      const reply = failureReply(result, query);
      chatStore.append({
        id: newMessageId(),
        role: "assistant",
        content: reply.content,
        createdAt: new Date().toISOString(),
        ...(reply.error ? { error: reply.error, retryQuery: reply.retryQuery } : {}),
      });
      return;
    }

    // Only tool-verified products reach the UI; register them so cart and
    // compare actions can resolve the ids.
    registerProducts(result.products);

    // Keep the accumulated intent for the next turn's context.
    intentRef.current = result.intent;

    chatStore.append({
      id: newMessageId(),
      role: "assistant",
      content: result.content,
      createdAt: new Date().toISOString(),
      products: result.products,
      productRefs: result.productIds,
      intent: result.intent,
      agentMeta: {
        mode: result.mode,
        model: result.model,
        toolsUsed: result.toolsUsed,
        catalog: result.catalog,
      },
    });
  }, []);

  const clearConversation = useCallback(() => {
    sendSeqRef.current += 1; // invalidate in-flight continuations
    abortRef.current?.abort();
    setPending(false);
    intentRef.current = null;
    resetConversationId();
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
    const start = window.setTimeout(() => void send(initialQuery), 0);
    return () => window.clearTimeout(start);
  }, [initialQuery, send]);

  useEffect(() => {
    scrollToBottom(scrollerRef.current);
  }, [messages, pending]);

  useEffect(() => {
    return () => {
      sendSeqRef.current += 1;
      abortRef.current?.abort();
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
              Grounded in the live Channel3 catalog · demo fallback always labeled
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
              Describe the thing you need in plain language. The agent searches
              the live Channel3 catalog, filters fuzzy matches, and ranks real
              merchant offers.
            </p>
            <ul className="mt-7 grid w-full gap-2 sm:grid-cols-2">
              {DEMO_PROMPTS.map((prompt) => (
                <li key={prompt}>
                  <button
                    type="button"
                    onClick={() => void send(prompt)}
                    className="h-full w-full rounded-xl border border-border bg-card px-4 py-3 text-left text-sm leading-snug text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {prompt}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-7 text-[13px] text-muted-foreground">
              Without an AI key the agent still searches the catalog with
              keyword matching; without a Channel3 key results are clearly
              labeled as demo data.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            {messages.map((message) => (
              <ChatMessageItem
                key={message.id}
                message={message}
                onRetry={send}
              />
            ))}
            {pending ? (
              <LoadingState
                variant="product-grid"
                className="mx-auto w-full max-w-xl"
              />
            ) : null}
          </div>
        )}
      </div>

      <footer className="border-t border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-6">
          <ChatInput pending={pending} onSubmit={(value) => void send(value)} />
          <p className="mt-2 text-center text-[13px] text-muted-foreground">
            AI answers are grounded in live catalog data — product facts come
            only from real records, never from the model.
          </p>
        </div>
      </footer>
    </section>
  );
}

export type { UiMessage };
