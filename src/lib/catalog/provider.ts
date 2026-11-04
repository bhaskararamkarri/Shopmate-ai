/**
 * ShopMate AI — catalog orchestration (server-side only).
 *
 * Chooses between the live Channel3 provider and the isolated demo provider,
 * applies short-lived caching that respects Channel3's caching guidance, and
 * guarantees that degraded responses stay explicitly labeled:
 *
 * - No API key configured   → demo results, fallback reason `not_configured`.
 * - Live provider failure   → demo results, fallback reason of the failure.
 * - Live provider healthy   → live results, no fallback, no demo mixing.
 *
 * Demo data is therefore never silently substituted for live prices — the
 * outcome says so, and the UI renders a visible DEMO DATA state.
 *
 * Caching policy (per Channel3's "Caching Best Practices" guide):
 * - Search responses: cached for a few minutes (presentational TTL), keyed
 *   per user id because offer buy URLs carry per-user attribution.
 * - Product detail: the endpoint is free and authoritative for prices,
 *   availability and offer URLs, so it is always fetched fresh — never cached.
 */
import type { CatalogSearchOptions, CatalogSearchOutcome } from "./types";
import type { Product } from "@/types";
import { channel3Provider } from "./normalize";
import { demoProvider } from "./demo";
import { isChannel3Configured } from "./channel3";

export { CHANNEL3_MAX_LIMIT } from "./channel3";
export type {
  CatalogFallbackReason,
  CatalogProvider,
  CatalogSearchOutcome,
  CatalogSource,
} from "./types";

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1_000;
const SEARCH_CACHE_MAX_ENTRIES = 200;

interface CacheEntry {
  expiresAt: number;
  products: CatalogSearchOutcome["products"];
  source: CatalogSearchOutcome["source"];
}

/** Tiny bounded in-memory TTL cache (per server instance, dev-friendly). */
class SearchCache {
  private entries = new Map<string, CacheEntry>();

  get(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh LRU-ish ordering so the map cannot grow stale-heavy.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  set(key: string, value: CacheEntry): void {
    if (this.entries.size >= SEARCH_CACHE_MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, value);
  }
}

const searchCache = new SearchCache();

function cacheKey(query: string, options: CatalogSearchOptions): string {
  return JSON.stringify([query, options.limit, options.userId ?? ""]);
}

/** True for ids that belong to the local demo catalog by construction. */
export function isDemoProductId(id: string): boolean {
  return id.startsWith("demo-");
}

/**
 * Runs a product search with explicit provenance and visible degradation.
 * Never throws for provider failures — failures degrade to labeled demo data.
 */
export async function searchCatalog(
  query: string,
  options: CatalogSearchOptions,
): Promise<CatalogSearchOutcome> {
  if (!isChannel3Configured()) {
    const products = await demoProvider.search(query, options);
    return { source: "demo", products, fallback: { reason: "not_configured" } };
  }

  const cached = searchCache.get(cacheKey(query, options));
  if (cached) {
    return { source: cached.source, products: cached.products };
  }

  try {
    const products = await channel3Provider.search(query, options);
    const outcome: CatalogSearchOutcome = { source: "channel3", products };
    searchCache.set(cacheKey(query, options), {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      source: outcome.source,
      products,
    });
    return outcome;
  } catch (error) {
    // Live failure → labeled demo fallback. The reason travels to the UI.
    const reason =
      typeof error === "object" && error !== null && "reason" in error
        ? String((error as { reason?: unknown }).reason)
        : undefined;
    const products = await demoProvider.search(query, options);
    return {
      source: "demo",
      products,
      fallback: {
        reason: (isReason(reason) ? reason : "provider_error") as CatalogFallbackReasonValue,
      },
    };
  }
}

const fallbackReasons = {
  not_configured: true,
  auth_failed: true,
  out_of_credits: true,
  rate_limited: true,
  timeout: true,
  provider_error: true,
} as const;

type CatalogFallbackReasonValue = keyof typeof fallbackReasons;

function isReason(value: unknown): value is CatalogFallbackReasonValue {
  return typeof value === "string" && value in fallbackReasons;
}

/**
 * Resolves one product by id.
 *
 * - demo ids (and demo-only mode) resolve from the static demo catalog.
 * - live ids hit the free, fresh Channel3 detail endpoint. Failures here
 *   propagate as `CatalogError` — a live id is never answered with a demo
 *   record pretending to be it.
 */
export async function getCatalogProduct(
  id: string,
): Promise<{ product: Product; source: CatalogSearchOutcome["source"] } | null> {
  if (!isChannel3Configured() || isDemoProductId(id)) {
    const product = await demoProvider.getProduct(id);
    return product ? { product, source: "demo" } : null;
  }

  const product = await channel3Provider.getProduct(id);
  return product ? { product, source: "channel3" } : null;
}

/** The provider serving live traffic right now. */
export function activeCatalogSource(): "channel3" | "demo" {
  return isChannel3Configured() ? "channel3" : "demo";
}
