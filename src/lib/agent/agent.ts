/**
 * ShopMate AI — agent assembly (Phase 4).
 *
 * `runAgentTurn` is the single entry point the /api/chat route calls. It
 * runs one tool-loop turn with the configured model, then assembles the
 * response deterministically: products come only from the tool-execution
 * log (the model cannot introduce a product), ranking comes from the
 * deterministic engine, and provenance travels with the payload.
 *
 * When no AI provider is configured the turn degrades to an explicitly
 * labeled keyword fallback — deterministic search + ranking with honest
 * copy, never pretending the AI wrote it. A model failure maps to the
 * typed `ai_unavailable` error; the caller decides how to respond.
 */
import { isStepCount, ToolLoopAgent, type ModelMessage } from "ai";
import type { Product } from "@/types";
import { filterRelevant, tokenize } from "./relevance";
import { rankProducts } from "./ranking";
import { generateRecommendations } from "./decision-engine";
import { emptyIntent, type ShoppingIntent } from "./intent";
import {
  DEFAULT_BUDGETS,
  createAgentTools,
  normalizeQuery,
  truncate,
  type AgentCatalog,
  type AgentToolContext,
} from "./tools";
import { buildInstructions } from "./instructions";
import {
  getConfiguredProviders,
  type ProviderCandidate,
} from "./provider";
import {
  executeWithFailover,
  AllProvidersFailedError,
  type ProviderAttemptRecord,
} from "./failover";
import { getCatalogProduct, searchCatalog } from "@/lib/catalog/provider";
import type { ChatApiSuccess, ChatComparison } from "./chat-contract";

/** Max products attached to a reply — matches the UI's result list. */
const MAX_PRODUCTS = 6;

/** Tool-loop ceiling: exactly 1 tool call + 1 answer step. */
const MAX_STEPS = 2;

/** Typed failure thrown when the model layer cannot complete a turn. */
export class AgentTurnError extends Error {
  constructor(
    readonly code: "ai_unavailable",
    message: string,
    /** Upstream HTTP status when the failure came from an API response. */
    readonly upstreamStatus?: number,
    /** Diagnostic log of individual provider attempts in the failover chain. */
    readonly attempts?: ProviderAttemptRecord[],
  ) {
    super(message);
    this.name = "AgentTurnError";
  }
}

export interface RunAgentTurnInput {
  /** Prior conversation turns (already validated by the route). */
  history: { role: "user" | "assistant"; content: string }[];
  /** The latest user message. */
  message: string;
  /** Pseudonymous id for Channel3 attribution. */
  userId?: string;
  /** Intent accumulated over the conversation, seeded by the client. */
  intent?: ShoppingIntent;
}

export interface RunAgentTurnDeps {
  /** Injectable catalog (tests stub this). Defaults to the real provider. */
  catalog?: AgentCatalog;
  /** Injectable provider candidates (tests stub this for failover scenarios). */
  providers?: ProviderCandidate[];
  /** Optional custom fetch. */
  fetch?: typeof fetch;
}

/**
 * Pure response assembly from turn state. Every product here comes from the
 * catalog log; recommended ids that never appeared in a tool result are
 * dropped — the model cannot introduce a product by naming it.
 */
