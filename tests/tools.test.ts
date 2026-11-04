import { describe, expect, it, vi } from "vitest";
import { createAgentTools, normalizeQuery } from "@/lib/agent/tools";
import { emptyIntent, type ShoppingIntent } from "@/lib/agent/intent";
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

const headphones = product({
  id: "p1",
  name: "Sony Wireless Noise Cancelling Headphones",
  brand: "Sony",
  category: "Headphones",
  price: 299,
  ratings: 4.6,
  reviews: 800,
  specs: { "battery-life": "30 hours" },
  description: "Great sound.",
});

const book = product({
  id: "p2",
  name: "No Such Country",
  brand: "Acme Press",
  category: "Books",
  price: 12,
});

function makeCtx(overrides?: {
  search?: ReturnType<typeof vi.fn>;
  getProduct?: ReturnType<typeof vi.fn>;
  intent?: ShoppingIntent;
}) {
  return {
    catalog: {
      search:
        overrides?.search ??
        vi.fn(async () => ({ source: "demo", products: [headphones, book] })),
      getProduct:
        overrides?.getProduct ??
        vi.fn(async (id: string) =>
          id === "p1" ? headphones : id === "p2" ? book : null,
        ),
    },
    budgets: { searches: 3, details: 6, compares: 1 },
    intentRef: { current: overrides?.intent ?? emptyIntent() },
    catalogLog: new Map<string, Product>(),
    recommendedIdsRef: { current: [] as string[] },
    userId: undefined,
  };
}

type Ctx = ReturnType<typeof makeCtx>;

async function call(
  tool: { execute?: unknown },
  input: unknown,
): Promise<unknown> {
  const execute = tool.execute as (
    input: unknown,
    options: unknown,
  ) => Promise<unknown>;
  return execute(input, { toolCallId: "test", messages: [] });
}

describe("normalizeQuery", () => {
  it("trims, collapses whitespace, lowercases, and caps length", () => {
    expect(normalizeQuery("  Wireless   HEADPHONES  ")).toBe(
      "wireless headphones",
    );
    expect(normalizeQuery(`${"x".repeat(200)}`)).toHaveLength(120);
  });
});

