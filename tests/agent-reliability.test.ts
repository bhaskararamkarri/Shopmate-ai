/**
 * ShopMate AI — Phase 9 Agent Reliability & Currency Integrity Regression Tests.
 *
 * Verifies:
 * A. Search + getProductDetails + final text generation.
 * B. Two tool calls followed by a final assistant response.
 * C. Maximum step safety limit.
 * D. Empty result.text with products -> deterministic fallback.
 * E. Empty result.text without products -> honest no-results message.
 * F. INR budget + USD products -> UNVERIFIED budget compatibility.
 * G. INR budget + INR products -> normal budget evaluation.
 * H. Missing product specifications -> no invented claims.
 * I. Provider quota failure -> graceful fallback.
 * J. Existing provider failover and catalog functionality remain intact.
 */
import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import {
  MAX_STEPS,
  assembleTurn,
  runAgentTurn,
  synthesizeDeterministicSummary,
} from "@/lib/agent/agent";
import {
  checkBudgetCompatibility,
  filterRelevant,
  overBudget,
} from "@/lib/agent/relevance";
import { rankProducts } from "@/lib/agent/ranking";
import { generateRecommendations } from "@/lib/agent/decision-engine";
import { emptyIntent, type ShoppingIntent } from "@/lib/agent/intent";
import type { Product } from "@/types";
import type { ProviderCandidate } from "@/lib/agent/provider";

function makeProduct(overrides: Partial<Product> & { id: string }): Product {
  return {
    name: "Standard Washing Machine",
    description: "Standard front-load washer.",
    price: 300,
    currency: "USD",
    availability: "in_stock",
    images: ["https://example.com/wm.jpg"],
    ratings: 4.5,
    reviews: 120,
    category: "Washing Machines",
    brand: "CleanBrand",
    specs: {},
    source: "demo",
    ...overrides,
  };
}

