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
import { emptyIntent, type ShoppingIntent } from "./intent";
import {
  DEFAULT_BUDGETS,
  createAgentTools,
  normalizeQuery,
  type AgentCatalog,
  type AgentToolContext,
} from "./tools";
import { buildInstructions } from "./instructions";
import { getProviderName, isAIConfigured, resolveChatModel, resolveModelId } from "./provider";
import { getCatalogProduct, searchCatalog } from "@/lib/catalog/provider";
import type { ChatApiSuccess, ChatComparison } from "./chat-contract";

/** Max products attached to a reply — matches the UI's result list. */
const MAX_PRODUCTS = 6;

/** Tool-loop ceiling: enough for search → details → compare → recordIntent. */
const MAX_STEPS = 8;

/** Typed failure thrown when the model layer cannot complete a turn. */
export class AgentTurnError extends Error {
  constructor(
    readonly code: "ai_unavailable",
    message: string,
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

  const candidateIds = recommended.length > 0 ? recommended : [...catalogLog.keys()];
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

  const products = ranked.slice(0, MAX_PRODUCTS).map((r) => r.product);
  const productIds = products.map((p) => p.id);

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
    intent,
    products,
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
 * Deterministic no-AI turn: keyword search + relevance gate + ranking, with
 * copy that says plainly what happened. Never presented as AI output.
 */
export async function runKeywordFallbackTurn(
  input: RunAgentTurnInput,
  catalog: AgentCatalog,
): Promise<ChatApiSuccess> {
  const query = normalizeQuery(input.message);
  const outcome = await catalog.search(query, { limit: 10, userId: input.userId });

  const { relevant, rejected, suggestion } = tokenize(query).length
    ? // Relevance gate with no intent yet — the message is all we know.
      filterRelevant(outcome.products, { tokens: tokenize(query) })
    : { relevant: [], rejected: [], suggestion: undefined };

  const catalogLog = new Map(relevant.map((r) => [r.product.id, r.product]));

  const intro = relevant.length
    ? `AI assistance isn't configured right now, so I ran a keyword search for “${query}” on the ${outcome.source === "demo" ? "demo catalog" : "live catalog"}. These are straight keyword matches, ranked deterministically — not AI-picked recommendations:`
    : `AI assistance isn't configured right now, and a keyword search for “${query}” found no confident matches.${rejected.length > 0 ? ` ${rejected.length} result(s) were filtered out as irrelevant.` : ""}${suggestion ? ` ${suggestion}` : ""}`;

  const intent: ShoppingIntent = { ...emptyIntent(), query };

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

  if (!isAIConfigured()) {
    return runKeywordFallbackTurn(input, catalog);
  }

  const intentRef = { current: input.intent ?? emptyIntent() };
  const ctx = createContext(catalog, intentRef, input.userId);

  try {
    const model = resolveChatModel();
    if (!model) {
      return runKeywordFallbackTurn(input, catalog);
    }

    const agent = new ToolLoopAgent({
      model,
      instructions: buildInstructions(intentRef.current),
      tools: createAgentTools(ctx),
      stopWhen: isStepCount(MAX_STEPS),
      maxOutputTokens: 1024,
      providerOptions:
        getProviderName() === "google"
          ? { google: { thinkingConfig: { thinkingLevel: "minimal" } } }
          : undefined,
    });

    const messages: ModelMessage[] = [
      ...input.history.map(
        (h): ModelMessage => ({ role: h.role, content: h.content }),
      ),
      { role: "user", content: input.message },
    ];

    const result = await agent.generate({ messages });

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
      model: resolveModelId(),
    });
  } catch (error) {
    if (error instanceof AgentTurnError) throw error;
    throw new AgentTurnError(
      "ai_unavailable",
      error instanceof Error ? error.message : "model request failed",
    );
  }
}
