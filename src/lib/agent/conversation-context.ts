/**
 * ShopMate AI — Conversation Product Context (Phase 9.2).
 *
 * Maintains server-side validated product awareness across multi-turn conversations.
 * Ensures:
 * 1. Product IDs from earlier turns are preserved and remain stable.
 * 2. Client-provided product IDs are never trusted blindly; they are strictly re-verified
 *    against trusted server state or re-fetched from Channel3.
 * 3. Unavailable or forged product IDs are explicitly isolated.
 */
import type { Product } from "@/types";
import type { AgentCatalog } from "./tools";

interface ConversationEntry {
  products: Map<string, Product>;
  lastAccessed: number;
}

const CONTEXT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CONVERSATIONS = 1000;

const conversationStore = new Map<string, ConversationEntry>();

/** Periodic cleanup of expired conversations. */
function cleanupExpired() {
  const now = Date.now();
  for (const [id, entry] of conversationStore.entries()) {
    if (now - entry.lastAccessed > CONTEXT_TTL_MS) {
      conversationStore.delete(id);
    }
  }
  if (conversationStore.size > MAX_CONVERSATIONS) {
    const sorted = [...conversationStore.entries()].sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed,
    );
    const toRemove = sorted.slice(0, Math.floor(MAX_CONVERSATIONS * 0.2));
    for (const [id] of toRemove) {
      conversationStore.delete(id);
    }
  }
}

/** Retrieves trusted products for a given conversation ID. */
export function getConversationProducts(conversationId: string): Map<string, Product> {
  if (!conversationId) return new Map();
  const entry = conversationStore.get(conversationId);
  if (!entry) return new Map();

  entry.lastAccessed = Date.now();
  return new Map(entry.products);
}

/** Saves or updates products in conversation context. */
export function saveConversationProducts(
  conversationId: string,
  products: Product[],
): void {
  if (!conversationId || products.length === 0) return;
  cleanupExpired();

  let entry = conversationStore.get(conversationId);
  if (!entry) {
    entry = { products: new Map(), lastAccessed: Date.now() };
    conversationStore.set(conversationId, entry);
  }

  entry.lastAccessed = Date.now();
  for (const product of products) {
    if (product?.id) {
      entry.products.set(product.id, product);
    }
  }
}

/** Clears stored products for a conversation (used in testing and session reset). */
export function clearConversationProducts(conversationId?: string): void {
  if (conversationId) {
    conversationStore.delete(conversationId);
  } else {
    conversationStore.clear();
  }
}

/**
 * Resolves product context for an incoming turn:
 * 1. Loads trusted server-state products for the conversation.
 * 2. Checks any client-supplied product IDs (from history or shortlist).
 * 3. Re-fetches un-cached IDs from Channel3 via catalog.getProduct().
 * 4. Records missing/invalid IDs to report to user if referenced.
 */
export async function resolveConversationContext(params: {
  conversationId?: string;
  clientProductIds?: string[];
  catalog: AgentCatalog;
}): Promise<{
  trustedProducts: Map<string, Product>;
  missingIds: string[];
}> {
  const { conversationId, clientProductIds = [], catalog } = params;
  const trustedProducts = conversationId
    ? getConversationProducts(conversationId)
    : new Map<string, Product>();

  const missingIds: string[] = [];
  const uniqueCandidateIds = Array.from(new Set(clientProductIds)).filter(
    (id) => typeof id === "string" && id.trim().length > 0,
  );

  for (const id of uniqueCandidateIds) {
    if (trustedProducts.has(id)) continue;

    try {
      const fetched = await catalog.getProduct(id);
      if (fetched) {
        trustedProducts.set(fetched.id, fetched);
      } else {
        missingIds.push(id);
      }
    } catch {
      missingIds.push(id);
    }
  }

  // Update server cache if we resolved any new valid products
  if (conversationId && trustedProducts.size > 0) {
    saveConversationProducts(conversationId, Array.from(trustedProducts.values()));
  }

  return { trustedProducts, missingIds };
}