const DUMMY_USAGE = {
  inputTokens: { total: 15, noCache: 15, cacheRead: 0, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
  raw: {},
};

describe("Phase 9: Agent Reliability & Lifecycle Integrity", () => {
  // Test A: Search + getProductDetails + final text generation
  it("A: executes searchProducts + getProductDetails + final text generation without premature cutoff", async () => {
    const wm1 = makeProduct({
      id: "wm-1",
      name: "Smart Load Washing Machine",
      price: 499.99,
      specs: { Capacity: "8.5 kg", SpinSpeed: "1400 rpm" },
    });

    const searchCatalog = vi.fn(async () => ({
      source: "demo" as const,
      products: [wm1],
    }));
    const getProduct = vi.fn(async (id: string) => (id === "wm-1" ? wm1 : null));

    const model = new MockLanguageModelV4({
      doGenerate: [
        // Step 1: searchProducts
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "searchProducts",
              input: JSON.stringify({ query: "washing machine" }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: "TOOL_CALL" },
          usage: DUMMY_USAGE,
          warnings: [],
        },
        // Step 2: getProductDetails
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "call-2",
              toolName: "getProductDetails",
              input: JSON.stringify({ productId: "wm-1" }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: "TOOL_CALL" },
          usage: DUMMY_USAGE,
          warnings: [],
        },
        // Step 3: Final text answer
        {
          content: [
            {
              type: "text",
              text: "The Smart Load Washing Machine has a verified 8.5 kg capacity and 1400 rpm spin speed, making it well-suited for medium to large households.",
            },
          ],
          finishReason: { unified: "stop", raw: "STOP" },
          usage: DUMMY_USAGE,
          warnings: [],
        },
      ],
    });

    const candidates: ProviderCandidate[] = [
      {
        name: "google",
        modelId: "gemini-3.8-flash",
        createModel: () => model,
        timeoutMs: 15_000,
      },
    ];

    const turn = await runAgentTurn(
      {
        message: "which one is best for a family of 4?",
        history: [],
      },
      {
        catalog: { search: searchCatalog, getProduct },
        providers: candidates,
      },
    );

    expect(turn.mode).toBe("ai");
    expect(turn.toolsUsed).toEqual(["searchProducts", "getProductDetails"]);
    expect(turn.content).toContain(
      "The Smart Load Washing Machine has a verified 8.5 kg capacity",
    );
    expect(turn.products.length).toBeGreaterThan(0);
    expect(turn.products[0].id).toBe("wm-1");
  });

  // Test B: Two tool calls followed by a final assistant response
  it("B: completes two tool calls followed by a final assistant response", async () => {
    const p1 = makeProduct({ id: "p1", name: "Washer A", price: 300 });
    const p2 = makeProduct({ id: "p2", name: "Washer B", price: 350 });

    const searchCatalog = vi.fn(async () => ({
      source: "demo" as const,
      products: [p1, p2],
    }));
    const getProduct = vi.fn(async (id: string) =>
      id === "p1" ? p1 : id === "p2" ? p2 : null,
    );

    const model = new MockLanguageModelV4({
      doGenerate: [
        // Step 1: searchProducts
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "c1",
              toolName: "searchProducts",
              input: JSON.stringify({ query: "washing machine" }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: "TOOL_CALL" },
          usage: DUMMY_USAGE,
          warnings: [],
        },
        // Step 2: compareProducts
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "c2",
              toolName: "compareProducts",
              input: JSON.stringify({ productIds: ["p1", "p2"] }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: "TOOL_CALL" },
          usage: DUMMY_USAGE,
          warnings: [],
        },
        // Step 3: Final response
        {
          content: [
            {
              type: "text",
              text: "Between Washer A ($300) and Washer B ($350), Washer A is more economical while Washer B offers higher build quality.",
            },
          ],
          finishReason: { unified: "stop", raw: "STOP" },
          usage: DUMMY_USAGE,
          warnings: [],
        },
      ],
    });

    const turn = await runAgentTurn(
      {
        message: "compare washer options",
        history: [],
      },
      {
        catalog: { search: searchCatalog, getProduct },
        providers: [
          {
            name: "groq",
            modelId: "openai/gpt-oss-120b",
            createModel: () => model,
            timeoutMs: 15_000,
          },
        ],
      },
    );

    expect(turn.toolsUsed).toEqual(["searchProducts", "compareProducts"]);
    expect(turn.comparisons.length).toBe(1);
    expect(turn.content).toContain("Between Washer A ($300) and Washer B ($350)");
  });

  // Test C: Maximum step safety limit
  it("C: halts safely at MAX_STEPS when model repeatedly issues tool calls", async () => {
    const wm = makeProduct({ id: "wm-loop", name: "Loop Washer" });
    const getProduct = vi.fn(async () => wm);

    // Provide 8 steps of continuous tool calls
    const infiniteToolCalls = Array.from({ length: 8 }).map((_, i) => ({
      content: [
        {
          type: "tool-call" as const,
          toolCallId: `call-${i}`,
          toolName: "getProductDetails",
          input: JSON.stringify({ productId: "wm-loop" }),
        },
      ],
      finishReason: { unified: "tool-calls" as const, raw: "TOOL_CALL" },
      usage: DUMMY_USAGE,
      warnings: [],
    }));

    const model = new MockLanguageModelV4({
      doGenerate: infiniteToolCalls,
    });

    const turn = await runAgentTurn(
      {
        message: "inspect washer",
        history: [],
      },
      {
        catalog: { search: vi.fn(async () => ({ source: "demo" as const, products: [wm] })), getProduct },
        providers: [
          {
            name: "google",
            modelId: "gemini-3.8-flash",
            createModel: () => model,
            timeoutMs: 15_000,
          },
        ],
      },
    );

    // Hard safety limit MAX_STEPS = 5 stops execution
    expect(turn.toolsUsed.length).toBeLessThanOrEqual(MAX_STEPS);
    expect(MAX_STEPS).toBe(5);
    // When loop hits step limit without final text, deterministic fallback handles it gracefully
    expect(turn.content).not.toContain("I could not compose a reply this time — try rephrasing.");
    expect(turn.content).toContain("Loop Washer");
  });

  // Test D: Empty result.text with products -> deterministic fallback
  it("D: generates a deterministic catalog summary when result.text is empty and products exist", () => {
    const p1 = makeProduct({
      id: "p1",
      name: "Lucky One Twin Tub Washer",
      price: 168.99,
      ratings: 4.4,
      reviews: 88,
    });
    const intent: ShoppingIntent = {
      ...emptyIntent(),
      query: "washing machine",
    };

    const ranked = rankProducts([p1], {
      tokens: ["washing", "machine"],
      brands: [],
      requiredSpecs: {},
      budget: null,
      priorities: [],
    });
    const recommendations = generateRecommendations(ranked, intent);

    const summary = synthesizeDeterministicSummary({
      products: [p1],
      recommendations,
      query: "washing machine",
      intent,
    });

    expect(summary).toContain("Lucky One Twin Tub Washer");
    expect(summary).toContain("168.99");
    expect(summary).toContain("AI explanation was temporarily unavailable");
    expect(summary).not.toContain("I could not compose a reply this time");
  });

  // Test E: Empty result.text without products -> honest no-results message
  it("E: returns an honest no-results message when result.text is empty and no products exist", () => {
    const intent: ShoppingIntent = {
      ...emptyIntent(),
      query: "impossible-product-query-xyz",
    };

    const turn = assembleTurn({
      content: "",
      intent,
      catalogLog: new Map(),
      recommendedIds: [],
      comparisons: [],
      catalogMeta: { source: "demo" },
      toolsUsed: [],
      query: "impossible-product-query-xyz",
      mode: "ai",
    });

    expect(turn.content).toContain("found no matching products");
    expect(turn.content).toContain("impossible-product-query-xyz");
    expect(turn.content).not.toContain("I could not compose a reply this time");
    expect(turn.products).toHaveLength(0);
  });
});

