/**
 * ShopMate AI — validated agent tools (Phase 4).
 *
 * The five tools the shopping agent may call, each a thin, Zod-validated
 * wrapper over the existing Phase 3 catalog services — Channel3 logic is
 * never duplicated here. Every product that reaches the model through a
 * tool is recorded in `catalogLog`; that log is the allow-list the response
 * assembler trusts, so the model can never present a product it did not
 * actually receive.
 *
 * Per-request budgets cap catalog consumption (Channel3 searches cost
 * credits): a tool call past its budget returns `{error:'budget_exhausted'}`
 * instead of hitting the provider again.
 */
import { tool } from "ai";
import { z } from "zod";
import type { Product } from "@/types";
import { filterRelevant, tokenize } from "./relevance";
import { IntentSchema, mergeIntent, type ShoppingIntent } from "./intent";

/** Per-request tool budgets: how often the model may touch the catalog. */
export interface ToolBudgets {
  searches: number;
  details: number;
  compares: number;
}

export const DEFAULT_BUDGETS: ToolBudgets = {
  searches: 3,
  details: 6,
  compares: 1,
};

/** Injectable catalog surface (the real provider module in production). */
export interface AgentCatalog {
  search(
    query: string,
    options: { limit: number; userId?: string },
  ): Promise<
    | { source: "channel3" | "demo"; products: Product[]; fallback?: { reason: string } }
    | { source: "channel3" | "demo"; products: Product[] }
  >;
  getProduct(id: string): Promise<Product | null>;
}

export interface AgentToolContext {
  catalog: AgentCatalog;
  budgets: ToolBudgets;
  /** Live intent state for this conversation, mutated by recordIntent. */
  intentRef: { current: ShoppingIntent };
  /** Every product a tool returned this turn — the model's id allow-list. */
  catalogLog: Map<string, Product>;
  /** Recommended ids the model recorded, already validated against the log. */
  recommendedIdsRef: { current: string[] };
  /** Tool names in call order — reported to the client for transparency. */
  toolsUsedRef: { current: string[] };
  /** Comparison groups performed this turn (ids only; resolved at assembly). */
  comparisonsRef: {
    current: { productIds: string[]; missingIds: string[] }[];
  };
  /** Provenance of the most recent search — demo degradation stays visible. */
  catalogMetaRef: {
    current: { source: "channel3" | "demo"; fallback?: string } | null;
  };
  /** Pseudonymous user id forwarded to Channel3 for attribution. */
  userId?: string;
}

/** Upper bound on a search query handed to the catalog. */
const MAX_QUERY_LENGTH = 120;

/** Model-facing descriptions are truncated to keep prompts small. */
const MAX_DESCRIPTION_LENGTH = 120;

/** Normalizes a raw query: trim, collapse whitespace, lowercase, cap length. Safe on undefined. */
export function normalizeQuery(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .slice(0, MAX_QUERY_LENGTH);
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

/** Compact, model-facing product record. Facts only — never invented here. */
function compactProduct(product: Product) {
  const cleanSpecs: Record<string, string | number | boolean> = {};
  if (product.specs && typeof product.specs === "object") {
    for (const [k, v] of Object.entries(product.specs).slice(0, 4)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        cleanSpecs[k] = typeof v === "string" ? truncate(v, 40) : v;
      }
    }
  }
  return {
    id: product.id,
    name: truncate(product.name, 80),
    price: product.price,
    currency: product.currency,
    category: product.category,
    brand: product.brand,
    ratings: product.ratings,
    reviews: product.reviews,
    specs: Object.keys(cleanSpecs).length > 0 ? cleanSpecs : undefined,
    description: truncate(product.description ?? "", MAX_DESCRIPTION_LENGTH),
  };
}

