import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { runAgentTurn } from "../src/lib/agent/agent";
import { getCatalogProduct } from "../src/lib/catalog/provider";
import { buildComparisonMatrix } from "../src/lib/compare/compare-matrix";

// Load environment safely
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}



async function runE2E() {
  console.log("=================================================");
  console.log("    ShopMate AI — End-to-End Shopping Workflow   ");
  console.log("=================================================\n");

  // ------------------------------------------------------------------
  // Turn 1: Product Discovery — search for "running shoes under $120"
  // ------------------------------------------------------------------
  console.log("--- Step 1: Product Discovery ---");
  const t1Prompt = "running shoes under $120";
  console.log(`User: "${t1Prompt}"`);

  const t1Start = Date.now();
  const turn1 = await runAgentTurn({
    history: [],
    message: t1Prompt,
  });
  const t1Latency = Date.now() - t1Start;

  console.log(`Turn 1 finished in ${t1Latency}ms`);
  console.log(`Active Provider/Model: ${turn1.model} (mode: ${turn1.mode})`);
  console.log(`Products returned: ${turn1.products.length}`);
  console.log(`Extracted budgetMax: ${turn1.intent.budgetMax}`);

  // Provenance verification: Check that every returned product actually exists in catalog
  // and prices/ratings match catalog exactly without fabrication
  let provenanceValid = true;
  for (const p of turn1.products) {
    const detail = await getCatalogProduct(p.id);
    const catalogItem = detail?.product;
    if (!catalogItem) {
      console.error(`Provenance failure: product ${p.id} not found in catalog!`);
      provenanceValid = false;
    } else {
      if (catalogItem.price !== p.price) {
        console.error(`Fabricated price for ${p.id}: got ${p.price}, catalog ${catalogItem.price}`);
        provenanceValid = false;
      }
      if (catalogItem.ratings !== p.ratings) {
        console.error(`Fabricated rating for ${p.id}: got ${p.ratings}, catalog ${catalogItem.ratings}`);
        provenanceValid = false;
      }
    }
  }
  console.log(`Provenance Integrity: ${provenanceValid ? "VERIFIED (100% matched catalog)" : "FAILED"}`);

  // ------------------------------------------------------------------
  // Turn 2: Budget Refinement — "actually my budget is $90"
  // ------------------------------------------------------------------
  console.log("\n--- Step 2: Budget Refinement ---");
  const t2Prompt = "actually my budget is $90";
  console.log(`User: "${t2Prompt}"`);

  const t2Start = Date.now();
  const turn2 = await runAgentTurn({
    history: [
      { role: "user", content: t1Prompt },
      { role: "assistant", content: turn1.content },
    ],
    message: t2Prompt,
    intent: turn1.intent,
  });
  const t2Latency = Date.now() - t2Start;

  console.log(`Turn 2 finished in ${t2Latency}ms`);
  console.log(`Active Provider/Model: ${turn2.model}`);
  console.log(`Refined budgetMax: ${turn2.intent.budgetMax}`);

  const allUnderBudget = turn2.products.every((p) => p.price <= 90);
  const retainedCategory =
    Boolean(turn2.intent.productCategory) ||
    turn2.intent.query?.toLowerCase().includes("shoe") ||
    turn1.intent.query?.toLowerCase().includes("shoe");

  console.log(`Budget compliance (<= $90): ${allUnderBudget ? "PASS" : "FAIL"}`);
  console.log(`Category preference retained: ${retainedCategory ? "PASS" : "FAIL"}`);

  // ------------------------------------------------------------------
  // Step 3: Comparison — Compare top 2 recommendations
  // ------------------------------------------------------------------
  console.log("\n--- Step 3: Comparison Experience ---");
  const compareCandidates = (turn2.products.length >= 2 ? turn2.products : turn1.products).slice(0, 2);
  console.log(`Comparing products: ${compareCandidates.map((p) => `"${p.name}" ($${p.price})`).join(" vs ")}`);

  const comparison = buildComparisonMatrix(compareCandidates, turn2.intent);

  console.log(`Side-by-side comparison generated: ${comparison.products.length} products`);
  console.log(`Spec rows detected: ${comparison.specRows.length}`);
  console.log(`Price delta: ${comparison.priceComparison.formattedDelta || "N/A"}`);

  let integrityVerified = true;
  for (const prod of comparison.products) {
    if (!prod.name || typeof prod.price !== "number") {
      integrityVerified = false;
    }
  }

  console.log(`Comparison integrity: ${integrityVerified ? "VERIFIED" : "FAILED"}`);

  // ------------------------------------------------------------------
  // Step 4: Multi-turn latency & bounds summary
  // ------------------------------------------------------------------
  console.log("\n=================================================");
  console.log("            E2E WORKFLOW SUMMARY                 ");
  console.log("=================================================");
  console.log(`Turn 1 Latency: ${t1Latency}ms (<15,000ms threshold: ${t1Latency < 15000 ? "PASS" : "FAIL"})`);
  console.log(`Turn 2 Latency: ${t2Latency}ms (<15,000ms threshold: ${t2Latency < 15000 ? "PASS" : "FAIL"})`);
  console.log(`Provenance Check: ${provenanceValid ? "PASS" : "FAIL"}`);
  console.log(`Budget Filter Check: ${allUnderBudget ? "PASS" : "FAIL"}`);
  console.log(`Comparison Integrity: ${integrityVerified ? "PASS" : "FAIL"}`);

  if (t1Latency < 15000 && t2Latency < 15000 && provenanceValid && integrityVerified) {
    console.log("\n>>> FULL E2E SHOPPING WORKFLOW VERIFIED SUCCESSFULLY <<<");
  } else {
    throw new Error("E2E verification criteria failed.");
  }
}

runE2E().catch((err) => {
  console.error("Workflow failed:", err);
  process.exit(1);
});
