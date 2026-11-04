/**
 * ShopMate AI — Channel3 response normalization.
 *
 * Channel3 responses are untrusted external data. Everything that reaches a
 * `Product` record is re-validated here field by field; anything malformed or
 * missing is dropped or defaulted — never guessed, never fabricated:
 *
 * - Prices/currency come from the chosen real merchant offer (never invented).
 * - Ratings appear only when the API supplies them; otherwise 0/0 (UI hides).
 * - Stock state maps from the offer's availability; absent stock = 'unknown'.
 * - Specs come from real API attributes only; missing specs stay empty.
 * - External URLs must parse as http(s) before they are kept.
 *
 * The v1 wire schema mirrored below is from the official OpenAPI document
 * (https://docs.trychannel3.com — see channel3.ts for the links).
 */
import type { Product, ProductAttribute } from "@/types";
import type { CatalogSearchOptions } from "./types";
import { searchChannel3, getChannel3Product } from "./channel3";
import { isSafeHttpUrl } from "./url";

/* ------------------------------------------------------------------ */
/* Wire types (untrusted) — mirrors of the Channel3 v1 OpenAPI schema  */
/*                                                                     */
/* The full schema lives at docs.trychannel3.com (see channel3.ts).    */
/* Access is structural (`isRecord` + per-field guards) rather than    */
/* typed interfaces, so unexpected or malformed fields fail safe.      */
/* ------------------------------------------------------------------ */

/** Known-good product from the provider: normalized and attribution-stamped. */
export type { CatalogSearchOptions };

/* ------------------------------------------------------------------ */
/* Small validation helpers                                            */
/* ------------------------------------------------------------------ */

const MAX_DESCRIPTION_CHARS = 2_000;
const MAX_IMAGES = 6;
const MAX_SPECS = 14;
const MAX_ATTRIBUTES = 8;
const MAX_ID_CHARS = 128;
const MAX_TITLE_CHARS = 300;
const MAX_SPEC_VALUE_CHARS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  // Strip control characters; the value is rendered as React text (escaped),
  // but we do not want invisible control bytes in stored data either.
  const cleaned = trimmed.replace(/[\u0000-\u001f\u007f]+/g, " ");
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Non-empty supplier domain, display-safe (letters/digits/dots/hyphens). */
function asDomain(value: unknown): string | undefined {
  const domain = asString(value, 253);
  if (!domain || !/^[a-zA-Z0-9.-]+$/.test(domain)) return undefined;
  return domain.toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Offer selection                                                     */
/* ------------------------------------------------------------------ */

interface ValidatedOffer {
  url: string;
  domain: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  inStock: boolean;
}

function validateOffer(raw: unknown): ValidatedOffer | null {
  if (!isRecord(raw)) return null;
  const url = asString(raw.url, 2_048);
  const domain = asDomain(raw.domain);
  if (!url || !isSafeHttpUrl(url) || !domain) return null;

  const price = isRecord(raw.price) ? raw.price : undefined;
  const amount = price ? asFiniteNumber(price.price) : undefined;
  const currency = price ? asString(price.currency, 8) : undefined;
  if (amount === undefined || amount < 0 || !currency) return null;

  const compareAt = price ? asFiniteNumber(price.compare_at_price) : undefined;
  const availability = raw.availability === "InStock";

  return {
    url,
    domain,
    price: amount,
    compareAtPrice: compareAt !== undefined && compareAt >= 0 ? compareAt : undefined,
    currency: currency.toUpperCase(),
    inStock: availability,
  };
}

/**
 * Picks the offer to present: in-stock offers win, then the lowest price.
 * (Never chooses "the nicest looking number" — only real, ranked offers.)
 */
function chooseOffer(offers: unknown): ValidatedOffer | null {
  if (!Array.isArray(offers)) return null;
  const validated = offers
    .map(validateOffer)
    .filter((offer): offer is ValidatedOffer => offer !== null);
  if (validated.length === 0) return null;

  return validated.sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    return a.price - b.price;
  })[0];
}

/* ------------------------------------------------------------------ */
/* Piecewise normalization                                             */
/* ------------------------------------------------------------------ */

/** Main shot first, then hero shots, then everything else. */
function imagePriority(image: Record<string, unknown>): number {
  if (image.is_main_image === true) return 0;
  if (image.shot_type === "hero") return 1;
  return 2;
}

function normalizeImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const seen = new Set<string>();
  const urls: Array<{ url: string; priority: number }> = [];
  for (const raw of images.slice(0, 12)) {
    if (!isRecord(raw)) continue;
    const cleaned =
      asString(raw.cleaned_url, 2_048) ?? asString(raw.url, 2_048);
    if (!cleaned || !isSafeHttpUrl(cleaned) || seen.has(cleaned)) continue;
    seen.add(cleaned);
    urls.push({ url: cleaned, priority: imagePriority(raw) });
    if (urls.length >= MAX_IMAGES) break;
  }
  return urls
    .sort((a, b) => a.priority - b.priority)
    .map((image) => image.url);
}

function normalizeRatings(ratings: unknown): { ratings: number; reviews: number } {
  if (!isRecord(ratings)) return { ratings: 0, reviews: 0 };
  const value = asFiniteNumber(ratings.value);
  const count = asFiniteNumber(ratings.count);
  if (value === undefined || count === undefined || count <= 0) {
    return { ratings: 0, reviews: 0 };
  }
  const bounded = Math.min(Math.max(value, 0), 5);
  return { ratings: bounded, reviews: Math.round(count) };
}

