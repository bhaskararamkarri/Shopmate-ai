/**
 * ShopMate AI — demo catalog provider.
 *
 * The isolated, always-mock fallback catalog. Every record it returns comes
 * from `demo-catalog.ts` and is stamped `source: "demo"` / `demo: true`, so
 * the UI can label it "DEMO DATA" and never pass it off as a live listing.
 *
 * Search uses the deterministic keyword scorer that previously lived in
 * `mock-assistant.ts` (tokenize → weighted field matches → price cap).
 */
import { DEMO_PRODUCTS, getDemoProduct } from "@/lib/demo-catalog";
import type { Product } from "@/types";
import type { CatalogProvider } from "./types";

const PRICE_CAP =
  /(?:under|below|less than|max(?:imum)?(?: of)?)\s*\$?\s*([\d,]+(?:\.\d+)?)/i;

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
  const attributes = (product.attributes ?? [])
    .map((a) => `${a.label} ${a.value}`)
    .join(" ")
    .toLowerCase();

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

/**
 * Keyword search over the demo catalog ("wireless headphones under 250").
 * Returns at most `limit` ranked matches; an empty query matches nothing.
 */
export function searchDemoProducts(query: string, limit: number): Product[] {
  const cappedLimit = Math.max(1, Math.min(Math.round(limit), DEMO_PRODUCTS.length));
  const trimmed = query.trim();
  if (!trimmed) return [];

  const capMatch = PRICE_CAP.exec(trimmed);
  const priceCap = capMatch ? Number(capMatch[1].replace(/,/g, "")) : undefined;

  const tokens = tokenize(trimmed);
  const ranked: Array<{ product: Product; score: number }> = [];
  for (const product of DEMO_PRODUCTS) {
    const score = scoreProduct(product, tokens);
    if (score > 0) ranked.push({ product, score });
  }
  ranked.sort((a, b) => b.score - a.score);

  let matched = ranked.map((r) => r.product);
  if (priceCap !== undefined) {
    // Only apply the budget when it keeps a sensible set of results; a single
    // record surviving a keyword sweep is still worth showing minus nothing.
    const inBudget = matched.filter((p) => p.price <= priceCap);
    if (inBudget.length >= 1) matched = inBudget;
  }
  return matched.slice(0, cappedLimit);
}

/** The local demo catalog provider (safe to import anywhere, fully mock). */
export const demoProvider: CatalogProvider = {
  source: "demo",
  async search(query, options) {
    return searchDemoProducts(query, options.limit);
  },
  async getProduct(id) {
    return getDemoProduct(id) ?? null;
  },
};