describe("Phase 9: Currency Integrity & Budget Parity", () => {
  // Test F: INR budget + USD products -> UNVERIFIED budget compatibility
  it("F: marks INR budget + USD products as UNVERIFIED without inventing exchange rates", () => {
    const usdProduct = makeProduct({
      id: "usd-1",
      name: "US Portable Washer",
      price: 168.99,
      currency: "USD",
    });

    const inrBudget = { amount: 30000, currency: "INR" };

    // 1. Relevance check
    const compat = checkBudgetCompatibility(usdProduct, inrBudget);
    expect(compat).toBe("UNVERIFIED");
    expect(overBudget(usdProduct, inrBudget)).toBe(false);

    // 2. Decision engine check
    const intent: ShoppingIntent = {
      ...emptyIntent(),
      query: "washing machine under 30000 inr",
      budget: inrBudget,
      currency: "INR",
    };

    const ranked = rankProducts([usdProduct], {
      tokens: ["washing", "machine"],
      brands: [],
      requiredSpecs: {},
      budget: inrBudget,
      priorities: [],
    });

    const recommendations = generateRecommendations(ranked, intent);
    expect(recommendations).toHaveLength(1);

    const rec = recommendations[0];
    // Must NOT have a budget-fit badge like Best Value
    expect(rec.badge).not.toBe("Best Value");

    // Must document unverified budget compatibility in missing/unverified or failures
    const hasUnverifiedNotice =
      rec.missingOrUnverified.some((m) => m.includes("UNVERIFIED") || m.includes("live exchange rate")) ||
      (rec.failedRequirements && rec.failedRequirements.some((f) => f.includes("live exchange rate")));
    expect(hasUnverifiedNotice).toBe(true);

    // Must disclose international delivery / customs unverified for INR requests
    const hasInternationalNotice = rec.missingOrUnverified.some((m) =>
      m.toLowerCase().includes("international") || m.toLowerCase().includes("india"),
    );
    expect(hasInternationalNotice).toBe(true);
  });

  // Test G: INR budget + INR products -> normal budget evaluation
  it("G: evaluates budget normally when both product and budget are in INR", () => {
    const inrUnder = makeProduct({
      id: "inr-1",
      name: "LG 7kg Front Load Washer",
      price: 25000,
      currency: "INR",
    });
    const inrOver = makeProduct({
      id: "inr-2",
      name: "Bosch 9kg Front Load Washer",
      price: 45000,
      currency: "INR",
    });

    const inrBudget = { amount: 30000, currency: "INR" };

    // Under budget
    expect(checkBudgetCompatibility(inrUnder, inrBudget)).toBe("COMPATIBLE");
    expect(overBudget(inrUnder, inrBudget)).toBe(false);

    // Over budget (45000 > 30000 * 1.15 = 34500)
    expect(checkBudgetCompatibility(inrOver, inrBudget)).toBe("OVER_BUDGET");
    expect(overBudget(inrOver, inrBudget)).toBe(true);

    // filterRelevant rejects the over-budget item
    const outcome = filterRelevant([inrUnder, inrOver], {
      tokens: ["washer"],
      budget: inrBudget,
    });
    expect(outcome.relevant.map((r) => r.product.id)).toEqual(["inr-1"]);
    expect(outcome.rejected.some((r) => r.id === "inr-2")).toBe(true);
  });
});

