/**
 * ShopMate AI — Decision Engine (Phase 3.1 Audit & Integrity Hardening).
 *
 * Produces transparent, evidenced recommendation insights for each product:
 * - Match rationale (grounded in verified specs & query)
 * - Requirements satisfied (budget, category, features, brands)
 * - Explicit failed requirements (mandatory constraints that were violated)
 * - Honest missing/unverified attributes (never assumed positive or negative)
 * - Verified trade-offs (supported strictly by catalog attributes)
 * - Tailored persona guidance ("Who should choose this")
 * - Evidenced badges ("Best Overall", "Best Value", "Best Fit") with strict eligibility
 *
 * Integrity Guarantees:
 * 1. A product failing mandatory requirements cannot receive Best Overall or Best Fit
 *    unless all candidates fail, in which case the failure is explicitly stated.
 * 2. Best Value requires genuine requirement satisfaction and relevance, never just lowest price.
 * 3. Never compare prices across different currencies without a verified exchange rate.
 * 4. Missing product data remains unknown — never an assumed positive or negative.
 * 5. Reviews and ratings are only displayed when verified from catalog records.
 * 6. All badge assignments and rankings are 100% deterministic and reproducible.
 */
import type { Product, ProductRecommendationInsight } from "@/types";
import type { RankedProduct } from "./ranking";
import type { ShoppingIntent } from "./intent";
import { extractApplianceCapacity } from "@/lib/catalog/normalize";

/** Checks if text contains a search keyword/phrase case-insensitively. */
function textContains(text: string | undefined, keyword: string): boolean {
  if (!text || !keyword) return false;
  return text.toLowerCase().includes(keyword.toLowerCase().trim());
}

/** Formats a currency amount with currency code or dollar sign. */
function formatPrice(amount: number, currency: string = "USD"): string {
  if (currency.toUpperCase() === "USD") return `$${amount.toFixed(2)}`;
  return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
}

/** Evaluates mandatory requirement failures for a product. */
function evaluateFailures(
  product: Product,
  intent: ShoppingIntent,
  maxBudget?: number,
  targetCurrency: string = "USD",
): string[] {
  const failures: string[] = [];
  const prodCurrency = (product.currency || "USD").toUpperCase();
  const tgtCurrency = targetCurrency.toUpperCase();

  // 1. Budget ceiling constraint (only comparable when currencies match)
  if (maxBudget !== undefined) {
    if (prodCurrency === tgtCurrency) {
      if (product.price > maxBudget) {
        failures.push(
          `Exceeds budget ceiling (${formatPrice(product.price, prodCurrency)} > ${formatPrice(maxBudget, tgtCurrency)})`,
        );
      }
    } else {
      failures.push(
        `Price is in ${prodCurrency}; cannot verify against ${tgtCurrency} budget without live exchange rate`,
      );
    }
  }

  // 2. Mandatory required specs
  if (intent.requiredSpecs) {
    for (const [key, expected] of Object.entries(intent.requiredSpecs)) {
      const actual = product.specs?.[key];
      if (actual === undefined) {
        failures.push(`Missing required specification: "${key}"`);
      } else {
        const actualTokens = actual.toLowerCase().split(/[^a-z0-9]+/);
        const expectedTokens = expected.toLowerCase().split(/[^a-z0-9]+/);
        const matches = expectedTokens.some((tok) => actualTokens.includes(tok));
        if (!matches) {
          failures.push(
            `Fails required specification "${key}": found "${actual}", expected "${expected}"`,
          );
        }
      }
    }
  }

  // 3. Mandatory required features
  if (intent.requiredFeatures && intent.requiredFeatures.length > 0) {
    for (const feat of intent.requiredFeatures) {
      const inDesc = textContains(product.description, feat);
      const inName = textContains(product.name, feat);
      const inSpecs =
        product.specs &&
        Object.entries(product.specs).some(
          ([k, v]) => textContains(k, feat) || textContains(v, feat),
        );
      if (!inDesc && !inName && !inSpecs) {
        failures.push(`Does not document required feature: "${feat}"`);
      }
    }
  }

  // 4. Excluded features
  if (intent.excludedFeatures && intent.excludedFeatures.length > 0) {
    for (const feat of intent.excludedFeatures) {
      const inDesc = textContains(product.description, feat);
      const inName = textContains(product.name, feat);
      const inSpecs =
        product.specs &&
        Object.entries(product.specs).some(
          ([k, v]) => textContains(k, feat) || textContains(v, feat),
        );
      if (inDesc || inName || inSpecs) {
        failures.push(`Contains excluded feature or form factor: "${feat}"`);
      }
    }
  }

  // 5. Washing machine capacity check for family-of-four requests
  const isWashingMachine =
    textContains(product.category, "washing") ||
    textContains(product.category, "washer") ||
    textContains(product.name, "washer") ||
    textContains(product.name, "washing machine");

  const queryOrUse = `${intent.query || ""} ${intent.intendedUse || ""} ${(intent.priorities || []).join(" ")}`.toLowerCase();
  const isFamilyRequest = queryOrUse.includes("family") || queryOrUse.includes("4 person") || queryOrUse.includes("4 people");

  if (isWashingMachine && isFamilyRequest) {
    const isCompactOrPortable =
      textContains(product.name, "portable") ||
      textContains(product.name, "twin tub") ||
      textContains(product.name, "mini") ||
      textContains(product.name, "compact") ||
      textContains(product.description, "portable") ||
      textContains(product.description, "twin tub") ||
      textContains(product.description, "compact spaces");

    const capacitySpec = extractApplianceCapacity(product);
    const specKeys = Object.keys(product.specs || {});
    const capacityKey = specKeys.find((k) => /capacity|tub|drum|load/i.test(k));
    const hasCapacitySpec = Boolean(
      capacitySpec || (capacityKey && product.specs?.[capacityKey]?.trim()),
    );

    if (isCompactOrPortable) {
      failures.push(
        "Compact/portable washer: typically designed for dorms/RVs; unverified capacity for a family of 4",
      );
    } else if (!hasCapacitySpec) {
      failures.push(
        "Washing load capacity is unknown in catalog specs; unverified for a family of 4",
      );
    } else if (capacitySpec && capacitySpec.unit === "kg" && capacitySpec.value < 7) {
      failures.push(
        `Rated capacity of ${capacitySpec.normalizedDisplay} is undersized for a typical family of 4 (minimum 7–8 kg recommended)`,
      );
    }
  }

  return failures;
}

