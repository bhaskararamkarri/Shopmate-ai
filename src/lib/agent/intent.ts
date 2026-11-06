/**
 * ShopMate AI — shopping intent (Phase 4).
 *
 * The structured understanding of what the shopper wants, extracted by the
 * agent through the `recordIntent` tool and refined across conversation turns.
 * Every field is optional: the agent works with whatever is known and asks
 * clarifying questions for the rest.
 *
 * Validation lives here (zod) because intent arrives from model output —
 * model output is untrusted input and is never used unchecked.
 */
import { z } from "zod";

/** Upper bounds keep a single turn from flooding the prompt or the UI. */
export const INTENT_LIMITS = {
  maxBrands: 10,
  maxPriorities: 6,
  maxClarifications: 6,
  maxRequiredSpecs: 8,
  maxStringLength: 120,
  maxQueryLength: 200,
} as const;

export interface ShoppingIntentBudget {
  /** Positive budget amount in `currency` units. */
  amount: number;
  /** ISO 4217 currency code, uppercase. */
  currency: string;
}

export interface ShoppingIntent {
  /** Product category when known, e.g. "headphones". */
  category?: string;
  /** Phase 3 structured requirement: target product category. */
  productCategory?: string;
  /** The current shopping query in the user's words. */
  query?: string;
  /** Budget ceiling when the user stated one. */
  budget?: ShoppingIntentBudget | null;
  /** Phase 3 structured requirement: minimum budget limit. */
  budgetMin?: number;
  /** Phase 3 structured requirement: maximum budget limit. */
  budgetMax?: number;
  /** Phase 3 currency specification (e.g. USD, INR). */
  currency?: string;
  /** Phase 3 structured requirement: context of use (e.g. "travel", "long flights"). */
  intendedUse?: string;
  /** Phase 3 structured requirement: mandatory features. */
  requiredFeatures?: string[];
  /** Phase 3 structured requirement: nice-to-have features. */
  preferredFeatures?: string[];
  /** Phase 3 structured requirement: features or form factors to avoid. */
  excludedFeatures?: string[];
  /** Brand preferences (may be empty). */
  brands: string[];
  /** Hard requirements as attribute label → expected value. */
  requiredSpecs: Record<string, string>;
  /** What the user said matters most, e.g. "battery life", "comfort". */
  priorities: string[];
  /** Phase 3 structured requirement: non-feature constraints (e.g. "under ₹10,000"). */
  constraints?: string[];
  /** Open questions the assistant still needs answered. */
  clarifications: string[];
}

const boundedString = (max: number) => z.string().trim().min(1).max(max);

export const IntentSchema = z.object({
  category: boundedString(INTENT_LIMITS.maxStringLength).optional(),
  productCategory: boundedString(INTENT_LIMITS.maxStringLength).optional(),
  query: boundedString(INTENT_LIMITS.maxQueryLength).optional(),
  budget: z
    .object({
      amount: z.number().positive().max(10_000_000),
      currency: z.string().trim().length(3).toUpperCase(),
    })
    .nullish(),
  budgetMin: z.number().nonnegative().max(10_000_000).optional(),
  budgetMax: z.number().positive().max(10_000_000).optional(),
  currency: z.string().trim().min(1).max(10).toUpperCase().optional(),
  intendedUse: boundedString(INTENT_LIMITS.maxStringLength).optional(),
  requiredFeatures: z.array(boundedString(80)).max(10).default([]),
  preferredFeatures: z.array(boundedString(80)).max(10).default([]),
  excludedFeatures: z.array(boundedString(80)).max(10).default([]),
  brands: z.array(boundedString(60)).max(INTENT_LIMITS.maxBrands).default([]),
  requiredSpecs: z
    .record(z.string().trim().min(1).max(60), z.string().trim().min(1).max(120))
    .refine(
      (specs) => Object.keys(specs).length <= INTENT_LIMITS.maxRequiredSpecs,
      "too many required specs",
    )
    .default({}),
  priorities: z
    .array(boundedString(60))
    .max(INTENT_LIMITS.maxPriorities)
    .default([]),
  constraints: z.array(boundedString(120)).max(10).default([]),
  clarifications: z
    .array(boundedString(200))
    .max(INTENT_LIMITS.maxClarifications)
    .default([]),
});