describe("searchProducts", () => {
  it("enforces the per-request search budget", async () => {
    const ctx = makeCtx();
    const tools = createAgentTools(ctx);
    for (let i = 0; i < 3; i += 1) {
      await call(tools.searchProducts, { query: `query ${i}` });
    }
    const exhausted = (await call(tools.searchProducts, {
      query: "one too many",
    })) as { error?: string };
    expect(exhausted.error).toBe("budget_exhausted");
  });

  it("passes the normalized query to the catalog", async () => {
    const search = vi.fn(async () => ({ source: "demo", products: [headphones] }));
    const ctx = makeCtx({ search });
    const tools = createAgentTools(ctx);
    await call(tools.searchProducts, { query: "  Wireless   HEADPHONES " });
    expect(search).toHaveBeenCalledWith(
      "wireless headphones",
      expect.objectContaining({ limit: 6 }),
    );
  });

  it("filters irrelevant results and reports the rejected count", async () => {
    const ctx = makeCtx();
    const tools = createAgentTools(ctx);
    const result = (await call(tools.searchProducts, {
      query: "wireless headphones",
    })) as { data?: string };
    expect(result.data).toContain("<catalog-data>");
    const payload = JSON.parse(
      result.data!.replace(/<\/?catalog-data>/g, ""),
    ) as {
      products: Array<{ id: string }>;
      rejectedCount: number;
      source: string;
    };
    expect(payload.products.map((p) => p.id)).toEqual(["p1"]);
    expect(payload.rejectedCount).toBe(1);
    expect(payload.source).toBe("demo");
  });

  it("records returned products in the catalog log", async () => {
    const ctx = makeCtx();
    const tools = createAgentTools(ctx);
    await call(tools.searchProducts, { query: "wireless headphones" });
    expect(ctx.catalogLog.has("p1")).toBe(true);
    expect(ctx.catalogLog.has("p2")).toBe(false);
  });

  it("truncates long descriptions in the model-facing payload", async () => {
    const long = product({
      id: "p3",
      name: "Wireless Headphones Long",
      category: "Headphones",
      description: "d".repeat(600),
    });
    const ctx = makeCtx({ search: vi.fn(async () => ({ source: "demo", products: [long] })) });
    const tools = createAgentTools(ctx);
    const result = (await call(tools.searchProducts, {
      query: "wireless headphones",
    })) as { data?: string };
    const payload = JSON.parse(
      result.data!.replace(/<\/?catalog-data>/g, ""),
    ) as { products: Array<{ description: string }> };
    expect(payload.products[0].description.length).toBeLessThanOrEqual(400);
  });

  it("applies maxPrice and brand filters", async () => {
    const pricey = product({
      id: "p4",
      name: "Bose Wireless Headphones",
      brand: "Bose",
      category: "Headphones",
      price: 400,
    });
    const otherBrand = product({
      id: "p5",
      name: "JBL Wireless Headphones",
      brand: "JBL",
      category: "Headphones",
      price: 100,
    });
    const ctx = makeCtx({ search: vi.fn(async () => ({ source: "demo", products: [headphones, pricey, otherBrand] })) });
    const tools = createAgentTools(ctx);
    const result = (await call(tools.searchProducts, {
      query: "wireless headphones",
      filters: { maxPrice: 300, brand: "Sony" },
    })) as { data?: string };
    const payload = JSON.parse(
      result.data!.replace(/<\/?catalog-data>/g, ""),
    ) as { products: Array<{ id: string }> };
    expect(payload.products.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("getProductDetails", () => {
  it("returns details, logs the product, and reports unknown ids", async () => {
    const ctx = makeCtx();
    const tools = createAgentTools(ctx);
    const found = (await call(tools.getProductDetails, {
      productId: "p1",
    })) as { data?: string };
    expect(found.data).toContain("<catalog-data>");
    expect(ctx.catalogLog.has("p1")).toBe(true);

    const missing = (await call(tools.getProductDetails, {
      productId: "nope",
    })) as { error?: string };
    expect(missing.error).toBe("not_found");
  });

  it("enforces the details budget", async () => {
    const ctx = makeCtx();
    const tools = createAgentTools(ctx);
    for (let i = 0; i < 6; i += 1) {
      await call(tools.getProductDetails, { productId: "p1" });
    }
    const exhausted = (await call(tools.getProductDetails, {
      productId: "p1",
    })) as { error?: string };
    expect(exhausted.error).toBe("budget_exhausted");
  });
});

describe("compareProducts", () => {
  it("compares logged products and reports missing ids", async () => {
    const ctx = makeCtx();
    const tools = createAgentTools(ctx);
    await call(tools.searchProducts, { query: "wireless headphones" });
    const result = (await call(tools.compareProducts, {
      productIds: ["p1", "p2", "missing"],
    })) as { data?: string };
    const payload = JSON.parse(
      result.data!.replace(/<\/?catalog-data>/g, ""),
    ) as { products: Array<{ id: string }>; missingIds: string[] };
    expect(payload.products.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(payload.missingIds).toEqual(["missing"]);
  });

  it("enforces the compare budget", async () => {
    const ctx = makeCtx();
    const tools = createAgentTools(ctx);
    await call(tools.compareProducts, { productIds: ["p1", "p2"] });
    const exhausted = (await call(tools.compareProducts, {
      productIds: ["p1", "p2"],
    })) as { error?: string };
    expect(exhausted.error).toBe("budget_exhausted");
  });
});

describe("refineSearch", () => {
  it("composes a refined query without consuming search budget", async () => {
    const ctx = makeCtx();
    const tools = createAgentTools(ctx);
    const result = (await call(tools.refineSearch, {
      originalQuery: "headphones",
      missingRequirements: ["noise cancelling", "under 200 USD"],
    })) as { refinedQuery?: string };
    expect(result.refinedQuery).toContain("headphones");
    expect(result.refinedQuery).toContain("noise cancelling");
    // No Channel3 search was spent.
    expect(ctx.catalog.search).not.toHaveBeenCalled();
    // The search budget is still intact afterwards.
    const search = (await call(tools.searchProducts, {
      query: "headphones",
    })) as { data?: string };
    expect(search.data).toBeDefined();
  });
});

describe("recordIntent", () => {
  it("merges intent and drops recommended ids not seen in the catalog log", async () => {
    const ctx = makeCtx();
    const tools = createAgentTools(ctx);
    await call(tools.searchProducts, { query: "wireless headphones" });
    const result = (await call(tools.recordIntent, {
      category: "headphones",
      budget: { amount: 300, currency: "USD" },
      brands: ["Sony"],
      recommendedProductIds: ["p1", "hallucinated-id"],
    })) as { acceptedRecommendedIds?: string[] };
    expect(ctx.intentRef.current.category).toBe("headphones");
    expect(ctx.intentRef.current.budget).toEqual({ amount: 300, currency: "USD" });
    expect(ctx.intentRef.current.brands).toEqual(["Sony"]);
    expect(result.acceptedRecommendedIds).toEqual(["p1"]);
    expect(ctx.recommendedIdsRef.current).toEqual(["p1"]);
  });
});
