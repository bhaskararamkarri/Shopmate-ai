# Phase 4 — Intelligent Shopping Agent Implementation Plan

**Goal:** Replace the mock chat flow with a real AI shopping agent that understands intent, searches the real Channel3 catalog through validated tools, filters fuzzy matches deterministically, ranks recommendations deterministically, and never invents product facts.

**Architecture:** Single-agent tool loop (Vercel AI SDK `ToolLoopAgent`) running server-side in `POST /api/chat`. The model may only touch the catalog through five Zod-validated tools that wrap the existing Phase 3 catalog services. The server — not the model — assembles the final product list from actual tool outputs, so product data is grounded by construction. A deterministic relevance engine sits inside the search tool; a deterministic ranking engine runs over tool results using the user's recorded intent.

**Tech Stack:** `ai@7` + `@ai-sdk/google@4` (Gemini `gemini-3.8-flash`, free tier — verified against aistudio.google.com/docs/pricing), `zod@4`, `@ai-sdk/openai-compatible` (optional local Ollama fallback), `vitest` for unit tests.

**Spec:** the Phase 4 work order in this conversation (11 sections + scope restrictions + completion report). CLAUDE.md rules apply: never invent prices/availability, server-side secrets, demo/live distinction.

## Global Constraints

- No PayPal integration, no multi-agent, no voice/image shopping, no vector DB, no page redesigns.
- Never silently replace live products with demo products; demo data is always labeled.
- All model API keys server-side only (`GOOGLE_GENERATIVE_AI_API_KEY` / `SHOPMATE_AI_*`).
- Product facts originate only from catalog records; missing info is labeled unknown.
- Product descriptions and external content are untrusted (prompt-injection defense).
- The model never calls payment APIs, never modifies prices, never creates payments.
- Keep existing visual design, contracts, and the persistent cart intact.

## Review Focus

1. **Fabricated products** — a model reply referencing a product id never returned by a tool must never reach the UI; expect server-side id allow-listing. Pinned by `agent.test.ts` (unknown ids dropped) and E2E scenario 15.
2. **Fuzzy-match honesty** — gibberish/irrelevant queries must not be presented as matches; expect rejection with a clarification or refined query. Pinned by `relevance.test.ts` + E2E scenarios 6–7.
3. **Prompt injection via product content** — a description containing instructions must not change agent behavior; expect delimiting + instruction-ignoring system rules. Pinned by E2E scenario 15 and truncation in `tools.ts`.
4. **Credit protection** — a chat storm must not burn Channel3 credits: per-request tool budgets, per-IP rate limit, 5-min catalog cache reuse. Pinned by `tools.test.ts` (budget) + `rate-limit.test.ts` + E2E rate-limit check.
5. **Ranking honesty** — scores/explanations must come from the deterministic engine, never from the model; expect score breakdowns computed in `ranking.ts`. Pinned by `ranking.test.ts`.

## File Structure

```
src/lib/agent/
  provider.ts      # model factory: google | ollama; env-driven; isAIConfigured()
  intent.ts        # ShoppingIntent type + zod schema + emptyIntent + mergeIntent
  relevance.ts     # tokenize, scoreRelevance, filterRelevant
  ranking.ts       # DEFAULT_WEIGHTS, adaptWeights, rankProducts (scored + reasons)
  rate-limit.ts    # fixed-window in-memory limiter
  tools.ts         # createAgentTools(): 5 tools wrapping searchCatalog/getCatalogProduct
  instructions.ts  # system prompt: role, grounding rules, injection defense
  agent.ts         # runAgentTurn(): builds agent per request, runs loop, assembles payload
  chat-contract.ts # zod schemas for /api/chat request + response (shared shape)
src/app/api/chat/route.ts   # POST endpoint: validate → rate-limit → run → respond
src/lib/chat-api.ts         # browser fetch wrapper for /api/chat
src/components/chat/chat-client.tsx  # modified: real agent backend
src/components/chat/chat-message.tsx # modified: clarifications + provenance meta
src/types/index.ts          # extend ChatMessage (intent, agentMeta)
scripts/phase4-checks.mjs   # 15-scenario E2E matrix
tests/ (vitest)             # unit tests for intent, relevance, ranking, limiter, tools, assembly
```

