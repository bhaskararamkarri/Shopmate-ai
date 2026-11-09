# Phase 9.2: Conversation Context Integrity & Product Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure 100% provenance and cross-turn integrity between the AI assistant's conversational prose and the UI shortlist cards, normalize appliance capacities, validate model claims against verified catalog records, and prevent product desynchronization across multi-turn conversations.

**Architecture:** 
1. **Capacity Normalizer:** Extracts, verifies, and standardizes appliance drum capacities across `structured_attributes`, `title`, `key_features`, and `description` in `src/lib/catalog/normalize.ts`.
2. **Server-Validated Conversation Product Context:** Bounded server-side conversation store keyed by `conversationId`, combined with client-passed historical product IDs that are strictly re-verified against trusted cache or Channel3 before use.
3. **Response Provenance Validator:** Intercepts model markdown text before turn assembly; checks product IDs, prices, and specs against active catalog records; reverts to deterministic grounded synthesis if any hallucination or unsupported claim is detected.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Vercel AI SDK (`ai`), Zod, Channel3 Product API, Vitest.

**Spec:** Phase 9.1 Forensic Audit findings and Phase 9.2 Prompt requirements.

## Global Constraints
- Deployment target: Vercel Preview only. Never promote to Production.
- Security: Never log, expose, echo, or commit API keys, tokens, or authorization headers.
- Integrity: Never trust client-provided product names, prices, or specs without catalog re-verification.
- Bounded Execution: All tool loops bounded by `MAX_STEPS = 5`, total per-turn timeouts, and rate limits.

## Review Focus
1. Multi-turn context desync: A user asking "which one is best?" after browsing washing machines must see the exact discussed machines in both assistant prose and UI cards.
2. Forged client IDs: If a malicious client sends forged product IDs in `history` or `contextProductIds`, the server must re-fetch and drop unverified IDs rather than trusting them.
3. Capacity unit precision: 8 kg, 17.6 lbs, and 3.0 cu. ft. must never be conflated without proper unit tags and conversions.
4. Hallucinated price/warranty claims: If an LLM claims a product has a 5-year warranty or costs $200 when catalog says $1,500, response provenance validation must intercept and substitute a grounded deterministic summary.
5. Missing capacity fallback: Ambiguous or missing capacity must remain explicitly labeled `UNKNOWN`.

---

### Task 1: Capacity Normalization (`src/lib/catalog/normalize.ts`)

**Files:**
- Modify: `src/lib/catalog/normalize.ts`
- Test: `tests/capacity-normalization.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CapacitySpec {
    value: number;
    unit: "kg" | "lbs" | "cu_ft";
    raw: string;
    normalizedKg?: number;
  }
  export function extractApplianceCapacity(product: {
    category?: string;
    name?: string;
    title?: string;
    description?: string;
    key_features?: string[];
    structured_attributes?: Record<string, unknown>;
    specs?: Record<string, string>;
  }): CapacitySpec | null;
  ```

- [ ] **Step 1: Write failing tests in `tests/capacity-normalization.test.ts`**
  - Test Samsung QuickDrive title `Ai Control QuickDrive™ WW80T854ABT - Washing Machine 8 Kg` -> `{ value: 8, unit: 'kg' }`
  - Test Bosch Serie 8 title and description `features a 9 kg capacity` -> `{ value: 9, unit: 'kg' }`
  - Test Bosch Series 4 description `with an 8 kg capacity` -> `{ value: 8, unit: 'kg' }`
  - Test Black & Decker `3.0 Cu. Ft` / `26.5 lbs` -> `{ value: 3.0, unit: 'cu_ft' }` or explicit lbs.
  - Test missing capacity returns `null` (remains UNKNOWN).
  - Test non-appliance (e.g. headphones) returns `null`.

- [ ] **Step 2: Run test to verify failure**
  Run: `npm test tests/capacity-normalization.test.ts`
  Expected: FAIL (module not defined / functions missing)

