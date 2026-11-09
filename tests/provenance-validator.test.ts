import { describe, expect, it } from "vitest";
import { validateResponseProvenance } from "@/lib/agent/provenance-validator";
import type { Product } from "@/types";

function makeProduct(id: string, name: string, price: number, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name,
    description: "Product description with 8 kg capacity.",
    price,
    currency: "USD",
    availability: "in_stock",
    images: [],
    ratings: 4.5,
    reviews: 10,
    category: "Washing Machines",
    brand: "Brand",
    specs: { Capacity: "8 kg" },
    source: "channel3",
    ...overrides,
  };
}

describe("Response Provenance Validator", () => {
  const p1 = makeProduct("d1rsSyv", "Samsung QuickDrive", 1528.52);
  const p2 = makeProduct("prXIzEg", "Bosch Serie 8", 1353.18, {
    description: "Features a 9 kg capacity.",
    specs: { Capacity: "9 kg" },
  });
  const catalog = new Map<string, Product>([
    [p1.id, p1],
    [p2.id, p2],
  ]);

  it("passes valid prose referencing catalog products, correct prices, and specs", () => {
    const text = `I recommend the **Samsung QuickDrive** (product ID **d1rsSyv**) for $1,528.52 with an 8 kg capacity.
Another great choice is the **Bosch Serie 8** (ID **prXIzEg**) at $1,353.18 with a 9 kg capacity.`;

    const res = validateResponseProvenance(text, catalog);
    expect(res.valid).toBe(true);
    expect(res.violations).toHaveLength(0);
    expect(res.referencedProductIds).toContain("d1rsSyv");
    expect(res.referencedProductIds).toContain("prXIzEg");
  });

  it("fails validation when text invents an unknown product ID", () => {
    const text = `You should buy this amazing model (product ID **fake999**) for $500.`;
    const res = validateResponseProvenance(text, catalog);

    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.includes("fake999"))).toBe(true);
  });

  it("fails validation when text invents an unsupported warranty claim", () => {
    const text = `The **Samsung QuickDrive** (d1rsSyv) costs $1,528.52 and includes a 5-year comprehensive manufacturer warranty.`;
    const res = validateResponseProvenance(text, catalog);

    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.toLowerCase().includes("warranty"))).toBe(true);
  });

  it("fails validation when text asserts a wildly inaccurate price for a catalog product", () => {
    const text = `The **Samsung QuickDrive** (d1rsSyv) is currently on sale for only $199.99!`;
    const res = validateResponseProvenance(text, catalog);

    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.toLowerCase().includes("price"))).toBe(true);
  });
});
