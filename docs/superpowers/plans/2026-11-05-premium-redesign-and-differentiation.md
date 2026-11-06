# ShopMate AI — Premium Redesign & Decision-Engine Differentiation Plan

**Goal:** Reposition ShopMate AI from "AI-powered shopping site" to a premium **AI Shopping Decision Engine** ("Don't just shop. Make the right decision."), redesign six surfaces on a two-canvas design system, close the five remaining differentiation gaps, and harden the AI layer with a bounded provider fallback chain — without touching payments, database architecture, or existing routes.

**Status:** Plan approved in conversation (review + 4 decision answers). Implementation gated per phase below.

**Art direction boards:** `shopmate-ai/design-boards/01-home.png` … `06-cart.png` (one per page).

## Locked Decisions

| Decision | Choice |
|---|---|
| Color system | **Two-canvas**: light warm-bone marketing (home, discovery, detail); dark navy workspace (`/chat`, `/compare`, `/cart`) |
| Display type | **Instrument Serif** (next/font) for editorial headlines; Geist Sans (UI) + Geist Mono (data) kept |
| Accent | Single restrained violet `#5B50D9` (light canvas) / `#8B80F2` (navy canvas); semantic badge colors unchanged (green=live verified, amber=demo, red=errors) |
| Spec doc | This document; P1+ implementers read this first |
| Visual boards | Yes — 6 horizontal references in `design-boards/` |

## Global Constraints (unchanged from brief)

- Do not break existing routes; PRESERVE all working functionality (`/`, `/chat`, `/compare`, `/cart`, all API routes, chat-store persistence, PayPal sandbox flow).
- No payment logic changes, no captures/refunds, no Supabase migrations, no DB schema changes.
- All API keys server-side only. No secrets in browser responses or logs.
- Product facts only from verified catalog records. Never fabricate reviews, ratings, specs, stock, or merchant prices. Demo data stays explicitly labeled.
- No cross-store price comparison claims (single offer is selected upstream; offers array is not carried).
- Avoid unnecessary dependencies: **no GSAP/Framer**; extend the existing `Reveal`/CSS transition system. Fonts are `next/font/google` (zero installs).
- Next.js 16: read `node_modules/next/dist/docs/` before route work; follow `/chat` page patterns (`PageProps<>`, awaited `searchParams`, `cacheComponents` compliance).

## Audit Summary (full detail in conversation 2026-11-05)

- **Stack:** Next 16.4.4 App Router (typed routes, `cacheComponents`, `partialPrefetching`), React 19.3, Tailwind v4 + shadcn tokens, AI SDK v7 (`ToolLoopAgent`), zod v4, pg, vitest.
- **AI agent (mature):** 5 Zod tools w/ budgets (3 search / 6 details / 1 compare), `ShoppingIntent` merge across turns, deterministic response assembly (id allow-list via `catalogLog`), weighted ranking engine (35/30/20/10/5, priorities shift to specMatch), provenance payload (`mode`, `model`, `toolsUsed`, `catalog.source`+`fallback`), honest keyword fallback when unconfigured, typed `ai_unavailable` 502, per-IP rate limit 10/min, 64 KB body cap, prompt-injection defenses.
- **Catalog (mature):** Channel3 v1 client (search=1 credit; detail free & authoritative), untrusted normalization, 5-min search TTL cache keyed per user, demo fallback always labeled with reason, never silently mixed.
- **Payments (untouchable):** Phase 6B/6C guest-session hardening in progress upstream (`PROJECT.md` M2); do not modify.
- **Tests:** 28 suites, 373 passing, 1 gated-skip (postgres). `scripts/phase3-checks.mjs`, `phase4-checks.mjs` scenario runners.
- **Gaps:** intent **exclusions**, **winner triad** (best overall/value/fit), shortlist-first chat presentation, visible/editable **requirements panel**, no `/products` discovery, no `/product/[id]` detail, stale `CLAUDE.md` inventory, provider default inconsistency (env example says groq primary; code defaults google when unset).

## Implementation Phases