- [ ] **Step 3: Implement `extractApplianceCapacity` in `src/lib/catalog/normalize.ts`**
  - Gate on appliance categories (`washing`, `washer`, `dryer`, `laundry`).
  - Scan `structured_attributes`, `key_features`, `title`, and `description` in priority order.
  - Distinguish kg, lbs, cu. ft.; preserve raw string.
  - Attach normalized `Capacity` and `Capacity Details` to `specs`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test tests/capacity-normalization.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/catalog/normalize.ts tests/capacity-normalization.test.ts
  git commit -m "feat(catalog): add rigorous appliance capacity normalization"
  ```

---

### Task 2: Decision Engine & International Disclosures Integration

**Files:**
- Modify: `src/lib/agent/decision-engine.ts`
- Modify: `src/lib/agent/instructions.ts`
- Test: `tests/decision-engine-capacity.test.ts`

**Interfaces:**
- Consumes: `extractApplianceCapacity` from `src/lib/catalog/normalize.ts`
- Produces: Updated `evaluateFailures` and `generateRecommendations` that inspect normalized capacity rather than purely unlisted spec keys.

- [ ] **Step 1: Write failing test in `tests/decision-engine-capacity.test.ts`**
  - Verify that a washer with 8kg or 9kg capacity extracted from title/description does NOT get flagged with `"Washing load capacity is unknown"`.
  - Verify that portable washers (< 6kg or < 15 lbs) or unlisted capacity washers are flagged as unverified for family of 4.
  - Verify that international merchant listings (e.g. `shop.mohd.it`) disclose international shipping and unverified warranty.

- [ ] **Step 2: Run test to verify failure**
  Run: `npm test tests/decision-engine-capacity.test.ts`
  Expected: FAIL

- [ ] **Step 3: Update `src/lib/agent/decision-engine.ts` & `src/lib/agent/instructions.ts`**
  - In `evaluateFailures`, check `extractApplianceCapacity(product)`:
    - If `capacity.unit === 'kg' && capacity.value >= 7.5`: satisfied for family of 4.
    - If `capacity.unit === 'lbs' && capacity.value >= 16`: satisfied for family of 4.
    - If `capacity.unit === 'cu_ft' && capacity.value >= 4.0`: satisfied for family of 4.
    - If portable/compact or no capacity found: flag failure.
  - In `instructions.ts`, add prompt instructions for international merchant disclosures.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test tests/decision-engine-capacity.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/agent/decision-engine.ts src/lib/agent/instructions.ts tests/decision-engine-capacity.test.ts
  git commit -m "feat(agent): integrate normalized capacity and international disclosures in decision engine"
  ```

---

### Task 3: Server-Validated Conversation Product Context

**Files:**
- Create: `src/lib/agent/conversation-context.ts`
- Modify: `src/lib/agent/chat-contract.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/lib/agent/agent.ts`
- Modify: `src/lib/chat-api.ts`
- Modify: `src/components/chat/chat-client.tsx`
- Test: `tests/conversation-context.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ConversationContextStore {
    getProducts(conversationId: string): Map<string, Product>;
    setProducts(conversationId: string, products: Product[]): void;
    resolveContextProducts(
      conversationId: string,
      clientProductIds: string[],
      catalog: AgentCatalog,
    ): Promise<{
      trustedProducts: Map<string, Product>;
      missingIds: string[];
    }>;
  }
  ```

- [ ] **Step 1: Write failing test in `tests/conversation-context.test.ts`**
  - Test storing products in conversation context and retrieving them in subsequent turns.
  - Test client passing product IDs: trusted server products returned immediately; unknown IDs re-fetched from catalog; non-existent/forged IDs rejected into `missingIds`.
  - Test multi-turn product preservation: Turn 1 products remain present in Turn 3 context.

- [ ] **Step 2: Run test to verify failure**
  Run: `npm test tests/conversation-context.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement `conversation-context.ts` and wire into `/api/chat` and `agent.ts`**
  - Implement bounded LRU memory store with TTL for active conversations.
  - Extend `ChatRequestSchema` to accept optional `contextProductIds: z.array(z.string()).max(24).optional()`.
  - In `runAgentTurn`, resolve context products before running the model loop.
  - Pre-seed `ctx.catalogLog` with verified context products so the model and ranking engine have continuous awareness.
  - If the user asks a comparative question ("which one is best?"), prioritize evaluating existing context products.
  - Update `chat-client.tsx` and `chat-api.ts` to transmit recently shortlisted product IDs with requests.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test tests/conversation-context.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/agent/conversation-context.ts src/lib/agent/chat-contract.ts src/app/api/chat/route.ts src/lib/agent/agent.ts src/lib/chat-api.ts src/components/chat/chat-client.tsx tests/conversation-context.test.ts
  git commit -m "feat(agent): implement server-validated conversation product context"
  ```

---

### Task 4: AI Response Provenance Validation

