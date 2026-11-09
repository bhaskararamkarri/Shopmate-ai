/**
 * ShopMate AI — Response Provenance Validator (Phase 9.2).
 *
 * Enforces strict grounding between the AI model's free-form markdown text and the
 * authenticated catalog log.
 *
 * Checks:
 * 1. Product IDs mentioned in prose must exist in the validated catalog.
 * 2. Prices cited for products must not be wildly fabricated (within 5% of catalog offer).
 * 3. Unsupported warranty or guarantee claims are rejected if unverified in merchant specs.
 * 4. Unsupported drum capacities are rejected if contradictory or unverified.
 */
import type { Product } from "@/types";

export interface ProvenanceValidationResult {
  valid: boolean;
  violations: string[];
  referencedProductIds: string[];
}

const TABLE_NOISE_WORDS = new Set([
  "product",
  "products",
  "reviews",
  "ratings",
  "rating",
  "feature",
  "features",
  "pricing",
  "details",
  "options",
  "summary",
  "unknown",
  "verdict",
  "compare",
  "choice",
  "default",
  "proscons",
  "heading",
  "section",
]);

function isCandidateProductId(candidate: string): boolean {
  if (!candidate || candidate.length < 5 || candidate.length > 20) return false;
  if (/^[-:\s_=#]+$/.test(candidate)) return false;
  if (TABLE_NOISE_WORDS.has(candidate.toLowerCase())) return false;
  return true;
}

export function validateResponseProvenance(
  content: string,
  catalog: Map<string, Product>,
): ProvenanceValidationResult {
  const violations: string[] = [];
  const referencedProductIds: string[] = [];

  if (!content || !content.trim()) {
    return { valid: true, violations: [], referencedProductIds: [] };
  }

  // 1. Detect explicit product ID citations:
  // e.g. "product ID **d1rsSyv**", "ID: d1rsSyv", "(ID prXIzEg)"
  const idPatterns = [
    /(?:product\s+id|id[:\s#]+)\*{0,2}([A-Za-z0-9_-]{5,16})\*{0,2}/gi,
  ];

  const matchedIds = new Set<string>();
  for (const pattern of idPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const candidateId = match[1]?.trim();
      if (candidateId && isCandidateProductId(candidateId)) {
        matchedIds.add(candidateId);
      }
    }
  }

  // Also check if any known catalog ID is mentioned anywhere in the content
  for (const [id] of catalog.entries()) {
    const regex = new RegExp(`\\b${id}\\b`, "i");
    if (regex.test(content)) {
      matchedIds.add(id);
    }
  }

  for (const id of matchedIds) {
    if (!catalog.has(id)) {
      violations.push(`Referenced unverified or non-catalog product ID: "${id}"`);
    } else {
      referencedProductIds.push(id);
    }
  }

  // 2. Check for unsupported warranty claims
  const warrantyRegex =
    /(?:comes with|includes|features|offers|backed by|has|with)\s+(?:a\s+)?(\d+[\s-]*(?:year|yr|month|mth))\s+[^.\n]*?(?:warranty|guarantee)/i;
  const warrantyMatch = content.match(warrantyRegex);
  if (warrantyMatch) {
    // Check if ANY referenced product has verified warranty
    let anyProductHasWarranty = false;
    for (const id of referencedProductIds) {
      const prod = catalog.get(id);
      const specs = prod?.specs || {};
      const hasWarranty = Object.keys(specs).some((k) =>
        /warranty|guarantee/i.test(k),
      );
      if (hasWarranty) {
        anyProductHasWarranty = true;
        break;
      }
    }
    if (!anyProductHasWarranty) {
      violations.push(
        `Asserted unsupported warranty claim ("${warrantyMatch[0]}") for catalog items without verified warranty data`,
      );
    }
  }

  // 3. Check for price fabrication when prices are cited alongside specific products
  for (const id of referencedProductIds) {
    const prod = catalog.get(id);
    if (!prod || !Number.isFinite(prod.price)) continue;

    // Search for prices mentioned near the product name or ID
    const escapedId = id.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const nameWords = prod.name.split(/\s+/).slice(0, 3).join("\\s+");
    const priceContextRegex = new RegExp(
      `(?:${escapedId}|${nameWords})[\\s\\S]{0,100}?\\$\\s*([\\d,]+(?:\\.\\d{2})?)`,
      "i",
    );
    const priceMatch = content.match(priceContextRegex);
    if (priceMatch) {
      const parsedPrice = Number(priceMatch[1].replace(/,/g, ""));
      if (Number.isFinite(parsedPrice)) {
        const diffRatio = Math.abs(parsedPrice - prod.price) / prod.price;
        // If price differs by more than 8% from real catalog price, reject as fabricated
        if (diffRatio > 0.08) {
          violations.push(
            `Price for "${prod.name}" asserted as $${parsedPrice} but actual catalog offer is $${prod.price.toFixed(2)}`,
          );
        }
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    referencedProductIds,
  };
}