describe("Phase 9: Recommendation Quality & Provider Failover", () => {
  // Test H: Missing product specifications -> no invented claims & washing machine family check
  it("H: labels missing washing machine capacity as unknown and flags portable units for family-of-4 queries", () => {
    const portableNoCapacity = makeProduct({
      id: "port-1",
      name: "Portable Twin Tub Washing Machine",
      description: "Ideal for dorms and small apartments.",
      price: 150,
      currency: "USD",
      specs: {}, // No capacity spec
    });

    const intent: ShoppingIntent = {
      ...emptyIntent(),
      query: "which one is best for a family of 4?",
      intendedUse: "family of 4",
    };

    const ranked = rankProducts([portableNoCapacity], {
      tokens: ["washing", "machine", "family"],
      brands: [],
      requiredSpecs: {},
      budget: null,
      priorities: ["family"],
    });

    const recommendations = generateRecommendations(ranked, intent);
    expect(recommendations).toHaveLength(1);
    const rec = recommendations[0];

    // Capacity is explicitly marked as UNKNOWN in missingOrUnverified
    expect(rec.missingOrUnverified.some((m) => m.includes("Washing load capacity: UNKNOWN"))).toBe(true);

    // Portable washer has trade-off notice for family usage
    expect(
      rec.tradeOffs.some((t) => t.toLowerCase().includes("portable") || t.toLowerCase().includes("family")),
    ).toBe(true);

    // Cannot receive "Best Fit" badge for family of 4
    expect(rec.badge).not.toBe("Best Fit");
  });

  // Test I: Provider quota failure -> graceful fallback
  it("I: fails over gracefully when primary provider returns 429 quota error", async () => {
    const prod = makeProduct({ id: "p1", name: "Safe Product" });

    // Primary model throws 429 quota error
    const primaryModel = new MockLanguageModelV4({
      doGenerate: async () => {
        const error = Object.assign(
          new Error("Resource has been exhausted (e.g. check quota)"),
          { statusCode: 429 },
        );
        throw error;
      },
    });

    // Secondary model succeeds
    const secondaryModel = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [{ type: "text", text: "Successfully answered by fallback provider." }],
          finishReason: { unified: "stop", raw: "STOP" },
          usage: DUMMY_USAGE,
          warnings: [],
        },
      ],
    });

    const candidates: ProviderCandidate[] = [
      {
        name: "google",
        modelId: "gemini-3.8-flash",
        createModel: () => primaryModel,
        timeoutMs: 15_000,
      },
      {
        name: "cerebras",
        modelId: "llama-3.3-70b",
        createModel: () => secondaryModel,
        timeoutMs: 15_000,
      },
    ];

    const turn = await runAgentTurn(
      {
        message: "hello",
        history: [],
      },
      {
        catalog: { search: vi.fn(async () => ({ source: "demo" as const, products: [prod] })), getProduct: vi.fn(async () => prod) },
        providers: candidates,
      },
    );

    expect(turn.mode).toBe("ai");
    expect(turn.model).toBe("llama-3.3-70b");
    expect(turn.content).toBe("Successfully answered by fallback provider.");
  });

  // Test J: Existing provider failover and catalog functionality remain intact
  it("J: preserves full multi-provider failover chain and error typing", async () => {
    const error503 = Object.assign(new Error("All endpoints down"), { statusCode: 503 });

    const failingModel = new MockLanguageModelV4({
      doGenerate: async () => {
        throw error503;
      },
    });

    const candidates: ProviderCandidate[] = [
      { name: "google", modelId: "gemini-3.8-flash", createModel: () => failingModel, timeoutMs: 15_000 },
      { name: "cerebras", modelId: "llama-3.3-70b", createModel: () => failingModel, timeoutMs: 15_000 },
      { name: "groq", modelId: "openai/gpt-oss-120b", createModel: () => failingModel, timeoutMs: 15_000 },
      { name: "openrouter", modelId: "openrouter/free", createModel: () => failingModel, timeoutMs: 15_000 },
    ];

    await expect(
      runAgentTurn(
        { message: "find items", history: [] },
        {
          catalog: { search: vi.fn(async () => ({ source: "demo" as const, products: [] })), getProduct: vi.fn(async () => null) },
          providers: candidates,
        },
      ),
    ).rejects.toThrow();
  });
});
