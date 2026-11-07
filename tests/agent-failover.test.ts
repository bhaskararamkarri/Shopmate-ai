import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { runAgentTurn } from "@/lib/agent/agent";
import type { ProviderCandidate } from "@/lib/agent/provider";
import type { Product } from "@/types";

interface HttpError extends Error {
  statusCode?: number;
}

function statusError(message: string, statusCode: number): HttpError {
  const err = new Error(message) as HttpError;
  err.statusCode = statusCode;
  return err;
}

function product(overrides: Partial<Product> & { id: string }): Product {
  return {
    name: "Sony WH-1000XM5 Wireless Headphones",
    description: "Industry leading noise canceling",
    price: 349,
    currency: "USD",
    availability: "in_stock",
    images: ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e"],
    ratings: 4.8,
    reviews: 1200,
    category: "Headphones",
    brand: "Sony",
    specs: { ANC: "Active Noise Cancellation", Battery: "30 hours" },
    source: "demo",
    ...overrides,
  };
}

const p1 = product({ id: "p1", name: "Sony WH-1000XM5", price: 349 });
const p2 = product({ id: "p2", name: "Anker Soundcore Q30", price: 79 });

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
  raw: {},
};

function createMockToolModel(responseText: string, toolQuery = "headphones") {
  return new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "searchProducts",
            input: JSON.stringify({ query: toolQuery }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "STOP" },
        usage: USAGE,
        warnings: [],
      },
      {
        content: [{ type: "text", text: responseText }],
        finishReason: { unified: "stop", raw: "STOP" },
        usage: USAGE,
        warnings: [],
      },
    ],
  });
}

function createFailingModel(errorFactory: () => Error) {
  return new MockLanguageModelV4({
    doGenerate: () => {
      throw errorFactory();
    },
  });
}