function normalizeBrand(brands: unknown): string {
  if (!Array.isArray(brands)) return "";
  const first = brands.find(isRecord);
  return first ? asString(first.name, 120) ?? "" : "";
}

function normalizeStructuredAttributes(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const specs: Record<string, string> = {};
  for (const [key, values] of Object.entries(value)) {
    const label = asString(key, 60);
    if (!label || !Array.isArray(values) || specs[label] !== undefined) continue;
    const joined = values
      .slice(0, 6)
      .map((entry) => asString(entry, 80))
      .filter((entry): entry is string => Boolean(entry))
      .join(", ");
    if (joined) specs[label] = joined;
    if (Object.keys(specs).length >= MAX_SPECS) break;
  }
  return specs;
}

function normalizeStringList(values: unknown, label: string): [string, string] | null {
  if (!Array.isArray(values)) return null;
  const joined = values
    .slice(0, 6)
    .map((entry) => asString(entry, 80))
    .filter((entry): entry is string => Boolean(entry))
    .join(" · ");
  return joined ? [label, joined] : null;
}

/**
 * Builds the spec sheet from real API data only: structured attributes,
 * materials and key features. Missing data stays missing (empty specs).
 */
function normalizeSpecs(product: Record<string, unknown>): Record<string, string> {
  const specs = normalizeStructuredAttributes(product.structured_attributes);

  const extras: Array<[string, string] | null> = [
    normalizeStringList(product.materials, "Material"),
    normalizeStringList(product.key_features, "Key features"),
  ];
  for (const extra of extras) {
    if (!extra) continue;
    const [key, value] = extra;
    if (specs[key] === undefined) specs[key] = value;
    if (Object.keys(specs).length >= MAX_SPECS) break;
  }

  // Bound every value and cap the sheet so payloads stay sane.
  const bounded: Record<string, string> = {};
  for (const [key, value] of Object.entries(specs)) {
    bounded[key] = value.length > MAX_SPEC_VALUE_CHARS
      ? `${value.slice(0, MAX_SPEC_VALUE_CHARS)}…`
      : value;
    if (Object.keys(bounded).length >= MAX_SPECS) break;
  }
  return bounded;
}

function specsToAttributes(specs: Record<string, string>): ProductAttribute[] {
  return Object.entries(specs)
    .slice(0, MAX_ATTRIBUTES)
    .map(([label, value]) => ({ label, value }));
}

/* ------------------------------------------------------------------ */
/* Product normalization                                               */
/* ------------------------------------------------------------------ */

/**
 * Converts one untrusted Channel3 product object into a verified `Product`
 * record, or null when the record is unusable (no valid id/title/offer).
 */
export function normalizeChannel3Product(raw: unknown): Product | null {
  if (!isRecord(raw)) return null;

  const id = asString(raw.id, MAX_ID_CHARS);
  const title = asString(raw.title, MAX_TITLE_CHARS);
  if (!id || !title || /[\s/\\?#&=%]+/.test(id)) return null;

  const offer = chooseOffer(raw.offers);
  if (!offer) {
    // Without a priced merchant offer there is nothing honest to display.
    return null;
  }

  const description = asString(raw.description, MAX_DESCRIPTION_CHARS) ?? "";
  const specs = normalizeSpecs(raw);
  const ratingInfo = normalizeRatings(raw.ratings);
  const category = isRecord(raw.category)
    ? asString(raw.category.title, 120) ?? ""
    : "";

  return {
    id,
    name: title,
    description,
    price: offer.price,
    currency: offer.currency,
    // Stock comes from the chosen real offer only — 'limited' and 'unknown'
    // are never assumed from thin air.
    availability: offer.inStock ? "in_stock" : "out_of_stock",
    images: normalizeImages(raw.images),
    ratings: ratingInfo.ratings,
    reviews: ratingInfo.reviews,
    category,
    brand: normalizeBrand(raw.brands) || offer.domain,
    specs,
    source: "channel3",
    demo: false,
    merchant: offer.domain,
    buyUrl: offer.url,
    compareAtPrice: offer.compareAtPrice,
    attributes: specsToAttributes(specs),
  };
}

/** Normalizes a full `/v1/search` response into verified products. */
export function normalizeChannel3SearchResponse(payload: unknown): Product[] {
  if (!isRecord(payload) || !Array.isArray(payload.products)) return [];
  return payload.products
    .map(normalizeChannel3Product)
    .filter((product): product is Product => product !== null);
}

/** Normalizes a `/v1/products/{id}` response into one verified product. */
export function normalizeChannel3Detail(payload: unknown): Product | null {
  return payload === null ? null : normalizeChannel3Product(payload);
}

/* ------------------------------------------------------------------ */
/* Live provider                                                       */
/* ------------------------------------------------------------------ */

import type { CatalogProvider } from "./types";

/** The live Channel3-backed catalog provider (server-side only). */
export const channel3Provider: CatalogProvider = {
  source: "channel3",
  async search(query, options) {
    const payload = await searchChannel3(query, options);
    return normalizeChannel3SearchResponse(payload);
  },
  async getProduct(id) {
    const payload = await getChannel3Product(id);
    return normalizeChannel3Detail(payload);
  },
};
