/**
 * ShopMate AI — Response Provenance Validator (Phase 9.2 & Phase 9.4).
 *
 * Enforces strict grounding between the AI model's free-form markdown text and the
 * authenticated catalog log.
 *
 * Checks:
 * 1. Product IDs mentioned in prose must exist in the validated catalog.
 * 2. Prices cited for products must not be wildly fabricated (within 8% of catalog offer).
 * 3. Unsupported warranty or guarantee claims are rejected if unverified in merchant specs.
 * 4. Capacity claims are validated against verified catalog capacity:
 *    - Normalized units (kg, lbs) are compared with 3% tolerance.
 *    - Unrelated units (volume cu_ft vs weight kg/lbs) are not falsely compared.
 *    - Asserting specific numerical capacity when catalog capacity is unknown is rejected.
 * 5. Feature claims asserted as confirmed facts must be grounded in product specs,
 *    key features, or description. Unsupported technical features trigger fallback.
 */
import type { Product } from "@/types";
import {
  extractApplianceCapacity,
  parseCapacityString,
  type CapacitySpec,
} from "@/lib/catalog/normalize";

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
  "design",
  "brand",
  "model",
  "price",
  "capacity",
  "warranty",
  "specs",
  "specification",
  "specifications",
]);

function isCandidateProductId(candidate: string): boolean {
  if (!candidate || candidate.length < 5 || candidate.length > 20) return false;
  if (/^[-:\s_=#]+$/.test(candidate)) return false;
  if (TABLE_NOISE_WORDS.has(candidate.toLowerCase())) return false;
  return true;
}

/**
 * Extracts the relevant context segment for a product from the markdown text.
 * When multiple products are discussed, partitions by line/list/section to prevent
 * cross-product attribution.
 */
function getProductContext(
  content: string,
  productId: string,
  allProductIds: string[],
): string {
  if (allProductIds.length <= 1) {
    return content;
  }

  const otherIds = allProductIds.filter((id) => id !== productId);
  const lines = content.split("\n");
  const relevantLines: string[] = [];

  let isCurrentProductBlock = false;
  for (const line of lines) {
    const hasThisId = line.includes(productId);
    const hasOtherId = otherIds.some((other) => line.includes(other));

    if (hasThisId && !hasOtherId) {
      isCurrentProductBlock = true;
      relevantLines.push(line);
    } else if (hasOtherId) {
      isCurrentProductBlock = false;
    } else if (isCurrentProductBlock) {
      // Continuation line (e.g. nested bullet or paragraph) until next blank line or header
      if (line.trim().startsWith("#") || line.trim().startsWith("---")) {
        isCurrentProductBlock = false;
      } else {
        relevantLines.push(line);
      }
    }
  }

  if (relevantLines.length > 0) {
    return relevantLines.join("\n");
  }

  // Fallback: character window around productId
  const idx = content.indexOf(productId);
  if (idx !== -1) {
    const start = Math.max(0, idx - 200);
    const end = Math.min(content.length, idx + 200);
    return content.slice(start, end);
  }

  return content;
}

/**
 * Extracts a claimed capacity from text, prioritizing qualified phrases like
 * "8 kg capacity" or "3.0 cu. ft. capacity" over standalone unit mentions.
 */
function extractClaimedCapacity(text: string): CapacitySpec | null {
  const qualifiedAfterMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(cu\.?\s*ft\.?|cubic\s*f(?:ee|oo)t|kg|kilograms?|lbs?|pounds?)\s*(?:capacity|load|drum|tub)\b/i,
  );
  if (qualifiedAfterMatch) {
    return parseCapacityString(qualifiedAfterMatch[0]);
  }

  const qualifiedBeforeMatch = text.match(
    /(?:capacity|load|drum|tub)\s*(?:of|is|:)?\s*(\d+(?:\.\d+)?)\s*(cu\.?\s*ft\.?|cubic\s*f(?:ee|oo)t|kg|kilograms?|lbs?|pounds?)\b/i,
  );
  if (qualifiedBeforeMatch) {
    return parseCapacityString(qualifiedBeforeMatch[0]);
  }

  return parseCapacityString(text);
}

const FEATURE_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "with",
  "and",
  "or",
  "for",
  "in",
  "of",
  "to",
  "function",
  "program",
  "technology",
  "system",
  "feature",
  "features",
  "built-in",
  "builtin",
  "motor",
]);