/** An intent with nothing known yet. */
export function emptyIntent(): ShoppingIntent {
  return {
    brands: [],
    requiredSpecs: {},
    priorities: [],
    clarifications: [],
    requiredFeatures: [],
    preferredFeatures: [],
    excludedFeatures: [],
    constraints: [],
  };
}

function mergeUniqueStrings(
  prevList: string[] | undefined,
  nextList: string[] | undefined,
  max: number,
): string[] {
  const base = prevList ?? [];
  if (!nextList || nextList.length === 0) return base;
  const seen = new Set(base.map((item) => item.toLowerCase().trim()));
  const result = [...base];
  for (const item of nextList) {
    const trimmed = item.trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase());
      result.push(trimmed);
    }
  }
  return result.slice(0, max);
}

/**
 * Overlays a new partial intent onto the previous one. Non-empty new values
 * update the intent without silently dropping earlier constraints.
 * List fields accumulate uniquely up to their bounds.
 */
export function mergeIntent(
  prev: ShoppingIntent,
  next: Partial<ShoppingIntent>,
): ShoppingIntent {
  const merged: ShoppingIntent = {
    ...prev,
    brands: [...prev.brands],
    requiredSpecs: { ...prev.requiredSpecs },
    priorities: [...prev.priorities],
    clarifications: [...prev.clarifications],
    requiredFeatures: [...(prev.requiredFeatures ?? [])],
    preferredFeatures: [...(prev.preferredFeatures ?? [])],
    excludedFeatures: [...(prev.excludedFeatures ?? [])],
    constraints: [...(prev.constraints ?? [])],
  };

  const cat = next.productCategory?.trim() || next.category?.trim();
  if (cat) {
    merged.category = cat;
    merged.productCategory = cat;
  }

  if (next.query && next.query.trim()) merged.query = next.query.trim();

  if (next.currency && next.currency.trim()) {
    merged.currency = next.currency.trim().toUpperCase();
  }

  if (next.budgetMin !== undefined) merged.budgetMin = next.budgetMin;
  if (next.budgetMax !== undefined) {
    merged.budgetMax = next.budgetMax;
    merged.budget = {
      amount: next.budgetMax,
      currency: merged.currency || prev.budget?.currency || "USD",
    };
  }

  if (next.budget !== undefined) {
    merged.budget = next.budget;
    if (next.budget) {
      merged.budgetMax = next.budget.amount;
      merged.currency = next.budget.currency;
    }
  }

  if (next.intendedUse && next.intendedUse.trim()) {
    merged.intendedUse = next.intendedUse.trim();
  }

  merged.requiredFeatures = mergeUniqueStrings(
    merged.requiredFeatures,
    next.requiredFeatures,
    10,
  );
  merged.preferredFeatures = mergeUniqueStrings(
    merged.preferredFeatures,
    next.preferredFeatures,
    10,
  );
  merged.excludedFeatures = mergeUniqueStrings(
    merged.excludedFeatures,
    next.excludedFeatures,
    10,
  );
  merged.constraints = mergeUniqueStrings(
    merged.constraints,
    next.constraints,
    10,
  );
  merged.brands = mergeUniqueStrings(
    merged.brands,
    next.brands,
    INTENT_LIMITS.maxBrands,
  );

  if (next.requiredSpecs && Object.keys(next.requiredSpecs).length > 0) {
    merged.requiredSpecs = {
      ...merged.requiredSpecs,
      ...next.requiredSpecs,
    };
  }

  merged.priorities = mergeUniqueStrings(
    merged.priorities,
    next.priorities,
    INTENT_LIMITS.maxPriorities,
  );

  if (next.clarifications && next.clarifications.length > 0) {
    const seen = new Set(merged.clarifications.map((c) => c.toLowerCase()));
    for (const clarification of next.clarifications) {
      const key = clarification.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.clarifications.push(clarification);
      }
    }
    merged.clarifications = merged.clarifications.slice(
      0,
      INTENT_LIMITS.maxClarifications,
    );
  }

  return merged;
}
