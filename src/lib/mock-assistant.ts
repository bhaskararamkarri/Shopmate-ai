/**
 * ShopMate AI — Mock assistant responses (Phase 2 frontend only).
 *
 * No AI model is connected. This module deterministically matches a query to
 * the demo catalog so the chat acts out the Phase 3 experience. Nothing in
 * here claims to be live data: every reply keeps the demo framing.
 */
import { DEMO_CATEGORIES, DEMO_PRODUCTS } from "@/lib/demo-catalog";
import type { Product } from "@/types";

export interface AssistantReply {
  content: string;
  /** Demo product ids attached to the reply. */
  productRefs: string[];
}

const PRICE_CAP = /(?:under|below|less than|max(?:imum)?(?: of)?)\s*\$?\s*([\d,]+(?:\.\d+)?)/i;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "than", "under", "below",
  "less", "need", "want", "have", "will", "would", "should", "must", "must-have",
  "best", "good", "nice", "something", "anything", "whose", "which", "from",
  "into", "onto", "over", "about", "after", "before", "between",
]);

function tokenize(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 3 &&
        !STOP_WORDS.has(w) &&
        !/^[\d,]+$/.test(w),
    );
  return Array.from(new Set(words));
}

function scoreProduct(product: Product, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const name = product.name.toLowerCase();
  const brand = product.brand.toLowerCase();
  const category = product.category.toLowerCase();
  const description = product.description.toLowerCase();
  const specs = Object.values(product.specs).join(" ").toLowerCase();
  const attributes = (product.attributes ?? []).map((a) => `${a.label} ${a.value}`).join(" ").toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (name.includes(token)) score += 6;
    if (brand.includes(token)) score += 3;
    if (category.includes(token)) score += 3;
    if (description.includes(token)) score += 2;
    if (specs.includes(token)) score += 1;
    if (attributes.includes(token)) score += 1;
  }
  return score;
}

export function buildAssistantReply(userQuery: string): AssistantReply {
  const query = userQuery.trim();
  if (!query) {
    return {
      content:
        "That came through empty. Try describing what you are shopping for in plain language and I will line up the demo catalog for you.",
      productRefs: [],
    };
  }

  const capMatch = PRICE_CAP.exec(query);
  const priceCap = capMatch ? Number(capMatch[1].replace(/,/g, "")) : undefined;

  const tokens = tokenize(query);
  const ranked: Array<{ product: Product; score: number }> = [];
  for (const product of DEMO_PRODUCTS) {
    const score = scoreProduct(product, tokens);
    if (score > 0) ranked.push({ product, score });
  }
  ranked.sort((a, b) => b.score - a.score);

  let matched = ranked.map((r) => r.product);
  if (priceCap !== undefined) {
    const inBudget = matched.filter((p) => p.price <= priceCap);
    // Only apply the budget when it keeps a sensible set of results; a single
    // record surviving a keyword sweep is still worth showing minus nothing.
    if (inBudget.length >= 1) matched = inBudget;
  }
  matched = matched.slice(0, 3);

  if (matched.length === 0) {
    const shelves = DEMO_CATEGORIES.map((c) => c.name.toLowerCase()).join(", ");
    return {
      content: [
        "I searched the demo catalog and nothing there is a confident match for that.",
        "This preview only carries one small mock catalog. Once the live product feed lands in a later phase, results like this come back with real listings instead. For now the shelves on hand cover " +
          shelves +
          " — try one of those, or ask from one of the suggestion prompts.",
      ].join(" "),
      productRefs: [],
    };
  }

  const middle =
    matched.length === 1
      ? "Here is the closest demo listing"
      : "Here are the closest demo listings, ranked by how well they cover what you described";
  const outro =
    "Everything above is mock demo data, not live listings. Add two or more picks to your comparison and the trade-offs show up side by side.";

  return {
    content: [middle + ":", outro].join(" "),
    productRefs: matched.map((p) => p.id),
  };
}