**Files:**
- Create: `src/lib/agent/provenance-validator.ts`
- Modify: `src/lib/agent/agent.ts`
- Test: `tests/provenance-validator.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ProvenanceValidationResult {
    valid: boolean;
    violations: string[];
    referencedProductIds: string[];
  }
  export function validateResponseProvenance(
    content: string,
    catalogLog: Map<string, Product>,
  ): ProvenanceValidationResult;
  ```

- [ ] **Step 1: Write failing test in `tests/provenance-validator.test.ts`**
  - Test valid text referencing real catalog products -> `valid: true`.
  - Test text referencing fabricated product ID (e.g. `xyz9999`) -> `valid: false`.
  - Test text claiming unsupported warranty when catalog has none -> `valid: false`.
  - Test text asserting drastically inaccurate price -> `valid: false`.
  - Test `agent.ts` falling back to `synthesizeDeterministicSummary()` when validation fails.

- [ ] **Step 2: Run test to verify failure**
  Run: `npm test tests/provenance-validator.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement `provenance-validator.ts` and integrate into `assembleTurn` in `agent.ts`**
  - Scan for product IDs and verify against `catalogLog`.
  - Check price statements for referenced products within acceptable rounding bounds.
  - Flag fabricated warranty claims when unlisted in merchant data.
  - If validation fails, log the exact violation and invoke `synthesizeDeterministicSummary()`.
  - Ensure referenced product IDs are promoted to `recommendedIds` so `products` in UI matches the discussed products.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test tests/provenance-validator.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/agent/provenance-validator.ts src/lib/agent/agent.ts tests/provenance-validator.test.ts
  git commit -m "feat(agent): add AI response provenance validation against verified catalog"
  ```

---

### Task 5: Comprehensive Regression Test Suite (Scenarios A through L)

**Files:**
- Create: `tests/phase9-2-regression.test.ts`

**Interfaces:**
- Exercises end-to-end integration across all requirements:
  - **A:** Product from Turn 1 remains available in Turn 3.
  - **B:** Assistant text product IDs match shortlist product IDs.
  - **C:** Compare uses the exact displayed product IDs.
  - **D:** Add to Cart uses the exact selected product ID.
  - **E:** Forged client product IDs are rejected or revalidated.
  - **F:** Product unavailable on re-fetch is disclosed.
  - **G:** Unsupported product names/prices are not accepted as verified facts.
  - **H:** Samsung 8kg title is normalized correctly.
  - **I:** Bosch 9kg description is normalized correctly.
  - **J:** Missing capacity remains UNKNOWN.
  - **K:** Ambiguous capacity remains UNKNOWN.
  - **L:** USD prices never qualify as INR budget-compatible.

- [ ] **Step 1: Write all 12 regression tests in `tests/phase9-2-regression.test.ts`**
- [ ] **Step 2: Run test suite**
  Run: `npm test tests/phase9-2-regression.test.ts`
  Expected: All 12 tests PASS
- [ ] **Step 3: Commit**
  ```bash
  git add tests/phase9-2-regression.test.ts
  git commit -m "test(agent): add comprehensive Phase 9.2 regression test suite"
  ```

---

### Task 6: Full Verification Suite

- [ ] **Step 1: Run full Vitest test suite**
  Run: `npm test`
  Expected: All test suites pass (457+ tests)
- [ ] **Step 2: Run TypeScript typecheck**
  Run: `npx tsc --noEmit`
  Expected: 0 errors
- [ ] **Step 3: Run ESLint**
  Run: `npm run lint`
  Expected: 0 errors, 0 warnings
- [ ] **Step 4: Run local Turbopack build**
  Run: `npm run build`
  Expected: Clean compilation across all 14 routes

---

### Task 7: Vercel Preview Deployment & Live Verification

- [ ] **Step 1: Push verified commits to `origin/main`**
- [ ] **Step 2: Deploy to Vercel Preview (never production)**
- [ ] **Step 3: Run live multi-turn verification on Preview URL**
  - Turn 1: "Find washing machines for a family of 4."
  - Turn 2: "Show me washing machines under ₹30,000."
  - Turn 3: "Which one is best for a family of 4?"
  - Turn 4: "Compare the Bosch and Samsung options you showed earlier."
- [ ] **Step 4: Verify product ID consistency between assistant text and shortlist cards**
- [ ] **Step 5: Test Compare and Add to Cart on the exact product IDs**
- [ ] **Step 6: Document results and compile final Phase 9.2 report**

