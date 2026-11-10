"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSearchParams } from "next/navigation";
import { Award, Check, Eraser, MessageSquare, SlidersHorizontal } from "lucide-react";
import { cn } from "cn";
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
  if (!node || typeof node.scrollTo !== "function") return;
  const reduce =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  node.scrollTo({ top: node.scrollHeight, behavior: reduce ? "auto" : "smooth" });
}

type MobileTab = "chat" | "requirements" | "shortlist";

/**
 * Intelligent AI Shopping Decision Workspace (Stitch Desktop 07 / Mobile 02).
 *
 * Strictly 2-column responsive light layout on Desktop:
 * - Left (lg:col-span-4 xl:col-span-3): Active stream, constraints, extracted catalog metrics
 * - Right (lg:col-span-8 xl:col-span-9): Wide chat stream with 2-up inline Synthesis Cards + floating omni-prompt dock
 * - Mobile (< lg): Segmented Chat | Context | Shortlist tabs with ShortlistPanel rendered on-demand
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
  const [exportedFeedback, setExportedFeedback] = useState(false);
  const sendSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const autoSentRef = useRef(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

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
  const shortlistedRecommendations =
    latestAssistantMessage?.recommendations ?? [];
  const currentIntent = latestIntentMessage?.intent ?? null;

  const activeTopic =
    currentIntent?.productCategory ||
    currentIntent?.category ||
    currentIntent?.query ||
    "Decision Workspace";

  const criteriaCount = useMemo(() => {
    if (!currentIntent) return 0;
    let count = 0;
    if (currentIntent.productCategory || currentIntent.category) count++;
    if (
      currentIntent.budgetMax !== undefined ||
      currentIntent.budget?.amount !== undefined
    )
      count++;
    if (currentIntent.intendedUse) count++;
    if (
      (currentIntent.requiredFeatures &&
        currentIntent.requiredFeatures.length > 0) ||
      (currentIntent.requiredSpecs &&
        Object.keys(currentIntent.requiredSpecs).length > 0)
    ) {
      count++;
    }
    if (currentIntent.priorities && currentIntent.priorities.length > 0)
      count++;
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
    const lastIntentMsg = [...currentSnapshot]
      .reverse()
      .find((m) => m.role === "assistant" && m.intent);
    const intentToSend = lastIntentMsg?.intent ?? undefined;

    const recentProductIds = Array.from(
      new Set(
        currentSnapshot
          .flatMap((m) => (m.products || []).map((p) => p.id))
          .filter((id): id is string => Boolean(id)),
      ),
    ).slice(-16);

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
        contextProductIds: recentProductIds,
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
        ...(reply.error
          ? { error: reply.error, retryQuery: reply.retryQuery }
          : {}),
      });
      return;
    }

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

  const handleExportThread = useCallback(() => {
    if (messages.length === 0) return;
    const markdown = messages
      .map((m) => `### ${m.role === "user" ? "You" : "ShopMate Copilot"}\n${m.content}`)
      .join("\n\n");
    try {
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `shopmate-thread-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setExportedFeedback(true);
      setTimeout(() => setExportedFeedback(false), 1800);
    } catch {
      // Ignore export errors cleanly
    }
  }, [messages]);

  useEffect(() => {
    chatStore.hydrate();
  }, []);

  useEffect(() => {
    if (
      autoSentRef.current ||
      !effectiveQuery ||
      effectiveQuery.trim().length === 0
    ) {
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
      data-canvas="workspace"
      aria-label="AI shopping workspace"
      className="flex h-[calc(100svh-8rem)] w-full flex-col overflow-hidden bg-surface lg:h-[calc(100svh-4rem)]"
    >
      {/* Top Meta Ribbon (Desktop 07) & Active Research Bar (Mobile 02) */}
      <header className="shrink-0 border-b border-border-subtle bg-surface-container-low lg:bg-surface">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 px-4 py-2.5 md:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-container-high px-2.5 py-1 text-[10px] font-semibold tracking-wide text-primary sm:text-[11px]">
              <span
                className="material-symbols-outlined text-[14px]"
                aria-hidden="true"
              >
                psychology
              </span>
              <span className="sm:hidden">WORKSPACE</span>
              <span className="hidden sm:inline">SHOPMATE WORKSPACE</span>
            </span>
            <span className="hidden text-xs text-text-muted sm:inline">/</span>
            <h1 className="truncate text-sm font-semibold tracking-tight text-on-surface md:text-base">
              {activeTopic}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-md bg-surface-container-low px-2.5 py-1 font-mono text-[11px] text-text-muted md:flex">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  pending ? "animate-pulse bg-primary" : "bg-secondary",
                )}
                aria-hidden="true"
              />
              <span>{pending ? "Evaluating…" : "Decision Engine Ready"}</span>
            </div>

            <button
              type="button"
              onClick={handleExportThread}
              disabled={messages.length === 0}
              className="hidden items-center gap-1 rounded-md border border-border-subtle bg-surface-card px-2.5 py-1 text-xs font-medium text-on-surface-variant shadow-2xs transition-colors hover:bg-surface-container disabled:opacity-45 sm:inline-flex"
            >
              {exportedFeedback ? (
                <>
                  <Check className="size-3.5 text-secondary" aria-hidden="true" />
                  <span>Exported</span>
                </>
              ) : (
                <>
                  <span
                    className="material-symbols-outlined text-[15px]"
                    aria-hidden="true"
                  >
                    ios_share
                  </span>
                  <span>Export Thread</span>
                </>
              )}
            </button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearConversation}
              aria-label="Reset workspace"
              className="h-7 rounded-md border-border-subtle bg-surface-card px-2.5 text-xs font-medium text-on-surface-variant"
            >
              <Eraser className="mr-1 size-3.5" aria-hidden="true" />
              Reset
            </Button>
          </div>
        </div>

        {/* Mobile Segmented Navigation Tabs (< lg) */}
        <div className="flex border-t border-border-subtle bg-surface-container-low px-3 py-1.5 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileTab("chat")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors",
              mobileTab === "chat"
                ? "bg-surface-card text-on-surface shadow-xs"
                : "text-text-muted hover:text-on-surface",
            )}
          >
            <MessageSquare className="size-3.5" />
            <span>Chat</span>
            {pending ? (
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setMobileTab("requirements")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors",
              mobileTab === "requirements"
                ? "bg-surface-card text-on-surface shadow-xs"
                : "text-text-muted hover:text-on-surface",
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            <span>Context</span>
            {criteriaCount > 0 ? (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {criteriaCount}
              </Badge>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setMobileTab("shortlist")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors",
              mobileTab === "shortlist"
                ? "bg-surface-card text-on-surface shadow-xs"
                : "text-text-muted hover:text-on-surface",
            )}
          >
            <Award className="size-3.5" />
            <span>Shortlist</span>
            {shortlistedProducts.length > 0 ? (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {shortlistedProducts.length}
              </Badge>
            ) : null}
          </button>
        </div>
      </header>

      {/* Main Strictly 2-Column Body on Desktop (lg+) */}
      <div className="mx-auto grid w-full max-w-[1440px] flex-1 grid-cols-12 gap-6 overflow-hidden px-4 pt-4 md:px-6 lg:px-8">
        {/* Left Rail: Requirements & Refinements (Desktop only when chat tab active; avoid duplicate DOM on mobile tab) */}
        <div
          className={cn(
            "h-full overflow-y-auto pb-6 no-scrollbar",
            mobileTab === "requirements"
              ? "col-span-12 lg:col-span-4 xl:col-span-3"
              : "hidden lg:col-span-4 lg:block xl:col-span-3",
          )}
        >
          <RequirementsPanel
            intent={currentIntent}
            products={shortlistedProducts}
            onRefine={handleRefine}
            onReset={clearConversation}
            pending={pending}
          />
        </div>

        {/* Wide Conversation Stream & Omni-Prompt Dock (col-span-12 lg:col-span-8 xl:col-span-9) */}
        <div
          className={cn(
            "col-span-12 h-full min-w-0 flex-col overflow-hidden lg:col-span-8 xl:col-span-9",
            mobileTab !== "chat" ? "hidden lg:flex" : "flex",
          )}
        >
          <div
            ref={scrollerRef}
            className="flex-1 overflow-y-auto overscroll-contain pb-4 pr-1 no-scrollbar"
          >
            {showEmptyState ? (
              <div className="flex min-h-full flex-col py-4">
                <div className="my-auto mx-auto flex w-full max-w-2xl flex-col items-center text-center">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-surface-container-low px-3 py-1 text-xs font-medium text-text-muted shadow-2xs">
                    <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
                    <span>ShopMate Engine • Grounded in live catalog specifications</span>
                  </div>

                  <div className="w-full rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-sm md:p-8">
                    <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-on-primary shadow-sm">
                      <span className="material-symbols-outlined text-[26px]" aria-hidden="true">
                        auto_awesome
                      </span>
                    </span>
                    <h2 className="mt-4 text-xl font-bold tracking-tight text-on-surface">
                      ShopMate Research Copilot
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-on-surface-variant">
                      Tell ShopMate what you need. It inspects verified catalog specs,
                      evaluates honest trade-offs, and renders side-by-side picks inline.
                    </p>

                    <ul className="mt-6 grid w-full gap-2.5 sm:grid-cols-2">
                      {DEMO_PROMPTS.map((prompt) => (
                        <li key={prompt}>
                          <button
                            type="button"
                            onClick={() => void send(prompt)}
                            className="h-full w-full rounded-xl border border-border-subtle bg-surface-container-low px-4 py-3 text-left text-xs font-medium leading-snug text-on-surface transition-all hover:border-primary/40 hover:bg-surface-container hover:text-primary"
                          >
                            {prompt}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div
                role="list"
                aria-label="Conversation messages"
                className="flex flex-col gap-5 pb-4"
              >
                <div className="flex items-center justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full bg-surface-container-low px-3 py-1 text-xs text-text-muted shadow-2xs">
                    <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
                    <span>
                      ShopMate Engine • Recommendations grounded strictly in verified catalog records
                    </span>
                  </div>
                </div>

                {messages.map((message) => (
                  <ChatMessageItem
                    key={message.id}
                    message={message}
                    onRetry={send}
                    onFollowUp={(followUp) => void send(followUp)}
                  />
                ))}

                {pending ? (
                  <LoadingState
                    variant="product-grid"
                    className="mx-auto w-full"
                  />
                ) : null}
              </div>
            )}
          </div>

          <footer className="shrink-0 pb-3 pt-2">
            <ChatInput
              pending={pending}
              onSubmit={(value) => void send(value)}
            />
          </footer>
        </div>

        {/* Mobile Tab: Shortlist (< lg ONLY when tab selected) */}
        {mobileTab === "shortlist" ? (
          <div className="col-span-12 h-full overflow-y-auto pb-6 lg:hidden">
            <ShortlistPanel
              products={shortlistedProducts}
              recommendations={shortlistedRecommendations}
              pending={pending}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type { UiMessage };
