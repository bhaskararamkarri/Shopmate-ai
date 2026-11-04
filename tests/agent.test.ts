import { afterEach, describe, expect, it, vi } from "vitest";

// Conditional model failure: SHOPMATE_FAIL_MODEL=1 makes the google provider
// hand back a model that explodes on construction, exercising the
// ai_unavailable mapping without any network.
vi.mock("@ai-sdk/google", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@ai-sdk/google")>();
  return {
    ...actual,
    createGoogle: vi.fn((...args: Parameters<typeof actual.createGoogle>) => {
      if (process.env.SHOPMATE_FAIL_MODEL === "1") {
        return () => {
          throw new Error("simulated model failure");
        };
      }
      return actual.createGoogle(...args);
    }),
  };
});

import { assembleTurn, runAgentTurn, AgentTurnError } from "@/lib/agent/agent";
import { emptyIntent } from "@/lib/agent/intent";
import type { Product } from "@/types";

function product(overrides: Partial<Product> & { id: string }): Product {
  return {
    name: "Generic Product",
    description: "",
    price: 100,
    currency: "USD",
    availability: "in_stock",
    images: [],
    ratings: 0,
    reviews: 0,
    category: "General",
    brand: "Generic",
    specs: {},
    source: "demo",
    ...overrides,
  };
}

const cheap = product({
  id: "cheap",
  name: "Sony Wireless Headphones",
  brand: "Sony",
  category: "Headphones",
  price: 80,
  ratings: 4.5,
  reviews: 900,
});

const pricey = product({
  id: "pricey",
  name: "Sony Wireless Headphones Elite",
  brand: "Sony",
  category: "Headphones",
  price: 350,
  ratings: 4.8,
  reviews: 1200,
});

function setEnv(overrides: Record<string, string | undefined>) {
  for (const key of [
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GEMINI_API_KEY",
    "SHOPMATE_AI_PROVIDER",
    "SHOPMATE_AI_MODEL",
    "SHOPMATE_FAIL_MODEL",
  ]) {
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
}

describe("assembleTurn", () => {
  const baseInput = {
    content: "Here are my picks.",
    intent: emptyIntent(),
    catalogLog: new Map<string, Product>(),
    recommendedIds: [] as string[],
    comparisons: [] as { productIds: string[]; missingIds: string[] }[],
    catalogMeta: { source: "demo" as const },
    toolsUsed: ["searchProducts"],
    query: "wireless headphones",
    mode: "ai" as const,
  };

  it("drops recommended ids that never came from a tool", () => {
    const catalogLog = new Map([
      ["cheap", cheap],
      ["pricey", pricey],
    ]);
    const result = assembleTurn({
      ...baseInput,
      catalogLog,
      recommendedIds: ["cheap", "hallucinated-id"],
    });
    expect(result.productIds).not.toContain("hallucinated-id");
    expect(result.productIds).toContain("cheap");
  });

  it("never returns products outside the catalog log", () => {
    const result = assembleTurn({
      ...baseInput,
      catalogLog: new Map([["cheap", cheap]]),
      recommendedIds: ["pricey"], // not in the log — must be ignored
    });
    expect(result.products.map((p) => p.id)).toEqual(["cheap"]);
  });

  it("ranks products with the deterministic engine", () => {
    const catalogLog = new Map([
      ["cheap", cheap],
      ["pricey", pricey],
    ]);
    const result = assembleTurn({
      ...baseInput,
      catalogLog,
      intent: {
        ...emptyIntent(),
        budget: { amount: 100, currency: "USD" },
      },
    });
    expect(result.products[0].id).toBe("cheap");
  });

  it("carries clarifications from the intent", () => {
    const result = assembleTurn({
      ...baseInput,
      intent: {
        ...emptyIntent(),
        clarifications: ["Over-ear or in-ear?"],
      },
    });
    expect(result.clarifications).toEqual(["Over-ear or in-ear?"]);
  });

  it("maps comparison groups to logged products only", () => {
    const catalogLog = new Map([
      ["cheap", cheap],
      ["pricey", pricey],
    ]);
    const result = assembleTurn({
      ...baseInput,
      catalogLog,
      comparisons: [
        { productIds: ["cheap", "pricey", "ghost"], missingIds: ["ghost"] },
      ],
    });
    expect(result.comparisons[0].products.map((p) => p.id)).toEqual([
      "cheap",
      "pricey",
    ]);
    expect(result.comparisons[0].missingIds).toEqual(["ghost"]);
  });

  it("caps the product list at six", () => {
    const many: [string, Product][] = Array.from({ length: 9 }, (_, i) => [
      `p${i}`,
      product({ id: `p${i}`, name: `Wireless Headphones ${i}` }),
    ]);
    const result = assembleTurn({
      ...baseInput,
      catalogLog: new Map(many),
    });
    expect(result.products).toHaveLength(6);
  });
});

describe("runAgentTurn — keyword fallback", () => {
  afterEach(() => setEnv({}));

  it("returns labeled keyword_fallback results from the catalog", async () => {
    setEnv({}); // no key → fallback mode
    const catalog = {
      search: vi.fn(async () => ({
        source: "demo" as const,
        products: [cheap, pricey],
      })),
      getProduct: vi.fn(async () => null),
    };
    const result = await runAgentTurn(
      { history: [], message: "wireless headphones" },
      { catalog },
    );
    expect(result.mode).toBe("keyword_fallback");
    expect(result.catalog.source).toBe("demo");
    expect(result.content).toContain("keyword");
    expect(result.products.length).toBeGreaterThan(0);
    expect(catalog.search).toHaveBeenCalled();
  });

  it("labels the fallback clearly instead of claiming AI recommendations", async () => {
    setEnv({});
    const catalog = {
      search: vi.fn(async () => ({
        source: "demo" as const,
        products: [cheap],
      })),
      getProduct: vi.fn(async () => null),
    };
    const result = await runAgentTurn(
      { history: [], message: "headphones" },
      { catalog },
    );
    expect(result.content).toContain("AI assistance isn't configured");
    expect(result.content).toContain("keyword");
    expect(result.mode).toBe("keyword_fallback");
  });
});

describe("runAgentTurn — error mapping", () => {
  afterEach(() => {
    setEnv({});
    delete process.env.SHOPMATE_FAIL_MODEL;
  });

  it("maps a model failure to ai_unavailable", async () => {
    setEnv({
      GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
      SHOPMATE_FAIL_MODEL: "1",
    });
    await expect(
      runAgentTurn({ history: [], message: "hello" }, {}),
    ).rejects.toBeInstanceOf(AgentTurnError);
    await expect(
      runAgentTurn({ history: [], message: "hello" }, {}),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
  });
});
