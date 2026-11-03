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