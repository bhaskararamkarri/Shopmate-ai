# ShopMate AI — Phase 6: Deployment Readiness & Vercel Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare ShopMate AI for public deployment, verify configuration and secret safety, launch and test a live Vercel Preview deployment, and compile a comprehensive Deployment Readiness Report without modifying payment or database architecture.

**Architecture:** Next.js 16 (App Router + Turbopack) deployed to Vercel Serverless Functions. Server-only secrets for Groq (`openai/gpt-oss-20b`), Channel3, PayPal Sandbox, and durable payments (with demo in-memory fallback enabled for standalone previews); client bundles strictly sanitized with zero exposed keys.

**Tech Stack:** Next.js 16, TypeScript, React 19, Tailwind CSS v4, Vercel CLI, Groq Cloud API, Channel3 Product API, PayPal REST API (Sandbox), Puppeteer.

**Spec:** Phase 6 User Request & Deployment Guidelines.

## Global Constraints

- Never print, echo, commit, or expose secret values or API keys.
- Keep PayPal in Sandbox mode exclusively (`PAYPAL_ENV=sandbox`); zero real payment capture or refunds.
- Do not modify payment architecture, database schema, or run remote database migrations.
- Deploy a Preview environment first; do not deploy directly to Production.
- Do not claim a deployment or test passed unless verified with fresh live evidence.

## Review Focus

1. **Client Bundle Secret Leakage:** Ensure `GROQ_API_KEY`, `CHANNEL3_API_KEY`, `PAYPAL_CLIENT_SECRET`, and database connection strings never appear in client-facing bundles or responses.
2. **Dynamic Route Prerendering Compatibility:** Ensure routes accessing dynamic request context (`/chat`, `/api/chat`, `/api/paypal/*`) execute correctly in Vercel serverless functions without prerender crashes.
3. **In-Memory Store Handling on Serverless:** Vercel functions are stateless and ephemeral; verify that `SHOPMATE_ALLOW_IN_MEMORY_DEMO=true` allows safe order creation in preview environments while documenting the requirement for PostgreSQL in production.
4. **Outbound Network Timeouts & Abort Handling:** Verify that Channel3 and Groq outbound requests obey timeout clamping to avoid hanging Vercel function instances.
5. **Cross-Origin & Host Validation:** Ensure PayPal order endpoints accept host headers from Vercel preview domains (`*.vercel.app`) without rejecting guest checkout sessions.

---

### Task 1: Audit Production Configuration & Runtime Compatibility

**Files:**
- Inspect: `next.config.ts`
- Inspect: `package.json`
- Inspect: `src/lib/payments/store.ts`
- Inspect: `src/lib/agent/provider.ts`
- Inspect: `src/lib/catalog/channel3.ts`
- Inspect: `src/app/api/paypal/orders/route.ts`

- [ ] **Step 1: Check Next.js server configuration for Vercel deployment**
  Inspect `next.config.ts` to ensure compatibility with Vercel serverless deployment (headers, images, cacheComponents, partial prerendering).

- [ ] **Step 2: Verify secret isolation**
  Verify that all sensitive keys (`GROQ_API_KEY`, `CHANNEL3_API_KEY`, `PAYPAL_CLIENT_SECRET`, `DATABASE_URL`, `CAPTURE_TOKEN_SECRET`, `SHOPMATE_GUEST_SESSION_SECRET`) are only read in server-side files and never prefixed with `NEXT_PUBLIC_`.

- [ ] **Step 3: Verify host validation on order endpoints**
  Inspect `src/app/api/paypal/orders/route.ts` and `src/app/api/paypal/orders/[orderId]/capture/route.ts` to verify how `Host` and `Origin` headers are validated so Vercel preview domains (`*.vercel.app`) are handled cleanly.

---

### Task 2: Git Hygiene, Secret Audit & Environment Variable Manifest

**Files:**
- Modify: `.env.example`
- Inspect: `.gitignore`
- Check: Git status and committed history

- [ ] **Step 1: Verify `.gitignore` rules**
  Confirm `.env`, `.env.local`, `.env.*` (except `.env.example`), and `.vercel` are excluded from version control.

- [ ] **Step 2: Git secret scan**
  Run git diff and git log checks to verify no API keys, client secrets, or private database credentials have been committed or staged.

- [ ] **Step 3: Construct comprehensive Vercel Environment Variable Manifest**
  Document the exact variable names, required/optional status, runtime destination (Preview vs Production), and purpose without exposing any values.

---

### Task 3: Vercel Preview Deployment Execution

**Files:**
- Target: Vercel project deployment (`.vercel/` or `vercel deploy --temporary`)

- [ ] **Step 1: Prepare environment configuration for preview**
  Assemble preview environment variables:
  - `SHOPMATE_AI_PROVIDER=groq`
  - `SHOPMATE_AI_MODEL=openai/gpt-oss-20b`
  - `GROQ_API_KEY`
  - `CHANNEL3_API_KEY`
  - `PAYPAL_ENV=sandbox`
  - `PAYPAL_CLIENT_ID`
  - `PAYPAL_CLIENT_SECRET`
  - `SHOPMATE_ALLOW_IN_MEMORY_DEMO=true`
  - `SHOPMATE_PAYMENT_STORE=memory` (for preview demo)
  - `CAPTURE_TOKEN_SECRET`
  - `SHOPMATE_GUEST_SESSION_SECRET`

- [ ] **Step 2: Trigger Vercel preview deployment**
  Deploy using Vercel CLI (`vercel deploy --temporary` or project link) and capture the generated preview URL and deployment ID.

- [ ] **Step 3: Verify preview deployment build logs**
  Inspect build status and confirm successful serverless function compilation on Vercel.

---

### Task 4: Hosted Browser & API Verification of Preview URL

**Files:**
- Test Script: `scratch/hosted-preview-verification.mjs`

- [ ] **Step 1: Write hosted verification script targeting the preview URL**
  Execute end-to-end checks against the live preview URL:
  - Homepage & Product Search
  - AI Workspace turn & shortlist generation
  - Side-by-side comparison
  - Add to cart & localStorage persistence
  - PayPal Sandbox order creation (`status === "CREATED"`, `approveUrl` points to sandbox, no real capture)
  - Channel3 live items vs demo fallback items
  - Mobile layout & navigation (390px, 0 overflow)

- [ ] **Step 2: Run verification script against live preview URL**
  Capture network responses, latencies, and screenshot evidence.

- [ ] **Step 3: Validate zero runtime errors in hosted logs**
  Confirm no 500 crashes, unhandled rejections, or client-side hydration mismatches.

---

### Task 5: Compilation of Final Deployment Report

**Files:**
- Output: Phase 6 Final Deployment Report & Checklist

- [ ] **Step 1: Compile deployment status & preview URL**
- [ ] **Step 2: Document environment variable configuration status table**
- [ ] **Step 3: Document hosted test results and performance metrics**
- [ ] **Step 4: Formulate production deployment recommendation and database migration path**