export function assembleTurn(input: {
  content: string;
  intent: ShoppingIntent;
  catalogLog: Map<string, Product>;
  recommendedIds: string[];
  comparisons: { productIds: string[]; missingIds: string[] }[];
  catalogMeta: { source: "channel3" | "demo"; fallback?: string } | null;
  toolsUsed: string[];
  query: string;
  mode: "ai" | "keyword_fallback";
  model?: string;
}): ChatApiSuccess {
  const { intent, catalogLog } = input;

  // Allow-list: only ids the tools actually returned can be recommended.
  const recommended = input.recommendedIds.filter((id) => catalogLog.has(id));

  // Deduplicate candidate IDs to ensure ranking stability and no duplicate products
  const candidateIds = Array.from(
    new Set(recommended.length > 0 ? recommended : [...catalogLog.keys()]),
  );
  const candidates = candidateIds
    .map((id) => catalogLog.get(id))
    .filter((product): product is Product => product !== undefined);

  const ranked = rankProducts(candidates, {
    tokens: tokenize(intent.query ?? input.query),
    brands: intent.brands.map((brand) => brand.toLowerCase()),
    requiredSpecs: intent.requiredSpecs,
    budget: intent.budget ?? null,
    priorities: intent.priorities,
  });

  const topRanked = ranked.slice(0, MAX_PRODUCTS);
  const products = topRanked.map((r) => r.product);
  const productIds = products.map((p) => p.id);
  const recommendations = generateRecommendations(topRanked, intent);

  const comparisons: ChatComparison[] = input.comparisons.map((group) => ({
    productIds: group.productIds.filter((id) => catalogLog.has(id)),
    products: group.productIds
      .filter((id) => catalogLog.has(id))
      .map((id) => catalogLog.get(id)!)
      .filter((product): product is Product => product !== undefined),
    missingIds: group.missingIds,
  }));

  return {
    success: true,
    content: input.content,
    intent: {
      ...intent,
      query: intent.query || input.query,
    },
    products,
    recommendations,
    comparisons,
    clarifications: intent.clarifications,
    productIds,
    catalog: input.catalogMeta ?? { source: "demo" },
    toolsUsed: input.toolsUsed,
    model: input.model,
    mode: input.mode,
  };
}

/** Builds a fresh per-request tool context bound to shared state objects. */
function createContext(
  catalog: AgentCatalog,
  intentRef: { current: ShoppingIntent },
  userId?: string,
): AgentToolContext {
  return {
    catalog,
    budgets: DEFAULT_BUDGETS,
    intentRef,
    catalogLog: new Map<string, Product>(),
    recommendedIdsRef: { current: [] },
    toolsUsedRef: { current: [] },
    comparisonsRef: { current: [] },
    catalogMetaRef: { current: null },
    userId,
  };
}

/**
 * Deterministic budget extraction for the keyword fallback path ("under $80",
 * "below 50", "budget of 200"). The AI path extracts intent via the model;
 * the fallback only honors explicit price-cap phrasing, and only in USD —
 * the site's catalog currency — never a guessed exchange rate.
 */
export function parseBudgetHint(
  message: string,
): { amount: number; currency: string; minAmount?: number } | null {
  // Check range first: "between $100 and $250", "100 to 200"
  const rangeMatch = message.match(
    /(?:between|from)\s*([$₹€£]|rs\.?|inr|usd|eur|gbp)?\s*([\d,]+(?:\.\d+)?)\s*(?:and|to|-)\s*([$₹€£]|rs\.?|inr|usd|eur|gbp)?\s*([\d,]+(?:\.\d+)?)\s*(dollars?|euros?|pounds?|inr|usd|eur|gbp)?/i,
  );
  if (rangeMatch) {
    const min = Number(rangeMatch[2].replace(/,/g, ""));
    const max = Number(rangeMatch[4].replace(/,/g, ""));
    const sym = (rangeMatch[1] || rangeMatch[3] || rangeMatch[5] || "").toLowerCase();
    const currency = sym.includes("₹") || sym.includes("inr") || sym.includes("rs")
      ? "INR"
      : sym.includes("€") || sym.includes("eur")
        ? "EUR"
        : sym.includes("£") || sym.includes("gbp") || sym.includes("pound")
          ? "GBP"
          : "USD";
    if (Number.isFinite(max) && max > 0) {
      return { amount: max, minAmount: Number.isFinite(min) && min >= 0 ? min : undefined, currency };
    }
  }

  const match = message.match(
    /(?:under|below|less\s+than|max(?:imum)?|up\s+to|budget(?:\s+(?:is|of))?|spend(?:\s+up\s+to)?|have|for|around)\s*([$₹€£]|rs\.?|inr|usd|eur|gbp)?\s*([\d,]+(?:\.\d+)?)\s*([$₹€£]|rs\.?|inr|usd|eur|gbp|euros?|dollars?|bucks?|pounds?)?/i,
  );
  if (!match) return null;
  const sym = (match[1] || match[3] || "").toLowerCase();
  const currency = sym.includes("₹") || sym.includes("inr") || sym.includes("rs")
    ? "INR"
    : sym.includes("€") || sym.includes("eur")
      ? "EUR"
      : sym.includes("£") || sym.includes("gbp") || sym.includes("pound")
        ? "GBP"
        : "USD";
  const amount = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency };
}

