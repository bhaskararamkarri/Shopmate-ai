"use client";

/**
 * ShopMate AI — shared cart, comparison & checkout confirmation receipt state.
 *
 * External store backed by `useSyncExternalStore`: cart & compare persist to
 * `localStorage`, while any active PayPal confirmation receipt persists to
 * `sessionStorage` (`shopmate.receipt.v1`) so browser refreshes preserve the
 * receipt and adding a new item or clicking back clears it cleanly.
 *
 * Storage hydrates after mount (never during SSR) to avoid hydration mismatches.
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
const RECEIPT_STORAGE_KEY = "shopmate.receipt.v1";

/** Side-by-side space is capped so the comparison table stays readable. */
export const MAX_COMPARE_ITEMS = 4;
const MAX_QUANTITY = 99;

interface CartLine {
  id: string;
  quantity: number;
}

export interface ReceiptItemSnapshot {
  product: Product;
  quantity: number;
}

export interface ShopReceiptSnapshot {
  orderId: string;
  captureId: string;
  amount: { currency: string; value: string };
  purchasedItems: ReceiptItemSnapshot[];
  capturedAt: string;
}

interface ShopSnapshot {
  cart: CartLine[];
  compare: string[];
  receipt: ShopReceiptSnapshot | null;
}

const EMPTY_SNAPSHOT: ShopSnapshot = { cart: [], compare: [], receipt: null };

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
    if (parsed.every((entry) => typeof entry === "string")) {
      return parsed
        .filter(
          (entry): entry is string =>
            typeof entry === "string" && resolveProduct(entry) !== undefined,
        )
        .slice(0, MAX_COMPARE_ITEMS);
    }
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

function isPlausibleReceipt(value: unknown): value is ShopReceiptSnapshot {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<ShopReceiptSnapshot>;
  if (
    typeof r.orderId !== "string" ||
    !r.orderId ||
    typeof r.captureId !== "string" ||
    !r.captureId ||
    typeof r.capturedAt !== "string" ||
    !r.amount ||
    typeof r.amount.currency !== "string" ||
    typeof r.amount.value !== "string" ||
    !Array.isArray(r.purchasedItems)
  ) {
    return false;
  }
  return r.purchasedItems.every(
    (item) =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof item.quantity === "number" &&
      Number.isFinite(item.quantity) &&
      item.quantity > 0 &&
      isPlausibleProduct(item.product),
  );
}

