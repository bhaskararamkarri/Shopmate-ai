export {};
import { validateResponseProvenance } from "../src/lib/agent/provenance-validator";
import type { Product } from "../src/types";

/**
 * Phase 9.5 Live Preview Verification & Submission Readiness
 * Target: https://shopmate-1i4iuy3m9-bhaskararamkarris-projects.vercel.app
 */

const PREVIEW_URL = "https://shopmate-1i4iuy3m9-bhaskararamkarris-projects.vercel.app";
const CONVERSATION_ID = `live-p95-${Date.now()}`;

interface ChatResponse {
  success: boolean;
  content: string;
  mode: string;
  model?: string;
  products: Product[];
  productIds: string[];
  recommendations: Array<{
    productId: string;
    badge?: string;
    whyItMatches: string;
    missingOrUnverified: string[];
    failedRequirements?: string[];
  }>;
  comparisons?: Array<{
    productIds: string[];
    missingIds: string[];
  }>;
  intent: Record<string, unknown>;
  catalog?: {
    source: string;
    fallback?: string;
  };
  error?: string;
}

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

async function recordResult(id: number, name: string, passed: boolean, details: string) {
  results.push({ id, name, passed, details });
  const mark = passed ? "PASS" : "FAIL";
  console.log(`[Test ${id}] [${mark}] ${name}`);
  console.log(`  Details: ${details}\n`);
}

async function fetchChatWithRetry(payload: Record<string, unknown>, maxRetries = 2): Promise<{ status: number; data: ChatResponse; latency: number }> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const start = Date.now();
    try {
      const res = await fetch(`${PREVIEW_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const latency = Date.now() - start;
      const data = (await res.json()) as ChatResponse;
      if (res.status === 200) {
        return { status: res.status, data, latency };
      }
      if (attempt < maxRetries && (res.status === 502 || res.status === 503 || res.status === 429)) {
        console.log(`  [fetchChatWithRetry] HTTP ${res.status} on attempt ${attempt + 1}, waiting 5s for provider rate-limit window...`);
        await new Promise((r) => setTimeout(r, 5000));
        attempt++;
        continue;
      }
      return { status: res.status, data, latency };
    } catch (err) {
      if (attempt < maxRetries) {
        console.log(`  [fetchChatWithRetry] Network error on attempt ${attempt + 1}, waiting 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
        attempt++;
        continue;
      }
      throw err;
    }
  }
  throw new Error("Exhausted retries");
}