describe("runAgentTurn multi-provider automatic failover", () => {
  it("uses primary provider (Google) when it succeeds", async () => {
    const searchMock = vi.fn(async () => ({ source: "demo" as const, products: [p1, p2] }));
    const catalog = { search: searchMock, getProduct: vi.fn(async () => null) };

    const googleModel = createMockToolModel("Here are the top headphones from Google Gemini.");

    const providers: ProviderCandidate[] = [
      {
        name: "google",
        modelId: "gemini-3.8-flash",
        createModel: () => googleModel,
        timeoutMs: 15_000,
      },
      {
        name: "cerebras",
        modelId: "llama-3.3-70b",
        createModel: () => createMockToolModel("Cerebras response"),
        timeoutMs: 15_000,
      },
    ];

    const result = await runAgentTurn(
      { history: [], message: "best headphones" },
      { catalog, providers },
    );

    expect(result.mode).toBe("ai");
    expect(result.content).toBe("Here are the top headphones from Google Gemini.");
    expect(result.model).toBe("gemini-3.8-flash");
    expect(result.products.length).toBe(2);
    expect(searchMock).toHaveBeenCalledTimes(1);
  });

  it("automatically fails over from Google (429) to Cerebras", async () => {
    const searchMock = vi.fn(async () => ({ source: "demo" as const, products: [p1, p2] }));
    const catalog = { search: searchMock, getProduct: vi.fn(async () => null) };

    const failingGoogle = createFailingModel(() =>
      statusError("Rate limit exceeded for gemini-3.8-flash", 429),
    );

    const successfulCerebras = createMockToolModel("Here are headphones found via Cerebras.");

    const providers: ProviderCandidate[] = [
      {
        name: "google",
        modelId: "gemini-3.8-flash",
        createModel: () => failingGoogle,
        timeoutMs: 15_000,
      },
      {
        name: "cerebras",
        modelId: "llama-3.3-70b",
        createModel: () => successfulCerebras,
        timeoutMs: 15_000,
      },
    ];

    const result = await runAgentTurn(
      { history: [], message: "best headphones" },
      { catalog, providers },
    );

    expect(result.mode).toBe("ai");
    expect(result.content).toBe("Here are headphones found via Cerebras.");
    expect(result.model).toBe("llama-3.3-70b");
    expect(result.products.length).toBe(2);
  });

  it("fails over across three tiers: Google (timeout) -> Cerebras (503) -> Groq", async () => {
    const searchMock = vi.fn(async () => ({ source: "demo" as const, products: [p1, p2] }));
    const catalog = { search: searchMock, getProduct: vi.fn(async () => null) };

    const timeoutGoogle = createFailingModel(() => {
      const err = new Error("Request timed out");
      err.name = "TimeoutError";
      return err;
    });

    const unavailableCerebras = createFailingModel(() =>
      statusError("Cerebras service temporarily unavailable", 503),
    );

    const successfulGroq = createMockToolModel("Recommendations powered by Groq.");

    const providers: ProviderCandidate[] = [
      {
        name: "google",
        modelId: "gemini-3.8-flash",
        createModel: () => timeoutGoogle,
        timeoutMs: 15_000,
      },
      {
        name: "cerebras",
        modelId: "llama-3.3-70b",
        createModel: () => unavailableCerebras,
        timeoutMs: 15_000,
      },
      {
        name: "groq",
        modelId: "openai/gpt-oss-120b",
        createModel: () => successfulGroq,
        timeoutMs: 15_000,
      },
    ];

    const result = await runAgentTurn(
      { history: [], message: "best headphones" },
      { catalog, providers },
    );

    expect(result.mode).toBe("ai");
    expect(result.content).toBe("Recommendations powered by Groq.");
    expect(result.model).toBe("openai/gpt-oss-120b");
    expect(result.products.length).toBe(2);
  });

  it("throws structured AgentTurnError with attempt trail when all providers fail", async () => {
    const catalog = {
      search: vi.fn(async () => ({ source: "demo" as const, products: [] })),
      getProduct: vi.fn(async () => null),
    };

    const providers: ProviderCandidate[] = [
      {
        name: "google",
        modelId: "gemini-3.8-flash",
        createModel: () =>
          createFailingModel(() => statusError("Google 429", 429)),
        timeoutMs: 15_000,
      },
      {
        name: "groq",
        modelId: "openai/gpt-oss-120b",
        createModel: () =>
          createFailingModel(() => statusError("Groq 500", 500)),
        timeoutMs: 15_000,
      },
    ];

    await expect(
      runAgentTurn({ history: [], message: "hello" }, { catalog, providers }),
    ).rejects.toMatchObject({
      code: "ai_unavailable",
      upstreamStatus: 500,
    });
  });

  it("ensures tool context isolation so failed attempts leave no corrupt state", async () => {
    let callCount = 0;
    const searchMock = vi.fn(async () => {
      callCount++;
      return { source: "demo" as const, products: [callCount === 1 ? p1 : p2] };
    });
    const catalog = { search: searchMock, getProduct: vi.fn(async () => null) };

    let googleCalls = 0;
    const halfFailedGoogle = new MockLanguageModelV4({
      doGenerate: async () => {
        googleCalls++;
        if (googleCalls === 1) {
          return {
            content: [
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "searchProducts",
                input: JSON.stringify({ query: "first query" }),
              },
            ],
            finishReason: { unified: "tool-calls", raw: "STOP" },
            usage: USAGE,
            warnings: [],
          };
        }
        throw statusError("Internal Server Error", 500);
      },
    });

    const cleanCerebras = createMockToolModel("Clean Cerebras completion", "headphones");

    const providers: ProviderCandidate[] = [
      {
        name: "google",
        modelId: "gemini-3.8-flash",
        createModel: () => halfFailedGoogle,
        timeoutMs: 15_000,
      },
      {
        name: "cerebras",
        modelId: "llama-3.3-70b",
        createModel: () => cleanCerebras,
        timeoutMs: 15_000,
      },
    ];

    const result = await runAgentTurn(
      { history: [], message: "headphones" },
      { catalog, providers },
    );

    expect(result.mode).toBe("ai");
    expect(result.model).toBe("llama-3.3-70b");
    // Cerebras should have its own clean search result (p2), not carrying over Google's partial p1
    expect(result.products.map((p) => p.id)).toEqual(["p2"]);
    expect(searchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves budget refinement across multi-turn intent through failover", async () => {
    const searchMock = vi.fn(async () => ({ source: "demo" as const, products: [p2] }));
    const catalog = { search: searchMock, getProduct: vi.fn(async () => null) };

    const failingGoogle = createFailingModel(() => statusError("Rate limit", 429));
    const successfulCerebras = createMockToolModel("Budget updated to $80.");

    const providers: ProviderCandidate[] = [
      {
        name: "google",
        modelId: "gemini-3.8-flash",
        createModel: () => failingGoogle,
        timeoutMs: 15_000,
      },
      {
        name: "cerebras",
        modelId: "llama-3.3-70b",
        createModel: () => successfulCerebras,
        timeoutMs: 15_000,
      },
    ];

    // Turn 2: User refines budget to under $80 with existing category and brand preferences
    const result = await runAgentTurn(
      {
        history: [
          { role: "user", content: "I want wireless headphones" },
          { role: "assistant", content: "Sure! What is your budget?" },
        ],
        message: "keep it under $80 please",
        intent: {
          productCategory: "Headphones",
          priorities: ["noise cancelling"],
          brands: ["Sony", "Anker"],
          requiredSpecs: {},
          clarifications: [],
          query: "wireless headphones",
        },
      },
      { catalog, providers },
    );

    expect(result.mode).toBe("ai");
    expect(result.model).toBe("llama-3.3-70b");
    // Intent should preserve previous category and brands, with updated budgetMax = 80
    expect(result.intent.productCategory).toBe("Headphones");
    expect(result.intent.brands).toEqual(["Sony", "Anker"]);
    expect(result.intent.budgetMax).toBe(80);
    expect(result.intent.budget).toEqual({ amount: 80, currency: "USD" });
  });

  it("fails over through all 4 providers: Google (404) -> Cerebras (timeout) -> Groq (429) -> OpenRouter", async () => {
    const searchMock = vi.fn(async () => ({ source: "demo" as const, products: [p1] }));
    const catalog = { search: searchMock, getProduct: vi.fn(async () => null) };

    const failingGoogle = createFailingModel(() => statusError("Google 404 Model Not Found", 404));
    const timeoutCerebras = createFailingModel(() => {
      const err = new Error("Cerebras inference timeout");
      err.name = "TimeoutError";
      return err;
    });
    const failingGroq = createFailingModel(() => statusError("Groq 429 Rate Limit", 429));
    const successfulOpenRouter = createMockToolModel("Recommended from OpenRouter fallback.");

    const providers: ProviderCandidate[] = [
      {
        name: "google",
        modelId: "gemini-3.8-flash",
        createModel: () => failingGoogle,
        timeoutMs: 15_000,
      },
      {
        name: "cerebras",
        modelId: "gpt-oss-120b",
        createModel: () => timeoutCerebras,
        timeoutMs: 15_000,
      },
      {
        name: "groq",
        modelId: "openai/gpt-oss-120b",
        createModel: () => failingGroq,
        timeoutMs: 15_000,
      },
      {
        name: "openrouter",
        modelId: "openrouter/free",
        createModel: () => successfulOpenRouter,
        timeoutMs: 15_000,
      },
    ];

    const result = await runAgentTurn(
      { history: [], message: "running shoes" },
      { catalog, providers },
    );

    expect(result.mode).toBe("ai");
    expect(result.model).toBe("openrouter/free");
    expect(result.content).toBe("Recommended from OpenRouter fallback.");
    expect(result.products.length).toBe(1);
  });
});
