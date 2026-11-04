"use client";

/**
 * ShopMate AI — shared cart & comparison state.
 *
 * A deliberately small external store (no state-management library) backed by
 * `useSyncExternalStore`: the cart is a list of {productId, quantity} resolved
 * against the product catalog, and the comparison is an ordered list of product
 * ids. Both persist to localStorage so the badge and contents survive
 * navigation and refresh.
 *
 * Record resolution: demo products come from the static demo catalog; live
 * Channel3 records arrive inside API responses and are registered in a
 * module-level cache (`registerProducts`). Live lines also persist their
 * product snapshot in storage so a cart/compare survives a reload without a
 * refetch — the snapshot is a display-only cache, never an inventory truth.
 *
 * Storage is hydrated after mount (a no-op on the server snapshot), which
 * keeps the prerendered HTML stable and avoids hydration mismatches.
 *
 * Subtotals here are display values only. In later phases, final totals are
 * recalculated and validated server-side before any payment.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { CartItem, Product } from "@/types";
import { DEMO_PRODUCT_MAP } from "@/lib/demo-catalog";

const CART_STORAGE_KEY = "shopmate.cart.v3";
const COMPARE_STORAGE_KEY = "shopmate.compare.v3";

/** Side-by-side space is capped so the comparison table stays readable. */
export const MAX_COMPARE_ITEMS = 4;
const MAX_QUANTITY = 99;

interface CartLine {
  id: string;
  quantity: number;
}

interface ShopSnapshot {
  cart: CartLine[];
  compare: string[];
}

const EMPTY_SNAPSHOT: ShopSnapshot = { cart: [], compare: [] };

/**
 * Client-side cache of live product records seen from catalog API responses.
 * Demo products never live here — they resolve statically from the catalog.
 */
const liveProducts = new Map<string, Product>();

/**
 * Registers products (typically from a search/lookup response) so cart and
 * comparison actions can resolve live ids. Cheap and idempotent.
 */
export function registerProducts(products: readonly Product[]): void {
  for (const product of products) {
    if (product?.id && product.source === "channel3") {
      liveProducts.set(product.id, product);
    }
  }
}

function resolveProduct(id: string): Product | undefined {
  return DEMO_PRODUCT_MAP.get(id) ?? liveProducts.get(id);
}

/** Minimal shape check for a persisted live product snapshot. */
function isPlausibleProduct(value: unknown): value is Product {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { id?: unknown; name?: unknown; price?: unknown; currency?: unknown };
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.price === "number" &&
    Number.isFinite(candidate.price) &&
    candidate.price >= 0 &&
    typeof candidate.currency === "string"
  );
}

interface StoredCartLine {
  id: string;
  quantity: number;
  product?: Product;
}

function readCartFromStorage(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[])
      .filter((entry): entry is StoredCartLine => {
        if (!entry || typeof entry !== "object") return false;
        const candidate = entry as { id?: unknown; quantity?: unknown };
        return (
          typeof candidate.id === "string" &&
          typeof candidate.quantity === "number" &&
          candidate.quantity > 0
        );
      })
      .filter((entry) => {
        const persisted = entry.product;
        // Live lines persist their snapshot; accept only plausible ones.
        if (persisted !== undefined) {
          if (!isPlausibleProduct(persisted) || persisted.id !== entry.id) {
            return false;
          }
          liveProducts.set(persisted.id, persisted);
        }
        return resolveProduct(entry.id) !== undefined;
      })
      .map((entry) => ({
        id: entry.id,
        quantity: Math.min(Math.round(entry.quantity), MAX_QUANTITY),
      }));
  } catch {
    return [];
  }
}

interface StoredCompare {
  ids: string[];
  products: Product[];
}

function readCompareFromStorage(): string[] {
  try {
    const raw = window.localStorage.getItem(COMPARE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Legacy v2 shape: a bare array of demo ids.
    if (parsed.every((entry) => typeof entry === "string")) {
      return parsed
        .filter(
          (entry): entry is string =>
            typeof entry === "string" && resolveProduct(entry) !== undefined,
        )
        .slice(0, MAX_COMPARE_ITEMS);
    }
    // v3 shape: ids plus snapshots for live records.
    const stored = parsed.find(
      (entry): entry is StoredCompare =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            Array.isArray((entry as { ids?: unknown }).ids),
        ),
    );
    if (!stored) return [];
    for (const product of stored.products ?? []) {
      if (isPlausibleProduct(product)) liveProducts.set(product.id, product);
    }
    return stored.ids
      .filter(
        (id): id is string =>
          typeof id === "string" && resolveProduct(id) !== undefined,
      )
      .slice(0, MAX_COMPARE_ITEMS);
  } catch {
    return [];
  }
}

function persist(snapshot: ShopSnapshot, hydrated: boolean) {
  if (!hydrated) return;
  try {
    // Live lines persist a display-only product snapshot; demo lines are
    // resolved statically on load.
    const cartToStore = snapshot.cart.map(
      (line): { id: string; quantity: number; product?: Product } => {
        const product = resolveProduct(line.id);
        return product && product.source === "channel3"
          ? { id: line.id, quantity: line.quantity, product }
          : { id: line.id, quantity: line.quantity };
      },
    );
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartToStore));
    const compareToStore: StoredCompare = {
      ids: snapshot.compare,
      products: snapshot.compare
        .map(resolveProduct)
        .filter((product): product is Product =>
          Boolean(product && product.source === "channel3"),
        ),
    };
    window.localStorage.setItem(
      COMPARE_STORAGE_KEY,
      JSON.stringify(compareToStore),
    );
  } catch {
    // Storage can be full or blocked; the UI keeps working in memory.
  }
}

