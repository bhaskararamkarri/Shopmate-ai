# ShopMate AI — Intelligent AI Shopping Decision Engine & Workspace

> **"Tell ShopMate what you need. It researches available options, compares trade-offs, and explains what you should buy and why."**

ShopMate AI transforms online shopping from tedious browsing into an evidence-grounded decision workspace. Users can specify natural-language constraints, budgets, and priorities, receive transparent recommendations that never invent specifications or reviews, compare shortlisted products side by side, and complete verified checkouts via PayPal Sandbox.

**Hosted Preview:** [https://shopmate-q7pulvitk-bhaskararamkarris-projects.vercel.app](https://shopmate-q7pulvitk-bhaskararamkarris-projects.vercel.app)

---

## Key Capabilities

- **Intelligent Shopping Decision Workspace (`/chat`)**: Multi-turn AI shopping agent with requirement tracking, adaptive budget refinement, and grounded shortlist generation powered by Groq (`openai/gpt-oss-120b`).
- **Evidence-Grounded Product Comparison (`/compare`)**: Side-by-side specification tables highlighting meaningful differences, verified trade-offs, and explicit unknown/missing attribute detection.
- **Dual Catalog Architecture**: Live product feeds via the Channel3 Product API alongside curated, labeled demo items with high-resolution photography and explicit provenance badges (`DEMO DATA` vs live merchant records).
- **Server-Verified PayPal Sandbox Checkout (`/cart`)**: Complete approval-to-capture PayPal Orders v2 integration with server-side repricing, integer-cent verification, deterministic HMAC capture capabilities, and serverless state reconciliation.
- **Durable Payment Architecture (Phase 6B & 6C)**: PostgreSQL storage with transactional idempotency leases, state-machine transition integrity, and cryptographically signed guest session cookies.
- **Comprehensive Test Coverage**: 403 automated Vitest tests covering end-to-end security, state machine transitions, recommendation integrity, and catalog fallbacks.

---

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack, Partial Prerendering)
- **UI & Styling**: React 19, [Tailwind CSS v4](https://tailwindcss.com/), Radix UI primitives, Lucide Icons
- **AI & Reasoning**: AI SDK (`ai`), Groq API (`openai/gpt-oss-120b`), Google Gemini fallback
- **Payments**: PayPal Orders v2 REST API, PayPal JavaScript SDK (Sandbox)
- **Database**: PostgreSQL (Supabase), Row-Level Security, custom SQL migration triggers
- **Catalog**: Channel3 Product API + curated local demo catalog
- **Testing**: Vitest, React Testing Library, jsdom

---

## Getting Started

### Prerequisites

- Node.js 20+ (tested on Node 22 & 24)
- npm, pnpm, or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/bhaskararamkarri/Shopmate-ai.git
   cd Shopmate-ai
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Fill in your API keys in `.env.local` (see [Configuration](#configuration) below).

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## PayPal Sandbox checkout

The PayPal flow is a Sandbox-only demonstration: no real money moves and no
goods ship. The server creates and re-prices the order, then verifies the
capture before the UI reports success.

### Sandbox account requirement

Use a Sandbox **Personal** buyer whose account country matches the order
currency. For this USD demo, create a **United States** Personal Sandbox buyer
in the Developer Dashboard under **Testing Tools → Sandbox Accounts**. Do not
use an India buyer with the India business seller for USD orders: PayPal blocks
that combination during approval because of Indian banking regulations, so the
order stays `CREATED` and no payer or capture is recorded.

### Manual approval-to-capture test

1. Set the Sandbox credentials in `.env` (`PAYPAL_CLIENT_ID`,
   `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox`). Never commit or share them.
2. Run `npm run dev` and add a demo product to the cart.
3. Open the cart in a clean incognito window and select **Pay with PayPal**.
4. Sign in with the **US Personal Sandbox buyer** (Developer Dashboard →
   Sandbox Accounts shows the generated email and password).
5. Approve the payment in the PayPal window.
6. Expected: the window closes, the page shows **Sandbox payment captured**
   with a capture ID and order ID, and the order is `COMPLETED`. Success is
   shown only after the server's capture verification passes.

If approval fails, the page shows a generic failure message plus a safe PayPal
reference (`code`, `debug_id`, or correlation ID). The browser console contains
only a sanitized diagnostic with those fields and the order ID — never
credentials, tokens, cookies, full URLs, or buyer details. Give the
`debug_id`/correlation ID to PayPal support when investigating.

## Durable payment storage (Phase 6B)

Phase 6B replaces the process-local PayPal order registry with a durable
PostgreSQL store. The PayPal checks, USD-only pricing rules, catalog behaviour,
API endpoints, and safe response shapes are unchanged. Only the storage and
concurrency layer changed.

### What is persisted

The additive migration in `supabase/migrations/` creates five tables:

| Table | Purpose |
| --- | --- |
| `payment_orders` | Server-owned order authority: PayPal order id, reference id, integer-cent amount, status, capture-token hash, expiry, capture lease fields. |
| `payment_captures` | Verified or unverified capture records; one row per PayPal order. |
| `payment_idempotency` | Transactional create-order reservations keyed by `(scope, idempotency_key)`. |
| `payment_reconciliation` | Durable issues for read-only follow-up (pending, in-doubt, unverified captures). |
| `payment_audit_logs` | Append-only safe event history. No tokens, credentials, or raw PayPal payloads. |

The enforced order states are `CREATED`, `APPROVED`, `CAPTURE_IN_PROGRESS`,
`CAPTURE_IN_DOUBT`, `PENDING`, `COMPLETED`, `FAILED`,
`RECONCILIATION_REQUIRED`, and `EXPIRED`. A database trigger rejects impossible
transitions and changes to the financial identity of an order.

Key properties:

- **Transactions and row locks.** Direct `pg` connections use short
  transactions for idempotency reservations, capture claims, and capture
  completion. The in-memory adapter is a reference implementation for tests and
  local development only.
- **Idempotency leases.** An in-flight create holds a `PROCESSING` lease. A
  duplicate request within the lease gets HTTP 429 with `Retry-After`; an
  expired lease may be taken over. Ambiguous PayPal failures keep the
  reservation eligible for a delayed retry instead of pretending the order
  definitely failed.
- **Capture safety.** A capture is claimed durably before the PayPal POST.
  `capture_request_sent_at` records that the request may have reached PayPal.
  If that lease expires, the order becomes `CAPTURE_IN_DOUBT`, and subsequent
  requests are read-only reconciliation — never a second capture. A verified
  success must match the PayPal order id, server reference id, integer cents,
  USD currency, exactly one capture, and `COMPLETED` order/capture states.
- **Token hashing.** The browser receives a deterministic HMAC capture token.
  The database stores only its SHA-256 hash and verification is constant-time.
- **Expiry.** The shared 30-minute demo window still applies.
- **RLS.** Row level security is enabled on every table. `anon` and
  `authenticated` receive deny-all policies and no grants; `service_role`
  receives only `SELECT`, `INSERT`, and `UPDATE`. The application connects as
  the table owner through `DATABASE_URL`, which bypasses RLS; RLS is
  defence-in-depth for the Supabase Data API.

No webhook table or webhook handler exists in this phase. There is also no
background reconciliation worker yet: reconciliation issues are persisted and
read-only PayPal order lookups are used while handling a capture, but a
scheduled processor is future work.

### Configuration

Copy `.env.example` to `.env.local` and fill in server-only values. Never use a
`NEXT_PUBLIC_` prefix for any of these, and never return them from an API route.

| Variable | Required | Notes |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox` | Yes, for checkout | Existing Sandbox credentials. |
| `DATABASE_URL` | Yes, for durable payments and migrations | Secret PostgreSQL connection string. Supabase Dashboard → **Project Settings → Database → Connection string**. Store in `.env.local` and restart the dev server. |
| `SHOPMATE_PAYMENT_STORE` | Recommended | `postgres` for durable storage. `memory` is allowed only outside production; pending orders are lost on restart and are not shared between instances. |
| `SHOPMATE_GUEST_SESSION_SECRET` | Yes | 32+ byte random secret for HMAC-SHA256 guest checkout cookie signatures. |
| `CAPTURE_TOKEN_SECRET` | Recommended | Stable 32+ byte random secret for capture-token derivation. Changing it invalidates tokens for pending orders. If unset, the app falls back to `SUPABASE_SECRET_KEY`, then `SUPABASE_SERVICE_ROLE_KEY`, then `DATABASE_URL`. |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Optional | The direct-Postgres adapter does not need them. The secret key is only consulted as optional capture-token key material. Both are server-only secrets. |
| `SUPABASE_PUBLISHABLE_KEY` | Optional | Safe to expose, but this app does not currently use the Supabase Data API. |
| `PAYMENTS_TEST_DATABASE_URL` | Optional, tests only | Disposable database with the migration applied. Never point at production. |

Generate `CAPTURE_TOKEN_SECRET` with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Applying the migration

The migration file is tracked in the repository but is **not applied
automatically** and has **not** been pushed to a hosted project. Review it
first. It is additive: `create table if not exists`, indexes, triggers, RLS
policies, and grants; it contains no `DROP TABLE`, no `TRUNCATE`, and no
`DELETE FROM`. Migrations must remain additive and backward-compatible.

For a local Supabase stack (Docker required):

```powershell
npx supabase start
npx supabase db push --local
```

For a linked hosted project, inspect the existing schema and migration history,
preview the plan, and apply only after explicit approval:

```powershell
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run
# Review the output, then, only with approval:
npx supabase db push
```

Do not reset the project, disable RLS, or run destructive SQL. The migration
uses `if not exists` for tables and indexes, but its triggers assume Supabase
migration tracking records the file exactly once. Verify the remote migration
history before applying.

### Verification

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
```

The Postgres integration test is skipped unless a disposable database is
provided explicitly:

```powershell
$env:PAYMENTS_TEST_DATABASE_URL="postgresql://..."
npm test -- tests/payments-postgres.test.ts
```

That test verifies persistence across two store instances, idempotent replay,
capture claiming, and completion. It never reads `DATABASE_URL` implicitly and
never deletes or truncates rows, so a mistaken production URL cannot wipe data.
Until it runs against a real database and the Supabase security advisors are
reviewed, the durable path should not be called production-ready. Passing unit
tests prove the in-memory contract, not restart persistence.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
