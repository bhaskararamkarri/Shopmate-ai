import { describe, expect, it } from "vitest";
import { emptyIntent, mergeIntent, IntentSchema } from "@/lib/agent/intent";
import { parseBudgetHint } from "@/lib/agent/agent";

describe("Phase 3 - Structured Shopping Intent & Requirement Extraction", () => {
  it("parses budget hints with currencies and ranges", () => {
    expect(parseBudgetHint("headphones under $150")).toEqual({
      amount: 150,
      currency: "USD",
    });

    expect(parseBudgetHint("budget between 50 and 200 USD")).toEqual({
      minAmount: 50,
      amount: 200,
      currency: "USD",
    });

    expect(parseBudgetHint("headphones under ₹8000")).toEqual({
      amount: 8000,
      currency: "INR",
    });

    expect(parseBudgetHint("something for 99 euros")).toEqual({
      amount: 99,
      currency: "EUR",
    });
  });

  it("validates full Phase 3 intent schema with all 10 structured fields", () => {
    const rawIntent = {
      productCategory: "Wireless Headphones",
      budgetMin: 50,
      budgetMax: 200,
      currency: "USD",
      intendedUse: "Daily commute and travel",
      requiredFeatures: ["Active Noise Cancellation", "Bluetooth 5.0"],
      preferredFeatures: ["Multi-device pairing"],
      excludedFeatures: ["In-ear earbuds"],
      brands: ["Sony", "Bose"],
      requiredSpecs: { "battery life": "30h" },
      priorities: ["Battery endurance", "Comfort"],
      constraints: ["Under $200 total"],
      clarifications: ["Do you prefer over-ear or on-ear?"],
    };

    const parsed = IntentSchema.parse(rawIntent);
    expect(parsed.productCategory).toBe("Wireless Headphones");
    expect(parsed.budgetMin).toBe(50);
    expect(parsed.budgetMax).toBe(200);
    expect(parsed.currency).toBe("USD");
    expect(parsed.intendedUse).toBe("Daily commute and travel");
    expect(parsed.requiredFeatures).toEqual(["Active Noise Cancellation", "Bluetooth 5.0"]);
    expect(parsed.preferredFeatures).toEqual(["Multi-device pairing"]);
    expect(parsed.excludedFeatures).toEqual(["In-ear earbuds"]);
    expect(parsed.brands).toEqual(["Sony", "Bose"]);
    expect(parsed.constraints).toEqual(["Under $200 total"]);
  });

  it("merges sequential user turns without dropping earlier constraints", () => {
    const initial = emptyIntent();
    const turn1 = mergeIntent(initial, {
      productCategory: "Headphones",
      budgetMax: 250,
      currency: "USD",
      intendedUse: "Office work",
    });

    expect(turn1.productCategory).toBe("Headphones");
    expect(turn1.category).toBe("Headphones");
    expect(turn1.budgetMax).toBe(250);
    expect(turn1.budget?.amount).toBe(250);
    expect(turn1.intendedUse).toBe("Office work");

    const turn2 = mergeIntent(turn1, {
      priorities: ["Microphone clarity", "Comfort"],
      requiredFeatures: ["Noise cancellation"],
    });

    // Retains turn 1 values while adding turn 2
    expect(turn2.productCategory).toBe("Headphones");
    expect(turn2.budgetMax).toBe(250);
    expect(turn2.intendedUse).toBe("Office work");
    expect(turn2.priorities).toEqual(["Microphone clarity", "Comfort"]);
    expect(turn2.requiredFeatures).toEqual(["Noise cancellation"]);
  });

  it("safely enforces boundaries on string lengths and array sizes", () => {
    const hugeList = Array.from({ length: 30 }, (_, i) => `Feature ${i}`);
    const parseResult = IntentSchema.safeParse({
      requiredFeatures: hugeList,
    });
    // Schema rejects arrays larger than max limit
    expect(parseResult.success).toBe(false);

    // mergeIntent automatically caps arrays to safe bounds
    const merged = mergeIntent(emptyIntent(), {
      requiredFeatures: hugeList,
    });
    expect(merged.requiredFeatures?.length).toBe(10);
  });
});
