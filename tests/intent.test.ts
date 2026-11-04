import { describe, expect, it } from "vitest";
import {
  IntentSchema,
  emptyIntent,
  mergeIntent,
  type ShoppingIntent,
} from "@/lib/agent/intent";

describe("IntentSchema validation", () => {
  it("accepts a complete intent", () => {
    const parsed = IntentSchema.safeParse({
      category: "headphones",
      query: "wireless headphones",
      budget: { amount: 200, currency: "USD" },
      brands: ["Sony"],
      requiredSpecs: { "noise-cancellation": "active" },
      priorities: ["battery life"],
      clarifications: ["Do you need ANC?"],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty partial intent", () => {
    const parsed = IntentSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("rejects a negative budget", () => {
    const parsed = IntentSchema.safeParse({
      budget: { amount: -5, currency: "USD" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a budget without a 3-letter currency", () => {
    expect(
      IntentSchema.safeParse({ budget: { amount: 10, currency: "us" } }).success,
    ).toBe(false);
  });

  it("rejects more than 10 brands", () => {
    const brands = Array.from({ length: 11 }, (_, i) => `brand-${i}`);
    expect(IntentSchema.safeParse({ brands }).success).toBe(false);
  });

  it("rejects more than 6 clarifications", () => {
    const clarifications = Array.from({ length: 7 }, (_, i) => `q-${i}`);
    expect(IntentSchema.safeParse({ clarifications }).success).toBe(false);
  });

  it("rejects non-string spec values", () => {
    expect(
      IntentSchema.safeParse({ requiredSpecs: { battery: 48 } }).success,
    ).toBe(false);
  });

  it("rejects oversized strings", () => {
    expect(IntentSchema.safeParse({ category: "x".repeat(200) }).success).toBe(
      false,
    );
  });
});

describe("mergeIntent", () => {
  it("overlays non-empty next values onto prev", () => {
    const prev: ShoppingIntent = {
      ...emptyIntent(),
      category: "headphones",
      brands: ["Sony"],
      budget: { amount: 200, currency: "USD" },
    };
    const next: Partial<ShoppingIntent> = {
      brands: ["Sony", "Bose"],
      priorities: ["battery life"],
    };
    const merged = mergeIntent(prev, next);
    expect(merged.category).toBe("headphones");
    expect(merged.brands).toEqual(["Sony", "Bose"]);
    expect(merged.budget).toEqual({ amount: 200, currency: "USD" });
    expect(merged.priorities).toEqual(["battery life"]);
  });

  it("keeps prev clarifications and appends new unique ones", () => {
    const prev: ShoppingIntent = {
      ...emptyIntent(),
      clarifications: ["Do you need ANC?"],
    };
    const merged = mergeIntent(prev, {
      clarifications: ["Do you need ANC?", "Over-ear or in-ear?"],
    });
    expect(merged.clarifications).toEqual([
      "Do you need ANC?",
      "Over-ear or in-ear?",
    ]);
  });

  it("caps merged arrays at the schema limits", () => {
    const prev = emptyIntent();
    const brands = Array.from({ length: 12 }, (_, i) => `brand-${i}`);
    const merged = mergeIntent(prev, { brands });
    expect(merged.brands.length).toBeLessThanOrEqual(10);
  });
});