### P0 — Baseline verification (~0.5 h)
`npm test`, `npx tsc --noEmit`, `npm run build`, env inventory. Record as green. Gate P1.

### P1 — Design system foundation (~0.5 d)
Files: `src/app/globals.css` (two-canvas tokens via `[data-canvas="workspace"]`, palette shift: bone `#F7F6F3`/`#FFFFFF` cards/`#E8E5DF` hairlines/ink `#14171F`; navy `#0E1420`/`#161E2E`; violet primaries; keep shadcn variable structure), `src/app/layout.tsx` (Instrument Serif variable, metadata repositioning, metadataBase + og), `src/components/shop/navbar.tsx`, `footer.tsx`, `section-heading.tsx`, `reveal.tsx` (minor), product-image tint tokens.
- `ShopProvider` remains global; workspace pages set `data-canvas="workspace"` on their root element.
- Gate: suite green, all routes compile, visual pass on both canvases.

### P2 — Server differentiation, tests first (~1 d)
Files: `src/lib/agent/intent.ts` (add bounded `exclusions: string[]` ≤8 to schema + merge), `src/lib/agent/relevance.ts` (exclusion-rejection reason), `src/lib/agent/tools.ts` (recordIntent carries exclusions; search criteria pass-through), `src/lib/agent/instructions.ts` (exclusion guidance + award framing), `src/lib/agent/ranking.ts` (expose deterministic award derivation: overall = top rank; value = argmax budgetFit×specMatch among in-budget, tie price asc; fit = argmax specMatch, tie relevance; withhold when <2 candidates or all-unknown specs), `src/lib/agent/agent.ts` (awards into `assembleTurn`), `src/lib/agent/chat-contract.ts` (`awards` payload, exclusions in intent schema).
- Tests: exclusions filtering, awards determinism + withholding, merge semantics. Payment suites untouched.
- Gate: new+updated vitest green; contract stays backward-compatible (additive).

### P2b — Provider fallback chain (~included in P2)
Files: `src/lib/agent/provider.ts`.
- Keep `SHOPMATE_AI_PROVIDER` as chain head; add `SHOPMATE_AI_FALLBACK` (comma list). On upstream 429/5xx/timeout: try each remaining provider **once**, last error wins; chain exhaust → existing typed `ai_unavailable` (no keyword substitution, no infinite retry, no provider mixing).
- Generalize the timeout fetch wrapper (clamp 5–120s, `SHOPMATE_AI_TIMEOUT_MS`) to Google + any OpenAI-compatible provider; keep Groq `reasoning_content` strip Groq-scoped.
- Recommended config (minimal reliable first): `SHOPMATE_AI_PROVIDER=groq` (`openai/gpt-oss-120b`, tool-calling verified in-repo) + `SHOPMATE_AI_FALLBACK=google` (`gemini-3.8-flash`). Ollama dev-only. **OpenRouter deferred** (free models often lack tool calling) until explicitly requested.
- Optional: `OPENROUTER_API_KEY` stub documented, not activated. Tests: provider-chain (first-success, last-error, single-attempt-per-provider).

### P3 — Homepage re-voicing (~0.5 d)
Files: `src/app/page.tsx` (+ board `01-home.png` as reference).
- Eyebrow: "Don't just shop. Make the right decision."; decision-journey "how it works" (Understand → Shortlist → Compare → Decide); requirement-shaped starter tiles; example-decision panel replacing the demo featured rail (still demo-labeled, rendered from real `assembleTurn` payload shape); navy CTA band kept.

### P4 — Chat workspace (~1.5 d)
Files: `src/components/chat/chat-client.tsx`, `chat-message.tsx`, `chat-input.tsx`, new `requirements-panel.tsx`, new `award-badge.tsx`; `src/app/chat/page.tsx` (split-shell + streaming fallback skeleton).
- Desktop ≥lg split: left rail = Requirements panel (chips w/ remove; removal applies at next turn via existing `mergeIntent`; `null` budget clears — verified), pinned-compare tray, provenance card (mode/model/toolsUsed/catalog+fallback); mobile: rail collapses to a bottom sheet and a compact chip strip.
- Thread: award cards ("why it wins" bullets from deterministic `RankingBreakdown` + verified `ProductAttribute` deltas), top-3 shortlist + "+ N more" collapse, comparison strip from `comparisons`, clarifications block (kept, restyled), tool-run footer (kept).
- Contract unchanged: same `ChatApiSuccess`, plus `awards`.
- Gate: vitest green; QA both modes (AI-configured and keyword fallback) and no-Channel3 demo labeling.

