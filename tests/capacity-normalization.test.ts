import { describe, expect, it } from "vitest";
import {
  extractApplianceCapacity,
  normalizeChannel3Product,
} from "@/lib/catalog/normalize";

describe("Phase 9.2: Appliance Capacity Normalization", () => {
  it("normalizes capacity from title for Samsung QuickDrive (8 kg)", () => {
    const raw = {
      id: "d1rsSyv",
      title: "Ai Control QuickDrive™ WW80T854ABT - Washing Machine 8 Kg",
      description: "Front-loading washing machine.",
      category: { title: "Washing Machines" },
      offers: [
        {
          url: "https://example.com/buy",
          domain: "shop.mohd.it",
          price: { price: 1528.52, currency: "USD" },
          availability: "InStock",
        },
      ],
    };

    const cap = extractApplianceCapacity(raw);
    expect(cap).not.toBeNull();
    expect(cap?.value).toBe(8);
    expect(cap?.unit).toBe("kg");
    expect(cap?.raw.toLowerCase()).toContain("8 kg");

    const product = normalizeChannel3Product(raw);
    expect(product).not.toBeNull();
    expect(product?.specs["Capacity"]).toBe("8 kg");
  });

  it("normalizes capacity from description for Bosch Serie 8 (9 kg)", () => {
    const raw = {
      id: "prXIzEg",
      title: "Serie 8 Washing Machine",
      description: "Features a 9 kg capacity and spin speeds up to 1400 rpm.",
      category: { title: "Washing Machines" },
      offers: [
        {
          url: "https://example.com/buy",
          domain: "shop.mohd.it",
          price: { price: 1353.18, currency: "USD" },
          availability: "InStock",
        },
      ],
    };

    const cap = extractApplianceCapacity(raw);
    expect(cap).not.toBeNull();
    expect(cap?.value).toBe(9);
    expect(cap?.unit).toBe("kg");

    const product = normalizeChannel3Product(raw);
    expect(product?.specs["Capacity"]).toBe("9 kg");
  });

  it("normalizes capacity from description for Bosch Series 4 (8 kg)", () => {
    const raw = {
      id: "vWOKnu4",
      title: "WAN28218IT Series 4 Front-load Washing Machine",
      description: "High-efficiency front-load washing machine with an 8 kg capacity.",
      category: { title: "Washing Machines" },
      offers: [
        {
          url: "https://example.com/buy",
          domain: "shop.mohd.it",
          price: { price: 1193.44, currency: "USD" },
          availability: "InStock",
        },
      ],
    };

    const cap = extractApplianceCapacity(raw);
    expect(cap).not.toBeNull();
    expect(cap?.value).toBe(8);
    expect(cap?.unit).toBe("kg");

    const product = normalizeChannel3Product(raw);
    expect(product?.specs["Capacity"]).toBe("8 kg");
  });

  it("distinguishes and extracts cubic feet (e.g. 3.0 cu. ft.) and pounds (lbs)", () => {
    const raw = {
      id: "CkUkmll",
      title: "BLACK+DECKER BCWB Series Small Portable Washer, 3.0 Cu. Ft",
      description: "Compact washer with 3.0 cubic foot capacity and handles up to 26.5 lbs.",
      category: { title: "Washing Machines" },
      offers: [
        {
          url: "https://example.com/buy",
          domain: "wayfair.com",
          price: { price: 493.99, currency: "USD" },
          availability: "InStock",
        },
      ],
    };

    const cap = extractApplianceCapacity(raw);
    expect(cap).not.toBeNull();
    expect(cap?.value).toBe(3);
    expect(cap?.unit).toBe("cu_ft");

    const product = normalizeChannel3Product(raw);
    expect(product?.specs["Capacity"]).toBe("3 cu ft");
  });

  it("returns null for non-appliance products (e.g. headphones, laptops)", () => {
    const raw = {
      id: "headphone-1",
      title: "Wireless Over-Ear Headphones with 30-hour battery",
      description: "Weighs 8 kg in shipping crate with heavy packaging.",
      category: { title: "Headphones" },
      offers: [
        {
          url: "https://example.com/buy",
          domain: "amazon.com",
          price: { price: 199.99, currency: "USD" },
          availability: "InStock",
        },
      ],
    };

    const cap = extractApplianceCapacity(raw);
    expect(cap).toBeNull();
  });

  it("returns null (UNKNOWN) when capacity is missing or ambiguous", () => {
    const raw = {
      id: "unknown-washer",
      title: "General Household Washer",
      description: "Spin speed 1400 rpm with multiple cycles. Dimensions: 60x60x85 cm.",
      category: { title: "Washing Machines" },
      offers: [
        {
          url: "https://example.com/buy",
          domain: "bestbuy.com",
          price: { price: 500, currency: "USD" },
          availability: "InStock",
        },
      ],
    };

    const cap = extractApplianceCapacity(raw);
    expect(cap).toBeNull();

    const product = normalizeChannel3Product(raw);
    expect(product?.specs["Capacity"]).toBeUndefined();
  });
});
