/**
 * ShopMate AI — deterministic recommendation ranking (Phase 4).
 *
 * Turns catalog candidates into an ordered, explained recommendation list.
 * The weights and the arithmetic live here — never in the model — so the
 * same inputs always produce the same ranking, and every recommendation
 * carries a human-readable reason derived from real product data.
 *
 * Initial weights follow the Phase 4 spec (relevance 35%, spec match 30%,
 * budget fit 20%, brand preference 10%, data completeness 5%). They are
 * configuration, not truth: explicit user priorities shift weight into the
 * spec-match dimension via `adaptWeights`.
 */
import type { Product } from "@/types";
import { scoreRelevance } from "./relevance";

export interface RankingWeights {
  relevance: number;
  specMatch: number;
  budgetFit: number;
  brandFit: number;
  completeness: number;
}

/** The spec's initial weighting. Sums to 1. */
export const DEFAULT_WEIGHTS: RankingWeights = {
  relevance: 0.35,
  specMatch: 0.3,
  budgetFit: 0.2,
  brandFit: 0.1,
  completeness: 0.05,
};

/** specMatch can absorb at most this much weight from the other dimensions. */
const SPEC_BOOST_PER_PRIORITY = 0.05;
const SPEC_MATCH_CAP = 0.5;

/**
 * Shifts weight into specMatch for each explicit user priority (e.g. "battery
 * life matters most"), taken proportionally from the other dimensions so the
 * weights keep summing to 1. Capped to keep the engine balanced.
 */
export function adaptWeights(
  weights: RankingWeights,
  priorities: string[],
): RankingWeights {
  if (priorities.length === 0) return { ...weights };

  const requested = priorities.length * SPEC_BOOST_PER_PRIORITY;
  const shift = Math.min(requested, Math.max(0, SPEC_MATCH_CAP - weights.specMatch));
  const others = weights.relevance + weights.budgetFit + weights.brandFit + weights.completeness;

  if (others <= 0) return { ...weights };

  return {
    relevance: weights.relevance - shift * (weights.relevance / others),
    specMatch: weights.specMatch + shift,
    budgetFit: weights.budgetFit - shift * (weights.budgetFit / others),
    brandFit: weights.brandFit - shift * (weights.brandFit / others),
    completeness: weights.completeness - shift * (weights.completeness / others),
  };
}

export interface RankingCriteria {
  /** Query tokens for the relevance component. */
  tokens: string[];
  /** Preferred brands, lowercased. Empty = no brand preference. */
  brands: string[];
  /** Hard requirements: attribute label → expected value. */
  requiredSpecs: Record<string, string>;
  /** Budget ceiling, or null when unstated. */
  budget: { amount: number; currency: string } | null;
  /** Explicit user priorities; shift weight toward spec match. */
  priorities?: string[];
}

export interface RankingBreakdown {
  relevance: number;
  specMatch: number;
  budgetFit: number;
  brandFit: number;
  completeness: number;
}

export interface RankedProduct {
  product: Product;
  /** Total 0–1 score (weighted component sum). */
  score: number;
  /** Unweighted component scores, for explanations and debugging. */
  breakdown: RankingBreakdown;
  /** Human-readable reasons derived from real product data. */
  reasons: string[];
}

/** Neutral score for a dimension with no criteria to judge against. */
const NEUTRAL = 0.5;

function specMatchScore(
  product: Product,
  requiredSpecs: Record<string, string>,
): number {
  const entries = Object.entries(requiredSpecs);
  if (entries.length === 0) return NEUTRAL;

  let total = 0;
  for (const [key, expected] of entries) {
    const actual = product.specs?.[key];
    if (actual === undefined) {
      // Missing data must remain unknown — it cannot be credited as a match.
      continue;
    }
    const actualTokens = tokenizeValue(actual);
    const expectedTokens = tokenizeValue(expected);
    const matched = expectedTokens.some((token) => actualTokens.includes(token));
    total += matched ? 1 : 0;
  }
  return total / entries.length;
}