function readReceiptFromStorage(): ShopReceiptSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(RECEIPT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPlausibleReceipt(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persistReceipt(receipt: ShopReceiptSnapshot | null, hydrated: boolean) {
  if (!hydrated) return;
  try {
    if (receipt === null) {
      window.sessionStorage.removeItem(RECEIPT_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(receipt));
    }
  } catch {
    // Storage can be blocked; receipt still exists in memory for the view.
  }
}

function persist(snapshot: ShopSnapshot, hydrated: boolean) {
  if (!hydrated) return;
  try {
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
  persistReceipt(snapshot.receipt, hydrated);
}

/** Module-scope external store: stable actions, hydrate-once per active mount. */
function createShopStore() {
  let snapshot = EMPTY_SNAPSHOT;
  let hydrated = false;
  let dirtyFields = { cart: false, compare: false, receipt: false };
  const listeners = new Set<() => void>();

  function emit() {
    listeners.forEach((listener) => listener());
  }

  function commit(
    updater: (previous: ShopSnapshot) => ShopSnapshot,
    mutated: Partial<typeof dirtyFields>,
  ) {
    Object.assign(dirtyFields, mutated);
    snapshot = updater(snapshot);
    persist(snapshot, hydrated);
    emit();
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
      const cart = dirtyFields.cart ? snapshot.cart : readCartFromStorage();
      const compare = dirtyFields.compare ? snapshot.compare : readCompareFromStorage();
      const receipt = dirtyFields.receipt ? snapshot.receipt : readReceiptFromStorage();
      const changed =
        cart !== snapshot.cart ||
        compare !== snapshot.compare ||
        receipt !== snapshot.receipt;
      snapshot = { cart, compare, receipt };
      // Flush any pre-hydration mutations (e.g. test child effects) into storage.
      if (dirtyFields.cart || dirtyFields.compare || dirtyFields.receipt) {
        persist(snapshot, true);
      }
      if (changed) {
        emit();
      }
    },
    resetForUnmount(): void {
      hydrated = false;
      dirtyFields = { cart: false, compare: false, receipt: false };
      snapshot = EMPTY_SNAPSHOT;
    },
    addToCart(productId: string): void {
      if (!resolveProduct(productId)) return;
      commit(
        (previous) => {
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
          return { ...previous, cart, receipt: null };
        },
        { cart: true, receipt: true },
      );
    },
    removeFromCart(productId: string): void {
      commit(
        (previous) => ({
          ...previous,
          cart: previous.cart.filter((line) => line.id !== productId),
        }),
        { cart: true },
      );
    },
    setQuantity(productId: string, quantity: number): void {
      commit(
        (previous) => {
          if (!Number.isFinite(quantity) || quantity < 1) {
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
        },
        { cart: true },
      );
    },
    clearCart(): void {
      commit((previous) => ({ ...previous, cart: [] }), { cart: true });
    },
    toggleCompare(productId: string): void {
      if (!resolveProduct(productId)) return;
      commit(
        (previous) => {
          if (previous.compare.includes(productId)) {
            return {
              ...previous,
              compare: previous.compare.filter((id) => id !== productId),
            };
          }
          if (previous.compare.length >= MAX_COMPARE_ITEMS) return previous;
          return { ...previous, compare: [...previous.compare, productId] };
        },
        { compare: true },
      );
    },
    clearCompare(): void {
      commit((previous) => ({ ...previous, compare: [] }), { compare: true });
    },
    setCompare(ids: string[]): void {
      const seen = new Set<string>();
      const valid: string[] = [];
      for (const id of ids) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (resolveProduct(id) !== undefined) {
          valid.push(id);
          if (valid.length >= MAX_COMPARE_ITEMS) break;
        }
      }
      commit((previous) => ({ ...previous, compare: valid }), { compare: true });
    },
    setActiveReceipt(receipt: ShopReceiptSnapshot): void {
      commit(
        (previous) => ({ ...previous, receipt }),
        { receipt: true },
      );
    },
    clearActiveReceipt(): void {
      commit(
        (previous) => ({ ...previous, receipt: null }),
        { receipt: true },
      );
    },
  };
}

const shopStore = createShopStore();
let mountedProviders = 0;

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
  setCompare: (ids: string[]) => void;
  isComparing: (productId: string) => boolean;
  /** False only when the item is unselected and the comparison is full. */
  canToggleCompare: (productId: string) => boolean;
  /** Active captured sandbox confirmation receipt, persisted in sessionStorage. */
  activeReceipt: ShopReceiptSnapshot | null;
  setActiveReceipt: (receipt: ShopReceiptSnapshot) => void;
  clearActiveReceipt: () => void;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    shopStore.subscribe,
    shopStore.getSnapshot,
    shopStore.getServerSnapshot,
  );

  // Hydrate after mount and clean up in-memory singleton when all providers unmount.
  useEffect(() => {
    mountedProviders += 1;
    shopStore.hydrate();
    return () => {
      mountedProviders = Math.max(0, mountedProviders - 1);
      if (mountedProviders === 0) {
        shopStore.resetForUnmount();
      }
    };
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
      setCompare: shopStore.setCompare,
      isComparing: (productId: string) => compareSet.has(productId),
      canToggleCompare: (productId: string) =>
        compareSet.has(productId) ||
        snapshot.compare.length < MAX_COMPARE_ITEMS,
      activeReceipt: snapshot.receipt,
      setActiveReceipt: shopStore.setActiveReceipt,
      clearActiveReceipt: shopStore.clearActiveReceipt,
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

export function useCart() {
  const shop = useShop();
  return {
    addToCart: shop.addToCart,
    removeFromCart: shop.removeFromCart,
    setQuantity: shop.setQuantity,
    clearCart: shop.clearCart,
    isInCart: shop.isInCart,
    cartLines: shop.cartLines,
    cartItems: shop.cartItems,
    cartCount: shop.cartCount,
    cartSubtotal: shop.cartSubtotal,
    hasLiveItems: shop.hasLiveItems,
  };
}

export function useCompare() {
  const shop = useShop();
  return {
    compareIds: shop.compareIds,
    compareProducts: shop.compareProducts,
    toggleCompare: shop.toggleCompare,
    clearCompare: shop.clearCompare,
    setCompare: shop.setCompare,
    isComparing: shop.isComparing,
    canToggleCompare: shop.canToggleCompare,
  };
}
