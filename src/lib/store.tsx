"use client";

/**
 * ShopMate AI — shared cart & comparison state.
 *
 * A deliberately small external store (no state-management library) backed by
 * `useSyncExternalStore`: the cart is a list of {productId, quantity} resolved
 * against the demo catalog, and the comparison is an ordered list of product
 * ids. Both persist to localStorage so the badge and contents survive
 * navigation and refresh.
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

const CART_STORAGE_KEY = "shopmate.cart.v2";
const COMPARE_STORAGE_KEY = "shopmate.compare.v2";

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

function readCartFromStorage(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is { id: string; quantity: number } =>
          Boolean(
            entry &&
              typeof entry === "object" &&
              typeof (entry as { id?: unknown }).id === "string" &&
              typeof (entry as { quantity?: unknown }).quantity === "number" &&
              DEMO_PRODUCT_MAP.has((entry as { id: string }).id) &&
              (entry as { quantity: number }).quantity > 0,
          ),
      )
      .map((entry) => ({
        id: entry.id,
        quantity: Math.min(Math.round(entry.quantity), MAX_QUANTITY),
      }));
  } catch {
    return [];
  }
}

function readCompareFromStorage(): string[] {
  try {
    const raw = window.localStorage.getItem(COMPARE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is string =>
          typeof entry === "string" && DEMO_PRODUCT_MAP.has(entry),
      )
      .slice(0, MAX_COMPARE_ITEMS);
  } catch {
    return [];
  }
}

function persist(snapshot: ShopSnapshot, hydrated: boolean) {
  if (!hydrated) return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(snapshot.cart));
    window.localStorage.setItem(
      COMPARE_STORAGE_KEY,
      JSON.stringify(snapshot.compare),
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
      if (!DEMO_PRODUCT_MAP.has(productId)) return;
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
      if (!DEMO_PRODUCT_MAP.has(productId)) return;
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
  /** Cart lines resolved to demo products (order preserved). */
  cartItems: CartItem[];
  cartCount: number;
  cartSubtotal: number;
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
        const product = DEMO_PRODUCT_MAP.get(line.id);
        return product ? { product, quantity: line.quantity } : null;
      })
      .filter((item): item is CartItem => item !== null);

    const compareProducts: Product[] = snapshot.compare
      .map((id) => DEMO_PRODUCT_MAP.get(id))
      .filter((product): product is Product => product !== undefined);

    return {
      cartLines: snapshot.cart,
      cartItems,
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