const GENERIC_DESCRIPTORS = new Set([
  "quiet",
  "operation",
  "performance",
  "design",
  "high",
  "quality",
  "clean",
  "cleaning",
  "wash",
  "washing",
  "laundry",
  "cycle",
  "cycles",
  "convenience",
  "style",
  "reliable",
  "durability",
  "simple",
  "easy",
  "use",
  "standard",
  "normal",
  "daily",
  "peace",
  "mind",
  "peace of mind",
  "great",
  "choice",
  "option",
  "options",
]);

/**
 * Extracts candidate feature assertions associated with a product.
 * Filters out price, warranty, capacity, and conversational table noise.
 * Does not prematurely truncate decimal numbers (e.g. 17.6 lbs, 3.0 cu ft).
 */
function extractCandidateFeatures(text: string): string[] {
  const candidates: string[] = [];
  const triggerRegex =
    /\b(?:features?|is equipped with|equipped with|comes with|includes?|has built-in|has a built-in|built-in)\s+(?:a\s+|an\s+|the\s+)?/gi;

  let match: RegExpExecArray | null;
  while ((match = triggerRegex.exec(text)) !== null) {
    const afterTrigger = text.slice(match.index + match[0].length);
    // Find the end of this clause/sentence (period followed by space/end, semicolon, colon, or newline)
    const endMatch = afterTrigger.match(/(?:\.(?:\s+|$)|[;:\n])/);
    const clause = (
      endMatch && endMatch.index !== undefined
        ? afterTrigger.slice(0, endMatch.index)
        : afterTrigger
    ).trim();

    if (!clause) continue;

    // Split on ' and ' or comma not between digits (e.g. "built-in microwave and laser drying sensor")
    const parts = clause.split(/\s+and\s+|,(?!\d)\s*/i);
    for (let part of parts) {
      part = part.trim();
      // Remove trailing purpose/benefit clauses (e.g. "for quiet operation", "for convenience")
      part = part.replace(/\s+for\s+.*$/i, "").trim();
      // Remove leading articles or qualifiers
      part = part.replace(/^(?:a|an|the|approximately|approx\.?)\s+/i, "").trim();

      // Skip warranty claims (handled by warranty validator)
      if (/warranty|guarantee/i.test(part)) continue;
      // Skip price claims
      if (/[$€£]|usd|price|cost/i.test(part)) continue;
      // Skip capacity claims (handled by capacity validator)
      if (/cu\.?\s*ft|cubic\s*f|kg|kilogram|lbs?|pound|capacity|load/i.test(part)) continue;
      // Skip markdown and conversational noise words
      if (/following|table|below|above|details|notes|specifications|options|products|ratings?|reviews?/i.test(part)) continue;

      if (part.length >= 3) {
        candidates.push(part);
      }
    }
  }

  return candidates;
}

