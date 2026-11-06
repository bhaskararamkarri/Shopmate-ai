import { describe, expect, it } from "vitest";
import { generateRecommendations } from "@/lib/agent/decision-engine";
import type { RankedProduct } from "@/lib/agent/ranking";
import type { ShoppingIntent } from "@/lib/agent/intent";
import type { Product } from "@/types";

function mockProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    name: "Aura Noise-Cancelling Headphones",
    price: 149.99,
    currency: "USD",
    category: "Headphones",
    brand: "Aura",
    description: "Premium over-ear headphones with active noise cancellation and 30 hour battery life.",
    availability: "in_stock",
    source: "demo",
    images: [],
    visual: { glyph: "headphones", tint: "blue" },
    ratings: 4.8,
    reviews: 120,
    specs: {
      "Battery Life": "30 hours",
      "Noise Cancellation": "Active ANC",
      "Weight": "250g",
    },
    ...overrides,
  };
}

function mockRankedProduct(product: Product, score = 0.85, reasons = ["Strong query match"]): RankedProduct {
  return {
    product,
    score,
    breakdown: {
      relevance: 0.9,
      specMatch: 0.8,
      budgetFit: 0.9,
      brandFit: 0.5,
      completeness: 0.9,
    },
    reasons,
  };
}

describe("Phase 3 - Decision Engine & Recommendation Insights", () => {
  it("handles empty ranked products gracefully", () => {
    const results = generateRecommendations([], { brands: [], requiredSpecs: {}, priorities: [], clarifications: [] });
    expect(results).toEqual([]);
  });

  it("assigns evidenced recommendation badges (Best Overall, Best Value, Best Fit)", () => {
    const p1 = mockProduct({ id: "p1", name: "Premium ANC Flagship", price: 220, ratings: 4.9, reviews: 300 });
    const p2 = mockProduct({ id: "p2", name: "Budget Wireless Option", price: 79, ratings: 4.3, reviews: 80 });
    const p3 = mockProduct({ id: "p3", name: "Spec-Focused Pro Model", price: 180, ratings: 4.6, reviews: 150 });

    const ranked: RankedProduct[] = [
      mockRankedProduct(p1, 0.92, ["Top overall benchmark score"]),
      mockRankedProduct(p2, 0.75, ["Lowest price option"]),
      mockRankedProduct(p3, 0.80, ["Exact spec alignment"]),
    ];

    const intent: ShoppingIntent = {
      productCategory: "Headphones",
      budgetMax: 250,
      currency: "USD",
      brands: [],
      requiredSpecs: {},
      priorities: ["Battery Life"],
      clarifications: [],
    };

    const recs = generateRecommendations(ranked, intent);
    expect(recs.length).toBe(3);

    // p1 has highest composite score -> Best Overall
    const p1Rec = recs.find((r) => r.productId === "p1");
    expect(p1Rec?.badge).toBe("Best Overall");

    // p2 has lowest price within budget -> Best Value
    const p2Rec = recs.find((r) => r.productId === "p2");
    expect(p2Rec?.badge).toBe("Best Value");

    // p3 is remaining distinct fit -> Best Fit
    const p3Rec = recs.find((r) => r.productId === "p3");
    expect(p3Rec?.badge).toBe("Best Fit");
  });

  it("transparently identifies missing / unverified attributes without inventing data", () => {
    const incompleteProduct = mockProduct({
      id: "inc-1",
      name: "Basic Wireless Earphones",
      price: 49.99,
      category: "Headphones",
      specs: {}, // No warranty, no battery, no dimensions, no water resistance
      reviews: 0,
    });

    const ranked = [mockRankedProduct(incompleteProduct, 0.6)];
    const intent: ShoppingIntent = {
      productCategory: "Headphones",
      brands: [],
      requiredSpecs: {},
      priorities: [],
      clarifications: [],
    };

    const recs = generateRecommendations(ranked, intent);
    expect(recs[0].missingOrUnverified.length).toBeGreaterThan(0);
    expect(recs[0].missingOrUnverified.some((m) => m.toLowerCase().includes("warranty"))).toBe(true);
    expect(recs[0].missingOrUnverified.some((m) => m.toLowerCase().includes("battery"))).toBe(true);
  });

  it("generates honest trade-offs and persona-based recommendation", () => {
    const highEndProduct = mockProduct({
      id: "high-1",
      name: "Luxury Studio Cans",
      price: 290,
      ratings: 4.9,
    });
    const budgetProduct = mockProduct({
      id: "low-1",
      name: "Entry Level Headphones",
      price: 45,
      ratings: 3.9,
      reviews: 20,
    });

    const ranked = [
      mockRankedProduct(highEndProduct, 0.9),
      mockRankedProduct(budgetProduct, 0.65),
    ];

    const intent: ShoppingIntent = {
      productCategory: "Headphones",
      budgetMax: 300,
      intendedUse: "Long international flights",
      brands: [],
      requiredSpecs: {},
      priorities: [],
      clarifications: [],
    };

    const recs = generateRecommendations(ranked, intent);
    const highRec = recs.find((r) => r.productId === "high-1")!;
    const lowRec = recs.find((r) => r.productId === "low-1")!;

    // Trade-off checks
    expect(highRec.tradeOffs.some((t) => t.toLowerCase().includes("top of the"))).toBe(true);
    expect(lowRec.tradeOffs.some((t) => t.toLowerCase().includes("lowest priced"))).toBe(true);

    // Who should choose
    expect(highRec.whoShouldChoose).toContain("Best for shoppers seeking the strongest overall balance");
    expect(lowRec.whoShouldChoose).toContain("Best for value-conscious buyers");
  });
});
