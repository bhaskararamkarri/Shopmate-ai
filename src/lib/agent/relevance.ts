/**
 * ShopMate AI — deterministic relevance engine (Phase 4).
 *
 * Channel3's search is fuzzy: a query like "zzqqxx12345-no-such-product" can
 * return real products whose titles merely contain "no such". This engine is
 * the gate between the catalog and the shopper: it scores every candidate
 * against the current search criteria with transparent token overlap and
 * rejects clearly irrelevant results instead of presenting them as matches.
 *
 * No model is involved — the same inputs always produce the same verdict.
 */
import type { Product } from "@/types";

/** Products scoring below this are treated as fuzzy noise, not matches. */
export const RELEVANCE_THRESHOLD = 0.15;

/** Live offers may exceed a stated budget slightly (shipping, tax). */
export const BUDGET_TOLERANCE = 1.15;

/** Field weights for token overlap: where a term appears matters. */
const TOKEN_CREDIT = {
  title: 1,
  brand: 0.7,
  category: 0.7,
  specs: 0.4,
  description: 0.3,
} as const;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "buy",
  "can",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "need",
  "of",
  "on",
  "or",
  "please",
  "some",
  "the",
  "to",
  "want",
  "with",
  "you",
  "your",
]);

/** Lowercases, strips punctuation, splits compounds, drops stopwords. */
export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export interface RelevanceCriteria {
  /** Meaningful tokens from the shopping query. */
  tokens: string[];
  /** Brand preferences, already lowercased. */
  brands?: string[];
  /** Category hint from the intent, free text. */
  category?: string;
  /** Budget ceiling in the user's currency. */
  budget?: { amount: number; currency: string };
  /** Hard requirements: attribute label → expected value. */
  requiredSpecs?: Record<string, string>;
}

export type BudgetCompatibility = "COMPATIBLE" | "OVER_BUDGET" | "UNVERIFIED";

export interface ScoredProduct {
  product: Product;
  score: number;
  budgetCompatibility?: BudgetCompatibility;
}

export interface RelevanceRejection {
  id: string;
  name: string;
  reason: string;
}

export interface RelevanceOutcome {
  relevant: ScoredProduct[];
  rejected: RelevanceRejection[];
  /** Set when everything was rejected — a hint for a refined query. */
  suggestion?: string;
}

function overlapTokens(a: string[], b: string[]): boolean {
  return a.some((token) => b.includes(token));
}

/**
 * Scores one product against the criteria on a 0–1 scale. Each query token
 * credits the strongest field it appears in (title > brand/category > specs >
 * description); brand, category and required-spec agreement add bonuses.
 */
export function scoreRelevance(
  product: Product,
  criteria: RelevanceCriteria,
): number {
  if (criteria.tokens.length === 0) return 0;

  const titleTokens = tokenize(product.name);
  const brandTokens = tokenize(product.brand ?? "");
  const categoryTokens = tokenize(product.category ?? "");
  const descriptionTokens = tokenize(product.description ?? "");
  const specTokens = Object.entries(product.specs ?? {}).flatMap(([key, value]) =>
    tokenize(`${key} ${value}`),
  );

  let total = 0;
  for (const token of criteria.tokens) {
    let credit = 0;
    if (titleTokens.includes(token)) credit = TOKEN_CREDIT.title;
    else if (brandTokens.includes(token)) credit = TOKEN_CREDIT.brand;
    else if (categoryTokens.includes(token)) credit = TOKEN_CREDIT.category;
    else if (specTokens.includes(token)) credit = TOKEN_CREDIT.specs;
    else if (descriptionTokens.includes(token)) credit = TOKEN_CREDIT.description;
    total += credit;
  }
  let score = total / criteria.tokens.length;

  if (
    criteria.brands?.some((brand) =>
      overlapTokens(tokenize(brand), brandTokens),
    )
  ) {
    score += 0.15;
  }
  if (
    criteria.category &&
    overlapTokens(tokenize(criteria.category), categoryTokens)
  ) {
    score += 0.15;
  }
  if (criteria.requiredSpecs) {
    for (const [key, expected] of Object.entries(criteria.requiredSpecs)) {
      const actual = product.specs?.[key];
      if (actual && overlapTokens(tokenize(actual), tokenize(expected))) {
        score += 0.05;
      }
    }
  }

  return Math.min(1, score);
}

