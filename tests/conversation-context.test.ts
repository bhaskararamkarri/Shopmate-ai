import { describe, expect, it, vi } from "vitest";
import {
  getConversationProducts,
  saveConversationProducts,
  resolveConversationContext,
  clearConversationProducts,
} from "@/lib/agent/conversation-context";
import type { Product } from "@/types";
import type { AgentCatalog } from "@/lib/agent/tools";

function makeProduct(id: string, name: string): Product {
  return {
    id,
    name,
    description: "Product description",
    price: 100,
    currency: "USD",
    availability: "in_stock",
    images: ["https://example.com/p.jpg"],
    ratings: 4.5,
    reviews: 10,
    category: "Appliances",
    brand: "Brand",
    specs: {},
    source: "channel3",
  };
}

describe("Conversation Product Context", () => {
  it("stores and retrieves products for a conversation ID", () => {
    const convId = "conv-test-1";
    const p1 = makeProduct("p-1", "Washing Machine A");
    const p2 = makeProduct("p-2", "Washing Machine B");

    saveConversationProducts(convId, [p1, p2]);
    const stored = getConversationProducts(convId);

    expect(stored.size).toBe(2);
    expect(stored.get("p-1")?.name).toBe("Washing Machine A");
    expect(stored.get("p-2")?.name).toBe("Washing Machine B");
  });

  it("re-fetches unknown client-provided product IDs from catalog", async () => {
    const convId = "conv-test-2";
    clearConversationProducts(convId);

    const p3 = makeProduct("p-3", "Washing Machine C");
    const catalog: AgentCatalog = {
      search: vi.fn(),
      getProduct: vi.fn(async (id: string) => (id === "p-3" ? p3 : null)),
    };

    const res = await resolveConversationContext({
      conversationId: convId,
      clientProductIds: ["p-3", "fake-404"],
      catalog,
    });

    expect(catalog.getProduct).toHaveBeenCalledWith("p-3");
    expect(catalog.getProduct).toHaveBeenCalledWith("fake-404");
    expect(res.trustedProducts.has("p-3")).toBe(true);
    expect(res.missingIds).toContain("fake-404");
  });

  it("rejects forged or missing client product IDs without trusting client data", async () => {
    const convId = "conv-test-3";
    const catalog: AgentCatalog = {
      search: vi.fn(),
      getProduct: vi.fn(async () => null),
    };

    const res = await resolveConversationContext({
      conversationId: convId,
      clientProductIds: ["forged-id-999"],
      catalog,
    });

    expect(res.trustedProducts.size).toBe(0);
    expect(res.missingIds).toContain("forged-id-999");
  });
});
