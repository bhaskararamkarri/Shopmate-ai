import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import {
  buildComparisonMatrix,
  getValidCompareProducts,
  MAX_COMPARE_PRODUCTS,
} from "@/lib/compare/compare-matrix";
import { notesForProduct } from "@/components/compare/comparison-notes";

const mockHeadphonesA: Product = {
  id: "prod-a",
  name: "Aura Sound Pro",
  brand: "Aura",
  category: "Audio",
  price: 249.99,
  currency: "USD",
  ratings: 4.8,
  reviews: 120,
  availability: "in_stock",
  images: [],
  source: "demo",
  description: "Premium wireless noise canceling headphones",
  visual: { glyph: "headphones", tint: "blue" },
  specs: {
    "Battery Life": "30 hours",
    "Weight": "250g",
    "Noise Canceling": "Active Hybrid ANC",
    "Bluetooth": "5.3",
  },
  attributes: [
    { label: "Battery Life", value: "30 hours", better: "higher" },
    { label: "Weight", value: "250g", better: "lower" },
  ],
};

const mockHeadphonesB: Product = {
  id: "prod-b",
  name: "Breeze Sound Lite",
  brand: "Breeze",
  category: "Audio",
  price: 149.99,
  currency: "USD",
  ratings: 4.5,
  reviews: 85,
  availability: "in_stock",
  images: [],
  source: "demo",
  description: "Budget wireless noise canceling headphones",
  visual: { glyph: "headphones", tint: "red" },
  specs: {
    "Battery Life": "24 hours",
    "Weight": "250g", // Identical to A
    "Noise Canceling": "Standard ANC",
    // Missing "Bluetooth" spec
  },
  attributes: [
    { label: "Battery Life", value: "24 hours", better: "higher" },
    { label: "Weight", value: "250g", better: "lower" },
  ],
};

const mockHeadphonesEuro: Product = {
  id: "prod-eur",
  name: "Euro Sound 1",
  brand: "EuroTech",
  category: "Audio",
  price: 199.99,
  currency: "EUR", // Different currency!
  ratings: 4.6,
  reviews: 40,
  availability: "in_stock",
  images: [],
  source: "demo",
  description: "European high fidelity audio headset",
  visual: { glyph: "headphones", tint: "amber" },
  specs: {
    "Battery Life": "35 hours",
    "Weight": "280g",
    "Noise Canceling": "Active Hybrid ANC",
  },
};