/** True when the product states a spec value that contradicts the requirement. */
export function specContradiction(
  product: Product,
  requiredSpecs: Record<string, string>,
): string | null {
  for (const [key, expected] of Object.entries(requiredSpecs)) {
    const actual = product.specs?.[key];
    if (
      actual !== undefined &&
      !overlapTokens(tokenize(actual), tokenize(expected))
    ) {
      return key;
    }
  }
  return null;
}

/**
 * Validates budget compatibility strictly:
 * - When currencies match: evaluates whether price is within budget (with tolerance).
 * - When currencies differ: returns "UNVERIFIED" because foreign currencies cannot
 *   be converted without a trusted live exchange rate. Never compares cross-currency
 *   numbers or guesses exchange rates.
 */
export function checkBudgetCompatibility(
  product: Product,
  budget: { amount: number; currency: string } | null | undefined,
): BudgetCompatibility {
  if (!budget || !Number.isFinite(budget.amount) || !Number.isFinite(product.price)) {
    return "COMPATIBLE";
  }
  const prodCurrency = (product.currency || "USD").toUpperCase();
  const tgtCurrency = (budget.currency || "USD").toUpperCase();

  if (prodCurrency !== tgtCurrency) {
    return "UNVERIFIED";
  }

  return product.price > budget.amount * BUDGET_TOLERANCE ? "OVER_BUDGET" : "COMPATIBLE";
}

/** True when the product price breaks the budget beyond tolerance in the same currency. */
export function overBudget(
  product: Product,
  budget: { amount: number; currency: string },
): boolean {
  return checkBudgetCompatibility(product, budget) === "OVER_BUDGET";
}

/**
 * Splits catalog results into relevant products (scored, best first) and
 * rejected fuzzy matches with human-readable reasons. Missing spec data is
 * neutral — only a stated contradiction disqualifies on specs.
 */
export function filterRelevant(
  products: Product[],
  criteria: RelevanceCriteria,
): RelevanceOutcome {
  const relevant: ScoredProduct[] = [];
  const rejected: RelevanceRejection[] = [];

  for (const product of products) {
    const contradiction = criteria.requiredSpecs
      ? specContradiction(product, criteria.requiredSpecs)
      : null;
    if (contradiction) {
      rejected.push({
        id: product.id,
        name: product.name,
        reason: `spec "${contradiction}" contradicts the requirement`,
      });
      continue;
    }

    const budgetCompat = criteria.budget
      ? checkBudgetCompatibility(product, criteria.budget)
      : "COMPATIBLE";

    if (budgetCompat === "OVER_BUDGET") {
      rejected.push({
        id: product.id,
        name: product.name,
        reason: `over budget (${product.price} ${product.currency} vs ${criteria.budget!.amount} ${criteria.budget!.currency})`,
      });
      continue;
    }

    const score = scoreRelevance(product, criteria);
    if (score < RELEVANCE_THRESHOLD) {
      rejected.push({
        id: product.id,
        name: product.name,
        reason: "low relevance to the query",
      });
      continue;
    }

    relevant.push({ product, score, budgetCompatibility: budgetCompat });
  }

  relevant.sort((a, b) => b.score - a.score);

  const suggestion =
    relevant.length === 0 && products.length > 0
      ? buildSuggestion(criteria)
      : undefined;

  return { relevant, rejected, suggestion };
}

function buildSuggestion(criteria: RelevanceCriteria): string {
  const topic = criteria.tokens.slice(0, 6).join(" ") || "that request";
  return `No confident matches for “${topic}” — try fewer words, a brand name, or a broader product type.`;
}
