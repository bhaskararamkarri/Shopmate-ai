import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEIGHTS,
  adaptWeights,
  rankProducts,
  type RankingCriteria,
} from "@/lib/agent/ranking";
import { scoreRelevance } from "@/lib/agent/relevance";
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

const cheapSony = product({
  id: "cheap",
  name: "Sony Wireless Headphones",
  brand: "Sony",
  category: "Headphones",
  price: 80,
  ratings: 4.5,
  reviews: 900,
  specs: { "battery-life": "40 hours" },
});

const priceySony = product({
  id: "pricey",
  name: "Sony Wireless Headphones Elite",
  brand: "Sony",
  category: "Headphones",
  price: 350,
  ratings: 4.8,
  reviews: 1200,
  specs: { "battery-life": "30 hours", "noise-cancellation": "active" },
});

const generic = product({
  id: "generic",
  name: "Wireless Headphones Basic",
  brand: "Acme",
  category: "Headphones",
  price: 45,
  ratings: 4.0,
  reviews: 120,
  specs: {},
});

function criteriaFor(
  overrides: Partial<RankingCriteria> = {},
): RankingCriteria {
  return {
    tokens: ["wireless", "headphones"],
    brands: [],
    requiredSpecs: {},
    budget: null,
    ...overrides,
  };
}

describe("DEFAULT_WEIGHTS", () => {
  it("matches the spec's initial weighting and sums to 1", () => {
    expect(DEFAULT_WEIGHTS.relevance).toBe(0.35);
    expect(DEFAULT_WEIGHTS.specMatch).toBe(0.3);
    expect(DEFAULT_WEIGHTS.budgetFit).toBe(0.2);
    expect(DEFAULT_WEIGHTS.brandFit).toBe(0.1);
    expect(DEFAULT_WEIGHTS.completeness).toBe(0.05);
    expect(
      Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0),
    ).toBeCloseTo(1, 10);
  });
});

describe("adaptWeights", () => {
  it("returns the default weights for no priorities", () => {
    expect(adaptWeights(DEFAULT_WEIGHTS, [])).toEqual(DEFAULT_WEIGHTS);
  });

  it("shifts weight into specMatch and renormalizes to 1", () => {
    const adapted = adaptWeights(DEFAULT_WEIGHTS, ["battery life"]);
    expect(adapted.specMatch).toBeGreaterThan(DEFAULT_WEIGHTS.specMatch);
    expect(
      Object.values(adapted).reduce((a, b) => a + b, 0),
    ).toBeCloseTo(1, 10);
  });

  it("caps the total shift so the engine stays balanced", () => {
    const adapted = adaptWeights(DEFAULT_WEIGHTS, [
      "battery life",
      "sound quality",
      "comfort",
      "price",
    ]);
    expect(adapted.specMatch).toBeLessThanOrEqual(0.5);
    expect(
      Object.values(adapted).reduce((a, b) => a + b, 0),
    ).toBeCloseTo(1, 10);
  });
});

describe("rankProducts", () => {
  it("orders by total score descending and attaches reasons", () => {
    const ranked = rankProducts(
      [generic, priceySony, cheapSony],
      criteriaFor({ budget: { amount: 100, currency: "USD" } }),
    );
    expect(ranked[0].product.id).toBe("cheap");
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked.every((r) => r.reasons.length > 0)).toBe(true);
    expect(ranked.every((r) => r.score >= 0 && r.score <= 1)).toBe(true);
  });

  it("breaks score ties deterministically on ratings, then reviews, then id", () => {
    // cheap and generic tie on total score without a budget; cheap wins on
    // ratings — and would win on reviews if ratings were equal too.
    const ranked = rankProducts([generic, cheapSony], criteriaFor());
    expect(ranked[0].product.id).toBe("cheap");
  });

  it("prefers the brand the user asked for", () => {
    const ranked = rankProducts(
      [generic, cheapSony],
      criteriaFor({ brands: ["sony"] }),
    );
    expect(ranked[0].product.id).toBe("cheap");
  });

  it("rewards spec matches against required specs", () => {
    const ranked = rankProducts(
      [cheapSony, priceySony],
      criteriaFor({ requiredSpecs: { "noise-cancellation": "active" } }),
    );
    expect(ranked[0].product.id).toBe("pricey");
  });

  it("adapts to a stated priority (battery life)", () => {
    const neutral = rankProducts(
      [generic, cheapSony],
      criteriaFor({ budget: { amount: 100, currency: "USD" } }),
    );
    const batteryFirst = rankProducts(
      [generic, cheapSony],
      criteriaFor({
        budget: { amount: 100, currency: "USD" },
        priorities: ["battery life"],
      }),
    );
    // cheapSony has the stronger battery spec; prioritizing battery life must
    // not lose it the lead it already has, and its spec-driven share of the
    // score must grow.
    expect(batteryFirst[0].product.id).toBe("cheap");
    const specShare = (r: (typeof batteryFirst)[number]) =>
      r.breakdown.specMatch / r.score;
    expect(specShare(batteryFirst[0])).toBeGreaterThan(specShare(neutral[0]));
  });

  it("is deterministic: identical inputs produce identical output", () => {
    const a = rankProducts([generic, cheapSony], criteriaFor());
    const b = rankProducts([generic, cheapSony], criteriaFor());
    expect(a).toEqual(b);
  });

  it("explains budget fit and misses", () => {
    const ranked = rankProducts(
      [priceySony],
      criteriaFor({ budget: { amount: 100, currency: "USD" } }),
    );
    const reasons = ranked[0].reasons.join(" ").toLowerCase();
    expect(reasons).toContain("budget");
  });
});

describe("scoreRelevance integration", () => {
  it("ranking consumes relevance scores for the relevance component", () => {
    const score = scoreRelevance(cheapSony, {
      tokens: ["wireless", "headphones"],
    });
    expect(score).toBeGreaterThan(0);
    const ranked = rankProducts([cheapSony], criteriaFor());
    expect(ranked[0].breakdown.relevance).toBeCloseTo(score, 6);
  });
});