### P5 — Discovery + detail routes (~1 d)
Files: new `src/app/products/page.tsx` (+ discovery-client), new `src/app/product/[id]/page.tsx` (+ product-detail components), `src/app/api/products/search/route.ts` (additive `gate=relevant` param applying existing `filterRelevant` server-side).
- Discovery: search-first hero, provenance banner (live vs labeled-demo), grid w/ add-to-cart/pin-compare/open-detail, designed empty + degraded states.
- Detail: server component on free detail endpoint; verified gallery (plain `<img>` for third-party hosts per existing pattern), full spec table with "Not published" cells, availability states, buy link, actions, recommendation context via query params. Follow Next 16 doc conventions; dynamic but cache-safe per `cacheComponents`.
- Gate: build clean; e2e scripts pass; no fabricated fields.

### P6 — Compare + cart restyle (~0.5 d — logic untouched)
Files: `src/components/compare/(compare-client|comparison-table|comparison-notes).tsx`, `src/components/cart/(cart-client|cart-item|cart-summary).tsx`, `paypal-checkout.tsx` visual-only deltas (class names; semantics/test hooks preserved).
- Table: verified-only cells, "Not published" explicit, better/worse direction deltas from `Product.attributes`, pinned first column (existing), workspace canvas. Gate: payment + paypal-checkout suites green.

### P7 — Full regression & docs (~0.5 d)
`vitest run` (373+ green), `phase3/phase4-checks.mjs`, `tsc --noEmit`, `lint`, responsive + a11y pass (focus rings, contrast ≥6:1, `prefers-reduced-motion`), refresh `CLAUDE.md` (stale component inventory) + `README.md` positioning + `.env.example` (`SHOPMATE_AI_FALLBACK`).

## Files Likely to Change (canonical list)

**New:** `src/app/products/page.tsx` · `src/app/product/[id]/page.tsx` · `src/components/discovery/discovery-client.tsx` · `src/components/product/product-detail*.tsx` · `src/components/chat/requirements-panel.tsx` · `src/components/chat/award-badge.tsx` · this doc · `design-boards/`.

**Modified:** `globals.css`, `layout.tsx`, `page.tsx`, `chat/page.tsx`, `api/products/search/route.ts` · chat clients (3) · compare clients (3) · cart clients (4, visual-only) · shop components (11) · `lib/agent/{intent,relevance,tools,instructions,ranking,agent,chat-contract,provider}.ts` · `types/index.ts` (additive: exclusions summary, `DecisionAward`) · `.env.example`, `CLAUDE.md`, `README.md`.

**Tests:** new: intent-exclusions, awards, provider-chain, relevance-exclusions; updated: agent/tools tests; untouched: everything under payments/paypal.

## Risks & Dependencies

1. Channel3 attribute sparsity → awards withheld + "Not published" honesty (accepted, designed-for).
2. Channel3 credits (1,000/mo free) → existing budgets/cache/rate-limits suffice; degradation stays labeled.
3. Tool-calling model quality variance → config discipline; chain is availability, not quality, insurance.
4. Non-streaming latency (≤30 s worst) → accepted for this phase; streaming is a separate future contract change.
5. Payment-adjacent regressions → visual-only rule + payment suites green every phase.
6. Next 16 `cacheComponents` on new dynamic routes → doc check + established `PageProps` patterns.
7. No breaking localStorage schema changes (cart v3 / compare v3 keys stay; chat message additions additive).

## Explicit Non-Goals

Streaming rewrite · new heavy dependencies (GSAP/Framer/etc.) · payment refactor · DB/migrations · cross-store price claims · OpenRouter integration (deferred) · fabricated any data.
