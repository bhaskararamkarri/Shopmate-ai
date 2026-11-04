import { describe, expect, it } from "vitest";
import {
  filterRelevant,
  scoreRelevance,
  tokenize,
  type RelevanceCriteria,
} from "@/lib/agent/relevance";
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
  name: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
  brand: "Sony",
  category: "Over-Ear Headphones",
  description: "Industry-leading ANC with 30-hour battery life.",
  price: 349,
  specs: { "battery-life": "30 hours", "noise-cancellation": "active" },
});

const earbuds = product({
  id: "p2",
  name: "Generic True Wireless Earbuds",
  brand: "Generic",
  category: "In-Ear Headphones",
  price: 49,
});

const country = product({
  id: "p3",
  name: "No Such Country",
  brand: "Generic",
  category: "Books",
  price: 12,
});

describe("tokenize", () => {
  it("lowercases, strips punctuation, and drops stopwords", () => {
    expect(tokenize("The Best Wireless Headphones!")).toEqual([
      "best",
      "wireless",
      "headphones",
    ]);
  });

  it("splits hyphenated compounds", () => {
    expect(tokenize("noise-cancelling over-ear")).toEqual([
      "noise",
      "cancelling",
      "over",
      "ear",
    ]);
  });
});

describe("scoreRelevance", () => {
  const baseCriteria: RelevanceCriteria = { tokens: ["wireless", "headphones"] };

  it("scores a strong title match highly", () => {
    const score = scoreRelevance(headphones, baseCriteria);
    expect(score).toBeGreaterThan(0.5);
  });

  it("scores an unrelated product near zero", () => {
    const score = scoreRelevance(country, baseCriteria);
    expect(score).toBeLessThan(0.15);
  });

  it("rewards a brand match", () => {
    // Unsaturated base (one token unmatched) so the bonus is observable.
    const withBrand = scoreRelevance(earbuds, {
      tokens: ["wireless", "battery"],
      brands: ["generic"],
    });
    const withoutBrand = scoreRelevance(earbuds, {
      tokens: ["wireless", "battery"],
    });
    expect(withBrand).toBeGreaterThan(withoutBrand);
  });

  it("rewards a category match", () => {
    const withCategory = scoreRelevance(headphones, {
      tokens: ["wireless", "battery"],
      category: "over ear headphones",
    });
    const withoutCategory = scoreRelevance(headphones, {
      tokens: ["wireless", "battery"],
    });
    expect(withCategory).toBeGreaterThan(withoutCategory);
  });

  it("is capped at 1", () => {
    const score = scoreRelevance(headphones, {
      tokens: ["sony", "wireless", "headphones", "noise"],
      brands: ["sony"],
      category: "over ear headphones",
      requiredSpecs: { "noise-cancellation": "active" },
    });
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("filterRelevant", () => {
  it("keeps relevant products and rejects fuzzy noise", () => {
    const result = filterRelevant([headphones, earbuds, country], {
      tokens: ["wireless", "headphones"],
    });
    expect(result.relevant.map((r) => r.product.id)).toEqual(["p1", "p2"]);
    expect(result.rejected.some((r) => r.id === "p3")).toBe(true);
  });

  it("rejects products over budget with a reason", () => {
    const result = filterRelevant([headphones, earbuds], {
      tokens: ["wireless", "headphones"],
      budget: { amount: 100, currency: "USD" },
    });
    const rejectedHeadphones = result.rejected.find((r) => r.id === "p1");
    expect(rejectedHeadphones?.reason).toContain("budget");
    expect(result.relevant.map((r) => r.product.id)).toEqual(["p2"]);
  });

  it("treats a missing required spec as neutral, not disqualifying", () => {
    const result = filterRelevant([earbuds], {
      tokens: ["wireless", "headphones"],
      requiredSpecs: { "noise-cancellation": "active" },
    });
    expect(result.relevant).toHaveLength(1);
  });

  it("rejects a product whose spec contradicts the requirement", () => {
    const wired = product({
      id: "p4",
      name: "Wired Over-Ear Headphones",
      category: "Over-Ear Headphones",
      specs: { "noise-cancellation": "none" },
    });
    const result = filterRelevant([wired], {
      tokens: ["headphones"],
      requiredSpecs: { "noise-cancellation": "active" },
    });
    expect(result.relevant).toHaveLength(0);
    expect(result.rejected[0]?.reason).toContain("noise-cancellation");
  });

  it("returns a suggestion when everything is rejected", () => {
    const result = filterRelevant([country], {
      tokens: ["wireless", "headphones"],
    });
    expect(result.relevant).toHaveLength(0);
    expect(result.suggestion).toBeTruthy();
  });

  it("orders relevant products by score descending", () => {
    const result = filterRelevant([earbuds, headphones], {
      tokens: ["sony", "wireless", "headphones"],
    });
    expect(result.relevant[0].product.id).toBe("p1");
    expect(result.relevant[0].score).toBeGreaterThanOrEqual(
      result.relevant[1].score,
    );
  });
});
