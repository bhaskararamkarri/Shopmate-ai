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
  /** The current shopping query in the user's words. */
  query?: string;
  /** Budget ceiling when the user stated one. */
  budget?: ShoppingIntentBudget | null;
  /** Brand preferences (may be empty). */
  brands: string[];
  /** Hard requirements as attribute label → expected value. */
  requiredSpecs: Record<string, string>;
  /** What the user said matters most, e.g. "battery life". */
  priorities: string[];
  /** Open questions the assistant still needs answered. */
  clarifications: string[];
}

const boundedString = (max: number) => z.string().trim().min(1).max(max);

export const IntentSchema = z.object({
  category: boundedString(INTENT_LIMITS.maxStringLength).optional(),
  query: boundedString(INTENT_LIMITS.maxQueryLength).optional(),
  budget: z
    .object({
      amount: z.number().positive().max(10_000_000),
      currency: z.string().trim().length(3).toUpperCase(),
    })
    .nullish(),
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
  };
}

/**
 * Overlays a new partial intent onto the previous one. Non-empty new values
 * win; empty arrays/objects never erase what is already known. List fields
 * are replaced (not concatenated) except clarifications, which accumulate
 * uniquely — a question stays open until it is answered or superseded.
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
  };

  if (next.category && next.category.trim()) merged.category = next.category.trim();
  if (next.query && next.query.trim()) merged.query = next.query.trim();
  if (next.budget !== undefined) merged.budget = next.budget;

  if (next.brands && next.brands.length > 0) {
    merged.brands = next.brands.slice(0, INTENT_LIMITS.maxBrands);
  }
  if (next.requiredSpecs && Object.keys(next.requiredSpecs).length > 0) {
    merged.requiredSpecs = {
      ...merged.requiredSpecs,
      ...next.requiredSpecs,
    };
  }
  if (next.priorities && next.priorities.length > 0) {
    merged.priorities = next.priorities.slice(0, INTENT_LIMITS.maxPriorities);
  }
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