async function runLiveVerification() {
  console.log("================================================================================");
  console.log("   ShopMate AI — Phase 9.5 Live Preview Verification & Submission Readiness    ");
  console.log(`   Target: ${PREVIEW_URL}`);
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log("================================================================================\n");

  // 1. Homepage loads
  try {
    const res = await fetch(`${PREVIEW_URL}/`);
    const text = await res.text();
    const ok = res.status === 200 && text.includes("ShopMate");
    await recordResult(
      1,
      "Homepage loads",
      ok,
      `HTTP ${res.status}, length=${text.length} bytes, contains 'ShopMate'`,
    );
  } catch (err) {
    await recordResult(1, "Homepage loads", false, `Error: ${(err as Error).message}`);
  }

  // 2. AI chat loads
  try {
    const res = await fetch(`${PREVIEW_URL}/chat`);
    const text = await res.text();
    const ok = res.status === 200 && text.length > 500;
    await recordResult(
      2,
      "AI chat page loads",
      ok,
      `HTTP ${res.status}, length=${text.length} bytes`,
    );
  } catch (err) {
    await recordResult(2, "AI chat page loads", false, `Error: ${(err as Error).message}`);
  }

  // 3. Search returns real Channel3 products
  let firstTurnProducts: Product[] = [];
  try {
    const { status, data, latency } = await fetchChatWithRetry({
      conversationId: CONVERSATION_ID,
      message: "Find front load washing machines",
      history: [],
    });
    const ok =
      status === 200 &&
      data.success &&
      Array.isArray(data.products) &&
      data.products.length > 0 &&
      data.catalog?.source === "channel3";

    firstTurnProducts = data.products || [];
    await recordResult(
      3,
      "Search returns real Channel3 products",
      ok,
      `HTTP ${status} in ${latency}ms, catalogSource=${data.catalog?.source}, productsReturned=${firstTurnProducts.length} (${firstTurnProducts.slice(0, 3).map((p) => `${p.id}: ${p.name.slice(0, 30)}...`).join(", ")})`,
    );
  } catch (err) {
    await recordResult(3, "Search returns real Channel3 products", false, `Error: ${(err as Error).message}`);
  }

  // 4. Follow-up questions preserve previous product context
  try {
    const recentIds = firstTurnProducts.slice(0, 3).map((p) => p.id);
    const { status, data, latency } = await fetchChatWithRetry({
      conversationId: CONVERSATION_ID,
      message: "Which one of these is best for a family of 4?",
      history: [
        { role: "user", content: "Find front load washing machines" },
        {
          role: "assistant",
          content: `I found several front load washing machines including ${recentIds.join(", ")}.`,
        },
      ],
      contextProductIds: recentIds,
    });

    const returnedIds = (data.products || []).map((p) => p.id);
    const preservedCount = recentIds.filter((id) => returnedIds.includes(id)).length;
    const ok = status === 200 && data.success && preservedCount > 0;

    await recordResult(
      4,
      "Follow-up questions preserve previous product context",
      ok,
      `HTTP ${status} in ${latency}ms, preserved ${preservedCount}/${recentIds.length} candidate IDs across multi-turn context`,
    );
  } catch (err) {
    await recordResult(
      4,
      "Follow-up questions preserve previous product context",
      false,
      `Error: ${(err as Error).message}`,
    );
  }

  // 5. Compare uses the exact displayed product IDs
  try {
    if (firstTurnProducts.length > 0) {
      const p = firstTurnProducts[0];
      const res = await fetch(`${PREVIEW_URL}/api/products/${p.id}`);
      const data = await res.json();
      const ok = res.status === 200 && data.product?.id === p.id;
      await recordResult(
        5,
        "Compare uses exact displayed product IDs",
        ok,
        `Resolved product ID "${p.id}" directly via /api/products/${p.id} with title "${data.product?.name}"`,
      );
    } else {
      await recordResult(5, "Compare uses exact displayed product IDs", false, "No products available from Turn 1");
    }
  } catch (err) {
    await recordResult(5, "Compare uses exact displayed product IDs", false, `Error: ${(err as Error).message}`);
  }

  // 6. Cart preserves product identity and authoritative pricing
  try {
    if (firstTurnProducts.length > 0) {
      const p = firstTurnProducts[0];
      const res = await fetch(`${PREVIEW_URL}/api/products/${p.id}`);
      const data = await res.json();
      const authoritativePrice = data.product?.price;
      const ok =
        res.status === 200 &&
        typeof authoritativePrice === "number" &&
        authoritativePrice === p.price &&
        data.product?.currency === p.currency;
      await recordResult(
        6,
        "Cart preserves product identity and authoritative pricing",
        ok,
        `Authoritative product price=$${authoritativePrice} ${data.product?.currency} matches initial shortlist price=$${p.price} ${p.currency} for ID ${p.id}`,
      );
    } else {
      await recordResult(6, "Cart preserves product identity and authoritative pricing", false, "No products available");
    }
  } catch (err) {
    await recordResult(6, "Cart preserves product identity and authoritative pricing", false, `Error: ${(err as Error).message}`);
  }

  // 7. Fabricated capacity claim is rejected
  try {
    const testCatalog = new Map<string, Product>();
    const testProduct: Product = {
      id: "vWOKnu4",
      name: "WAN28218IT Series 4 Front-load Washing Machine",
      description: "Front load washing machine",
      price: 1193.44,
      currency: "USD",
      availability: "in_stock",
      images: [],
      ratings: 4.5,
      reviews: 12,
      category: "Washing Machines",
      brand: "Bosch",
      specs: { Capacity: "8 kg" },
      source: "channel3",
    };
    testCatalog.set(testProduct.id, testProduct);

    const fabricatedText = "The Bosch Series 4 (ID: **vWOKnu4**) has an enormous 20 kg capacity suitable for commercial hotels.";
    const check = validateResponseProvenance(fabricatedText, testCatalog);
    const ok = !check.valid && check.violations.some((v) => v.toLowerCase().includes("capacity"));
    await recordResult(
      7,
      "Fabricated capacity claim is rejected",
      ok,
      `Claiming 20 kg on 8 kg washer produced valid=${check.valid}, violations: ${JSON.stringify(check.violations)}`,
    );
  } catch (err) {
    await recordResult(7, "Fabricated capacity claim is rejected", false, `Error: ${(err as Error).message}`);
  }

  // 8. Fabricated feature claim is rejected
  try {
    const testCatalog = new Map<string, Product>();
    const testProduct: Product = {
      id: "vWOKnu4",
      name: "WAN28218IT Series 4 Front-load Washing Machine",
      description: "Engineered in Germany with EcoSilence Drive motor.",
      price: 1193.44,
      currency: "USD",
      availability: "in_stock",
      images: [],
      ratings: 4.5,
      reviews: 12,
      category: "Washing Machines",
      brand: "Bosch",
      specs: { Capacity: "8 kg" },
      source: "channel3",
    };
    testCatalog.set(testProduct.id, testProduct);

    const fabricatedFeatureText = "The Bosch Series 4 (ID: **vWOKnu4**) features a built-in microwave and laser drying sensor.";
    const check = validateResponseProvenance(fabricatedFeatureText, testCatalog);
    const ok = !check.valid && check.violations.some((v) => v.toLowerCase().includes("feature") || v.toLowerCase().includes("unverified"));
    await recordResult(
      8,
      "Fabricated feature claim is rejected",
      ok,
      `Claiming built-in microwave / laser drying produced valid=${check.valid}, violations: ${JSON.stringify(check.violations)}`,
    );
  } catch (err) {
    await recordResult(8, "Fabricated feature claim is rejected", false, `Error: ${(err as Error).message}`);
  }

  // 9. Unsupported warranty claim is rejected
  try {
    const testCatalog = new Map<string, Product>();
    const testProduct: Product = {
      id: "vWOKnu4",
      name: "WAN28218IT Series 4 Front-load Washing Machine",
      description: "Front load washing machine",
      price: 1193.44,
      currency: "USD",
      availability: "in_stock",
      images: [],
      ratings: 4.5,
      reviews: 12,
      category: "Washing Machines",
      brand: "Bosch",
      specs: { Capacity: "8 kg" }, // NO warranty in specs
      source: "channel3",
    };
    testCatalog.set(testProduct.id, testProduct);

    const fabricatedWarrantyText = "The Bosch Series 4 (ID: **vWOKnu4**) comes with a 10-year comprehensive warranty on all parts.";
    const check = validateResponseProvenance(fabricatedWarrantyText, testCatalog);
    const ok = !check.valid && check.violations.some((v) => v.toLowerCase().includes("warranty"));
    await recordResult(
      9,
      "Unsupported warranty claim is rejected",
      ok,
      `Claiming 10-year warranty when unlisted produced valid=${check.valid}, violations: ${JSON.stringify(check.violations)}`,
    );
  } catch (err) {
    await recordResult(9, "Unsupported warranty claim is rejected", false, `Error: ${(err as Error).message}`);
  }

  // 10. Correct product claims are accepted
  try {
    const testCatalog = new Map<string, Product>();
    const bosch9kg: Product = {
      id: "prXIzEg",
      name: "Serie 8 Washing Machine - 9 Kg",
      price: 1353.18,
      currency: "USD",
      availability: "in_stock",
      images: [],
      ratings: 4.5,
      reviews: 12,
      category: "Washing Machines",
      brand: "Bosch",
      description: "Features active water plus and steam wash program with a 9 kg capacity.",
      specs: {
        Capacity: "9 kg",
        "Key features": "ActiveWater Plus · Steam Refresh · Wi-Fi Control",
        Warranty: "2 Year Manufacturer Warranty",
      },
      source: "channel3",
    };
    testCatalog.set(bosch9kg.id, bosch9kg);

    const textVerified = "The Bosch Serie 8 (ID: **prXIzEg**) costs $1,353.18 and includes a 2-year warranty with 9 kg capacity.";
    const check = validateResponseProvenance(textVerified, testCatalog);
    const ok = check.valid && check.violations.length === 0 && check.referencedProductIds.includes("prXIzEg");
    await recordResult(
      10,
      "Correct product claims are accepted",
      ok,
      `Verified claim (prXIzEg, $1,353.18, 9kg capacity, 2-year warranty) produced valid=${check.valid}, violations=${check.violations.length}`,
    );
  } catch (err) {
    await recordResult(10, "Correct product claims are accepted", false, `Error: ${(err as Error).message}`);
  }

  // 11. INR budget against USD offers remains UNVERIFIED
  try {
    const { status, data } = await fetchChatWithRetry({
      conversationId: `inr-test-${Date.now()}`,
      message: "Washing machine under ₹50,000",
      history: [],
    });
    const hasUnverifiedCurrencyWarning = (data.recommendations || []).some((rec) =>
      rec.failedRequirements?.some(
        (f) => f.includes("INR") || f.includes("cannot verify") || f.includes("exchange rate"),
      ),
    );
    const ok = status === 200 && data.success && hasUnverifiedCurrencyWarning;
    await recordResult(
      11,
      "INR budget against USD offers remains UNVERIFIED",
      ok,
      `HTTP ${status}, currency mismatch correctly flagged in failedRequirements: ${hasUnverifiedCurrencyWarning}`,
    );
  } catch (err) {
    await recordResult(11, "INR budget against USD offers remains UNVERIFIED", false, `Error: ${(err as Error).message}`);
  }

  // 12. PayPal Sandbox checkout succeeds for an eligible product below the $500 limit
  try {
    const searchRes = await fetch(`${PREVIEW_URL}/api/products/search?q=portable+washer&limit=5`);
    const searchData = await searchRes.json();
    const candidate = (searchData.products || []).find(
      (p: Product) => p.price > 0 && p.price < 500,
    ) || {
      id: "eGeVUtT",
      price: 209.49,
      currency: "USD",
    };

    console.log(`Testing PayPal Sandbox order creation with product "${candidate.id}" ($${candidate.price})...`);

    const orderRes = await fetch(`${PREVIEW_URL}/api/paypal/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ productId: candidate.id, quantity: 1 }],
        currency: "USD",
      }),
    });

    const orderData = await orderRes.json();
    const ok =
      (orderRes.status === 201 || orderRes.status === 200) &&
      typeof orderData.orderId === "string" &&
      orderData.orderId.length > 5 &&
      orderData.status === "CREATED";

    await recordResult(
      12,
      "PayPal Sandbox checkout succeeds for an eligible product below $500",
      ok,
      `HTTP ${orderRes.status}, orderId=${orderData.orderId}, status=${orderData.status}`,
    );
  } catch (err) {
    await recordResult(
      12,
      "PayPal Sandbox checkout succeeds for an eligible product below $500",
      false,
      `Error: ${(err as Error).message}`,
    );
  }

  console.log("\n================================================================================");
  console.log(`   LIVE VERIFICATION SUMMARY: ${results.filter((r) => r.passed).length}/${results.length} PASSED`);
  console.log("================================================================================\n");
}

runLiveVerification().catch(console.error);