/** Wraps catalog payload in explicit delimiters: untrusted data, not instructions. */
function catalogData(payload: unknown): string {
  // Escape '<' so merchant-controlled content cannot close the delimiter
  // early ("\u003c" is valid JSON and decodes back to '<' on parse).
  const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<catalog-data>\n${serialized}\n</catalog-data>`;
}

const BUDGET_EXHAUSTED = { error: "budget_exhausted" as const };

export function createAgentTools(ctx: AgentToolContext) {
  let searchesUsed = 0;
  let detailsUsed = 0;
  let comparesUsed = 0;

  /** Builds relevance criteria from the query plus the current intent. */
  const criteriaFrom = (query: string) => {
    const intent = ctx.intentRef.current;
    return {
      tokens: tokenize(query),
      brands: intent.brands.map((brand) => brand.toLowerCase()),
      category: intent.category,
      budget: intent.budget ?? undefined,
      requiredSpecs: intent.requiredSpecs,
    };
  };

  return {
    searchProducts: tool({
      description:
        "Search the product catalog. Returns only results relevant to the query " +
        "(irrelevant fuzzy matches are filtered out and counted). Use for product discovery.",
      inputSchema: z.object({
        query: z.string().max(MAX_QUERY_LENGTH).optional().default(""),
        limit: z.number().int().min(1).max(10).default(6),
        filters: z
          .object({
            maxPrice: z.number().positive().optional(),
            brand: z.string().min(1).max(60).optional(),
          })
          .optional(),
      }),
      execute: async ({ query, limit, filters }) => {
        ctx.toolsUsedRef.current.push("searchProducts");
        if (searchesUsed >= ctx.budgets.searches) return BUDGET_EXHAUSTED;
        searchesUsed += 1;

        try {
          const effectiveQuery = query?.trim()
            ? query
            : (ctx.intentRef.current.query || ctx.intentRef.current.category || ctx.intentRef.current.productCategory || "products");
          const normalized = normalizeQuery(effectiveQuery);
          if (!ctx.intentRef.current.query && normalized && normalized !== "products") {
            ctx.intentRef.current.query = normalized;
          }
          const outcome = await ctx.catalog.search(normalized, {
            // Default here, not only in the schema: direct callers (tests,
            // fallback path) bypass the model loop's validation step.
            limit: limit ?? 6,
            userId: ctx.userId,
          });
          ctx.catalogMetaRef.current = {
            source: outcome.source,
            fallback: "fallback" in outcome ? outcome.fallback?.reason : undefined,
          };

          let candidates = outcome.products;
          if (filters?.maxPrice !== undefined) {
            candidates = candidates.filter(
              (product) => Number.isFinite(product.price) && product.price <= filters.maxPrice!,
            );
          }
          if (filters?.brand) {
            const brandTokens = tokenize(filters.brand);
            candidates = candidates.filter((product) =>
              brandTokens.some((token) =>
                tokenize(product.brand ?? "").includes(token),
              ),
            );
          }

          const { relevant, rejected, suggestion } = filterRelevant(
            candidates,
            criteriaFrom(normalized),
          );

          for (const { product } of relevant) {
            ctx.catalogLog.set(product.id, product);
          }

          return {
            data: catalogData({
              source: outcome.source,
              fallback: "fallback" in outcome ? outcome.fallback : undefined,
              totalReturned: outcome.products.length,
              rejectedCount: rejected.length,
              suggestion,
              products: relevant.map(({ product, score }) => ({
                ...compactProduct(product),
                relevanceScore: Number(score.toFixed(3)),
              })),
            }),
          };
        } catch (err) {
          return {
            error: "catalog_error",
            message: err instanceof Error ? err.message : "Catalog search failed",
          };
        }
      },
    }),

    getProductDetails: tool({
      description:
        "Fetch authoritative details for one product id previously returned by " +
        "searchProducts. Prices and availability here are authoritative.",
      inputSchema: z.object({
        productId: z.string().min(1).max(120),
      }),
      execute: async ({ productId }) => {
        ctx.toolsUsedRef.current.push("getProductDetails");
        if (detailsUsed >= ctx.budgets.details) return BUDGET_EXHAUSTED;
        detailsUsed += 1;

        try {
          const found = await ctx.catalog.getProduct(productId);
          if (!found) return { error: "not_found" as const };

          ctx.catalogLog.set(found.id, found);
          return { data: catalogData({ product: compactProduct(found) }) };
        } catch (err) {
          return {
            error: "catalog_error",
            message: err instanceof Error ? err.message : "Product detail lookup failed",
          };
        }
      },
    }),

    compareProducts: tool({
      description:
        "Compare 2–4 products side by side. Only use ids previously returned by " +
        "searchProducts or getProductDetails.",
      inputSchema: z.object({
        productIds: z.array(z.string().min(1).max(120)).min(2).max(4),
      }),
      execute: async ({ productIds }) => {
        ctx.toolsUsedRef.current.push("compareProducts");
        if (comparesUsed >= ctx.budgets.compares) return BUDGET_EXHAUSTED;
        comparesUsed += 1;

        try {
          const products: Product[] = [];
          const missingIds: string[] = [];
          for (const id of productIds) {
            const found = await ctx.catalog.getProduct(id);
            if (found) {
              products.push(found);
              ctx.catalogLog.set(found.id, found);
            } else {
              missingIds.push(id);
            }
          }
          ctx.comparisonsRef.current.push({ productIds, missingIds });

          return {
            data: catalogData({
              products: products.map(compactProduct),
              missingIds,
            }),
          };
        } catch (err) {
          return {
            error: "catalog_error",
            message: err instanceof Error ? err.message : "Comparison lookup failed",
          };
        }
      },
    }),

    refineSearch: tool({
      description:
        "Compose a better search query from the original query and the requirements " +
        "still missing. Does not search by itself — follow up with searchProducts.",
      inputSchema: z.object({
        originalQuery: z.string().min(1).max(MAX_QUERY_LENGTH),
        missingRequirements: z.array(z.string().min(1).max(120)).max(6),
      }),
      execute: async ({ originalQuery, missingRequirements }) => {
        ctx.toolsUsedRef.current.push("refineSearch");
        const parts = [normalizeQuery(originalQuery), ...missingRequirements.map((r) => r.trim().toLowerCase())];
        const refinedQuery = parts.filter(Boolean).join(" ").slice(0, MAX_QUERY_LENGTH);
        return { refinedQuery, note: "Run searchProducts with this query." };
      },
    }),

    recordIntent: tool({
      description:
        "Record the shopping intent you extracted from the conversation: category, " +
        "budget, brands, required specs, priorities, clarifying questions, and the " +
        "product ids you intend to recommend (must be ids the tools returned).",
      inputSchema: IntentSchema.extend({
        recommendedProductIds: z.array(z.string().min(1).max(120)).max(10).default([]),
      }),
      execute: async ({ recommendedProductIds, ...intentInput }) => {
        ctx.toolsUsedRef.current.push("recordIntent");
        const parsed = IntentSchema.parse(intentInput);
        ctx.intentRef.current = mergeIntent(ctx.intentRef.current, parsed);

        const accepted = recommendedProductIds.filter((id) =>
          ctx.catalogLog.has(id),
        );
        ctx.recommendedIdsRef.current = accepted;

        return {
          acceptedRecommendedIds: accepted,
          droppedRecommendedIds: recommendedProductIds.filter(
            (id) => !ctx.catalogLog.has(id),
          ),
          intent: ctx.intentRef.current,
        };
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
