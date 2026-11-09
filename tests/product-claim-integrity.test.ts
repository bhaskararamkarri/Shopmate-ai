import { describe, expect, it } from "vitest";
import { validateResponseProvenance } from "@/lib/agent/provenance-validator";
import type { Product } from "@/types";

function makeProduct(id: string, name: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name,
    description: "Standard washing machine description.",
    price: 1193.44,
    currency: "USD",
    availability: "in_stock",
    images: ["https://example.com/p.jpg"],
    ratings: 4.5,
    reviews: 12,
    category: "Washing Machines",
    brand: "Bosch",
    specs: {},
    source: "channel3",
    ...overrides,
  };
}

describe("Phase 9.4: Product Claim Integrity & Grounding", () => {
  // Test products
  const bosch8kg = makeProduct("vWOKnu4", "WAN28218IT Series 4 Front-load Washing Machine", {
    price: 1193.44,
    description: "Engineered in Germany with EcoSilence Drive motor.",
    specs: {
      Capacity: "8 kg",
      "Spin Speed": "1400 rpm",
      "Key features": "EcoSilence Drive · Quick Wash · Add Garment",
    },
  });

  const bosch9kg = makeProduct("prXIzEg", "Serie 8 Washing Machine - 9 Kg", {
    price: 1353.18,
    description: "Features active water plus and steam wash program with a 9 kg capacity.",
    specs: {
      Capacity: "9 kg",
      "Key features": "ActiveWater Plus · Steam Refresh · Wi-Fi Control",
      Warranty: "2 Year Manufacturer Warranty",
    },
  });

  const blackDeckerCuFt = makeProduct("CkUkmll", "BLACK+DECKER Portable Washer 3.0 Cu. Ft", {
    price: 493.99,
    description: "Compact portable laundry washer with 3.0 cu. ft. capacity and child lock.",
    specs: {
      Capacity: "3.0 cu ft",
      "Key features": "Child Lock · Delay Start",
    },
  });

  const unknownCapacityWasher = makeProduct("eGeVUtT", "Portable Washing Machine With Drain Pump", {
    price: 209.49,
    description: "Compact portable washer with drain pump for apartments.",
    specs: {
      "Control Type": "Push button",
    }, // NO capacity in specs or description
  });

  const catalog = new Map<string, Product>([
    [bosch8kg.id, bosch8kg],
    [bosch9kg.id, bosch9kg],
    [blackDeckerCuFt.id, blackDeckerCuFt],
    [unknownCapacityWasher.id, unknownCapacityWasher],
  ]);

  // 1. Correct product ID with fabricated capacity
  it("rejects correct product ID when capacity is fabricated (20 kg vs verified 8 kg)", () => {
    const text = "The Bosch Series 4 (ID: **vWOKnu4**) has an enormous 20 kg capacity suitable for commercial hotels.";
    const res = validateResponseProvenance(text, catalog);
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.toLowerCase().includes("capacity"))).toBe(true);
  });

  // 2. Correct product ID with correct capacity
  it("accepts correct product ID with correct capacity (8 kg for 8 kg washer)", () => {
    const text = "The Bosch Series 4 (ID: **vWOKnu4**) features an 8 kg capacity and costs $1,193.44.";
    const res = validateResponseProvenance(text, catalog);
    expect(res.valid).toBe(true);
    expect(res.violations).toHaveLength(0);
    expect(res.referencedProductIds).toContain("vWOKnu4");
  });

  // 3. Capacity claim when capacity is unknown
  it("rejects asserting a specific numerical capacity when catalog capacity is unknown", () => {
    const text = "The Portable Washer (ID: **eGeVUtT**) offers a 10 kg load capacity with drain pump.";
    const res = validateResponseProvenance(text, catalog);
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.toLowerCase().includes("capacity") && v.includes("unknown"))).toBe(true);
  });

  // 4. Correct product ID with fabricated feature
  it("rejects correct product ID with a fabricated feature not in catalog records", () => {
    const text = "The Bosch Series 4 (ID: **vWOKnu4**) features a built-in microwave and laser drying sensor.";
    const res = validateResponseProvenance(text, catalog);
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.toLowerCase().includes("feature"))).toBe(true);
  });

  // 5. Feature supported only in description
  it("accepts a feature supported only in product description", () => {
    // "EcoSilence Drive" is only in description and key features
    const text = "The Bosch Series 4 (ID: **vWOKnu4**) is equipped with EcoSilence Drive for quiet operation.";
    const res = validateResponseProvenance(text, catalog);
    expect(res.valid).toBe(true);
    expect(res.violations).toHaveLength(0);
  });

  // 6. Feature supported only in key_features
  it("accepts a feature supported in key_features", () => {
    // "Add Garment" is in key_features
    const text = "The Bosch Series 4 (ID: **vWOKnu4**) includes the Add Garment function for convenience.";
    const res = validateResponseProvenance(text, catalog);
    expect(res.valid).toBe(true);
    expect(res.violations).toHaveLength(0);
  });

  // 7. Unverified feature expressed as a confirmed fact
  it("rejects an unverified feature expressed as a confirmed fact", () => {
    const text = "The Bosch Series 4 (ID: **vWOKnu4**) comes with a built-in steam sanitizer.";
    const res = validateResponseProvenance(text, catalog);
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.toLowerCase().includes("feature") || v.toLowerCase().includes("unverified"))).toBe(true);
  });

  // 8. Different capacity units: weight (kg to lbs normalized) vs unrelated units (cu_ft vs kg)
  it("handles supported unit conversions and does not compare unrelated units (drum weight vs volume)", () => {
    // 8 kg ≈ 17.6 lbs: normalized equivalent should pass
    const textNormalizedLbs = "The Bosch Series 4 (ID: **vWOKnu4**) features approximately 17.6 lbs capacity.";
    const resLbs = validateResponseProvenance(textNormalizedLbs, catalog);
    expect(resLbs.valid).toBe(true);

    // Black & Decker has 3.0 cu ft. If prose mentions 3.0 cu ft, it passes
    const textCuFt = "The Black & Decker washer (ID: **CkUkmll**) has a 3.0 cu. ft. capacity and child lock.";
    const resCuFt = validateResponseProvenance(textCuFt, catalog);
    expect(resCuFt.valid).toBe(true);
  });

  // 9. Multiple products with different specifications in one response
  it("validates multiple products with different specifications in the same markdown response", () => {
    const multiText = `Here are the options:
1. **Bosch Series 4** (ID: **vWOKnu4**): 8 kg capacity, $1,193.44, features EcoSilence Drive.
2. **Bosch Serie 8** (ID: **prXIzEg**): 9 kg capacity, $1,353.18, features Steam Refresh.`;

    const res = validateResponseProvenance(multiText, catalog);
    expect(res.valid).toBe(true);
    expect(res.violations).toHaveLength(0);
    expect(res.referencedProductIds).toEqual(expect.arrayContaining(["vWOKnu4", "prXIzEg"]));
  });

  // 10. Correct price and warranty claims must continue passing
  it("preserves correct price and verified warranty claims", () => {
    const textVerified = "The Bosch Serie 8 (ID: **prXIzEg**) costs $1,353.18 and includes a 2-year warranty with 9 kg capacity.";
    const res = validateResponseProvenance(textVerified, catalog);
    expect(res.valid).toBe(true);
    expect(res.violations).toHaveLength(0);
  });
});