/**
 * Deterministic no-AI turn: keyword search + relevance gate + ranking, with
 * copy that says plainly what happened. Never presented as AI output.
 */
export async function runKeywordFallbackTurn(
  input: RunAgentTurnInput,
  catalog: AgentCatalog,
): Promise<ChatApiSuccess> {
  const query = normalizeQuery(input.message);
  const outcome = await catalog.search(query, { limit: 10, userId: input.userId });

  const budgetHint = parseBudgetHint(input.message);
  const { relevant, rejected, suggestion } = tokenize(query).length
    ? // Relevance gate with no intent yet — the message (plus any explicit
      // budget phrasing) is all we know.
      filterRelevant(outcome.products, {
        tokens: tokenize(query),
        budget: budgetHint ?? undefined,
      })
    : { relevant: [], rejected: [], suggestion: undefined };

  const catalogLog = new Map(relevant.map((r) => [r.product.id, r.product]));

  const intro = relevant.length
    ? `AI assistance isn't configured right now, so I ran a keyword search for “${query}” on the ${outcome.source === "demo" ? "demo catalog" : "live catalog"}.${budgetHint ? ` Results are filtered to your ${budgetHint.amount} ${budgetHint.currency} budget.` : ""} These are straight keyword matches, ranked deterministically — not AI-picked recommendations:`
    : `AI assistance isn't configured right now, and a keyword search for “${query}” found no confident matches.${rejected.length > 0 ? ` ${rejected.length} result(s) were filtered out as irrelevant.` : ""}${suggestion ? ` ${suggestion}` : ""}`;

  const intent: ShoppingIntent = {
    ...emptyIntent(),
    query,
    budget: budgetHint ? { amount: budgetHint.amount, currency: budgetHint.currency } : null,
    budgetMin: budgetHint?.minAmount,
    budgetMax: budgetHint?.amount,
    currency: budgetHint?.currency ?? "USD",
  };

  return assembleTurn({
    content: intro,
    intent,
    catalogLog,
    recommendedIds: [],
    comparisons: [],
    catalogMeta: {
      source: outcome.source,
      fallback: "fallback" in outcome ? outcome.fallback?.reason : undefined,
    },
    toolsUsed: [],
    query,
    mode: "keyword_fallback",
  });
}

/**
 * Runs one full agent turn. Throws `AgentTurnError('ai_unavailable')` when
 * the model layer fails; falls back to the keyword path when no provider is
 * configured.
 */
