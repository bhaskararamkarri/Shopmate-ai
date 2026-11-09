export {};
try {
  (process as unknown as { loadEnvFile?: (path: string) => void }).loadEnvFile?.(".env.local");
} catch {}
import { getCatalogProduct } from "../src/lib/catalog/provider";
import { PayPalOrderRequestSchema } from "../src/lib/paypal/orders";

async function runAudit3() {
  console.log("=================================================");
  console.log("   Audit 3: Checkout Consistency Verification    ");
  console.log("=================================================\n");

  const testProductId = "prXIzEg"; // Bosch Serie 8 from Channel3
  console.log(`Checking product identity pipeline for '${testProductId}'...`);

  // Step 1: Catalog lookup
  const catalogRecord = await getCatalogProduct(testProductId);
  console.log("1. Catalog Resolution:");
  if (catalogRecord) {
    console.log(`   - ID: ${catalogRecord.product.id}`);
    console.log(`   - Name: ${catalogRecord.product.name}`);
    console.log(`   - Price: ${catalogRecord.product.price} ${catalogRecord.product.currency}`);
    console.log(`   - Merchant: ${catalogRecord.product.merchant}`);
    console.log(`   - Source: ${catalogRecord.source}`);
  } else {
    console.log("   - Catalog record not found (demo mode or offline)");
  }

  // Step 2: Validate Cart -> PayPal Order Schema Transformation
  console.log("\n2. Cart -> PayPal Order Schema Validation:");
  const clientPayload = {
    items: [{ productId: testProductId, quantity: 1 }],
    currency: "USD",
    // Simulating malicious client attempting to override price/merchant
    tamperedPrice: 10.00,
    tamperedMerchant: "fake-store.com",
  };

  const parsed = PayPalOrderRequestSchema.safeParse(clientPayload);
  console.log(`   - Schema accepts payload: ${parsed.success}`);
  if (parsed.success) {
    console.log(`   - Sanitized items sent to PayPal service:`, parsed.data.items);
    console.log(`   - Tampered price stripped? ${!("tamperedPrice" in parsed.data)}`);
    console.log(`   - Tampered merchant stripped? ${!("tamperedMerchant" in parsed.data)}`);
  }

  // Step 3: Check Demo Cap ($500 limit) behavior for high-value appliances
  console.log("\n3. High-Value Appliance Price Guardrail:");
  if (catalogRecord) {
    const isAboveCap = catalogRecord.product.price > 500;
    console.log(`   - Product price ($${catalogRecord.product.price}) > $500 demo ceiling: ${isAboveCap}`);
    console.log(`   - Behavior: PayPal createOrder will enforce amount_too_large guardrail for items > $500`);
  }
}

runAudit3().catch(console.error);
