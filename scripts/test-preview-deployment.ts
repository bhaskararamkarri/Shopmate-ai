const PREVIEW_URL = "https://shopmate-4mb6gvmld-bhaskararamkarris-projects.vercel.app";

interface ChatTurnResponse {
  mode?: string;
  model?: string;
  content?: string;
  products?: Array<{ id: string; name: string; price: number; currency?: string }>;
  intent?: { budgetMax?: number };
  error?: string;
}

async function runAudit() {
  console.log("=================================================");
  console.log("   ShopMate AI — Hosted Preview Deployment Audit ");
  console.log("   Target URL: " + PREVIEW_URL);
  console.log("=================================================\n");

  // Check 0: Health / Root status
  try {
    const rootStart = Date.now();
    const rootRes = await fetch(PREVIEW_URL);
    const rootLatency = Date.now() - rootStart;
    console.log(`[Root /] HTTP ${rootRes.status} in ${rootLatency}ms`);
  } catch (err: unknown) {
    console.error("Root / fetch failed:", (err as Error).message);
  }

  // ------------------------------------------------------------------
  // Test 1: AI Shopping Request ("running shoes under $120")
  // ------------------------------------------------------------------
  console.log("\n--- Test 1: AI Shopping Request ---");
  const prompt1 = "running shoes under $120";
  console.log(`Prompt: "${prompt1}"`);

  let turn1Data: ChatTurnResponse | null = null;
  const t1Start = Date.now();
  let t1Status = 0;
  let t1Latency = 0;

  try {
    const res = await fetch(`${PREVIEW_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "test-preview-audit-123",
        message: prompt1,
        history: [],
      }),
    });
    t1Latency = Date.now() - t1Start;
    t1Status = res.status;
    const json = (await res.json()) as ChatTurnResponse;
    turn1Data = json;

    console.log(`HTTP ${t1Status} in ${t1Latency}ms`);
    if (json.error) {
      console.log(`API Error:`, json.error);
    } else {
      console.log(`Mode: ${json.mode}, Model: ${json.model}`);
      console.log(`Products returned: ${json.products?.length ?? 0}`);
      console.log(`Extracted budgetMax: ${json.intent?.budgetMax}`);
      if (json.products && json.products.length > 0) {
        console.log(`Sample: "${json.products[0].name}" ($${json.products[0].price})`);
      }
      console.log(`Content preview: "${json.content?.slice(0, 120)}..."`);
    }
  } catch (err: unknown) {
    t1Latency = Date.now() - t1Start;
    console.error("Test 1 error:", (err as Error).message);
  }

  // ------------------------------------------------------------------
  // Test 2: Budget Refinement ("actually my budget is $90")
  // ------------------------------------------------------------------
  console.log("\n--- Test 2: Budget Refinement ---");
  const prompt2 = "actually my budget is $90";
  console.log(`Prompt: "${prompt2}"`);

  const t2Start = Date.now();
  let t2Status = 0;
  let t2Latency = 0;
  let turn2Data: ChatTurnResponse | null = null;

  try {
    const history = turn1Data?.content
      ? [
          { role: "user", content: prompt1 },
          { role: "assistant", content: turn1Data.content },
        ]
      : [{ role: "user", content: prompt1 }];

    const res = await fetch(`${PREVIEW_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "test-preview-audit-123",
        message: prompt2,
        history,
        intent: turn1Data?.intent,
      }),
    });
    t2Latency = Date.now() - t2Start;
    t2Status = res.status;
    const json = (await res.json()) as ChatTurnResponse;
    turn2Data = json;

    console.log(`HTTP ${t2Status} in ${t2Latency}ms`);
    if (json.error) {
      console.log(`API Error:`, json.error);
    } else {
      console.log(`Mode: ${json.mode}, Model: ${json.model}`);
      console.log(`Products returned: ${json.products?.length ?? 0}`);
      console.log(`Refined budgetMax: ${json.intent?.budgetMax}`);
      const allUnder = json.products?.every((p) => p.price <= 90);
      console.log(`All products <= $90: ${allUnder}`);
      if (json.products && json.products.length > 0) {
        console.log(`Sample: "${json.products[0].name}" ($${json.products[0].price})`);
      }
    }
  } catch (err: unknown) {
    t2Latency = Date.now() - t2Start;
    console.error("Test 2 error:", (err as Error).message);
  }

  // ------------------------------------------------------------------
  // Test 2B: Chat Product Comparison Turn
  // ------------------------------------------------------------------
  console.log("\n--- Test 2B: AI Product Comparison via Chat ---");
  const promptCompare = "compare the first two options you recommended";
  console.log(`Prompt: "${promptCompare}"`);

  let turn3Data: ChatTurnResponse | null = null;
  const t2bStart = Date.now();
  let t2bStatus = 0;
  let t2bLatency = 0;

  try {
    const history = [
      { role: "user", content: prompt1 },
      ...(turn1Data?.content ? [{ role: "assistant", content: turn1Data.content }] : []),
      { role: "user", content: prompt2 },
      ...(turn2Data?.content ? [{ role: "assistant", content: turn2Data.content }] : []),
    ];

    const res = await fetch(`${PREVIEW_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "test-preview-audit-123",
        message: promptCompare,
        history,
        intent: turn2Data?.intent || turn1Data?.intent,
      }),
    });
    t2bLatency = Date.now() - t2bStart;
    t2bStatus = res.status;
    const json = (await res.json()) as ChatTurnResponse;
    turn3Data = json;

    console.log(`HTTP ${t2bStatus} in ${t2bLatency}ms`);
    if (json.error) {
      console.log(`API Error:`, json.error);
    } else {
      console.log(`Mode: ${json.mode}, Model: ${json.model}`);
      console.log(`Comparison preview: "${json.content?.slice(0, 150)}..."`);
    }
  } catch (err: unknown) {
    t2bLatency = Date.now() - t2bStart;
    console.error("Test 2B error:", (err as Error).message);
  }

  // ------------------------------------------------------------------
  // Test 3: Product Comparison Page & Catalog API
  // ------------------------------------------------------------------
  console.log("\n--- Test 3: Product Comparison ---");
  const compareUrl = `${PREVIEW_URL}/compare?ids=demo-aurora-headphones,demo-bloom-earbuds`;
  console.log(`Fetching compare page: ${compareUrl}`);

  const t3Start = Date.now();
  let t3Status = 0;
  let t3Latency = 0;
  let p1Found = false;
  let p2Found = false;

  try {
    const pageRes = await fetch(compareUrl);
    t3Latency = Date.now() - t3Start;
    t3Status = pageRes.status;
    console.log(`Compare page: HTTP ${t3Status} in ${t3Latency}ms`);

    // Fetch individual product details via API to verify catalog matching
    const p1Res = await fetch(`${PREVIEW_URL}/api/products/demo-aurora-headphones`);
    const p1Json = (await p1Res.json()) as { product?: { price: number; name: string } };
    if (p1Json && p1Json.product) {
      p1Found = true;
      console.log(`Product 1 API verified: "${p1Json.product.name}" ($${p1Json.product.price})`);
    }

    const p2Res = await fetch(`${PREVIEW_URL}/api/products/demo-bloom-earbuds`);
    const p2Json = (await p2Res.json()) as { product?: { price: number; name: string } };
    if (p2Json && p2Json.product) {
      p2Found = true;
      console.log(`Product 2 API verified: "${p2Json.product.name}" ($${p2Json.product.price})`);
    }
  } catch (err: unknown) {
    console.error("Test 3 error:", (err as Error).message);
  }

  console.log("\n=================================================");
  console.log("            HOSTED TEST RESULTS SUMMARY          ");
  console.log("=================================================");
  console.log(`Test 1 (AI Shopping Request):     HTTP ${t1Status} in ${t1Latency}ms (Model: ${turn1Data?.model || "none"})`);
  console.log(`Test 2 (Budget Refinement):       HTTP ${t2Status} in ${t2Latency}ms (Model: ${turn2Data?.model || "none"})`);
  console.log(`Test 2B (Chat Product Compare):   HTTP ${t2bStatus} in ${t2bLatency}ms (Model: ${turn3Data?.model || "none"})`);
  console.log(`Test 3 (Product Compare Page):    HTTP ${t3Status} in ${t3Latency}ms (Catalog Products: ${p1Found && p2Found ? "MATCHED" : "UNVERIFIED"})`);
}

runAudit().catch((err) => {
  console.error("Audit runner failed:", err);
  process.exit(1);
});
