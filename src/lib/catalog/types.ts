/**
 * ShopMate AI — provider-independent catalog contracts (Phase 3).
 *
 * A "catalog provider" turns a natural-language query (or a product id) into
 * verified `Product` records. Two providers exist:
 *
 * - `channel3` — the live Channel3 Product API (server-side only).
 * - `demo`     — the isolated local demo catalog (mock, always labeled).
 *
 * Responses never merge the two: when the live provider fails, the outcome is
 * explicitly marked with a fallback reason so the UI can label demo data as
 * demo data instead of silently substituting it for live prices.
 */
import type { Product } from "@/types";

/** Explicit product source identifiers (mirrors `ProductSource`). */
export type CatalogSource = "channel3" | "demo";

/**
 * Why a catalog response degraded to (or stayed on) demo data.
 * Surfaced to the UI so the degradation is always visible, never silent.
 */
export type CatalogFallbackReason =
  /** No CHANNEL3_API_KEY configured — the app runs in demo mode by design. */
  | "not_configured"
  /** The API key was rejected (401). */
  | "auth_failed"
  /** The account ran out of free/paid credits (402). */
  | "out_of_credits"
  /** Provider rate limit hit (429). */
  | "rate_limited"
  /** The provider call exceeded the configured timeout. */
  | "timeout"
  /** Any other provider-side failure (4xx/5xx/network/parse). */
  | "provider_error";

/** Typed error raised by catalog providers; carries a stable machine reason. */
export class CatalogError extends Error {
  readonly reason: CatalogFallbackReason;
  /** HTTP status from the provider, when the error came from a response. */
  readonly status?: number;

  constructor(reason: CatalogFallbackReason, message: string, status?: number) {
    super(message);
    this.name = "CatalogError";
    this.reason = reason;
    this.status = status;
  }
}

export interface CatalogSearchOptions {
  /** Max results, already validated and clamped by the caller (1–30). */
  limit: number;
  /**
   * Stable pseudonymous user id forwarded to Channel3 as `x-user-id` so buy
   * links attribute clicks/sales. Omit when attribution is not wanted.
   */
  userId?: string;
}

/** The result of a catalog search, with explicit provenance. */
export interface CatalogSearchOutcome {
  source: CatalogSource;
  products: Product[];
  /** Set only when live results were replaced by (labeled) demo results. */
  fallback?: { reason: CatalogFallbackReason };
}

/** A pluggable product catalog. Implementations are server-side only. */
export interface CatalogProvider {
  readonly source: CatalogSource;
  search(query: string, options: CatalogSearchOptions): Promise<Product[]>;
  /** Resolves to null when the product does not exist. */
  getProduct(id: string): Promise<Product | null>;
}
