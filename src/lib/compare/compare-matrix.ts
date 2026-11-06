import type { Product, ProductRecommendationInsight } from "@/types";
import { rankProducts, type RankingCriteria } from "@/lib/agent/ranking";
import { generateRecommendations } from "@/lib/agent/decision-engine";
import type { ShoppingIntent } from "@/lib/agent/intent";
import { tokenize } from "@/lib/agent/relevance";
import { formatMoney } from "@/lib/format";

export const MAX_COMPARE_PRODUCTS = 4;

export interface SpecValue {
  value: string;
  isMissing: boolean;
}

export interface SpecRow {
  key: string;
  isIdentical: boolean;
  isDifferent: boolean;
  hasMissing: boolean;
  values: Record<string, SpecValue>;
}

export interface PriceComparison {
  hasCurrencyMismatch: boolean;
  currencies: string[];
  minPrice?: number;
  maxPrice?: number;
  priceDelta?: number;
  formattedDelta?: string;
  currencyWarning?: string;
}

export interface ComparisonMatrixResult {
  products: Product[];
  specRows: SpecRow[];
  priceComparison: PriceComparison;
  insights: Map<string, ProductRecommendationInsight>;
  totalSpecsCount: number;
  differingSpecsCount: number;
}

/**
 * Filters and validates a list of product IDs against a catalog,
 * deduplicating and capping at MAX_COMPARE_PRODUCTS.
 */
export function getValidCompareProducts(
  ids: string[],
  catalog: Product[],
): Product[] {
  const seen = new Set<string>();
  const valid: Product[] = [];

  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const product = catalog.find((p) => p.id === id);
    if (product) {
      valid.push(product);
      if (valid.length >= MAX_COMPARE_PRODUCTS) break;
    }
  }

  return valid;
}

/**
 * Builds a structured comparison matrix across 0 to 4 products.
 * Identifies identical vs differing specs, marks missing specs explicitly,
 * validates currency safety, and computes evidenced recommendations.
 */
export function buildComparisonMatrix(
  products: Product[],
  intent?: ShoppingIntent,
): ComparisonMatrixResult {
  // Cap at MAX_COMPARE_PRODUCTS
  const activeProducts = products.slice(0, MAX_COMPARE_PRODUCTS);

  // 1. Gather all unique spec keys preserving order of appearance
  const specKeySet = new Set<string>();
  for (const product of activeProducts) {
    if (product.specs) {
      for (const key of Object.keys(product.specs)) {
        specKeySet.add(key);
      }
    }
  }
  const specKeys = Array.from(specKeySet);

  // 2. Build rows
  const specRows: SpecRow[] = [];

  for (const key of specKeys) {
    const values: Record<string, SpecValue> = {};
    let hasMissing = false;
    const rawValues: string[] = [];

    for (const product of activeProducts) {
      const raw = product.specs?.[key];
      const isMissing =
        raw === undefined || raw === null || raw.trim() === "";

      if (isMissing) {
        hasMissing = true;
        values[product.id] = {
          value: "Not documented",
          isMissing: true,
        };
      } else {
        const trimmed = raw.trim();
        values[product.id] = {
          value: trimmed,
          isMissing: false,
        };
        rawValues.push(trimmed);
      }
    }

    let isIdentical = false;
    let isDifferent = false;

    if (activeProducts.length > 1) {
      if (hasMissing) {
        isIdentical = false;
        isDifferent = true;
      } else {
        // All have verified values. Check if they match.
        const normalized = rawValues.map((v) => v.toLowerCase());
        const allMatch = normalized.every((v) => v === normalized[0]);
        isIdentical = allMatch;
        isDifferent = !allMatch;
      }
    }

    specRows.push({
      key,
      isIdentical,
      isDifferent,
      hasMissing,
      values,
    });
  }

  // 3. Price and Currency Safety
  const currencySet = new Set<string>();
  for (const product of activeProducts) {
    currencySet.add((product.currency || "USD").toUpperCase());
  }
  const currencies = Array.from(currencySet);
  const hasCurrencyMismatch = currencies.length > 1;

  let priceComparison: PriceComparison;

  if (activeProducts.length === 0) {
    priceComparison = {
      hasCurrencyMismatch: false,
      currencies: [],
    };
  } else if (hasCurrencyMismatch) {
    priceComparison = {
      hasCurrencyMismatch: true,
      currencies,
      currencyWarning: `Products use different currencies (${currencies.join(
        ", ",
      )}). Numerical prices and savings cannot be compared without a verified live exchange rate.`,
    };
  } else {
    const prices = activeProducts.map((p) => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceDelta = Math.round((maxPrice - minPrice) * 100) / 100;
    const currency = currencies[0] || "USD";

    priceComparison = {
      hasCurrencyMismatch: false,
      currencies,
      minPrice,
      maxPrice,
      priceDelta,
      formattedDelta: formatMoney(priceDelta, currency),
    };
  }

  // 4. Recommendation Insights (Grounding with Phase 3 Decision Engine)
  const insights = new Map<string, ProductRecommendationInsight>();

  if (activeProducts.length > 0) {
    const effectiveIntent: ShoppingIntent = intent ?? {
      query: activeProducts[0].category || "compare products",
      category: activeProducts[0].category,
      currency: currencies[0] || "USD",
      brands: [],
      requiredSpecs: {},
      priorities: [],
      clarifications: [],
    };

    const queryTokens = tokenize(effectiveIntent.query || activeProducts[0].name || "");
    const criteria: RankingCriteria = {
      tokens: queryTokens.length > 0 ? queryTokens : ["product"],
      brands: (effectiveIntent.brands ?? []).map((b) => b.toLowerCase()),
      requiredSpecs: effectiveIntent.requiredSpecs ?? {},
      budget: effectiveIntent.budget
        ? effectiveIntent.budget
        : effectiveIntent.budgetMax
        ? { amount: effectiveIntent.budgetMax, currency: effectiveIntent.currency ?? currencies[0] ?? "USD" }
        : null,
      priorities: effectiveIntent.priorities ?? [],
    };

    const ranked = rankProducts(activeProducts, criteria);
    const recs = generateRecommendations(ranked, effectiveIntent);

    for (const rec of recs) {
      insights.set(rec.productId, rec);
    }
  }

  return {
    products: activeProducts,
    specRows,
    priceComparison,
    insights,
    totalSpecsCount: specRows.length,
    differingSpecsCount: specRows.filter((r) => r.isDifferent).length,
  };
}
