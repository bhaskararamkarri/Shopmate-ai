"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { BotMessageSquare, Eraser, MessageSquare, SlidersHorizontal, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/shop/loading-state";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessageItem } from "@/components/chat/chat-message";
import { RequirementsPanel } from "@/components/chat/requirements-panel";
import { ShortlistPanel } from "@/components/chat/shortlist-panel";
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

type MobileTab = "chat" | "requirements" | "shortlist";

/**
 * Intelligent AI Shopping Decision Workspace (Phase 3).
 *
 * 3-Column responsive layout on Desktop:
 * - Left: Shopping context, active requirements & interactive refinement chips
 * - Center: Conversation stream, natural-language dialog & clarifications
 * - Right: Live curated shortlist & evidence-backed decision insights
 *
 * Mobile layout:
 * - Fluid tabbed navigation (Chat / Requirements / Shortlist) with 0 horizontal overflow.
 */
export function ChatClient({ initialQuery }: { initialQuery?: string }) {
  const searchParams = useSearchParams();
  const effectiveQuery = initialQuery || searchParams?.get("q") || undefined;
  const messages = useSyncExternalStore(
    chatStore.subscribe,
    chatStore.getSnapshot,
    chatStore.getServerSnapshot,
  );
  const [pending, setPending] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const sendSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const autoSentRef = useRef(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Derive latest active intent, products, and recommendation insights from messages
  const latestAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (
        messages[i].role === "assistant" &&
        messages[i].products &&
        messages[i].products!.length > 0
      ) {
        return messages[i];
      }
    }
    return null;
  }, [messages]);

  const latestIntentMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].intent) {
        return messages[i];
      }
    }
    return null;
  }, [messages]);

  const shortlistedProducts = latestAssistantMessage?.products ?? [];
  const shortlistedRecommendations = latestAssistantMessage?.recommendations ?? [];
  const currentIntent = latestIntentMessage?.intent ?? null;

  const criteriaCount = useMemo(() => {
    if (!currentIntent) return 0;
    let count = 0;
    if (currentIntent.productCategory || currentIntent.category) count++;
    if (currentIntent.budgetMax !== undefined || currentIntent.budget?.amount !== undefined) count++;
    if (currentIntent.intendedUse) count++;
    if (
      (currentIntent.requiredFeatures && currentIntent.requiredFeatures.length > 0) ||
      (currentIntent.requiredSpecs && Object.keys(currentIntent.requiredSpecs).length > 0)
    ) {
      count++;
    }
    if (currentIntent.priorities && currentIntent.priorities.length > 0) count++;
    return count;
  }, [currentIntent]);

  const send = useCallback(async (text: string) => {
    const query = text.trim();
    if (!query) return;

    sendSeqRef.current += 1;
    const sendId = sendSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const currentSnapshot = chatStore.getSnapshot();
    const lastIntentMsg = [...currentSnapshot].reverse().find((m) => m.role === "assistant" && m.intent);
    const intentToSend = lastIntentMsg?.intent ?? undefined;

    const history = buildHistory(currentSnapshot);
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
        intent: intentToSend,
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

    chatStore.append({
      id: newMessageId(),
      role: "assistant",
      content: result.content,
      createdAt: new Date().toISOString(),
      products: result.products,
      productRefs: result.productIds,
      intent: result.intent,
      recommendations: result.recommendations,
      agentMeta: {
        mode: result.mode,
        model: result.model,
        toolsUsed: result.toolsUsed,
        catalog: result.catalog,
      },
    });
  }, []);

  const handleRefine = useCallback(
    (refinementQuery: string) => {
      setMobileTab("chat");
      void send(refinementQuery);
    },
    [send],
  );

  const clearConversation = useCallback(() => {
    sendSeqRef.current += 1;
    abortRef.current?.abort();
    setPending(false);
    resetConversationId();
    chatStore.replaceAll([]);
  }, []);

  // Hydrate the conversation after mount (session-scoped persistence).
  useEffect(() => {
    chatStore.hydrate();
  }, []);

  // Honor a deep-linked query (?q=...) once per mount.
  useEffect(() => {
    if (autoSentRef.current || !effectiveQuery || effectiveQuery.trim().length === 0) {
      return;
    }
    autoSentRef.current = true;
    const start = window.setTimeout(() => void send(effectiveQuery), 0);
    return () => window.clearTimeout(start);
  }, [effectiveQuery, send]);

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
    <div
      aria-label="AI shopping workspace"
      className="flex h-[calc(100svh-4rem)] w-full flex-col overflow-hidden bg-background"
    >
      {/* Top Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex w-full items-center justify-between px-4 py-2.5 md:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <BotMessageSquare className="size-4" />
            </span>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold tracking-tight text-foreground truncate">
                ShopMate Decision Workspace
              </h1>
              <p className="text-[12px] text-muted-foreground truncate hidden sm:block">
                Evaluates catalog trade-offs, budget bounds, and verified merchant offers
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearConversation}
              aria-label="Reset workspace"
              className="h-8 text-xs font-medium"
            >
              <Eraser className="size-3.5 mr-1" aria-hidden="true" />
              Reset
            </Button>
          </div>
        </div>

        {/* Mobile Segmented Navigation Tabs (< lg) */}
        <div className="flex lg:hidden border-t border-border px-4 py-1.5 bg-muted/20">
          <button
            type="button"
            onClick={() => setMobileTab("chat")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
              mobileTab === "chat"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare className="size-3.5" />
            <span>Chat</span>
            {pending && (
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileTab("requirements")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
              mobileTab === "requirements"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <SlidersHorizontal className="size-3.5" />
            <span>Context</span>
            {criteriaCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {criteriaCount}
              </Badge>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileTab("shortlist")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
              mobileTab === "shortlist"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Award className="size-3.5" />
            <span>Shortlist</span>
            {shortlistedProducts.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {shortlistedProducts.length}
              </Badge>
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Requirements & Refinements (Desktop) */}
        <div className="hidden lg:block w-72 xl:w-80 shrink-0 border-r border-border h-full overflow-hidden">
          <RequirementsPanel
            intent={currentIntent}
            onRefine={handleRefine}
            pending={pending}
          />
        </div>

        {/* Center Column: Conversation & Dialogue */}
        <div
          className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden ${
            mobileTab !== "chat" ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Scrollable Message List */}
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
                  ShopMate Decision Workspace
                </h2>
                <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground">
                  Tell ShopMate what you need. It explores verified catalog items, weighs trade-offs, and recommends what you should buy and why.
                </p>
                <ul className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                  {DEMO_PROMPTS.map((prompt) => (
                    <li key={prompt}>
                      <button
                        type="button"
                        onClick={() => void send(prompt)}
                        className="h-full w-full rounded-xl border border-border bg-card px-4 py-3 text-left text-xs leading-snug text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                      >
                        {prompt}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-[12px] text-muted-foreground">
                  Grounded in live Channel3 listings with honest fallback transparency.
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

          {/* Chat Input Footer */}
          <footer className="border-t border-border bg-background/95 backdrop-blur-sm p-3 md:px-6">
            <div className="mx-auto w-full max-w-2xl">
              <ChatInput
                pending={pending}
                onSubmit={(value) => void send(value)}
              />
              <p className="mt-1.5 text-center text-[12px] text-muted-foreground">
                All recommendations are evidenced by real catalog specs, prices, and merchant offers.
              </p>
            </div>
          </footer>
        </div>

        {/* Right Column: Live Shortlist & Decision Insights (Desktop) */}
        <div className="hidden lg:block w-80 xl:w-96 shrink-0 border-l border-border h-full overflow-hidden">
          <ShortlistPanel
            products={shortlistedProducts}
            recommendations={shortlistedRecommendations}
            pending={pending}
          />
        </div>

        {/* Mobile View: Requirements Panel */}
        {mobileTab === "requirements" && (
          <div className="flex-1 lg:hidden h-full overflow-hidden">
            <RequirementsPanel
              intent={currentIntent}
              onRefine={handleRefine}
              pending={pending}
            />
          </div>
        )}

        {/* Mobile View: Shortlist Panel */}
        {mobileTab === "shortlist" && (
          <div className="flex-1 lg:hidden h-full overflow-hidden">
            <ShortlistPanel
              products={shortlistedProducts}
              recommendations={shortlistedRecommendations}
              pending={pending}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export type { UiMessage };
