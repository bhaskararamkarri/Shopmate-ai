/**
 * ShopMate AI — product catalog API client (browser side).
 *
 * Typed fetch wrapper for the shop's own product API:
 *   GET /api/products/search?q=...&limit=...
 *   GET /api/products/[id]
 *
 * The browser never sees a Channel3 key; it only talks to this same-origin
 * API. `source` (channel3 | demo) and `fallback` travel with every response
 * so the UI can label demo data honestly.
 */
import type { Product } from "@/types";

export type CatalogSource = "channel3" | "demo";

export interface ProductSearchResult {
  success: true;
  source: CatalogSource;
  products: Product[];
  count: number;
  /** Present when live results degraded to labeled demo results. */
  fallback?: { reason: string };
}

export type ProductSearchFailure = {
  success: false;
  error: "invalid_query" | "internal_error";
  message?: string;
};

export type ProductSearchResponse = ProductSearchResult | ProductSearchFailure;

export type ProductDetailResponse =
  | { success: true; source: CatalogSource; product: Product }
  | {
      success: false;
      error: "invalid_id" | "not_found" | "timeout" | "provider_error" | "internal_error";
      reason?: string;
    };

export interface SearchProductsArgs {
  /** Non-empty natural-language query. */
  query: string;
  /** Clamp 1–30; the server re-validates regardless. */
  limit?: number;
  /** Propagated with a client-side AbortController. */
  signal?: AbortSignal;
}

/** Thrown on transport failure (network), abort, or a non-JSON reply. */
export class CatalogApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "CatalogApiError";
    this.status = status;
  }
}

const API_TIMEOUT_MS = 15_000;

function withTimeout(signal?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  // Compose an explicit caller abort with a bounded fetch timeout.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CatalogApiError("Malformed response from the product API", response.status);
  }
}

/** Triggers a product search. A payload error object is returned, not thrown. */
export async function searchProducts({
  query,
  limit = 12,
  signal,
}: SearchProductsArgs): Promise<ProductSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const { signal: composite, cancel } = withTimeout(signal);
  try {
    const response = await fetch(`/api/products/search?${params.toString()}`, {
      headers: { accept: "application/json" },
      signal: composite,
    });
    const payload = (await parseJson(response)) as ProductSearchResponse;
    if (!response.ok) return payload;
    return payload;
  } catch (error) {
    if (signal?.aborted) throw new CatalogApiError("Search cancelled");
    if (error instanceof CatalogApiError) throw error;
    throw new CatalogApiError("Could not reach the product search service");
  } finally {
    cancel();
  }
}

/** Resolves one product by id, or null when it does not exist (404). */
export async function fetchProduct(
  id: string,
  signal?: AbortSignal,
): Promise<Product | null> {
  const { signal: composite, cancel } = withTimeout(signal);
  try {
    const response = await fetch(`/api/products/${encodeURIComponent(id)}`, {
      headers: { accept: "application/json" },
      signal: composite,
    });
    const payload = (await parseJson(response)) as ProductDetailResponse;
    if (!payload.success) {
      if (payload.error === "not_found") return null;
      throw new CatalogApiError(
        payload.error === "timeout"
          ? "The product lookup timed out"
          : "The product lookup failed",
      );
    }
    return payload.product;
  } catch (error) {
    if (signal?.aborted) throw new CatalogApiError("Lookup cancelled");
    if (error instanceof CatalogApiError) throw error;
    throw new CatalogApiError("Could not reach the product service");
  } finally {
    cancel();
  }
}