describe("Comparison Matrix Engine (Phase 4)", () => {
  it("caps comparison products at MAX_COMPARE_PRODUCTS (4) and ignores duplicates", () => {
    const catalog = [mockHeadphonesA, mockHeadphonesB, mockHeadphonesEuro];
    const ids = ["prod-a", "prod-b", "prod-a", "prod-eur", "non-existent"];

    const validated = getValidCompareProducts(ids, catalog);
    expect(validated).toHaveLength(3);
    expect(validated.map((p) => p.id)).toEqual(["prod-a", "prod-b", "prod-eur"]);
    expect(MAX_COMPARE_PRODUCTS).toBe(4);
  });

  it("handles empty and single product gracefully without crashing", () => {
    const emptyResult = buildComparisonMatrix([]);
    expect(emptyResult.products).toHaveLength(0);
    expect(emptyResult.specRows).toHaveLength(0);
    expect(emptyResult.priceComparison.hasCurrencyMismatch).toBe(false);

    const singleResult = buildComparisonMatrix([mockHeadphonesA]);
    expect(singleResult.products).toHaveLength(1);
    expect(singleResult.specRows.length).toBeGreaterThan(0);
    expect(singleResult.differingSpecsCount).toBe(0);
  });

  it("identifies identical and differing specifications accurately", () => {
    const matrix = buildComparisonMatrix([mockHeadphonesA, mockHeadphonesB]);
    expect(matrix.products).toHaveLength(2);

    // "Weight" is "250g" on both -> identical
    const weightRow = matrix.specRows.find((r) => r.key === "Weight");
    expect(weightRow).toBeDefined();
    expect(weightRow?.isIdentical).toBe(true);
    expect(weightRow?.isDifferent).toBe(false);
    expect(weightRow?.hasMissing).toBe(false);

    // "Battery Life" is "30 hours" vs "24 hours" -> different
    const batteryRow = matrix.specRows.find((r) => r.key === "Battery Life");
    expect(batteryRow).toBeDefined();
    expect(batteryRow?.isIdentical).toBe(false);
    expect(batteryRow?.isDifferent).toBe(true);
    expect(batteryRow?.hasMissing).toBe(false);
  });

  it("flags missing/unverified specifications honestly rather than assuming defaults", () => {
    const matrix = buildComparisonMatrix([mockHeadphonesA, mockHeadphonesB]);

    // "Bluetooth" is in A ("5.3") but missing in B
    const btRow = matrix.specRows.find((r) => r.key === "Bluetooth");
    expect(btRow).toBeDefined();
    expect(btRow?.hasMissing).toBe(true);
    expect(btRow?.isIdentical).toBe(false);
    expect(btRow?.isDifferent).toBe(true);

    const valA = btRow?.values[mockHeadphonesA.id];
    const valB = btRow?.values[mockHeadphonesB.id];
    expect(valA?.isMissing).toBe(false);
    expect(valA?.value).toBe("5.3");
    expect(valB?.isMissing).toBe(true);
    expect(valB?.value).toBe("Not documented");
  });

  it("enforces cross-currency safety: never compares price numbers across different currencies", () => {
    // 1. Same currency (USD & USD)
    const sameCurrMatrix = buildComparisonMatrix([mockHeadphonesA, mockHeadphonesB]);
    expect(sameCurrMatrix.priceComparison.hasCurrencyMismatch).toBe(false);
    expect(sameCurrMatrix.priceComparison.minPrice).toBe(149.99);
    expect(sameCurrMatrix.priceComparison.maxPrice).toBe(249.99);
    expect(sameCurrMatrix.priceComparison.priceDelta).toBe(100);
    expect(sameCurrMatrix.priceComparison.currencyWarning).toBeUndefined();

    // 2. Mismatched currencies (USD & EUR)
    const diffCurrMatrix = buildComparisonMatrix([mockHeadphonesA, mockHeadphonesEuro]);
    expect(diffCurrMatrix.priceComparison.hasCurrencyMismatch).toBe(true);
    expect(diffCurrMatrix.priceComparison.priceDelta).toBeUndefined();
    expect(diffCurrMatrix.priceComparison.currencyWarning).toBeDefined();
    expect(diffCurrMatrix.priceComparison.currencyWarning).toContain("live exchange rate");
  });

  it("integrates with Phase 3 decision engine to generate verified verdicts and badges", () => {
    const matrix = buildComparisonMatrix([mockHeadphonesA, mockHeadphonesB], {
      query: "wireless headphones",
      budgetMax: 300,
      currency: "USD",
      brands: [],
      requiredSpecs: {},
      priorities: [],
      clarifications: [],
    });

    expect(matrix.insights.size).toBe(2);
    const insightA = matrix.insights.get("prod-a");
    const insightB = matrix.insights.get("prod-b");
    expect(insightA).toBeDefined();
    expect(insightB).toBeDefined();
    // One of them should receive Best Overall or Best Value
    const badges = [insightA?.badge, insightB?.badge].filter(Boolean);
    expect(badges.length).toBeGreaterThan(0);
    // Insights must carry trade-offs or advantages without crashing
    expect(Array.isArray(insightA?.tradeOffs)).toBe(true);
  });

  it("notesForProduct does not calculate invalid price deltas when currencies differ", () => {
    // USD vs EUR
    const notesA = notesForProduct(mockHeadphonesA, [mockHeadphonesEuro]);
    const priceNotes = notesA.filter((n) => n.text.toLowerCase().includes("price"));
    // Must NOT claim "Lowest price" or "Highest price" with raw cross-currency numbers
    for (const note of priceNotes) {
      expect(note.text).not.toContain("(+");
    }
    // Should warn or omit cross-currency ranking
    const hasWarning = notesA.some((n) => n.text.toLowerCase().includes("currency") || n.text.toLowerCase().includes("different"));
    expect(hasWarning).toBe(true);
  });
});