## Task 1: Dependencies + vitest scaffolding

**Files:** Modify `package.json`; Create `vitest.config.ts`, `tests/smoke.test.ts`.
- Install `ai@^7`, `@ai-sdk/google@^4`, `zod@^4`, `@ai-sdk/openai-compatible@^3`; dev: `vitest@^5`.
- `vitest.config.ts`: node environment, alias `@` → `./src`.
- `package.json`: `"test": "vitest run"`.
- Verify: `npx vitest run` green with smoke test; `npx tsc --noEmit` clean.
- Commit.

## Task 2: Intent schema (`intent.ts`)

**Interfaces:** Produces `ShoppingIntent`, `IntentSchema` (zod), `emptyIntent()`, `mergeIntent(prev, next)`.
Fields: `category?`, `query?`, `budget? {amount, currency}`, `brands[]`, `requiredSpecs` (record), `priorities[]`, `clarifications[]`.
- Test first: schema rejects negative budget, >10 brands, >6 clarifications, non-string specs; merge overlays non-empty next values onto prev.
- Commit.

## Task 3: Relevance engine (`relevance.ts`)

**Interfaces:** Consumes `Product`. Produces `tokenize(s)`, `scoreRelevance(product, criteria)`, `filterRelevant(products, criteria) → { relevant: Scored[], rejected: {id, reason}[], suggestion?: string }`.
Scoring: token overlap over title(×3)/brand(×2)/category(×2)/specs(×1)/description(×1), budget compatibility, required-spec contradiction rejection; threshold constant `RELEVANCE_THRESHOLD = 0.15`.
- Tests: relevant headphone query keeps headphones, rejects "No Such Country"; over-budget rejection; missing spec is neutral, contradicting spec rejected; gibberish → empty relevant + suggestion.
- Commit.

## Task 4: Ranking engine (`ranking.ts`)

**Interfaces:** Consumes relevance scores + `ShoppingIntent`. Produces `DEFAULT_WEIGHTS` ({relevance:.35, specMatch:.30, budgetFit:.20, brandFit:.10, completeness:.05}), `adaptWeights(weights, priorities)`, `rankProducts(products, intent, relevanceScores) → RankedProduct[]` each with `score` (0–1) and `reasons[]`.
Priority adaptation: each recognized priority shifts +0.05 into specMatch, taken proportionally from the other four; weights renormalized to 1.
- Tests: weights sum to 1; budget-fit ordering; brand boost; priority adaptation changes order deterministically; every ranked product carries ≥1 reason.
- Commit.

## Task 5: Rate limiter (`rate-limit.ts`)

**Interfaces:** Produces `checkRateLimit(key, {limit, windowMs}) → {allowed, retryAfterSec}`; fixed window, bounded map (max 1000 keys).
- Tests: allows up to limit, blocks after, resets after window (fake timers), retryAfterSec ≥ 1.
- Commit.

## Task 6: Provider abstraction (`provider.ts`)

**Interfaces:** Produces `resolveChatModel(): LanguageModel | null` and `isAIConfigured()`. `SHOPMATE_AI_PROVIDER=google|ollama` (default google), `SHOPMATE_AI_MODEL` (default `gemini-3.8-flash`), Ollama baseURL `SHOPMATE_OLLAMA_URL` (default `http://127.0.0.1:11434/v1`). Google key from `GOOGLE_GENERATIVE_AI_API_KEY` (AI SDK default) — never logged.
- Test: configuration resolution per env combos (no network calls).
- Commit.

## Task 7: Agent tools (`tools.ts`)

