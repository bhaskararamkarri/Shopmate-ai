export {};
import { validateResponseProvenance } from "../src/lib/agent/provenance-validator";
import { assembleTurn } from "../src/lib/agent/agent";
import { emptyIntent } from "../src/lib/agent/intent";
import type { Product } from "../src/types";

function createCatalog() {
  const p1: Product = {
    id: "vWOKnu4",
    name: "WAN28218IT Series 4 Front-load Washing Machine",
    description: "Bosch washing machine with 8 kg capacity and EcoSilence Drive.",
    price: 1193.44,
    currency: "USD",
    availability: "in_stock",
    images: ["https://example.com/bosch.jpg"],
    ratings: 0,
    reviews: 0,
    merchant: "shop.mohd.it",
    category: "Washing Machines",
    brand: "Bosch",
    specs: {
      Capacity: "8 kg",
      "Spin Speed": "1400 rpm",
    }, // NO warranty listed
    source: "channel3",
  };

  const catalog = new Map<string, Product>();
  catalog.set(p1.id, p1);
  return { catalog, p1 };
}

async function testAdversarialPayloads() {
  console.log("=================================================");
  console.log("   Audit 2: Adversarial Provenance Test Suite    ");
  console.log("=================================================\n");

  const { catalog } = createCatalog();

  // Adversarial Test 1: Correct product ID but fabricated capacity
  console.log("Test 2.1: Correct ID (vWOKnu4) but fabricated capacity (claiming 20 kg instead of 8 kg)");
  const textCapacity = "The Bosch Series 4 (ID: **vWOKnu4**) has an enormous 20 kg drum capacity suitable for commercial hotels.";
  const resCapacity = validateResponseProvenance(textCapacity, catalog);
  console.log(`- Valid: ${resCapacity.valid}`);
  console.log(`- Violations detected:`, resCapacity.violations);
  console.log(`- Was it rejected? ${!resCapacity.valid ? "YES" : "NO (Passed as unrestricted LLM prose!)"}`);

  // Adversarial Test 2: Correct product ID but fabricated warranty
  console.log("\nTest 2.2: Correct ID (vWOKnu4) but fabricated warranty (claiming 10-year warranty when unlisted)");
  const textWarranty = "The Bosch Series 4 (ID: **vWOKnu4**) comes with a 10-year comprehensive warranty on all parts.";
  const resWarranty = validateResponseProvenance(textWarranty, catalog);
  console.log(`- Valid: ${resWarranty.valid}`);
  console.log(`- Violations detected:`, resWarranty.violations);
  console.log(`- Was it rejected? ${!resWarranty.valid ? "YES" : "NO"}`);

  // Adversarial Test 3: Correct product ID but incorrect price
  console.log("\nTest 2.3: Correct ID (vWOKnu4) but incorrect price (claiming $299 instead of $1193.44)");
  const textPrice = "The Bosch Series 4 (ID: **vWOKnu4**) is currently available for only $299.00!";
  const resPrice = validateResponseProvenance(textPrice, catalog);
  console.log(`- Valid: ${resPrice.valid}`);
  console.log(`- Violations detected:`, resPrice.violations);
  console.log(`- Was it rejected? ${!resPrice.valid ? "YES" : "NO"}`);

  // Adversarial Test 4: Correct product ID but fabricated feature
  console.log("\nTest 2.4: Correct ID (vWOKnu4) but fabricated feature (claiming built-in microwave / laser drying)");
  const textFeature = "The Bosch Series 4 (ID: **vWOKnu4**) features a built-in microwave oven and laser drying sensor.";
  const resFeature = validateResponseProvenance(textFeature, catalog);
  console.log(`- Valid: ${resFeature.valid}`);
  console.log(`- Violations detected:`, resFeature.violations);
  console.log(`- Was it rejected? ${!resFeature.valid ? "YES" : "NO (Passed as unrestricted LLM prose!)"}`);

  // Adversarial Test 5: Product not present in validated catalog
  console.log("\nTest 2.5: Product NOT present in validated catalog (citing phantom ID phantom999)");
  const textPhantom = "I highly recommend the SuperWasher (Product ID: **phantom999**) for your family.";
  const resPhantom = validateResponseProvenance(textPhantom, catalog);
  console.log(`- Valid: ${resPhantom.valid}`);
  console.log(`- Violations detected:`, resPhantom.violations);
  console.log(`- Was it rejected? ${!resPhantom.valid ? "YES" : "NO"}`);

  // Test assembleTurn replacement behavior when validation fails
  console.log("\nTest 2.6: Verify assembleTurn fallback replacement when validation fails");
  const turnOutput = assembleTurn({
    content: textPhantom,
    intent: emptyIntent(),
    catalogLog: catalog,
    recommendedIds: [],
    comparisons: [],
    catalogMeta: { source: "channel3" },
    toolsUsed: ["searchProducts"],
    query: "washing machine",
    mode: "ai",
  });
  console.log("- assembleTurn content replaced with deterministic summary:", !turnOutput.content.includes("phantom999"));
  console.log("- assembleTurn content preview:", turnOutput.content.slice(0, 160));
}

testAdversarialPayloads().catch(console.error);

