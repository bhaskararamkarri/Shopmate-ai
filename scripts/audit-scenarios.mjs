import { generateRecommendations } from "../src/lib/agent/decision-engine.ts";
import { rankProducts } from "../src/lib/agent/ranking.ts";
import { emptyIntent, mergeIntent } from "../src/lib/agent/intent.ts";

console.log("=== RUNNING PHASE 3.1 AUDIT SCENARIO TESTS ===");

const baseProduct = {
  id: "prod-1",
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
  specs: { "Battery": "None", "Connectivity": "Wired" },
  source: "demo",
};

// ============================================================
// SCENARIO 1: Cheap product that fails a mandatory requirement
// ============================================================
console.log("\n--- SCENARIO 1: Cheap product failing mandatory requirement ---");
const pCheapFails = {
  ...baseProduct,
  id: "p-cheap",
  name: "Cheap Wired Earbuds",
  description: "Basic wired earbuds without noise cancelling.",
  price: 15,
  currency: "USD",
  specs: { "Type": "Earbuds", "ANC": "No" },
};
const pGoodExpensive = {
  ...baseProduct,
  id: "p-good",
  name: "Pro Wireless ANC Headphones",
  description: "Over-ear active noise cancelling wireless headphones.",
  price: 120,
  currency: "USD",
  specs: { "ANC": "Active Noise Cancellation", "Wireless": "Bluetooth 5.2" },
};

const intentMandatory = {
  ...emptyIntent(),
  productCategory: "Headphones",
  budgetMax: 150,
  currency: "USD",
  requiredFeatures: ["Active Noise Cancellation"],
  requiredSpecs: { "ANC": "Active Noise Cancellation" },
};

const rankedS1 = rankProducts([pCheapFails, pGoodExpensive], {
  tokens: ["headphones", "active", "noise", "cancellation"],
  brands: [],
  requiredSpecs: intentMandatory.requiredSpecs,
  budget: { amount: 150, currency: "USD" },
});

const recsS1 = generateRecommendations(rankedS1, intentMandatory);
console.log("Scenario 1 Rankings:", rankedS1.map(r => ({ id: r.product.id, score: r.score, specMatch: r.breakdown.specMatch })));
console.log("Scenario 1 Recommendations:", recsS1.map(r => ({
  id: r.productId,
  badge: r.badge,
  whyItMatches: r.whyItMatches,
  satisfied: r.requirementsSatisfied,
  tradeOffs: r.tradeOffs,
})));

// Check: Did p-cheap get Best Value despite failing mandatory requirement?
const cheapBadge = recsS1.find(r => r.productId === "p-cheap")?.badge;
console.log("Did p-cheap receive a badge?", cheapBadge);

// ============================================================
// SCENARIO 2: Expensive product that exceeds the budget
// ============================================================
console.log("\n--- SCENARIO 2: Expensive product exceeding budget ---");
const pOverBudget = {
  ...baseProduct,
  id: "p-over",
  name: "Ultra Luxury Headphones",
  price: 500,
  currency: "USD",
  specs: { "ANC": "Active Noise Cancellation" },
};
const pInBudget = {
  ...baseProduct,
  id: "p-in",
  name: "Solid Mid-Range Headphones",
  price: 180,
  currency: "USD",
  specs: { "ANC": "Active Noise Cancellation" },
};

const intentBudget200 = {
  ...emptyIntent(),
  productCategory: "Headphones",
  budgetMax: 200,
  currency: "USD",
  budget: { amount: 200, currency: "USD" },
};

const rankedS2 = rankProducts([pOverBudget, pInBudget], {
  tokens: ["headphones"],
  brands: [],
  requiredSpecs: {},
  budget: { amount: 200, currency: "USD" },
});

const recsS2 = generateRecommendations(rankedS2, intentBudget200);
console.log("Scenario 2 Rankings:", rankedS2.map(r => ({ id: r.product.id, score: r.score, budgetFit: r.breakdown.budgetFit })));
console.log("Scenario 2 Recommendations:", recsS2.map(r => ({
  id: r.productId,
  badge: r.badge,
  whyItMatches: r.whyItMatches,
  tradeOffs: r.tradeOffs,
})));

// ============================================================
// SCENARIO 3: Two products with different currencies
// ============================================================
console.log("\n--- SCENARIO 3: Two products with different currencies ---");
const pUSD = {
  ...baseProduct,
  id: "p-usd",
  name: "US Headphones",
  price: 100,
  currency: "USD",
};
const pEUR = {
  ...baseProduct,
  id: "p-eur",
  name: "EU Headphones",
  price: 90,
  currency: "EUR",
};
const pINR = {
  ...baseProduct,
  id: "p-inr",
  name: "India Headphones",
  price: 8000,
  currency: "INR",
};