**Interfaces:** Consumes `searchCatalog`, `getCatalogProduct`, relevance, intent store. Produces `createAgentTools(ctx)` where `ctx = { userId?, budgets: {searches:3, details:6, compares:1}, intentRef: {current: ShoppingIntent}, catalogLog: ProductLog }`. Tools: `searchProducts(query, limit≤10, filters{maxPrice?,brand?})`, `getProductDetails(productId)`, `compareProducts(productIds 2–4)`, `refineSearch(originalQuery, missingRequirements)`, `recordIntent(partial intent + recommendedProductIds)`.
Rules: query normalized (trim/collapse/lowercase, ≤120 chars); every returned product recorded into `catalogLog` (the only ids the model may reference); budget exhaustion returns `{error:'budget_exhausted'}`; product data passed to the model is compact and description-truncated (≤400 chars) inside `<catalog-data>` delimiters.
- Tests (mock catalog injected): budget enforcement; normalization; irrelevant results filtered with rejectedCount; refineSearch composes query; recordIntent merges + unknown recommended ids dropped.
- Commit.

## Task 8: Agent assembly (`instructions.ts` + `agent.ts`)

**Interfaces:** Consumes tools, provider, intent. Produces `buildInstructions(intent)` and `runAgentTurn({messages, message, userId, ip}) → ChatApiSuccess`. Flow: build per-request agent (`ToolLoopAgent`, `stopWhen: isStepCount(8)`, `maxOutputTokens: 1024`, thinkingLevel minimal) → `generate()` → collect `catalogLog` → rank products deterministically → validate model-referenced ids against log → assemble `{content, intent, products, comparisons, clarifications, productIds, catalog, toolsUsed}`. Keyword fallback when `!isAIConfigured()`: deterministic search + ranking + honest copy, `mode:'keyword_fallback'`. Model failure → typed error `ai_unavailable`.
- Tests: assembler drops unknown ids; ranks by engine; keyword fallback path with stubbed catalog; error mapping.
- Commit.

## Task 9: `POST /api/chat` route

**Files:** Create `src/app/api/chat/route.ts`. Zod body validation (`conversationId` 1–64 safe chars; history ≤16 messages × ≤2000 chars; message 1–1000 chars) → rate limit per IP (default 10/min, 429 + retryAfterSec) → `runAgentTurn` → JSON. Errors: 400 invalid_request, 429 rate_limited, 502 ai_unavailable, 500 internal_error. `export const runtime = 'nodejs'`; `export const maxDuration = 60`.
- Verify: `npx tsc --noEmit`, `npm run lint` clean; manual curl of validation + rate-limit paths.
- Commit.

## Task 10: Chat UI wiring

**Files:** Create `src/lib/chat-api.ts`; Modify `chat-client.tsx` (send via /api/chat, registerProducts, retry, pending dots, 429 handling), `chat-message.tsx` (render clarifications block, agent meta line with model + catalog source), `src/types/index.ts` (ChatMessage.intent/agentMeta), header/footer copy ("no live AI yet" removed).
- Verify: `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean; manual dev-server check of a live chat turn.
- Commit.

## Task 11: E2E scenario matrix (`scripts/phase4-checks.mjs`)

15 scenarios: specific search, budget-constrained, brand preference, multiple specs, ambiguous request, gibberish, irrelevant fuzzy matches, missing attributes, Channel3 auth failure, Channel3 timeout, model API failure, conversation follow-up, product comparison, add-to-cart (id resolvability), prompt injection. Plus `npm run lint`, `npm run build`, `npx tsc --noEmit`, `npm test`.
Run matrix twice: keyword-fallback mode (no AI key env) and live agent mode (real key).

## Task 12: Final commit + completion report

Commit remaining work; report provider/model, integration details, files, tools, ranking implementation, tool-execution evidence, test results, cost considerations, limitations. STOP.
