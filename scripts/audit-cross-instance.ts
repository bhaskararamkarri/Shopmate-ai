export {};
import {
  saveConversationProducts,
  getConversationProducts,
  clearConversationProducts,
  resolveConversationContext,
} from "../src/lib/agent/conversation-context";
import type { Product } from "../src/types";

function makeMockProduct(id: string, name: string): Product {
  return {
    id,
    name,
    description: "Mock product description",
    price: 100,
    currency: "USD",
    availability: "in_stock",
    images: ["https://example.com/p.jpg"],
    ratings: 4.5,
    reviews: 50,
    category: "Appliances",
    brand: "MockBrand",
    specs: {},
    source: "channel3",
  };
}

async function runAudit1() {
  console.log("=================================================");
  console.log("   Audit 1: Cross-Instance Reliability Tests     ");
  console.log("=================================================\n");

  // 1. Process-local LRU dependency
  console.log("Test 1.1: Local in-memory storage behavior");
  clearConversationProducts();
  const prod1 = makeMockProduct("p1", "Product 1");
  saveConversationProducts("conv-1", [prod1]);
  const stored1 = getConversationProducts("conv-1");
  console.log(`- Stored in-memory: ${stored1.has("p1") ? "YES" : "NO"} (${stored1.get("p1")?.name})`);

  // 2. Simulated Cold Start (clearing memory store)
  console.log("\nTest 1.2: Simulated Cold-Start Context Recovery");
  clearConversationProducts(); // Simulates fresh serverless container boot
  console.log(`- In-memory store after container restart: size = ${getConversationProducts("conv-1").size}`);

  const mockCatalog = {
    search: async () => ({ products: [], source: "channel3" as const }),
    getProduct: async (id: string) => {
      if (id === "p1") return makeMockProduct("p1", "Product 1 (Re-fetched from Channel3)");
      if (id === "p2") return makeMockProduct("p2", "Product 2 (Re-fetched from Channel3)");
      return null;
    },
  };

  const recovered = await resolveConversationContext({
    conversationId: "conv-1",
    clientProductIds: ["p1", "p2"],
    catalog: mockCatalog,
  });

  console.log(`- Recovery from clientProductIds on cold start:`);
  console.log(`  * Trusted products recovered: ${recovered.trustedProducts.size}`);
  console.log(`  * p1 name: "${recovered.trustedProducts.get("p1")?.name}"`);
  console.log(`  * p2 name: "${recovered.trustedProducts.get("p2")?.name}"`);
  console.log(`  * Success: ${recovered.trustedProducts.has("p1") && recovered.trustedProducts.has("p2")}`);

  // 3. Forged, invalid, or expired product IDs
  console.log("\nTest 1.3: Handling of Forged / Unavailable Product IDs");
  const mixedRecovery = await resolveConversationContext({
    conversationId: "conv-1",
    clientProductIds: ["p1", "forged-id-999", "non-existent-404"],
    catalog: mockCatalog,
  });

  console.log(`  * Valid ID 'p1' trusted: ${mixedRecovery.trustedProducts.has("p1")}`);
  console.log(`  * Forged ID 'forged-id-999' rejected: ${!mixedRecovery.trustedProducts.has("forged-id-999")}`);
  console.log(`  * Missing IDs logged:`, mixedRecovery.missingIds);
  console.log(`  * Success: ${!mixedRecovery.trustedProducts.has("forged-id-999") && mixedRecovery.missingIds.includes("forged-id-999")}`);

  // 4. Conversation ID Isolation
  console.log("\nTest 1.4: Conversation ID Isolation");
  clearConversationProducts();
  saveConversationProducts("user-session-A", [makeMockProduct("prod-A", "Item A")]);
  saveConversationProducts("user-session-B", [makeMockProduct("prod-B", "Item B")]);

  const sessionA = getConversationProducts("user-session-A");
  const sessionB = getConversationProducts("user-session-B");
  console.log(`  * Session A has prod-A: ${sessionA.has("prod-A")}`);
  console.log(`  * Session A has prod-B: ${sessionA.has("prod-B")} (leak test)`);
  console.log(`  * Session B has prod-B: ${sessionB.has("prod-B")}`);
  console.log(`  * Session B has prod-A: ${sessionB.has("prod-A")} (leak test)`);
}

runAudit1().catch(console.error);