/** Module-scope external store: stable actions, hydrate-once semantics. */
function createShopStore() {
  let snapshot = EMPTY_SNAPSHOT;
  let hydrated = false;
  const listeners = new Set<() => void>();

  function commit(updater: (previous: ShopSnapshot) => ShopSnapshot) {
    const previous = snapshot;
    snapshot = updater(previous);
    persist(snapshot, hydrated);
    listeners.forEach((listener) => listener());
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot(): ShopSnapshot {
      return snapshot;
    },
    getServerSnapshot(): ShopSnapshot {
      return EMPTY_SNAPSHOT;
    },
    hydrate(): void {
      if (hydrated) return;
      hydrated = true;
      const cart = readCartFromStorage();
      const compare = readCompareFromStorage();
      if (cart.length > 0 || compare.length > 0) {
        snapshot = { cart, compare };
        listeners.forEach((listener) => listener());
      }
    },
    addToCart(productId: string): void {
      if (!resolveProduct(productId)) return;
      commit((previous) => {
        const existing = previous.cart.find((line) => line.id === productId);
        const cart = existing
          ? previous.cart.map((line) =>
              line.id === productId
                ? {
                    ...line,
                    quantity: Math.min(line.quantity + 1, MAX_QUANTITY),
                  }
                : line,
            )
          : [...previous.cart, { id: productId, quantity: 1 }];
        return { ...previous, cart };
      });
    },
    removeFromCart(productId: string): void {
      commit((previous) => ({
        ...previous,
        cart: previous.cart.filter((line) => line.id !== productId),
      }));
    },
    setQuantity(productId: string, quantity: number): void {
      commit((previous) => {
        if (!Number.isFinite(quantity) || quantity < 1) {
          // Quantity zeroing from the stepper removes the line.
          return {
            ...previous,
            cart: previous.cart.filter((line) => line.id !== productId),
          };
        }
        return {
          ...previous,
          cart: previous.cart.map((line) =>
            line.id === productId
              ? {
                  ...line,
                  quantity: Math.min(Math.round(quantity), MAX_QUANTITY),
                }
              : line,
          ),
        };
      });
    },
    clearCart(): void {
      commit((previous) => ({ ...previous, cart: [] }));
    },
    toggleCompare(productId: string): void {
      if (!resolveProduct(productId)) return;
      commit((previous) => {
        if (previous.compare.includes(productId)) {
          return {
            ...previous,
            compare: previous.compare.filter((id) => id !== productId),
          };
        }
        if (previous.compare.length >= MAX_COMPARE_ITEMS) return previous;
        return { ...previous, compare: [...previous.compare, productId] };
      });
    },
    clearCompare(): void {
      commit((previous) => ({ ...previous, compare: [] }));
    },
  };
}

const shopStore = createShopStore();

interface ShopContextValue {
  cartLines: CartLine[];
  /** Cart lines resolved to product records (order preserved). */
  cartItems: CartItem[];
  cartCount: number;
  cartSubtotal: number;
  /** True when any live (non-demo) product sits in the cart. */
  hasLiveItems: boolean;
  addToCart: (productId: string) => void;
  removeFromCart: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  isInCart: (productId: string) => boolean;
  compareIds: string[];
  compareProducts: Product[];
  toggleCompare: (productId: string) => void;
  clearCompare: () => void;
  isComparing: (productId: string) => boolean;
  /** False only when the item is unselected and the comparison is full. */
  canToggleCompare: (productId: string) => boolean;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    shopStore.subscribe,
    shopStore.getSnapshot,
    shopStore.getServerSnapshot,
  );

  // Hydration happens after mount; the store notifies subscribers below.
  useEffect(() => {
    shopStore.hydrate();
  }, []);

  const value = useMemo<ShopContextValue>(() => {
    const compareSet = new Set(snapshot.compare);

    const cartItems: CartItem[] = snapshot.cart
      .map((line) => {
        const product = resolveProduct(line.id);
        return product ? { product, quantity: line.quantity } : null;
      })
      .filter((item): item is CartItem => item !== null);

    const compareProducts: Product[] = snapshot.compare
      .map(resolveProduct)
      .filter((product): product is Product => product !== undefined);

    return {
      cartLines: snapshot.cart,
      cartItems,
      /** True when any live (non-demo) record sits in the cart. */
      hasLiveItems: cartItems.some((item) => item.product.source === "channel3"),
      cartCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      cartSubtotal: cartItems.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0,
      ),
      addToCart: shopStore.addToCart,
      removeFromCart: shopStore.removeFromCart,
      setQuantity: shopStore.setQuantity,
      clearCart: shopStore.clearCart,
      isInCart: (productId: string) =>
        snapshot.cart.some((line) => line.id === productId),
      compareIds: snapshot.compare,
      compareProducts,
      toggleCompare: shopStore.toggleCompare,
      clearCompare: shopStore.clearCompare,
      isComparing: (productId: string) => compareSet.has(productId),
      canToggleCompare: (productId: string) =>
        compareSet.has(productId) ||
        snapshot.compare.length < MAX_COMPARE_ITEMS,
    };
  }, [snapshot]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopContextValue {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error("useShop must be used within a ShopProvider");
  }
  return context;
}
