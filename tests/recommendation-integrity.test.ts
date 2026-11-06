import { describe, expect, it } from "vitest";
import { generateRecommendations } from "@/lib/agent/decision-engine";
import { rankProducts } from "@/lib/agent/ranking";
import { emptyIntent, mergeIntent } from "@/lib/agent/intent";
import { parseBudgetHint } from "@/lib/agent/agent";
import type { Product } from "@/types";

const baseProduct: Product = {
  id: "prod-base",
  name: "Standard Headphones",
  description: "Standard stereo headphones with 3.5mm jack.",
  price: 50,
  currency: "USD",
  availability: "in_stock",
  images: ["https://example.com/img.jpg"],
  ratings: 4.5,
  reviews: 100,
  category: "Headphones",
  brand: "AudioBrand",
  specs: { Battery: "None", Connectivity: "Wired" },
  source: "demo",
};

describe("Phase 3.1 — Recommendation Integrity Audit Scenarios", () => {
  it("Scenario 1: Cheap product failing a mandatory requirement must NOT receive Best Value or Best Overall", () => {
    const pCheapFails: Product = {
      ...baseProduct,
      id: "p-cheap",
      name: "Cheap Earbuds",
      description: "Basic earbuds with no noise cancelling.",
      price: 15,
      currency: "USD",
      specs: { ANC: "No" },
    };
    const pCompliant: Product = {
      ...baseProduct,
      id: "p-compliant",
      name: "Wireless ANC Pro Headphones",
      description: "Over-ear active noise cancelling wireless headphones.",
      price: 120,
      currency: "USD",
      specs: { ANC: "Active Noise Cancellation", Wireless: "Bluetooth 5.2" },
    };

    const intent = {
      ...emptyIntent(),
      productCategory: "Headphones",
      budgetMax: 150,
      currency: "USD",
      requiredFeatures: ["Active Noise Cancellation"],
      requiredSpecs: { ANC: "Active Noise Cancellation" },
    };

    const ranked = rankProducts([pCheapFails, pCompliant], {
      tokens: ["headphones", "active", "noise", "cancellation"],
      brands: [],
      requiredSpecs: intent.requiredSpecs,
      budget: { amount: 150, currency: "USD" },
    });

    const recs = generateRecommendations(ranked, intent);
    const cheapRec = recs.find((r) => r.productId === "p-cheap");
    const compliantRec = recs.find((r) => r.productId === "p-compliant");

    // p-cheap failed mandatory requirement -> must NOT receive Best Value or Best Overall
    expect(cheapRec?.badge).toBeUndefined();
    expect(cheapRec?.failedRequirements?.length).toBeGreaterThan(0);
    expect(
      cheapRec?.failedRequirements?.some((f) => f.includes("ANC") || f.includes("Active Noise")),
    ).toBe(true);

    // p-compliant satisfies mandatory requirement -> receives Best Overall
    expect(compliantRec?.badge).toBe("Best Overall");
  });

  it("Scenario 2: Expensive product exceeding budget must NOT receive Best Fit without explaining failure", () => {
    const pOverBudget: Product = {
      ...baseProduct,
      id: "p-over",
      name: "Luxury Headphones",
      price: 500,
      currency: "USD",
      specs: { ANC: "Active Noise Cancellation" },
    };
    const pInBudget: Product = {
      ...baseProduct,
      id: "p-in",
      name: "Mid-Range Headphones",
      price: 180,
      currency: "USD",
      specs: { ANC: "Active Noise Cancellation" },
    };

    const intent = {
      ...emptyIntent(),
      productCategory: "Headphones",
      budgetMax: 200,
      currency: "USD",
      budget: { amount: 200, currency: "USD" },
    };

    const ranked = rankProducts([pOverBudget, pInBudget], {
      tokens: ["headphones"],
      brands: [],
      requiredSpecs: {},
      budget: { amount: 200, currency: "USD" },
    });

    const recs = generateRecommendations(ranked, intent);
    const overRec = recs.find((r) => r.productId === "p-over");
    const inRec = recs.find((r) => r.productId === "p-in");

    // Product exceeding budget must NOT be awarded Best Fit
    expect(overRec?.badge).not.toBe("Best Fit");
    expect(overRec?.failedRequirements?.length).toBeGreaterThan(0);
    expect(overRec?.tradeOffs.some((t) => t.includes("Exceeds budget ceiling"))).toBe(true);

    // In-budget compliant product gets Best Overall
    expect(inRec?.badge).toBe("Best Overall");
  });

  it("Scenario 3: Products with different currencies must never be compared using raw numbers", () => {
    const pUSD: Product = {
      ...baseProduct,
      id: "p-usd",
      name: "US Product",
      price: 100,
      currency: "USD",
    };
    const pEUR: Product = {
      ...baseProduct,
      id: "p-eur",
      name: "EU Product",
      price: 90,
      currency: "EUR",
    };
    const pINR: Product = {
      ...baseProduct,
      id: "p-inr",
      name: "IN Product",
      price: 8000,
      currency: "INR",
    };

    const intent = {
      ...emptyIntent(),
      budgetMax: 150,
      currency: "USD",
      budget: { amount: 150, currency: "USD" },
    };

    const ranked = rankProducts([pUSD, pEUR, pINR], {
      tokens: ["headphones"],
      brands: [],
      requiredSpecs: {},
      budget: intent.budget,
    });

    const recs = generateRecommendations(ranked, intent);
    const eurRec = recs.find((r) => r.productId === "p-eur");
    const inrRec = recs.find((r) => r.productId === "p-inr");

    // Unconverted currencies must NOT be awarded Best Value based on raw numbers
    expect(eurRec?.badge).not.toBe("Best Value");
    expect(inrRec?.badge).not.toBe("Best Value");

    // Must explicitly note that currency conversion is unavailable without exchange rate
    expect(
      eurRec?.missingOrUnverified.some((m) => m.includes("exchange rate")),
    ).toBe(true);
    expect(
      inrRec?.missingOrUnverified.some((m) => m.includes("exchange rate")),
    ).toBe(true);
  });

  it("Scenario 4: Product missing specifications must remain unknown, never assumed positive or negative", () => {
    const pMissingSpecs: Product = {
      id: "p-missing",
      name: "Mystery Listing",
      description: "Simple audio item.",
      price: 45,
      currency: "USD",
      availability: "unknown",
      images: [],
      ratings: 0,
      reviews: 0,
      category: "Headphones",
      brand: "Unknown",
      specs: {},
      source: "demo",
    };

    const ranked = rankProducts([pMissingSpecs], {
      tokens: ["headphones"],
      brands: [],
      requiredSpecs: { Bluetooth: "5.0" },
      budget: null,
    });

    const recs = generateRecommendations(ranked, emptyIntent());
    const rec = recs[0];

    // Must be listed in missingOrUnverified without speculative claims
    expect(rec.missingOrUnverified.some((m) => m.toLowerCase().includes("warranty"))).toBe(true);
    expect(rec.missingOrUnverified.some((m) => m.toLowerCase().includes("reviews"))).toBe(true);
    // Must NOT contain speculative claims like "fewer premium luxury materials"
    expect(rec.tradeOffs.some((t) => t.toLowerCase().includes("luxury materials"))).toBe(false);
  });

  it("Scenario 5: Two products with identical scores must break ties deterministically and reproducibly", () => {
    const pA: Product = {
      ...baseProduct,
      id: "p-alpha",
      name: "Alpha Cans",
      ratings: 4.5,
      reviews: 50,
    };
    const pB: Product = {
      ...baseProduct,
      id: "p-beta",
      name: "Beta Cans",
      ratings: 4.5,
      reviews: 50,
    };

    const ranked1 = rankProducts([pA, pB], {
      tokens: ["headphones"],
      brands: [],
      requiredSpecs: {},
      budget: null,
    });
    const ranked2 = rankProducts([pB, pA], {
      tokens: ["headphones"],
      brands: [],
      requiredSpecs: {},
      budget: null,
    });

    // Regardless of input array order, tie-breaking on ID must yield identical ordering
    expect(ranked1.map((r) => r.product.id)).toEqual(["p-alpha", "p-beta"]);
    expect(ranked2.map((r) => r.product.id)).toEqual(["p-alpha", "p-beta"]);
  });

  it("Scenario 6: User changing budget must retain other preferences without silent loss", () => {
    const initial = mergeIntent(emptyIntent(), {
      productCategory: "Headphones",
      budgetMax: 200,
      currency: "USD",
      intendedUse: "Travel",
      priorities: ["ANC", "Battery"],
      requiredFeatures: ["Wireless"],
      brands: ["Sony"],
    });

    const refined = mergeIntent(initial, {
      budgetMax: 120,
    });

    expect(refined.productCategory).toBe("Headphones");
    expect(refined.budgetMax).toBe(120);
    expect(refined.budget?.amount).toBe(120);
    expect(refined.intendedUse).toBe("Travel");
    expect(refined.priorities).toEqual(["ANC", "Battery"]);
    expect(refined.requiredFeatures).toEqual(["Wireless"]);
    expect(refined.brands).toEqual(["Sony"]);
  });

  it("Scenario 7: Catalog response with duplicate products must be deduplicated by id", () => {
    const dupes: Product[] = [
      baseProduct,
      { ...baseProduct },
      { ...baseProduct, id: "prod-2", name: "Other Option" },
    ];

    const ranked = rankProducts(dupes, {
      tokens: ["headphones"],
      brands: [],
      requiredSpecs: {},
      budget: null,
    });

    // prod-base was present twice; deduplication must reduce total to 2 unique products
    expect(ranked.length).toBe(2);
    expect(ranked.map((r) => r.product.id)).toEqual(["prod-base", "prod-2"]);
  });

  it("Scenario 8: Empty catalog response must return empty arrays without throwing", () => {
    const ranked = rankProducts([], {
      tokens: ["headphones"],
      brands: [],
      requiredSpecs: {},
      budget: null,
    });
    const recs = generateRecommendations(ranked, emptyIntent());

    expect(ranked).toEqual([]);
    expect(recs).toEqual([]);
  });

  it("parseBudgetHint parses various phrasing including 'budget is', 'spend up to', and ranges", () => {
    expect(parseBudgetHint("my budget is $180")).toEqual({
      amount: 180,
      currency: "USD",
    });
    expect(parseBudgetHint("spend up to 250 USD")).toEqual({
      amount: 250,
      currency: "USD",
    });
    expect(parseBudgetHint("between 100 and 200 euros")).toEqual({
      minAmount: 100,
      amount: 200,
      currency: "EUR",
    });
  });
});

