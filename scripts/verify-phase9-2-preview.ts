export {};

/**
 * Phase 9.2 Live Preview Verification Script
 * Target: https://shopmate-gmv575gbx-bhaskararamkarris-projects.vercel.app
 */

const PREVIEW_URL = "https://shopmate-gmv575gbx-bhaskararamkarris-projects.vercel.app";
const CONVERSATION_ID = `live-p92-${Date.now()}`;

interface Product {
  id: string;
  name: string;
  price: number;
  currency: string;
  specs?: Record<string, string>;
  merchant?: string;
}

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
  error?: string;
}

async function sendTurn(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  contextProductIds?: string[],
  intent?: Record<string, unknown>,
): Promise<ChatResponse> {
  console.log(`\n===============================================================`);
  console.log(`SENDING TURN: "${message}"`);
  console.log(`Context Product IDs passed:`, contextProductIds || []);
  const start = Date.now();

  const res = await fetch(`${PREVIEW_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: CONVERSATION_ID,
      message,
      history,
      contextProductIds,
      intent,
    }),
  });

  const latency = Date.now() - start;
  const data = (await res.json()) as ChatResponse;
  console.log(`HTTP ${res.status} in ${latency}ms | Mode: ${data.mode} | Model: ${data.model || "none"}`);
  console.log(`Product IDs in Shortlist (${data.products?.length || 0}):`, (data.products || []).map(p => `${p.id} (${p.name})`));
  console.log(`Assistant Content:\n${data.content}`);
  if (data.recommendations && data.recommendations.length > 0) {
    console.log(`\nTop Recommendation Insights:`);
    for (const rec of data.recommendations.slice(0, 3)) {
      console.log(` - [${rec.productId}] ${rec.badge || "Standard"}: ${rec.whyItMatches}`);
      if (rec.missingOrUnverified?.length) {
        console.log(`   Missing/Unverified:`, rec.missingOrUnverified);
      }
      if (rec.failedRequirements?.length) {
        console.log(`   Failed Requirements:`, rec.failedRequirements);
      }
    }
  }
  return data;
}

async function run() {
  console.log(`Starting Phase 9.2 Live Verification on ${PREVIEW_URL}`);
  console.log(`Conversation ID: ${CONVERSATION_ID}`);

  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  let recentProductIds: string[] = [];
  let currentIntent: Record<string, unknown> | undefined = undefined;

  // Turn 1
  const t1 = await sendTurn(
    "Find washing machines for a family of 4.",
    history,
    recentProductIds,
    currentIntent,
  );
  history.push({ role: "user", content: "Find washing machines for a family of 4." });
  history.push({ role: "assistant", content: t1.content.slice(0, 1500) });
  recentProductIds = t1.products?.map(p => p.id) || [];
  currentIntent = t1.intent;

  // Turn 2
  const t2 = await sendTurn(
    "Show me washing machines under ₹30,000.",
    history,
    recentProductIds,
    currentIntent,
  );
  history.push({ role: "user", content: "Show me washing machines under ₹30,000." });
  history.push({ role: "assistant", content: t2.content.slice(0, 1500) });
  recentProductIds = Array.from(new Set([...recentProductIds, ...(t2.products?.map(p => p.id) || [])]));
  currentIntent = t2.intent;

  // Turn 3
  const t3 = await sendTurn(
    "Which one is best for a family of 4?",
    history,
    recentProductIds,
    currentIntent,
  );
  if (t3.content) {
    history.push({ role: "user", content: "Which one is best for a family of 4?" });
    history.push({ role: "assistant", content: t3.content.slice(0, 1500) });
  }
  if (t3.intent) currentIntent = t3.intent;

  // Turn 4
  const t4 = await sendTurn(
    "Compare the Bosch and Samsung options you showed earlier.",
    history,
    recentProductIds,
    currentIntent,
  );
  if (t4.content) {
    console.log(`Turn 4 comparison products:`, t4.comparisons || []);
  }

  console.log(`\n===============================================================`);
  console.log(`PHASE 9.2 LIVE VERIFICATION COMPLETE.`);
}

run().catch(console.error);