const intentUSD = {
  ...emptyIntent(),
  budgetMax: 150,
  currency: "USD",
  budget: { amount: 150, currency: "USD" },
};

const rankedS3 = rankProducts([pUSD, pEUR, pINR], {
  tokens: ["headphones"],
  brands: [],
  requiredSpecs: {},
  budget: intentUSD.budget,
});

const recsS3 = generateRecommendations(rankedS3, intentUSD);
console.log("Scenario 3 Recommendations:", recsS3.map(r => ({
  id: r.productId,
  badge: r.badge,
  tradeOffs: r.tradeOffs,
})));

// ============================================================
// SCENARIO 4: Product missing most specifications
// ============================================================
console.log("\n--- SCENARIO 4: Product missing most specifications ---");
const pBare = {
  id: "p-bare",
  name: "Mystery Headphones",
  description: "",
  price: 40,
  currency: "USD",
  availability: "unknown",
  images: [],
  ratings: 0,
  reviews: 0,
  category: "Headphones",
  brand: "",
  specs: {},
  source: "demo",
};

const rankedS4 = rankProducts([pBare], {
  tokens: ["headphones"],
  brands: [],
  requiredSpecs: { "Bluetooth": "5.0" },
  budget: null,
});

const recsS4 = generateRecommendations(rankedS4, emptyIntent());
console.log("Scenario 4 Missing/Unverified:", recsS4[0]?.missingOrUnverified);
console.log("Scenario 4 Trade-offs:", recsS4[0]?.tradeOffs);
console.log("Scenario 4 Reasons:", rankedS4[0]?.reasons);

// ============================================================
// SCENARIO 5: Two products with identical scores
// ============================================================
console.log("\n--- SCENARIO 5: Two products with identical scores ---");
const pIdenticalA = {
  ...baseProduct,
  id: "p-alpha",
  name: "Twin A",
  ratings: 4.5,
  reviews: 50,
};
const pIdenticalB = {
  ...baseProduct,
  id: "p-beta",
  name: "Twin B",
  ratings: 4.5,
  reviews: 50,
};

const rankedS5_1 = rankProducts([pIdenticalA, pIdenticalB], {
  tokens: ["headphones"],
  brands: [],
  requiredSpecs: {},
  budget: null,
});
const rankedS5_2 = rankProducts([pIdenticalB, pIdenticalA], {
  tokens: ["headphones"],
  brands: [],
  requiredSpecs: {},
  budget: null,
});

console.log("Order 1:", rankedS5_1.map(r => r.product.id));
console.log("Order 2 (reversed input):", rankedS5_2.map(r => r.product.id));

// ============================================================
// SCENARIO 6: Changing budget while retaining other preferences
// ============================================================
console.log("\n--- SCENARIO 6: Budget change with preference retention ---");
const turn1Intent = mergeIntent(emptyIntent(), {
  productCategory: "Headphones",
  budgetMax: 200,
  currency: "USD",
  intendedUse: "Travel",
  priorities: ["ANC", "Battery"],
  requiredFeatures: ["Wireless"],
  brands: ["Sony"],
});

const turn2Intent = mergeIntent(turn1Intent, {
  budgetMax: 120,
});

console.log("Turn 2 Intent after budget change:", {
  category: turn2Intent.productCategory,
  budgetMax: turn2Intent.budgetMax,
  intendedUse: turn2Intent.intendedUse,
  priorities: turn2Intent.priorities,
  requiredFeatures: turn2Intent.requiredFeatures,
  brands: turn2Intent.brands,
});

// ============================================================
// SCENARIO 7: Catalog response with duplicate products
// ============================================================
console.log("\n--- SCENARIO 7: Duplicate products in catalog response ---");
const dupes = [baseProduct, { ...baseProduct }, { ...baseProduct, id: "prod-2", name: "Other" }];
const rankedS7 = rankProducts(dupes, {
  tokens: ["headphones"],
  brands: [],
  requiredSpecs: {},
  budget: null,
});
console.log("Ranked products count from duplicate input:", rankedS7.length);

// ============================================================
// SCENARIO 8: Empty catalog response
// ============================================================
console.log("\n--- SCENARIO 8: Empty catalog response ---");
const rankedS8 = rankProducts([], {
  tokens: ["headphones"],
  brands: [],
  requiredSpecs: {},
  budget: null,
});
const recsS8 = generateRecommendations(rankedS8, emptyIntent());
console.log("Ranked empty:", rankedS8);
console.log("Recs empty:", recsS8);
