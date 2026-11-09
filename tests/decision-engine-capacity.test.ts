import { describe, expect, it } from "vitest";
import { generateRecommendations } from "@/lib/agent/decision-engine";
import { emptyIntent, type ShoppingIntent } from "@/lib/agent/intent";
import type { RankedProduct } from "@/lib/agent/ranking";
import type { Product } from "@/types";

function makeProduct(overrides: Partial<Product> & { id: string }): Product {
  return {
    name: "Standard Washing Machine",
    description: "Standard washer.",
    price: 1200,
    currency: "USD",
    availability: "in_stock",
    images: ["https://example.com/wm.jpg"],
    ratings: 4.5,
    reviews: 120,
    category: "Washing Machines",
    brand: "Bosch",
    specs: {},
    source: "channel3",
    merchant: "shop.mohd.it",
    ...overrides,
  };
}

const defaultBreakdown = {
  relevance: 1,
  specMatch: 1,
  budgetFit: 1,
  brandFit: 1,
  completeness: 1,
};

describe("Decision Engine: Capacity & International Disclosures", () => {
  it("recognizes normalized 8kg/9kg capacity as verified for family of 4", () => {
    const wm = makeProduct({
      id: "vWOKnu4",
      name: "WAN28218IT Series 4 Front-load Washing Machine",
      specs: { Capacity: "8 kg" },
    });

    const ranked: RankedProduct[] = [{ product: wm, score: 0.9, reasons: [], breakdown: defaultBreakdown }];
    const intent: ShoppingIntent = {
      ...emptyIntent(),
      query: "washing machine for family of 4",
      intendedUse: "family of 4",
    };

    const recs = generateRecommendations(ranked, intent);
    expect(recs).toHaveLength(1);
    const rec = recs[0];

    // Capacity should NOT be in missingOrUnverified as UNKNOWN
    expect(
      rec.missingOrUnverified.some((m) =>
        m.includes("Washing load capacity: UNKNOWN"),
      ),
    ).toBe(false);

    // Should NOT fail family capacity requirements
    expect(
      Boolean(
        rec.failedRequirements?.some((f) =>
          f.includes("Washing load capacity is unknown"),
        ),
      ),
    ).toBe(false);
  });

  it("flags portable/compact washers as unsuitable for full family-of-4 needs", () => {
    const portable = makeProduct({
      id: "portable-1",
      name: "Portable Compact Twin Tub Washer",
      description: "Mini portable washer for dorms and RVs.",
      specs: { Capacity: "3 kg" },
    });

    const ranked: RankedProduct[] = [{ product: portable, score: 0.5, reasons: [], breakdown: defaultBreakdown }];
    const intent: ShoppingIntent = {
      ...emptyIntent(),
      query: "washing machine for family of 4",
    };

    const recs = generateRecommendations(ranked, intent);
    expect(recs).toHaveLength(1);
    expect(
      recs[0].failedRequirements?.some((f) =>
        f.includes("Compact/portable washer"),
      ),
    ).toBe(true);
  });

  it("adds international disclosures for overseas merchant listings (e.g. shop.mohd.it)", () => {
    const intl = makeProduct({
      id: "mohd-1",
      name: "Serie 8 Washing Machine - 9 Kg",
      merchant: "shop.mohd.it",
      specs: { Capacity: "9 kg" },
    });

    const ranked: RankedProduct[] = [{ product: intl, score: 0.9, reasons: [], breakdown: defaultBreakdown }];
    const intent: ShoppingIntent = {
      ...emptyIntent(),
      query: "washing machine",
      currency: "INR",
      budget: { amount: 30000, currency: "INR" },
    };

    const recs = generateRecommendations(ranked, intent);
    expect(recs).toHaveLength(1);
    const rec = recs[0];

    expect(
      rec.missingOrUnverified.some(
        (m) =>
          m.includes("voltage") ||
          m.includes("customs") ||
          m.includes("international") ||
          m.includes("merchant"),
      ),
    ).toBe(true);
  });
});