/**
 * Evaluates candidates and generates transparent recommendation insights.
 */
export function generateRecommendations(
  ranked: RankedProduct[],
  intent: ShoppingIntent,
): ProductRecommendationInsight[] {
  if (ranked.length === 0) return [];

  const maxBudget = intent.budgetMax ?? intent.budget?.amount;
  const targetCurrency = (intent.currency ?? intent.budget?.currency ?? "USD").toUpperCase();

  // Pre-calculate per-product failures
  const productFailuresMap = new Map<string, string[]>();
  for (const item of ranked) {
    const failures = evaluateFailures(item.product, intent, maxBudget, targetCurrency);
    productFailuresMap.set(item.product.id, failures);
  }

  // Group prices by currency to prevent cross-currency numerical comparisons
  const pricesByCurrency = new Map<string, number[]>();
  for (const item of ranked) {
    const curr = (item.product.currency || "USD").toUpperCase();
    const list = pricesByCurrency.get(curr) ?? [];
    list.push(item.product.price);
    pricesByCurrency.set(curr, list);
  }

  // -------------------------------------------------------------
  // Badge Assignment Logic
  // -------------------------------------------------------------
  let bestOverallId: string | null = null;
  let bestValueId: string | null = null;
  let bestFitId: string | null = null;

  // 1. "Best Overall": Highest scoring candidate.
  // Must prioritize a candidate with 0 failures if one exists.
  if (ranked.length > 0) {
    const fullyCompliant = ranked.filter(
      (r) => (productFailuresMap.get(r.product.id)?.length ?? 0) === 0,
    );

    if (fullyCompliant.length > 0) {
      // Pick top-scoring fully compliant product
      if (fullyCompliant[0].score >= 0.4) {
        bestOverallId = fullyCompliant[0].product.id;
      }
    } else if (ranked[0].score >= 0.4) {
      // All candidates have some failure; top ranked gets badge only with explicit failure notice
      bestOverallId = ranked[0].product.id;
    }
  }

  // 2. "Best Value":
  // Critical check: Best Value MUST satisfy mandatory requirements, have relevant score,
  // share the target currency, and have price <= maxBudget.
  if (ranked.length > 1) {
    let minPrice = Infinity;
    let bestValueCandidate: RankedProduct | null = null;

    for (const item of ranked) {
      if (item.product.id === bestOverallId) continue;

      const failures = productFailuresMap.get(item.product.id) ?? [];
      const prodCurrency = (item.product.currency || "USD").toUpperCase();

      // Must have zero mandatory requirement failures
      if (failures.length > 0) continue;

      // Must share the target currency to make meaningful price comparisons
      if (prodCurrency !== targetCurrency) continue;

      // Must be relevant (not an irrelevant cheap accessory)
      if (item.breakdown.relevance < 0.35) continue;

      // Must not exceed budget
      if (maxBudget !== undefined && item.product.price > maxBudget) continue;

      // Candidate must be cheaper than Best Overall (if Best Overall exists and is in same currency)
      const bestOverallItem = ranked.find((r) => r.product.id === bestOverallId);
      if (
        bestOverallItem &&
        (bestOverallItem.product.currency || "USD").toUpperCase() === targetCurrency &&
        item.product.price >= bestOverallItem.product.price * 0.95
      ) {
        continue;
      }

      if (item.product.price < minPrice) {
        minPrice = item.product.price;
        bestValueCandidate = item;
      } else if (item.product.price === minPrice && bestValueCandidate) {
        // Deterministic tie-breaker
        if (item.score > bestValueCandidate.score) {
          bestValueCandidate = item;
        } else if (
          item.score === bestValueCandidate.score &&
          item.product.id.localeCompare(bestValueCandidate.product.id) < 0
        ) {
          bestValueCandidate = item;
        }
      }
    }

    if (bestValueCandidate) {
      bestValueId = bestValueCandidate.product.id;
    }
  }

  // 3. "Best Fit":
  // Highest spec match / priority alignment candidate that satisfies mandatory requirements.
  if (ranked.length > 1) {
    let topSpecScore = -1;
    let topSpecCandidate: RankedProduct | null = null;

    for (const item of ranked) {
      if (item.product.id === bestOverallId || item.product.id === bestValueId) continue;

      const failures = productFailuresMap.get(item.product.id) ?? [];
      // Must not have failed mandatory requirements or budget
      if (failures.length > 0) continue;

      const specScore = item.breakdown.specMatch + item.breakdown.relevance;
      if (specScore > topSpecScore) {
        topSpecScore = specScore;
        topSpecCandidate = item;
      } else if (specScore === topSpecScore && topSpecCandidate) {
        // Deterministic tie-breaker
        if (item.score > topSpecCandidate.score) {
          topSpecCandidate = item;
        } else if (
          item.score === topSpecCandidate.score &&
          item.product.id.localeCompare(topSpecCandidate.product.id) < 0
        ) {
          topSpecCandidate = item;
        }
      }
    }

    if (topSpecCandidate && topSpecScore >= 0.5) {
      bestFitId = topSpecCandidate.product.id;
    }
  }

  // -------------------------------------------------------------
  // Insight Generation per Product
  // -------------------------------------------------------------
  return ranked.map((item) => {
    const product = item.product;
    const prodCurrency = (product.currency || "USD").toUpperCase();
    const failures = productFailuresMap.get(product.id) ?? [];

    const isWashingMachine =
      textContains(product.category, "washing") ||
      textContains(product.category, "washer") ||
      textContains(product.name, "washer") ||
      textContains(product.name, "washing machine");

    const queryOrUse = `${intent.query || ""} ${intent.intendedUse || ""} ${(intent.priorities || []).join(" ")}`.toLowerCase();
    const isFamilyRequest = queryOrUse.includes("family") || queryOrUse.includes("4 person") || queryOrUse.includes("4 people");

    let badge: "Best Overall" | "Best Value" | "Best Fit" | undefined = undefined;
    if (product.id === bestOverallId) {
      badge = "Best Overall";
    } else if (product.id === bestValueId) {
      badge = "Best Value";
    } else if (product.id === bestFitId) {
      badge = "Best Fit";
    }

    // Requirements Satisfied
    const satisfied: string[] = [];

    // Category match
    if (intent.productCategory || intent.category) {
      const cat = intent.productCategory || intent.category;
      if (textContains(product.category, cat!) || textContains(product.name, cat!)) {
        satisfied.push(`Matches target category: ${product.category || cat}`);
      }
    }

    // Budget match (only if currencies match)
    if (maxBudget !== undefined) {
      if (prodCurrency === targetCurrency && product.price <= maxBudget) {
        satisfied.push(
          `Priced at ${formatPrice(product.price, prodCurrency)}, within your budget limit of ${formatPrice(maxBudget, targetCurrency)}`,
        );
      }
    }

    // Preferred brands
    if (intent.brands && intent.brands.length > 0) {
      for (const b of intent.brands) {
        if (textContains(product.brand, b) || textContains(product.name, b)) {
          satisfied.push(`Matches preferred brand: ${product.brand || b}`);
          break;
        }
      }
    }

    // Required features & specs verified
    const allFeatures = [
      ...(intent.requiredFeatures ?? []),
      ...Object.entries(intent.requiredSpecs ?? {}).map(([k, v]) => `${k}: ${v}`),
    ];
    for (const feat of allFeatures) {
      const isPresentInDesc = textContains(product.description, feat);
      const isPresentInName = textContains(product.name, feat);
      const isPresentInSpecs =
        product.specs &&
        Object.entries(product.specs).some(
          ([k, v]) => textContains(k, feat) || textContains(v, feat),
        );
      if (isPresentInDesc || isPresentInName || isPresentInSpecs) {
        satisfied.push(`Verifiably features: ${feat}`);
      }
    }

    // Intended use
    if (intent.intendedUse) {
      if (
        textContains(product.description, intent.intendedUse) ||
        textContains(product.name, intent.intendedUse)
      ) {
        satisfied.push(`Well-suited for: ${intent.intendedUse}`);
      }
    }

    if (satisfied.length === 0 && failures.length === 0 && item.reasons.length > 0) {
      satisfied.push(...item.reasons.slice(0, 2));
    }

    // Missing / Unverified Attributes (Truthful disclosure, no assumptions)
    const missingOrUnverified: string[] = [];
    const specs = product.specs || {};
    const specKeys = Object.keys(specs).map((k) => k.toLowerCase());

    const hasBatterySpec = specKeys.some(
      (k) => k.includes("battery") || k.includes("run time") || k.includes("playtime"),
    );
    const hasWarrantySpec = specKeys.some((k) => k.includes("warranty"));
    const hasDimensions = specKeys.some(
      (k) => k.includes("dimension") || k.includes("size") || k.includes("weight"),
    );
    const hasWaterResistance = specKeys.some(
      (k) => k.includes("water") || k.includes("ipx") || k.includes("weather"),
    );

    // Currency conversion warning if currency differs from intent
    if (maxBudget !== undefined && prodCurrency !== targetCurrency) {
      missingOrUnverified.push(
        `Budget compatibility: UNVERIFIED (Price is in ${prodCurrency}; conversion to ${targetCurrency} requires live exchange rate)`,
      );
    }

    const isOverseas = Boolean(
      product.merchant &&
      (product.merchant.endsWith(".it") ||
        product.merchant.endsWith(".de") ||
        product.merchant.endsWith(".eu") ||
        product.merchant.endsWith(".uk") ||
        product.merchant.endsWith(".ca") ||
        product.merchant.includes("mohd")),
    );

    if (isOverseas || (targetCurrency === "INR" && prodCurrency === "USD")) {
      const merchantTag = product.merchant ? ` via ${product.merchant}` : "";
      missingOrUnverified.push(
        `International merchant offer${merchantTag}: domestic delivery in India, customs duties, international shipping, and electrical voltage compatibility are UNKNOWN`,
      );
    }

    if (isWashingMachine) {
      const hasCapacity = specKeys.some((k) => /capacity|tub|drum|load/i.test(k));
      if (!hasCapacity) {
        missingOrUnverified.push("Washing load capacity: UNKNOWN (unlisted in merchant specifications)");
      }
    }

    if (!hasWarrantySpec) {
      missingOrUnverified.push("Merchant warranty coverage period unlisted");
    }
    if (
      !hasBatterySpec &&
      (textContains(product.category, "headphone") ||
        textContains(product.category, "audio") ||
        textContains(product.category, "electronic") ||
        textContains(product.name, "wireless"))
    ) {
      missingOrUnverified.push("Exact battery life duration not documented in specs");
    }
    if (
      !hasWaterResistance &&
      (textContains(product.category, "headphone") ||
        textContains(product.category, "earbuds") ||
        textContains(product.category, "audio"))
    ) {
      missingOrUnverified.push("Official IPX water/sweat resistance rating unverified");
    }
    if (!hasDimensions) {
      missingOrUnverified.push("Product package weight and dimensions not specified");
    }
    if (!product.reviews || product.reviews === 0 || !product.ratings || product.ratings === 0) {
      missingOrUnverified.push("No verified customer reviews or ratings published in catalog");
    }

    // Cap to top transparent missing points
    const trimmedMissing = missingOrUnverified.slice(0, 6);

    // Trade-offs (Grounded strictly in catalog facts, no speculation)
    const tradeOffs: string[] = [];

    // 1. Budget trade-offs (only within matching currency)
    if (maxBudget !== undefined && prodCurrency === targetCurrency) {
      if (product.price > maxBudget) {
        tradeOffs.push(
          `Exceeds budget ceiling (${formatPrice(product.price, prodCurrency)} vs ${formatPrice(maxBudget, targetCurrency)})`,
        );
      } else if (product.price >= maxBudget * 0.85) {
        tradeOffs.push(
          `Price (${formatPrice(product.price, prodCurrency)}) is near your ${formatPrice(maxBudget, targetCurrency)} budget ceiling`,
        );
      }
    }

    // 2. Relative price trade-offs within the same currency only
    const sameCurrencyPrices = pricesByCurrency.get(prodCurrency) ?? [];
    if (sameCurrencyPrices.length > 1) {
      const highestInCurrency = Math.max(...sameCurrencyPrices);
      const lowestInCurrency = Math.min(...sameCurrencyPrices);
      if (product.price === highestInCurrency && highestInCurrency > lowestInCurrency) {
        tradeOffs.push(
          `Priced at the top of the ${prodCurrency} shortlist (${formatPrice(product.price, prodCurrency)})`,
        );
      } else if (product.price === lowestInCurrency && lowestInCurrency < highestInCurrency) {
        tradeOffs.push(
          `Lowest priced option among ${prodCurrency} candidates (${formatPrice(product.price, prodCurrency)})`,
        );
      }
    }

    // 3. Customer review status
    if (product.ratings && product.ratings < 4.2 && product.reviews && product.reviews > 0) {
      tradeOffs.push(
        `Average rating (${product.ratings}/5) is moderate across ${product.reviews} reviews`,
      );
    } else if (!product.reviews || product.reviews === 0) {
      tradeOffs.push("No verified customer reviews recorded yet for this merchant listing");
    }

    // 4. Missing required specs or features as explicit trade-offs
    for (const failure of failures) {
      if (!tradeOffs.includes(failure)) {
        tradeOffs.push(failure);
      }
    }

    if (tradeOffs.length === 0) {
      tradeOffs.push("Check compatibility with existing setup before purchasing");
    }

    // Who should choose this (Persona recommendation)
    let whoShouldChoose = "Shoppers looking for a dependable option in this category.";
    if (badge === "Best Overall") {
      whoShouldChoose =
        failures.length > 0
          ? `Best overall option available, though note: ${failures[0]}.`
          : "Best for shoppers seeking the strongest overall balance of performance, brand reputation, and verified features.";
    } else if (badge === "Best Value") {
      whoShouldChoose = `Best for value-conscious buyers wanting verified core capabilities at an accessible price (${formatPrice(product.price, prodCurrency)}).`;
    } else if (badge === "Best Fit") {
      whoShouldChoose = intent.intendedUse
        ? `Best for users specifically focusing on ${intent.intendedUse}.`
        : "Best for shoppers seeking close alignment with specific search criteria.";
    } else if (intent.intendedUse) {
      whoShouldChoose = `Recommended for ${intent.intendedUse} and everyday requirements.`;
    }

    if (isWashingMachine && isFamilyRequest) {
      const isCompactOrPortable =
        textContains(product.name, "portable") ||
        textContains(product.name, "twin tub") ||
        textContains(product.name, "mini") ||
        textContains(product.name, "compact") ||
        textContains(product.description, "portable") ||
        textContains(product.description, "twin tub") ||
        textContains(product.description, "compact spaces");
      if (isCompactOrPortable) {
        whoShouldChoose = "Shoppers needing a compact/portable washer for smaller spaces; load capacity is unverified for full family-of-4 needs.";
      }
    }

    // Why it matches (incorporate failure notice if Best Overall failed a requirement)
    let whyItMatches =
      item.reasons.length > 0
        ? item.reasons.join(". ") + "."
        : `Relevance score of ${Math.round(item.score * 100)}% based on query and feature criteria.`;

    if (failures.length > 0 && badge === "Best Overall") {
      whyItMatches = `[Best Available] Note: ${failures[0]}. ` + whyItMatches;
    }

    return {
      productId: product.id,
      badge,
      whyItMatches,
      requirementsSatisfied: satisfied,
      failedRequirements: failures.length > 0 ? failures : undefined,
      missingOrUnverified: trimmedMissing,
      tradeOffs,
      whoShouldChoose,
    };
  });
}