/** Builds an exhaustive text corpus of verified catalog facts for a product. */
function buildCatalogKnowledgeCorpus(prod: Product): string {
  const parts: string[] = [
    prod.name || "",
    prod.description || "",
    prod.category || "",
    prod.brand || "",
  ];

  if (prod.specs) {
    for (const [k, v] of Object.entries(prod.specs)) {
      parts.push(k);
      parts.push(String(v));
    }
  }

  const raw = prod as unknown as Record<string, unknown>;
  if (Array.isArray(raw.key_features)) {
    for (const feat of raw.key_features) {
      if (typeof feat === "string") parts.push(feat);
    }
  }
  if (typeof raw.structured_attributes === "object" && raw.structured_attributes !== null) {
    for (const [k, v] of Object.entries(raw.structured_attributes as Record<string, unknown>)) {
      parts.push(k);
      if (Array.isArray(v)) {
        for (const item of v) if (typeof item === "string") parts.push(item);
      }
    }
  }

  return parts.join(" ").toLowerCase();
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

  // 4. Capacity Claim Validation (Phase 9.4)
  for (const id of referencedProductIds) {
    const prod = catalog.get(id);
    if (!prod) continue;

    const prodContext = getProductContext(content, id, referencedProductIds);
    const claimedCapacity = extractClaimedCapacity(prodContext);

    if (claimedCapacity) {
      const catalogCapacity = extractApplianceCapacity(prod);

      // Requirement 5: Never invent capacity when catalog capacity is unknown
      if (!catalogCapacity) {
        violations.push(
          `Asserted capacity claim ("${claimedCapacity.raw}") for "${prod.name}" but catalog capacity is unknown in catalog records`,
        );
      } else {
        // Requirement 6: Do not compare unrelated units such as drum weight and volume
        const isClaimedVolume = claimedCapacity.unit === "cu_ft";
        const isCatalogVolume = catalogCapacity.unit === "cu_ft";

        if (isClaimedVolume === isCatalogVolume) {
          // Comparable units (both volume, or both weight)
          if (isClaimedVolume) {
            // Volume comparison (cu_ft)
            const diff = Math.abs(claimedCapacity.value - catalogCapacity.value);
            if (diff > 0.1) {
              violations.push(
                `Capacity for "${prod.name}" asserted as ${claimedCapacity.raw} but actual catalog capacity is ${catalogCapacity.normalizedDisplay}`,
              );
            }
          } else {
            // Weight comparison: normalize to kg
            const claimedKg =
              claimedCapacity.unit === "lbs"
                ? claimedCapacity.value / 2.20462
                : claimedCapacity.value;
            const catalogKg =
              catalogCapacity.unit === "lbs"
                ? catalogCapacity.value / 2.20462
                : catalogCapacity.value;

            // Use relative tolerance of 3% for unit conversion rounding (e.g. 17.6 lbs vs 8 kg)
            // Strictly reject discrepancies like 8 kg vs 9 kg (12.5%) or 20 kg vs 8 kg (150%)
            const diffRatio = Math.abs(claimedKg - catalogKg) / catalogKg;
            if (diffRatio > 0.03) {
              violations.push(
                `Capacity for "${prod.name}" asserted as ${claimedCapacity.raw} but actual catalog capacity is ${catalogCapacity.normalizedDisplay}`,
              );
            }
          }
        }
      }
    }
  }

  // 5. Feature Claim Grounding (Phase 9.4)
  for (const id of referencedProductIds) {
    const prod = catalog.get(id);
    if (!prod) continue;

    const prodContext = getProductContext(content, id, referencedProductIds);
    const candidateFeatures = extractCandidateFeatures(prodContext);
    if (candidateFeatures.length === 0) continue;

    const corpus = buildCatalogKnowledgeCorpus(prod);

    for (const feat of candidateFeatures) {
      // Extract substantive tokens (exclude stopwords and generic descriptors)
      const tokens = feat
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/[\s-]+/)
        .filter((w) => w.length > 2 && !FEATURE_STOPWORDS.has(w));

      const substantiveTokens = tokens.filter((w) => !GENERIC_DESCRIPTORS.has(w));

      // If there are no substantive tokens (e.g. only generic descriptors like "quiet operation"),
      // skip checking as it's not a specific technical feature claim
      if (substantiveTokens.length === 0) continue;

      // Check if all substantive tokens are present in the catalog corpus
      const missingTokens = substantiveTokens.filter((token) => !corpus.includes(token));

      if (missingTokens.length > 0) {
        violations.push(
          `Asserted unverified feature ("${feat}") for "${prod.name}" not supported in catalog records`,
        );
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    referencedProductIds,
  };
}