function tokenizeValue(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

function budgetFitScore(
  product: Product,
  budget: { amount: number; currency: string } | null,
): number {
  if (!budget) return NEUTRAL;
  if (
    budget.currency &&
    product.currency &&
    product.currency.toUpperCase() !== budget.currency.toUpperCase()
  ) {
    // Never guess an exchange rate — a foreign-currency price is unratable.
    return NEUTRAL;
  }
  return product.price <= budget.amount ? 1 : 0;
}

function brandFitScore(product: Product, brands: string[]): number {
  if (brands.length === 0) return NEUTRAL;
  const brandTokens = tokenizeValue(product.brand ?? "");
  return brands.some((brand) =>
    tokenizeValue(brand).some((token) => brandTokens.includes(token)),
  )
    ? 1
    : 0;
}

const COMPLETENESS_FIELDS = 10;

function completenessScore(product: Product): number {
  let present = 0;
  if (product.name?.trim()) present += 1;
  if (Number.isFinite(product.price)) present += 1;
  if (product.currency?.trim()) present += 1;
  if (product.images?.length > 0) present += 1;
  if (product.description?.trim()) present += 1;
  if (product.ratings > 0) present += 1;
  if (product.reviews > 0) present += 1;
  if (product.category?.trim()) present += 1;
  if (product.brand?.trim()) present += 1;
  if (Object.keys(product.specs ?? {}).length > 0) present += 1;
  return present / COMPLETENESS_FIELDS;
}

function formatMoney(amount: number, currency: string): string {
  return `${amount} ${currency}`;
}

function buildReasons(
  product: Product,
  breakdown: RankingBreakdown,
  criteria: RankingCriteria,
): string[] {
  const reasons: string[] = [];

  if (breakdown.relevance >= 0.75) {
    reasons.push("strong match for what you searched");
  } else if (breakdown.relevance >= 0.4) {
    reasons.push("relevant to your search");
  }

  const requiredEntries = Object.entries(criteria.requiredSpecs);
  if (requiredEntries.length > 0) {
    const matched = requiredEntries.filter(([key, expected]) => {
      const actual = product.specs?.[key];
      return (
        actual !== undefined &&
        tokenizeValue(actual).some((token) => tokenizeValue(expected).includes(token))
      );
    });
    for (const [key] of matched) {
      reasons.push(`meets your "${key}" requirement`);
    }
  }

  if (criteria.budget) {
    if (breakdown.budgetFit === 1) {
      reasons.push(
        `fits your ${formatMoney(criteria.budget.amount, criteria.budget.currency)} budget`,
      );
    } else if (breakdown.budgetFit === 0) {
      reasons.push(
        `over your ${formatMoney(criteria.budget.amount, criteria.budget.currency)} budget`,
      );
    }
  }

  if (criteria.brands.length > 0 && breakdown.brandFit === 1) {
    reasons.push(`made by ${product.brand}`);
  }

  if (product.ratings > 0 && product.reviews > 0) {
    reasons.push(`rated ${product.ratings} from ${product.reviews} reviews`);
  } else {
    reasons.push("no review data published for this listing");
  }

  return reasons;
}

/**
 * Ranks products by weighted component scores. Ties break deterministically
 * on ratings, then review count, then id — never on list order.
 */
export function rankProducts(
  products: Product[],
  criteria: RankingCriteria,
): RankedProduct[] {
  // Deduplicate products by id to ensure ranking stability and prevent duplicate cards
  const seenIds = new Set<string>();
  const uniqueProducts: Product[] = [];
  for (const product of products) {
    if (!seenIds.has(product.id)) {
      seenIds.add(product.id);
      uniqueProducts.push(product);
    }
  }

  const weights = adaptWeights(DEFAULT_WEIGHTS, criteria.priorities ?? []);

  const ranked = uniqueProducts.map((product) => {
    const relevance = scoreRelevance(product, {
      tokens: criteria.tokens,
      brands: criteria.brands,
      requiredSpecs: criteria.requiredSpecs,
    });
    const breakdown: RankingBreakdown = {
      relevance,
      specMatch: specMatchScore(product, criteria.requiredSpecs),
      budgetFit: budgetFitScore(product, criteria.budget),
      brandFit: brandFitScore(product, criteria.brands),
      completeness: completenessScore(product),
    };

    const score =
      weights.relevance * breakdown.relevance +
      weights.specMatch * breakdown.specMatch +
      weights.budgetFit * breakdown.budgetFit +
      weights.brandFit * breakdown.brandFit +
      weights.completeness * breakdown.completeness;

    return {
      product,
      score,
      breakdown,
      reasons: buildReasons(product, breakdown, criteria),
    };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.product.ratings !== a.product.ratings) {
      return b.product.ratings - a.product.ratings;
    }
    if (b.product.reviews !== a.product.reviews) {
      return b.product.reviews - a.product.reviews;
    }
    return a.product.id.localeCompare(b.product.id);
  });

  return ranked;
}
