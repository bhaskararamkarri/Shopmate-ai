/**
 * ShopMate AI — Shared Type Definitions
 *
 * These types will be fleshed out during Phases 3–5 (catalog, AI, PayPal).
 * For Phase 1 they exist to define the contracts between modules.
 */

/** A verified product record from the catalog (never fabricated). */
export interface Product {
  /** Unique product identifier from the catalog source. */
  id: string;
  name: string;
  description: string;
  /** Price in minor... in decimal currency units (e.g., 249.99 USD). */
  price: number;
  currency: string;
  availability: 'in_stock' | 'out_of_stock' | 'limited';
  images: string[];
  ratings: number;
  reviews: number;
  category: string;
  brand: string;
  specs: Record<string, string>;
  sku?: string;
  /** True when this record comes from the local demo catalog, not the live API. */
  demo?: boolean;
  /** Drawn iconography for demo records; real records rely on `images`. */
  visual?: ProductVisual;
  /** Comparable attributes powering advantage/trade-off notes. */
  attributes?: ProductAttribute[];
}

/** Visual key for the code-drawn product tiles used across the demo UI. */
export type ProductGlyph =
  | 'headphones'
  | 'earbuds'
  | 'speaker'
  | 'keyboard'
  | 'mouse'
  | 'lamp'
  | 'watch'
  | 'sleep-ring'
  | 'camera'
  | 'action-cam';

/** Washed-out pastel surface tints for demo product tiles. */
export type ProductTint = 'blue' | 'red' | 'green' | 'amber';

/** Drawn tile appearance for demo products (inverted to real imagery once the live catalog lands). */
export interface ProductVisual {
  glyph: ProductGlyph;
  tint: ProductTint;
}

/** A comparable product attribute, with the direction that counts as better when known. */
export interface ProductAttribute {
  label: string;
  value: string;
  /** 'higher' or 'lower' — the direction that reads as an advantage. Optional. */
  better?: 'higher' | 'lower';
}

/** An item placed in the user's cart. */
export interface CartItem {
  product: Product;
  quantity: number;
}

/** A placed PayPal order (server-verified). */
export interface Order {
  id: string;
  items: CartItem[];
  /** Server-calculated total. Never computed client-side. */
  total: number;
  currency: string;
  status: 'created' | 'approved' | 'captured' | 'failed';
  createdAt: string;
}

/** A single message in the AI shopping conversation. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  /** Products referenced by the assistant (must come from verified catalog). */
  productRefs?: string[];
}