export async function runAgentTurn(
  input: RunAgentTurnInput,
  deps: RunAgentTurnDeps = {},
): Promise<ChatApiSuccess> {
  const catalog: AgentCatalog = deps.catalog ?? {
    search: (query, options) => searchCatalog(query, options),
    getProduct: (id) => getCatalogProduct(id).then((r) => r?.product ?? null),
  };

  const candidates =
    deps.providers ?? getConfiguredProviders({ fetch: deps.fetch });
  if (candidates.length === 0) {
    return runKeywordFallbackTurn(input, catalog);
  }

  const budgetHint = parseBudgetHint(input.message);
  const baseIntent = input.intent ? { ...input.intent } : emptyIntent();
  if (budgetHint) {
    baseIntent.budget = { amount: budgetHint.amount, currency: budgetHint.currency };
    baseIntent.budgetMax = budgetHint.amount;
    if (budgetHint.minAmount !== undefined) baseIntent.budgetMin = budgetHint.minAmount;
    baseIntent.currency = budgetHint.currency;
  }
  if (!baseIntent.query && input.message) {
    baseIntent.query = normalizeQuery(input.message);
  }

  // Bound history to at most the last 2 turns (4 messages) to stay well within token limits.
  // Truncate assistant content so verbose markdown doesn't blow past rate limits on multi-turn.
  const boundedHistory: ModelMessage[] = input.history.slice(-4).map((h) => ({
    role: h.role,
    content: h.role === "assistant" ? truncate(h.content, 350) : truncate(h.content, 200),
  }));

  const messages: ModelMessage[] = [
    ...boundedHistory,
    { role: "user", content: input.message },
  ];

  try {
    const execution = await executeWithFailover(candidates, async (candidate, context) => {
      // Fresh isolated context per provider attempt to prevent partial side effects
      const intentRef = { current: { ...baseIntent } };
      const ctx = createContext(catalog, intentRef, input.userId);
      const allTools = createAgentTools(ctx);
      const tools = {
        searchProducts: allTools.searchProducts,
        getProductDetails: allTools.getProductDetails,
        compareProducts: allTools.compareProducts,
      };

      const model = candidate.createModel();

      const agent = new ToolLoopAgent({
        model,
        instructions: buildInstructions(intentRef.current),
        tools,
        stopWhen: isStepCount(MAX_STEPS),
        maxRetries: 0,
        maxOutputTokens: 1024,
      });

      const result = await agent.generate({
        messages,
        abortSignal: context?.abortSignal,
      });

      // Safeguard: if the model turn did not search the catalog, retrieve relevant catalog
      // candidates so the shopper always gets grounded product recommendations in their shortlist.
      if (ctx.catalogLog.size === 0) {
        const outcome = await catalog.search(input.message, { limit: 4, userId: input.userId });
        ctx.catalogMetaRef.current = {
          source: outcome.source,
          fallback: "fallback" in outcome ? outcome.fallback?.reason : undefined,
        };
        for (const prod of outcome.products) {
          ctx.catalogLog.set(prod.id, prod);
        }
      }

      return assembleTurn({
        content: result.text?.trim() || "I could not compose a reply this time — try rephrasing.",
        intent: intentRef.current,
        catalogLog: ctx.catalogLog,
        recommendedIds: ctx.recommendedIdsRef.current,
        comparisons: ctx.comparisonsRef.current,
        catalogMeta: ctx.catalogMetaRef.current,
        toolsUsed: ctx.toolsUsedRef.current,
        query: input.message,
        mode: "ai",
        model: candidate.modelId,
      });
    });

    return {
      ...execution.result,
      model: execution.model,
    };
  } catch (error) {
    if (error instanceof AgentTurnError) throw error;
    if (error instanceof AllProvidersFailedError) {
      const isTimeout = error.attempts.some(
        (a) =>
          a.errorName === "TimeoutError" ||
          a.errorName === "AbortError" ||
          a.error?.toLowerCase().includes("timeout") ||
          a.error?.toLowerCase().includes("abort"),
      );
      throw new AgentTurnError(
        "ai_unavailable",
        isTimeout ? "AI provider request timed out" : error.message,
        error.lastStatus,
        error.attempts,
      );
    }
    const status = (error as { statusCode?: unknown } | null)?.statusCode;
    const name = error instanceof Error ? error.name : "";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    throw new AgentTurnError(
      "ai_unavailable",
      timedOut
        ? "AI provider request timed out"
        : error instanceof Error
          ? error.message
          : "model request failed",
      typeof status === "number" ? status : undefined,
    );
  }
}
