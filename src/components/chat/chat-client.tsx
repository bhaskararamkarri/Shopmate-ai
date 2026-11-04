"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BotMessageSquare, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/shop/loading-state";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessageItem } from "@/components/chat/chat-message";
import { DEMO_PROMPTS } from "@/lib/demo-catalog";
import { chatStore, newMessageId, type UiMessage } from "@/lib/chat-store";
import { registerProducts } from "@/lib/store";
import {
  searchProducts,
  type ProductSearchResponse,
} from "@/lib/catalog-api";
import type { Product } from "@/types";

/** Results shown per assistant reply in the chat thread. */
const SEARCH_RESULT_LIMIT = 6;

/**
 * Composes the assistant's reply text from the API outcome. The wording is
 * derived from the response's own `source`/`fallback` metadata, so demo data
 * can never read as a live listing and a live failure never reads as success.
 */
function composeAssistantReply(
  query: string,
  response: Extract<ProductSearchResponse, { success: true }>,
): { content: string; products: Product[] } {
  const products = response.products ?? [];

  if (response.source === "channel3") {
    if (products.length === 0) {
      return {
        content: `The live Channel3 catalog has no confident match for “${query}”. Try fewer words, a brand name, or a different product — e.g. “wireless headphones”.`,
        products: [],
      };
    }
    const count =
      products.length === 1 ? "one match" : `${products.length} matches`;
    return {
      content: `Ranked picks for “${query}” — live results from the Channel3 catalog (${count}). Prices and stock come from the merchants behind each offer:`,
      products,
    };
  }

  const reason = response.fallback?.reason ?? "not_configured";
  const prefix =
    reason === "not_configured"
      ? "No live catalog key is configured, so this reply comes from the clearly labeled demo catalog."
      : "The live catalog is unavailable right now, so this reply falls back to the clearly labeled demo catalog instead.";

  if (products.length === 0) {
    return {
      content: `${prefix}\n\nNothing in the demo catalog matches “${query}” either — try one of the suggestion prompts below.`,
      products: [],
    };
  }
  return {
    content: `${prefix}\n\nClosest demo picks for “${query}” — DEMO DATA, not live listings:`,
    products,
  };
}

function scrollToBottom(node: HTMLElement | null) {
  if (!node) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  node.scrollTo({ top: node.scrollHeight, behavior: reduce ? "auto" : "smooth" });
}

/**
 * Chat experience backed by the live product catalog API. Every reply carries
 * real product records (or visibly labeled demo records on fallback); failed
 * requests surface a retry instead of a fabricated answer.
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

    chatStore.append({
      id: newMessageId(),
      role: "user",
      content: query,
      createdAt: new Date().toISOString(),
    });
    setPending(true);

    let response: ProductSearchResponse;
    try {
      response = await searchProducts({
        query,
        limit: SEARCH_RESULT_LIMIT,
        signal: controller.signal,
      });
    } catch {
      if (sendSeqRef.current !== sendId) return;
      setPending(false);
      chatStore.append({
        id: newMessageId(),
        role: "assistant",
        content:
          "Something went wrong reaching the product catalog, so there is nothing to show for that. No demo results were substituted — try again in a moment.",
        createdAt: new Date().toISOString(),
        error: "request_failed",
        retryQuery: query,
      });
      return;
    }

    if (sendSeqRef.current !== sendId) return;
    setPending(false);

    if (!response.success) {
      chatStore.append({
        id: newMessageId(),
        role: "assistant",
        content:
          response.message ??
          "That search was rejected as invalid. Try a short, plain product description.",
        createdAt: new Date().toISOString(),
      });
      return;
    }

    // Live search results must be resolvable for cart/compare actions.
    registerProducts(response.products);

    const reply = composeAssistantReply(query, response);
    chatStore.append({
      id: newMessageId(),
      role: "assistant",
      content: reply.content,
      createdAt: new Date().toISOString(),
      products: reply.products,
    });
  }, []);

  const clearConversation = useCallback(() => {
    sendSeqRef.current += 1; // invalidate in-flight continuations
    abortRef.current?.abort();
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
              Live catalog via Channel3 · labeled demo fallback · no live AI yet
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
              Describe the thing you need in plain language. Replies search the
              live Channel3 catalog and rank real merchant offers.
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
              Live listings without a Channel3 key fall back to results clearly
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
            Catalog: live via Channel3, with a labeled demo fallback · AI agent
            orchestration arrives in the next phase.
          </p>
        </div>
      </footer>
    </section>
  );
}

export type { UiMessage };
