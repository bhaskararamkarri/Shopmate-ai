import { describe, it, expect, beforeEach } from "vitest";
import type { Product } from "@/types";
import { extractApplianceCapacity } from "@/lib/catalog/normalize";
import {
  saveConversationProducts,
  clearConversationProducts,
  resolveConversationContext,
} from "@/lib/agent/conversation-context";
import { validateResponseProvenance } from "@/lib/agent/provenance-validator";
import { assembleTurn } from "@/lib/agent/agent";
import { emptyIntent } from "@/lib/agent/intent";
import { checkBudgetCompatibility } from "@/lib/agent/relevance";
import { generateRecommendations } from "@/lib/agent/decision-engine";

function makeProduct(id: string, name: string, price: number, currency = "USD", overrides: Partial<Product> = {}): Product {
  return {
    id,
    name,
    description: name,
    price,
    currency,
    availability: "in_stock",
    images: [`https://example.com/${id}.jpg`],
    ratings: 4.5,
    reviews: 120,
    merchant: "Test Merchant",
    category: "Appliances",
    brand: "TestBrand",
    specs: {},
    source: "channel3",
    ...overrides,
  };
}

describe("Phase 9.2: Comprehensive Regression Suite (Scenarios A through L)", () => {
  beforeEach(() => {
    clearConversationProducts();
  });

  // Scenario A: Product from Turn 1 remains available in Turn 3
  it("Scenario A: Product from Turn 1 remains available in Turn 3 via conversation context", async () => {
    const convId = "conv-abc-123";
    const prod1 = makeProduct("prod-turn1", "Samsung Front Load Washer", 899);
    
    // Turn 1 saves product
    saveConversationProducts(convId, [prod1]);

    // Turn 2 adds another product
    const prod2 = makeProduct("prod-turn2", "Bosch Serie 8 Washer", 1199);
    saveConversationProducts(convId, [prod2]);

    // Turn 3 retrieves context
    const mockCatalog = {
      search: async () => ({ products: [], source: "demo" as const }),
      getProduct: async () => null,
    };

    const { trustedProducts } = await resolveConversationContext({
      conversationId: convId,
      catalog: mockCatalog,
    });

    expect(trustedProducts.has("prod-turn1")).toBe(true);
    expect(trustedProducts.get("prod-turn1")?.name).toBe("Samsung Front Load Washer");
    expect(trustedProducts.has("prod-turn2")).toBe(true);
  });

  // Scenario B: Assistant text product IDs match shortlist product IDs
  it("Scenario B: Assistant text product IDs match shortlist product IDs", () => {
    const p1 = makeProduct("d1rsSyv", "Samsung QuickDrive 8kg", 850);
    const p2 = makeProduct("prXIzEg", "Bosch Serie 8 9kg", 1200);
    const p3 = makeProduct("other77", "LG TurboWash", 950);

    const catalogLog = new Map<string, Product>([
      [p1.id, p1],
      [p2.id, p2],
      [p3.id, p3],
    ]);

    // The AI cites d1rsSyv and prXIzEg in prose
    const content = "I recommend the Samsung QuickDrive (ID: **d1rsSyv**) and the Bosch Serie 8 (ID: **prXIzEg**).";
    
    const turn = assembleTurn({
      content,
      intent: emptyIntent(),
      catalogLog,
      recommendedIds: [],
      comparisons: [],
      catalogMeta: { source: "channel3" },
      toolsUsed: ["searchProducts"],
      query: "washing machine",
      mode: "ai",
    });

    expect(turn.productIds).toContain("d1rsSyv");
    expect(turn.productIds).toContain("prXIzEg");
    expect(turn.products.map((p) => p.id)).toEqual(expect.arrayContaining(["d1rsSyv", "prXIzEg"]));
  });

  // Scenario C: Compare uses the exact displayed product IDs
  it("Scenario C: Compare uses the exact displayed product IDs", () => {
    const p1 = makeProduct("prod-cmp-1", "Samsung Washer", 800);
    const p2 = makeProduct("prod-cmp-2", "Bosch Washer", 900);

    const catalogLog = new Map<string, Product>([
      [p1.id, p1],
      [p2.id, p2],
    ]);

    const turn = assembleTurn({
      content: "Here is the comparison between the two units.",
      intent: emptyIntent(),
      catalogLog,
      recommendedIds: ["prod-cmp-1", "prod-cmp-2"],
      comparisons: [{ productIds: ["prod-cmp-1", "prod-cmp-2"], missingIds: [] }],
      catalogMeta: { source: "channel3" },
      toolsUsed: ["compareProducts"],
      query: "compare them",
      mode: "ai",
    });

    expect(turn.comparisons[0].productIds).toEqual(["prod-cmp-1", "prod-cmp-2"]);
    expect(turn.comparisons[0].products.map((p) => p.id)).toEqual(["prod-cmp-1", "prod-cmp-2"]);
  });

  // Scenario D: Add to Cart uses the exact selected product ID
  it("Scenario D: Add to Cart uses the exact selected product ID", () => {
    const p1 = makeProduct("prod-cart-99", "Selected Bosch 9kg Washer", 1250);
    const catalogLog = new Map([[p1.id, p1]]);

    const turn = assembleTurn({
      content: "Option 1 is ready.",
      intent: emptyIntent(),
      catalogLog,
      recommendedIds: [p1.id],
      comparisons: [],
      catalogMeta: { source: "channel3" },
      toolsUsed: [],
      query: "buy this",
      mode: "ai",
    });

    const chosenProduct = turn.products.find((p) => p.id === "prod-cart-99");
    expect(chosenProduct).toBeDefined();
    expect(chosenProduct?.id).toBe("prod-cart-99");
  });

  // Scenario E: Forged client product IDs are rejected or revalidated
  it("Scenario E: Forged client product IDs are rejected or revalidated", async () => {
    const mockCatalog = {
      search: async () => ({ products: [], source: "demo" as const }),
      getProduct: async (id: string) => {
        if (id === "real-id-123") {
          return makeProduct("real-id-123", "Legit Product", 100);
        }
        return null; // Forged ID not found
      },
    };

    const result = await resolveConversationContext({
      conversationId: "test-forgery-conv",
      clientProductIds: ["real-id-123", "forged-id-999", "fake-xyz"],
      catalog: mockCatalog,
    });

    expect(result.trustedProducts.has("real-id-123")).toBe(true);
    expect(result.trustedProducts.has("forged-id-999")).toBe(false);
    expect(result.trustedProducts.has("fake-xyz")).toBe(false);
    expect(result.missingIds).toEqual(expect.arrayContaining(["forged-id-999", "fake-xyz"]));
  });

  // Scenario F: Product unavailable on re-fetch is disclosed
  it("Scenario F: Product unavailable on re-fetch is tracked in missingIds", async () => {
    const mockCatalog = {
      search: async () => ({ products: [], source: "demo" as const }),
      getProduct: async () => null,
    };

    const result = await resolveConversationContext({
      conversationId: "test-missing-conv",
      clientProductIds: ["vanished-product-001"],
      catalog: mockCatalog,
    });

    expect(result.missingIds).toContain("vanished-product-001");
    expect(result.trustedProducts.size).toBe(0);
  });

  // Scenario G: Unsupported product names/prices are not accepted as verified facts
  it("Scenario G: Unsupported product prices or phantom IDs are rejected by provenance validator", () => {
    const p1 = makeProduct("p-valid-1", "Bosch Serie 8", 1200);
    const catalog = new Map([[p1.id, p1]]);

    // Price asserted as $200 when catalog price is $1200
    const fabricatedPriceText = "You can get the Bosch Serie 8 (ID p-valid-1) for only $200!";
    const res1 = validateResponseProvenance(fabricatedPriceText, catalog);
    expect(res1.valid).toBe(false);
    expect(res1.violations.some((v) => v.includes("Price for"))).toBe(true);

    // Phantom ID not in catalog
    const phantomIdText = "I found the amazing machine with product ID phantom999!";
    const res2 = validateResponseProvenance(phantomIdText, catalog);
    expect(res2.valid).toBe(false);
    expect(res2.violations.some((v) => v.includes("phantom999"))).toBe(true);
  });

  // Scenario H: Samsung 8kg title is normalized correctly
  it("Scenario H: Samsung 8kg title is normalized correctly", () => {
    const prod = {
      title: "Ai Control QuickDrive™ WW80T854ABT - Washing Machine 8 Kg",
      category: "Washing Machines",
    };
    const cap = extractApplianceCapacity(prod);
    expect(cap).not.toBeNull();
    expect(cap?.value).toBe(8);
    expect(cap?.unit).toBe("kg");
  });

  // Scenario I: Bosch 9kg description is normalized correctly
  it("Scenario I: Bosch 9kg description is normalized correctly", () => {
    const prod = {
      title: "Bosch Serie 8 Front Loader",
      description: "Engineered in Germany, this appliance features a 9 kg capacity with EcoSilence Drive.",
      category: "Washing Machines",
    };
    const cap = extractApplianceCapacity(prod);
    expect(cap).not.toBeNull();
    expect(cap?.value).toBe(9);
    expect(cap?.unit).toBe("kg");
  });

  // Scenario J: Missing capacity remains UNKNOWN
  it("Scenario J: Missing capacity remains UNKNOWN (null)", () => {
    const prod = {
      title: "Generic Modern Laundry Machine",
      description: "Fast spin speed and digital control panel.",
      category: "Washing Machines",
    };
    const cap = extractApplianceCapacity(prod);
    expect(cap).toBeNull();
  });

  // Scenario K: Ambiguous capacity remains UNKNOWN
  it("Scenario K: Ambiguous capacity remains UNKNOWN", () => {
    const prod = {
      title: "High Performance Washer",
      description: "Capable of handling big family laundry loads and large blankets.",
      category: "Washing Machines",
    };
    const cap = extractApplianceCapacity(prod);
    expect(cap).toBeNull();
  });

  // Scenario L: USD prices never qualify as INR budget-compatible
  it("Scenario L: USD prices never qualify as INR budget-compatible without verified rate", () => {
    const usdProduct = makeProduct("usd-1", "Samsung Washer", 850, "USD");
    const inrBudget = { amount: 30000, currency: "INR" };

    // 1. checkBudgetCompatibility returns UNVERIFIED, never COMPATIBLE
    const compat = checkBudgetCompatibility(usdProduct, inrBudget);
    expect(compat).toBe("UNVERIFIED");

    // 2. Decision engine flags it as an unverified/failed requirement
    const defaultBreakdown = {
      relevance: 1,
      specMatch: 1,
      budgetFit: 1,
      brandFit: 1,
      completeness: 1,
    };
    const recs = generateRecommendations(
      [{ product: usdProduct, score: 0.9, reasons: [], breakdown: defaultBreakdown }],
      { ...emptyIntent(), budget: inrBudget, budgetMax: inrBudget.amount, currency: "INR" },
    );
    expect(recs[0].failedRequirements).toBeDefined();
    expect(
      recs[0].failedRequirements?.some((f) =>
        f.includes("cannot verify against INR budget without live exchange rate"),
      ),
    ).toBe(true);
  });
});
