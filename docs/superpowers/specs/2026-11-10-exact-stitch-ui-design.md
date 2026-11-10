# Exact Stitch UI Redesign Specification — ShopMate AI

- **Date:** 2026-11-10
- **Status:** Finalized Specification — Pending User Approval
- **Target Application:** `shopmate-ai` (`c:/Users/BHASKARARAM/OneDrive/Antigravity/Paypal AI/shopmate-ai`)
- **Design Source:** Stitch Project `714239052433189669` (*ShopMate AI E-Commerce Platform*, `stitch/DESIGN.md`, Mobile Screens `01`–`05`, Desktop Screens `06`–`12`)

---

## 1. Intent & Why

The user requested a complete replacement of the current partial UI across **all screens** so `shopmate-ai` matches the **exact Stitch UI** (`stitch/01` through `stitch/12` and `stitch/DESIGN.md`) rather than keeping legacy sections or mixed chrome styles.

At the same time, `shopmate-ai` is an active full-stack AI commerce sandbox rather than a static HTML prototype. The redesign must unify the visual system, typography, spacing rhythm, navigation shells, cards, comparison tables, AI chat cards, cart layout, and post-capture confirmation receipt into one exact Stitch experience across **Mobile (`390×844`)**, **Tablet (`768px`)**, and **Desktop (`1280px–1440px`)** while keeping all backend APIs, catalog provenance rules, currency safety rules, and server-verified PayPal Sandbox checkout invariants intact.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
1. **Complete Screen Coverage (`01`–`12`):** Replace the current chrome and all four routes (`/`, `/chat`, `/compare`, `/cart` + payment confirmation state) to match the Stitch mobile (`01`–`05`) and desktop (`06`–`12`) blueprints.
2. **Exact Stitch Visual Language:** Adopt the tonal lilac/lavender-white surface system (`#fcf8ff` ground, `#ffffff` cards, `#f5f2ff` recessed spec wells, `#efecfb` user/chip containers, `#FAFAFC` thumbnail stages, `#131627` deep-indigo accents/drawers), `Geist` display/label type paired with `Inter` body text, and `Material Symbols Outlined` iconography alongside accessible SVGs.
3. **Cohesive Navigation Shells:**
   - **Desktop (`>= lg`):** Fixed glass header (`h-16`) with `ShopMate AI` mark, `SANDBOX MODE` pill, centered `⌘K` omni-search, right route links (`Discovery`, `AI Workspace`, `Product Matrix`, `Cart [N]`), notification indicator, and user avatar, paired with the minimalist 1-row system status footer.
   - **Mobile (`< lg`):** Fixed compact glass header (`h-16`) with `ShopMate AI` + `v2.0` pill, `SANDBOX` pill, search toggle, notification bell, avatar (plus the `05` `Checkout Flow` back-header variant on payment confirmation), paired with the persistent 4-tab fixed bottom navigation bar (`Home`, `AI Assistant`, `Compare`, `Cart`).
4. **Honest Grounded Commerce Data:** Bind Stitch's structural templates directly to real `DEMO_PRODUCTS`, live `channel3` search/product records, `buildComparisonMatrix`, decision engine insights, and server-verified USD totals without fabricated counts, ratings, discounts, or taxes.

### Non-Goals
- Modifying API routes (`/api/chat`, `/api/products/search`, `/api/products/[id]`, `/api/paypal/*`), database adapters, AI agent routing/failover (`src/lib/agent/*`), or `src/lib/compare/compare-matrix.ts` core logic.
- Replacing live Channel3 / demo catalog functionality with hardcoded static Sony/Bose/Anker HTML content.

### Anti-Goals
- **Zero security regressions in checkout:** Never calculate or send prices, shipping, taxes, or order totals from the client to `/api/paypal/orders`; never render a working "Force 200 OK" or fake instant capture bypass of `PayPalCheckout` server verification.
- **Zero fabricated product claims:** Never display invented star ratings (`★ 4.8 (2.1k)` when `ratings === 0`), invented catalog counts (`4,820 Verified Items`), invented discount percentages (`-13%` when `compareAtPrice` is absent/invalid), or invented state sales tax (`CA ~8% $31.04`).
- **Zero mobile layout collisions:** Never stack the desktop footer, mobile bottom tab bar, floating comparison drawer, mobile compare CTA bar, and mobile chat composer on top of each other.
- **Zero cross-currency math:** Never compute numeric price spreads, deltas, or percentage savings across differing currencies.

---

## 3. Preserved Engineering Invariants (Hard Constraints)

1. **`PayPalCheckout` Contract (`src/components/cart/paypal-checkout.tsx`):**
   - Must continue rendering vertical PayPal buttons via `loadPayPalSdk` + `window.paypal.Buttons`.
   - `createOrder` payload remains strictly `{ items: [{ productId, quantity }], currency: "USD" }`.
   - `onApprove` must continue calling `/api/paypal/orders/[orderId]/capture` with `x-shopmate-capture-token`.
   - All exact user-facing safety/state messages verified by `tests/paypal-checkout.test.tsx` remain verbatim:
     - `"ShopMate Sandbox demonstration"`, `"This is not a real retailer purchase"`, `"No goods are shipped"`, `"Sandbox payment captured"`, `"Confirming payment with PayPal"`, `"Capture pending — payment not complete"`, `"Payment outcome unknown"`, `"Do not retry"`, `"Checkout cancelled — no payment was taken."`.
2. **`ShopMateLogo` Unit Contract (`src/components/brand/logo.tsx`):**
   - Preserve `<ShopMateLogo />` SVG `role="img"`, `aria-label="ShopMate AI"`, `fill="currentColor"` on the `Shop` `<text>` node, variants (`horizontal`, `icon`, `full`, `mascot`), tagline option, and size classes (`sm: h-7`, `md: h-9`, `lg: h-11`, `xl: h-14`) required by `tests/brand-logo.test.tsx`. *(Our call: use a clean Stitch sparkle/badge or `<ShopMateLogo variant="icon" />` inside the navbar badge lockup while keeping `ShopMateLogo` compliant.)*
3. **Store Hydration & SSR Safety (`src/lib/store.tsx`, `src/lib/chat-store.ts`):**
   - Keep `useSyncExternalStore` with empty server snapshot and post-mount `localStorage` hydration so Next.js SSR produces zero hydration mismatch warnings.
4. **Comparison Matrix Integrity (`src/lib/compare/compare-matrix.ts`):**
   - Keep `buildComparisonMatrix`, `getValidCompareProducts`, `MAX_COMPARE_PRODUCTS = 4`, missing-spec `"Not documented"` labeling, and `hasCurrencyMismatch` warnings.
5. **UI Test & QA Suites (`tests/stitch-ui.test.tsx`, `scripts/qa-runner.mjs`, `scripts/phase3-workspace-qa.mjs`):**
   - Where tests verify structural selectors or labels deliberately replaced by the Stitch redesign (such as card primary buttons or footer links), update tests and QA runners explicitly in lockstep with the approved spec; keep semantic accessibility landmarks (`<header>`, `<nav>`, `<main>`, `<aside aria-label="...">`, `<article>`, `#hero-search`, `#chat-input`).

---

## 4. Design System Foundation (`stitch/DESIGN.md` + `01`–`12` Tokens)

### 4.1 Color Tokens (`src/app/globals.css`)
Define all Stitch palette CSS custom properties and map them cleanly into Tailwind v4 `@theme inline`:

| Token Role | CSS Custom Property | Hex Value | Usage |
| :--- | :--- | :--- | :--- |
| Ground Canvas | `--background`, `--surface`, `--surface-bright` | `#fcf8ff` | Main page ground across mobile & desktop |
| Card Surface | `--surface-card`, `--surface-container-lowest` | `#ffffff` | Product cards, AI cards, matrix sections, summary panels |
| Thumbnail Stage | `--canvas-bg` | `#FAFAFC` | Product media frames & category preview wells |
| Low Container | `--surface-container-low` | `#f5f2ff` | Spec boxes (`2x2`), subtotal wells, table group headers, mobile spec cards |
| Default Container | `--surface-container` | `#efecfb` | Desktop user chat bubble, breadcrumb/verified strips, secondary buttons |
| High Container | `--surface-container-high` | `#e9e6f5` | Hover fills on chips & inactive segmented controls |
| Highest / Variant | `--surface-container-highest`, `--surface-variant` | `#e4e1ef` | Active segmented track, Key Trade-off well on mobile |
| Dim Surface | `--surface-dim` | `#dbd8e7` | Deep recessed dividers |
| Deep Indigo Dock | `--brand-deep-indigo` | `#131627` | Floating sliding Comparison Drawer (`12`), mobile user chat bubble (`02`), secondary dark CTAs (`01`) |
| Primary Anchor | `--primary` / `--primary-container` | `#412cdd` / `#5b4cf5` | CTAs, selected filters, match highlights, active tabs |
| Primary Fixed | `--primary-fixed` / `--on-primary-fixed` | `#e3dfff` / `#120068` | Active chips, match pills, winner cell highlight |
| Secondary (Verified) | `--secondary` / `--secondary-container` | `#006c49` / `#6cf8bb` | Fit scores, verified availability, captured payment states, winner highlights |
| Tertiary (Sandbox) | `--tertiary` / `--tertiary-fixed` | `#734700` / `#ffddb8` | `SANDBOX MODE` banners, amber sandbox badges, test alerts |
| Error | `--error` / `--error-container` | `#ba1a1a` / `#ffdad6` | Unmet criteria, validation alerts, clear/remove hover |
| Ink & Hairlines | `--on-surface` / `--on-surface-variant` / `--text-muted` | `#1b1b25` / `#464556` / `#747482` | Headings, body prose, metadata labels |
| Borders & Outlines | `--border-subtle` / `--border-strong` / `--outline-variant` | `#EEEEF2` / `#E5E7EB` / `#c8c4d8` | Tier-1 1px hairlines & Tier-2/3 modal edges |

### 4.2 Typography & Iconography (`src/app/layout.tsx`)
- **Fonts:** Load `Geist` (`--font-geist`), `Inter` (`--font-inter`), and `Geist_Mono` (`--font-geist-mono`) via `next/font/google` in `layout.tsx`. Headings, titles, numeric prices, badges, and UI labels use `Geist` (`tracking-tight` `-0.01em` to `-0.03em`); conversational responses and product descriptions use `Inter`. Monetary figures and spec measurements use `tabular-nums`.
- **Icons (`(Our call)`):** Load `Material Symbols Outlined` in `src/app/layout.tsx` (matching all 12 Stitch HTML files so icons like `auto_awesome`, `compare_arrows`, `analytics`, `verified_user`, `tune`, `science`, `arrow_forward`, `arrow_upward`, and bottom tab symbols match 1:1 visually). Pair filled/outlined icon states with clean accessible `aria-hidden="true"` attributes, while keeping SVGs for `<ShopMateLogo />` and fallback `ProductImage` drawn tiles (`lucide-react`).
- **Elevation & Motion:** Preserve `stitch-tier-1`, `stitch-tier-2`, and `stitch-tier-3` elevation utilities (`globals.css`), subtle hardware easing, and `@media (prefers-reduced-motion: reduce)` fallbacks.

---

## 5. Global Shell Architecture (Mobile vs Desktop)

### 5.1 Responsive Breakpoint Split (`(Our call)`)
Because Stitch defines distinctly tuned headers and bottom bars for mobile (`01`–`05`, `< lg` / `< 1024px`) vs desktop (`06`–`12`, `>= lg`):
- Use `lg` (`1024px`) as the clean switch between the Mobile Shell (compact top header + fixed bottom 4-tab bar) and Desktop Shell (full nav links + 1-row system footer). Note: tablet (`768px–1023px`) safely fits desktop multi-column grids where appropriate (`md:grid-cols-2`), while retaining the mobile bottom nav + compact header below `1024px` to avoid horizontal navbar crowding.

### 5.2 Desktop Top Navbar (`h-16` fixed/sticky glass, `hidden lg:flex` for full controls)
- **Left Group:** `ShopMate AI` brand mark (`w-8 h-8 rounded-lg bg-primary-container text-white` gradient badge + crisp `ShopMate AI` wordmark, plus `ShopMateLogo` preserved as reusable brand component) + `SANDBOX MODE` amber pulsing pill (`bg-tertiary-fixed/70 text-on-tertiary-fixed-variant`, hidden `< xl` only if cramped, visible `>= xl`).
- **Center Quick Search (`max-w-md`):** `bg-surface-container-low` rounded search bar (`#navbar-quick-search`) with `⌘K` shortcut submitting to `/chat?q=...`.
- **Right Group:**
  - `nav[aria-label="Main"]`: `Discovery` (`/`), `AI Workspace` (`/chat`), `Product Matrix` (`/compare`, subtle compare badge when `> 0`), `Cart` (`/cart` with indigo circle item count badge). Active route receives `bg-primary-fixed/60 text-primary font-semibold`.
  - Notification bell button (opens lightweight session notifications popover — recent added item / compare updates — `(Our call)` so clicking never dead-ends) + Indigo Avatar circle.

### 5.3 Mobile Header (`h-16` fixed glass, `lg:hidden`)
- **Standard Routes (`/`, `/chat`, `/compare`, `/cart` pre-capture):**
  - Left: Compact icon mark + `ShopMate` + `v2.0` muted pill (`bg-surface-container text-on-surface-variant`).
  - Right: `SANDBOX` pill (`bg-tertiary-fixed text-on-tertiary-fixed-variant`) + Quick Search trigger button (`44×44` opening an accessible `#shopmate-mobile-search-sheet` / drawer modal routing to `/chat?q=...` — *(Our call)* replaces inline burger menu while maintaining keyboard/mobile navigation alongside the bottom tab bar) + Notification bell (`44×44`) + User Avatar (`w-8 h-8 rounded-full bg-primary text-white`).
- **Checkout Confirmation Flow Variant (Stitch `05`, active on `/cart` when `capturedOrder !== null`):**
  - Left: `<-` Back button (clears the active receipt and returns to the Cart view) + compact brand mark + `"Checkout Flow"` title.
  - Right: `SANDBOX` pill + User Avatar.
  - Bottom Tab Bar visibility `(Our call)`: Matches `stitch/05/screen.png` by hiding the mobile 4-tab bottom bar while the Confirmation receipt is active so the confirmation CTAs remain unobstructed.

### 5.4 Mobile Bottom Tab Bar (`fixed bottom-0 inset-x-0 z-40 h-16 pb-safe bg-surface/85 backdrop-blur-xl lg:hidden`)
- Equal 4-column grid (`min-h-[44px]` touch targets):
  1. `Home` (`/`)
  2. `AI Assistant` (`/chat`)
  3. `Compare` (`/compare`, optional compare badge pill if `compareIds.length > 0`)
  4. `Cart` (`/cart`, primary circular count badge when `cartCount > 0`)
- Active state tints icon and text in `#412cdd` (`text-primary font-semibold`).
- Body `<main>` applies bottom clearance (`pb-24 lg:pb-12`, extended to `pb-40 lg:pb-28` when floating bottom docks/action bars are mounted) so scrolling never hides final content underneath fixed chrome.

### 5.5 Desktop 1-Row Footer (`hidden lg:block`) (`(Our call)`)
- Matches Stitch `06`–`09` / `12`: clean single-row bar on `bg-surface-card` (`border-t border-border-subtle`, `max-w-[1440px]`):
  - **Left:** Pulsing green status dot + `Catalog Engine: Ready (Channel3 + Demo)` • `verified_user` icon + `Server-Verified PayPal Sandbox`.
  - **Right:** Internal navigable route links (`Discovery` `/`, `AI Workspace` `/chat`, `Product Matrix` `/compare`, `Cart & Checkout` `/cart`) styled identically in muted `text-body-sm` to Stitch's right-aligned link cluster so there are **zero dead `#` anchors** and QA footer route validation remains clean.

---

## 6. Screen-by-Screen UI Blueprint (`01`–`12`)

### 6.1 Discovery & AI Catalog (`/`) — Stitch `03` (Mobile), `06` / `10` / `11` / `12` (Desktop)
Replaces current landing page completely (removes *How ShopMate AI works*, *Why choose ShopMate AI*, dark bottom CTA band, and multi-column dark/legacy blocks):
1. **Ambient Background Wash & Hero (`max-w-[1440px]`):**
   - Subtle top-center & top-right violet ambient blur radial glows (`pointer-events-none`).
   - Top telemetry pill: live pulsing emerald dot + honest catalog label `"Catalog Synced · ${DEMO_PRODUCTS.length} Curated Demo Items · Live Channel3 Search Ready"` *(Our call: replaces hardcoded `"4,820 Verified Items • 32ms index"` with factual runtime truth)*.
   - Gradient Headline (`headline-xl-mobile` on mobile, `headline-xl` on desktop): `Shop smarter. Compare better.` + gradient indigo highlight `Buy with confidence.`
   - Subtitle (`max-w-2xl text-on-surface-variant`): Concise description of plain-language AI comparison, verified catalog specs, and server-verified sandbox checkout.
   - **Tier-3 Glass Omni-Search Bar (`HeroSearch`, `#hero-search`):**
     - *Desktop (`06`):* `bg-surface-card/95 backdrop-blur-xl rounded-2xl border border-outline-variant/40 p-2` containing sparkle/bot container (`bg-primary/10 text-primary`), main `#hero-search` input (`/` shortcut preserved), internal action cluster (`Decision Engine` indicator pill + optional mic/clear icon + primary `Synthesize ->` button), **and an integrated `SUGGESTED:` prompt chips row inside the bottom of the search box** separated by a hairline border (`border-t border-border-subtle/80`).
     - *Mobile (`03`):* Compact glass card (`rounded-2xl p-2`) with left violet sparkle tile, input, circular purple `arrow_upward` submit button, thin bottom status bar (`Decision Engine: Grounded Catalog` + keyboard/quick-prompt hint), plus **horizontally scrollable prompt chips immediately below** the card (`snap-x`).
2. **Category Strip:**
   - *Mobile (`03`):* `Explore Categories` header + `4 Sectors` (or `All` + `4` = `5 Sectors`) horizontal snap-scroll square/compact icon cards (`bg-surface-card rounded-xl`).
   - *Desktop (`06`):* `grid-cols-5` equal horizontal cards: `(Our call)` Include **All Catalog (`DEMO_PRODUCTS.length` items)** + the 4 `DEMO_CATEGORIES` (**Audio**, **Wearables**, **Workspace**, **Photography**) with `Material Symbols` icon inside `bg-surface-container-low` square + category title + honest `"N items"` count. Clicking a category either filters the catalog grid smoothly and scrolls to recommendations OR offers double-action/AI launch so existing `/chat?q=...` links still remain accessible! *(Our call: clicking a category tile filters the grid right below and updates an active filter chip + provides an "Ask AI about [Category]" quick link so `/chat?q=...` discoverability is even stronger.)*
3. **Curated Recommendations Filter & Sort Bar:**
   - Header: `Curated Catalog Picks` (desktop) / `Curated Recommendations` (mobile) + real subline `"Sorted by catalog order & price"` + active dismissible filter pill (`Category: ...`, `Featured`, etc.) + Stitch segmented sort switcher (`Featured`, `Lowest Price`, `Highest Price`) with mobile sort icon button.
4. **Product Card Anatomy (`ProductCard`):**
   - **Mobile (`03`):** Compact Tier-1 horizontal card (`rounded-2xl bg-surface-card p-3.5 border border-border-subtle`):
     - Top bar: Left AI/Provenance badge (`Demo data` or `LIVE via merchant` pill) + right honest status/category pill (`In Stock` only for non-demo `channel3` `"in_stock"`, otherwise clean `"Demo Catalog"` / `"Unavailable"` pill for provenance honesty — `(Our call)`).
     - Content row: `w-24 h-24 rounded-xl bg-canvas-bg` thumbnail on left; right column with brand uppercase micro-label + merchant pill, product title, real `formatMoney` price (+ strikeout `compareAtPrice` only when strictly `> price`), and up to 3 compact `bg-surface-container-low` spec tags derived from real `Object.entries(product.specs)`.
     - Action footer: Exact Stitch `[Compare / Compared | View Analysis]` buttons — clicking `Compare` toggles comparison selection; clicking `View Analysis` opens a **Slide-Over Product Analysis Drawer / Modal** (displaying full catalog specs, `ProductProvenanceBadge`, category/merchant context, `Ask AI Workspace` link, optional `buyUrl` link for live items, and primary **`Add to Cart` / `In Cart`** CTA).
   - **Desktop (`11`/`12`):** Vertical 4-col grid card (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6`):
     - Top provenance row: `ProductProvenanceBadge` / match context + merchant pill.
     - Media well (`h-44 rounded-xl bg-canvas-bg p-3 relative overflow-hidden`): product image with **top-right `Compare` / `Compared` overlay pill** (plus hover/active micro-drawer `"Added to Matrix • X/4 slots used"` on hover matching Stitch `12`!) + **bottom-left availability/provenance pill**.
     - Title + concise description (`line-clamp-2`).
     - Price row (`headline-md font-bold`) + conditional strikethrough `compareAtPrice` & emerald `-XX%` pill **only when real `compareAtPrice > price`**.
     - 3-row recessed specification table (`bg-surface-container-low rounded-xl p-3`) rendering real `product.specs` pairs with `Material Symbols` spec icons.
     - Action footer: Exact Stitch `[Compare / Compared | Analysis >]` buttons — `Compare` toggles comparison matrix selection and `Analysis >` opens the same **Slide-Over Product Analysis Drawer / Modal** containing full verified specs and `Add to Cart`. (`tests/stitch-ui.test.tsx` and `scripts/qa-runner.mjs` Journey 9 are updated in lockstep to test `[Compare | View Analysis / Analysis >]` + drawer `Add to Cart` cleanly.)
5. **Catalog Attribute Telemetry Visual Strip (`06` / `11`):**
   - Clean horizontal white card (`rounded-2xl border border-border-subtle bg-surface-card p-5`) rendered below the catalog grid showing an interactive/factual SVG comparison sparkline of the currently compared (or top featured) items' numeric attribute profiles (e.g., Price vs Battery/Spec endurance indexed from real catalog values, cleanly labeled `Catalog Attribute Profile` rather than fake pink-noise dB curves `(Our call)`).
   - **Mobile Promo Card (`03`):** Directly below recommendations on mobile (`< lg`), render the purple gradient `Instant Matrix` card (`"Need side-by-side analysis?"` + numbered compare slot dots + `"Launch Matrix ->"` link to `/compare`).
6. **Sliding Comparison Drawer (`ComparisonDrawer`, Stitch `12`):**
   - Hidden when `compareProducts.length === 0` or on `/chat`, `/compare`, `/cart`.
   - **Desktop (`>= lg`):** Fixed `#131627/95` (`brand-deep-indigo`) floating bottom dock (`max-w-[1360px] mx-auto rounded-t-2xl`), peek strip (`h-[4.25rem]` with `compare_arrows` tile, `Instant Comparison Matrix`, `X Items Ready` / `X/4 Selected` pill, stacked circular thumbnails `+N`, `Live Attribute Engine`, `Launch Matrix (N Selected) ->` CTA, chevron expand button). Expands (click or accessible toggle; hover CSS enhancement only on non-touch desktop) smoothly into the `Side-by-Side Spec Breakdown` panel showing `compare-cards` (real specs, real price range, remove action) + dark `ShopMate AI Quick Verdict` card (factual highlights from `buildComparisonMatrix` + dual progress bar when single-currency).
   - **Mobile (`< lg`):** Compact `#302f3a/95` / `#131627/95` floating dock positioned cleanly at `bottom-20` (above the `h-16` bottom tab bar) with expand peek & `Matrix` CTA.

---

### 6.2 AI Shopping Workspace (`/chat`) — Stitch `02` (Mobile), `07` (Desktop)
Replaces current chat styling while retaining `ChatClient`, `chatStore`, `sendChatMessage`, `RequirementsPanel`, and `ShortlistPanel` functionality:
1. **Desktop Layout (`07`, `>= lg`):**
   - **Top Workspace Ribbon:** Left breadcrumb badge `SHOPMATE WORKSPACE` + active query topic (`"Discovery Stream"` or inferred category/query) | Right engine status pill (`emerald` dot + `"Ready"` / `"Evaluating"`) + `Export Thread` / `Reset` buttons.
   - **12-Column Responsive Workspace (`max-w-[1440px] px-margin py-6 grid-cols-12 gap-6`):**
     - **Left Rail (`xl:col-span-3`, retaining `aside[aria-label="Shopping requirements & refinements"]`):**
       - *Card 1 — Active Stream:* Current search topic, criteria count, confidence/constraint completeness progress bar (`min(100, criteriaCount * 20)%` labeled `"Criteria Captured"`, honest).
       - *Card 2 — Active Constraints (`Reset` action):* Visual budget slider/cap display (populated from extracted `budgetMax`/`currency` + interactive quick ceiling buttons `< $100`, `< $200`, `< $350`, `< $500`), Form Factor / Use Case tiles, Priority toggles (`+ Battery Life`, `+ Noise Cancellation`, etc.).
       - *Card 3 — Catalog Metrics Extracted (when products returned):* Factual attribute summary & SVG mini-chart comparing returned shortlist items' prices/specs `(Our call: replaces hardcoded "Cabin Jet Turbofan -34.8 dB" SVG card when empty/idle or grounds dynamically in real returned product specs)`.
       - *Card 4 — Quick Exploration Prompts / Snapshots:* Quick switchable example queries (`DEMO_PROMPTS`) to launch or reset a topic cleanly.
     - **Right Stream (`xl:col-span-9 flex flex-col`):**
       - Status pill header (`ShopMate Decision Engine · Grounded Catalog`).
       - Empty State (when `messages.length === 0`): Stitch welcome card with sparkle emblem, value prop, and 4 clickable starter cards (`DEMO_PROMPTS`).
       - **Message Stream:**
         - *User Message:* Right-aligned `bg-surface-container` (`#efecfb`) rounded bubble with user label & timestamp.
         - *Telemetry Divider:* Centered capsule pill (`Analyzed N records · Tools: ... · Source: ...` from real `agentMeta`).
         - *Assistant Copilot Card:* White (`bg-surface-card border border-border-subtle rounded-2xl p-6 shadow-sm`) with indigo bot badge (`w-8 h-8 rounded-lg bg-primary-container`), `"ShopMate Research Copilot"`, proven source pill (`LIVE` vs `Demo Fallback` / `Verified Catalog`), narrative paragraphs (`message.content`), clarifications notice (if present), **2-Column Rich Synthesis Cards (`grid-cols-1 lg:grid-cols-2 gap-4`)** matching Stitch `07`:
           - Each card (`bg-surface-container-low rounded-xl p-4 border border-border-subtle hover:border-primary/40`): top row with decision badge (`Best Overall` / `Best Value` / `Best Fit` / `ProductProvenanceBadge` — honest rather than hardcoded `98% FIT SCORE`) + merchant domain; mid row with `w-20 h-20 rounded-xl bg-white` thumbnail + title + real bold `#412cdd` price + real stock/provenance subline; **`2×2` White Spec Tile Grid** (up to 4 real `product.specs` pairs); white **`Key Trade-off:`** callout box populated from real `insight.tradeOffs[0]` or `insight.whyItMatches` (with `failedRequirements` badge in error tint if any!); footer **`[Add to Cart ($Price) | Compare]`** buttons!
         - *Suggested Exploration Paths:* Horizontal wrap pills extracted cleanly from `intent.clarifications` / category follow-ups (`onClick` sends refinement prompt).
         - **2-Column Inline Decision Cards & Shortlist Reconciliation `(Answered + Our call)`:** Matches `stitch/07` strictly with a **2-column desktop workspace** (`xl:col-span-3` Left Constraint Rail + `xl:col-span-9` wide Conversation Stream) and **no permanent 3rd right-hand sidebar** (`ShortlistPanel` column removed on desktop so wide 2-up synthesis cards fit comfortably at `1280px–1440px`). Every recommendation card inside the assistant bubble includes all decision-engine insights inline (`badge`, `whyItMatches`, `tradeOffs`, `failedRequirements`, collapsible `requirementsSatisfied` / `missingOrUnverified` details, `Add to Cart`, and `Compare`), while the conversation stream exposes `aria-label="Recommended products"` (`role="list"`) and `scripts/phase3-workspace-qa.mjs` is updated accordingly. Mobile (`< lg`) retains `Chat | Context` / inline shortlist access cleanly.
       - **Sticky Bottom Glass Composer (`ChatInput`, `#chat-input`):** Fixed inside stream bottom (`bg-surface-card/90 backdrop-blur-xl rounded-2xl border border-outline-variant/40`), paperclip/context toggle, active model pill (`agentMeta?.model` or `Decision Engine`), Enter / Shift+Enter shortcut caption, and primary indigo circular `arrow_upward` submit button.
2. **Mobile Layout (`02`, `< lg`):**
   - Low-container top meta bar (`bg-surface-container-low/95 px-4 py-2`): green dot + active topic + status pill (`Ready` / `Auto-Evaluating`), followed by compact segmented tabs (`Chat | Context | Shortlist`).
   - User Bubble (`bg-brand-deep-indigo` `#131627`, white text, right-aligned `rounded-2xl rounded-tr-sm` matching `02`).
   - Filter Divider Pill + White Assistant Card (`rounded-2xl`) with copy button + fit/source badge + narrative text.
   - Stacked Full-Width Synthesis Product Cards (`rounded-2xl bg-surface-card`) featuring Stitch `02`'s signature **`6px` left border accent** (`border-l-[5px] border-l-primary-container` for Rank #1 / `Best Overall`, `border-l-secondary` for Rank #2 / `Best Value`, neutral for others), `w-20 h-20` photo, price + merchant, `2×2` `#f5f2ff` spec boxes, `#e4e1ef` `Key Trade-off:` box, and `[Add to Cart ($X) | Compare]` CTA row.
   - Horizontal scrollable `Suggested follow-ups` pills + Mobile Floating Prompt Dock positioned cleanly at `bottom-16` right above the Mobile Bottom Tab Bar!

---

### 6.3 Product Comparison Matrix (`/compare`) — Stitch `01` (Mobile), `08` (Desktop)
Built on top of `buildComparisonMatrix(compareProducts)`:
1. **Header & Controls:**
   - Desktop (`08`): `HOME > COMPARISON MATRIX` breadcrumb, bold `Product Comparison Matrix` heading, factual subtitle, top-right action pills (`+ Add Product` modal/scroll-to-picker, `Differences Only` toggle button, `Share` copies URL `?ids=...`, `Ask AI Workspace`, `Clear All`).
   - Mobile (`01`): `BENCHMARK MATRIX` purple pill + green `Verified Catalog Data` indicator → `Product Comparison` title → `"Comparing N picks"` + `+ Add Product` trigger pill.
2. **Decision Synthesis / Verdict Card:**
   - Desktop (`08`): White card (`rounded-2xl border border-border-subtle p-6`) with `#f5f2ff` inner executive summary strip: `AI SYNTHESIZED VERDICT` badge + honest `Differing Specs` / provenance count + executive takeaway computed strictly from `matrix` insights (and currency warning banner if `hasCurrencyMismatch`), paired with up to 2 right-aligned **SVG Radial Gauge Cards (`bg-surface-container-low`)** displaying genuine derived ratios (e.g., spec coverage `%` or price/attribute lead badge without fake `9.4/10` marketing scores `(Our call)`).
   - Mobile (`01`): `#f5f2ff` rounded `AI Decision Synthesis` card containing key takeaway prose + 2 horizontal dual-color comparison progress bars grounded in real comparable numeric attributes (`compare-matrix`).
3. **Sticky Top Product Deck (`top-16`):**
   - Desktop (`08`): `bg-surface-card` sticky header row above grouped tables (`lg:grid`, left engine cell `Side-by-Side Specs` + catalog provenance count; columns `1..4` with `w-16 h-16` rounded image, `Best Overall`/`Best Value`/`Best Fit` pill or category tag, product name, `formatMoney` price + brand/merchant, `[Add to Cart | Remove]` buttons).
   - Mobile (`01`): Sticky 2-column horizontal scroll grid (`grid-cols-2` when 2 items, horizontal snap cards if 3–4 items) with compact `w-11 h-11` thumbnail, brand, title, price, and full-width dark/primary `Add to Cart` button + subtle remove `×` icon.
4. **Grouped Categorized Spec Sections:**
   - Group `matrix.specRows` cleanly via deterministic UI keyword grouping (`1. AUDIO & ACOUSTICS`, `2. BATTERY & POWER`, `3. BUILD, SIZE & PORTABILITY`, `4. CONNECTIVITY & OTHER SPECS` — dynamically hiding empty groups so any product category renders cleanly `(Our call)`):
   - **Desktop (`08`):** One white `rounded-2xl` card per group: `#f5f2ff` section title bar → `divide-y` spec rows (`grid`). When `row.isDifferent` and values parse safely to single-unit comparable numbers (or `ProductAttribute.better` defines winner), tint the winning cell `bg-primary-fixed/25` or `bg-secondary-container/25` with a crisp `SPEC LEAD` / `BEST` badge and proportional horizontal comparison progress bar (e.g., `34 hours` vs `18 hours`). Missing cells always show italic `"Not documented"`.
   - **Mobile (`01`):** One white `rounded-2xl` card per group housing `#f5f2ff` rounded spec sub-cards (`p-3.5 rounded-xl`), placing competing products side-by-side in a 2-col inner grid with green/amber `Winner` pill badges + subtle highlighted sub-cards when numeric leads exist, followed by the emerald `Documented Catalog Specs` assurance banner.
5. **Fixed Bottom Choice CTA Bar:**
   - Desktop (`08`, `fixed bottom-0 inset-x-0 bg-surface-card/90 backdrop-blur-xl border-t py-3 z-30` when comparing `>= 2` items): Shows price/selection summary on left and action buttons on right (`Choose [Short Name] — $Price ->`, up to top 2 picks or scrollable pills). Clicking adds item to cart & navigates to `/cart`.
   - Mobile (`01`, `fixed bottom-16 inset-x-0 z-30 px-4 py-3 bg-surface/90 backdrop-blur-xl border-t lg:hidden`): Dual `Choose [Item 1]` (indigo gradient) and `Choose [Item 2]` (`#131627` deep-indigo) action buttons clearing the `h-16` bottom tab bar cleanly!
6. **Empty State & Product Picker:**
   - Preserves `PRESET_COMPARISONS` one-click comparison bundles and `"Add products to compare"` filtered catalog drawer/grid (`remainingProducts`).

---

### 6.4 Shopping Cart (`/cart`) & Confirmation Receipt — Stitch `04` (Mobile Cart), `09` (Desktop Cart), `05` (Confirmation)
Built around `useCart()` and `<PayPalCheckout />`:
1. **Desktop 3-Step Checkout Pipeline (`09`, `>= lg`):**
   - `CHECKOUT PIPELINE / Session`: Step `1. Review Cart` (active) → Step `2. PayPal Sandbox Auth` → Step `3. Instant Fulfillment` (advances dynamically to Step 2 during `approval`/`capturing` and Step 3 on `captured`!).
2. **Cart Left Column (`lg:col-span-8`):**
   - Header: `Shopping Cart` + `[N Items]` lavender pill + `Clear All` action (with 2-step confirmation safety preserved).
   - Direct Fulfillment Strip: `#f5f2ff` banner (`verified_user` icon + `ShopMate Verified Sandbox Cart · Direct Server Pricing`).
   - Empty State (Mobile `04` + Desktop): When `cartItems.length === 0`, show Stitch's centered `"Your Cart is Quiet"` empty card with bag emblem, concise copy, primary `"Browse Discovery"` CTA (`/`), and secondary `"Restore Demo Cart"` quick-fill button *(seeds 2 sample demo products via `addToCart` — replaces static preview friction cleanly `(Our call)`)*.
   - **Cart Item Cards:** White `rounded-2xl p-4 sm:p-5 border border-border-subtle`:
     - Media thumbnail (`w-24 h-24` mobile / `w-28 h-28` desktop inside `#FAFAFC` rounded well) with Stitch bottom-right category corner pill (`Audio`, `Workspace`, etc.).
     - Top meta: `brand · ProductProvenanceBadge` + honest stock/provenance tag.
     - Title + real spec/variant summary (`specs` highlights) + unit price & right-aligned tabular line subtotal.
     - Bottom bar: recessed `#f5f2ff` pill stepper (`- [qty] +`) + `"Save to Compare"` (adds item to comparison matrix / saves) & `"Remove"` button.
   - **AI Order Optimization / Notice Banner:** Violet-indigo subtle gradient card (`bg-gradient-to-r from-primary/5 via-surface-container-low to-surface-card`): `auto_awesome` circle + honest message summarizing multi-item comparison readiness or free sandbox fulfillment (`"$0.00 Fulfillment · Server-Calculated USD Total"`, **no invented `$14.50 logistics saved` or `CO2e` numbers** `(Our call)`).
   - **Frequently Complemented Catalog Upgrades (`09` Desktop / below items on Mobile):** 2-column grid displaying 2 real catalog items **not currently in the cart** from `DEMO_PRODUCTS`, each with mini thumbnail, title, price, category note, and one-click `+ Add` button calling `addToCart(id)`.
3. **Cart Summary & Checkout Column (`lg:col-span-4` sticky):**
   - `Order Summary` card (`rounded-2xl border border-border-subtle p-6 bg-surface-card`):
     - Top header + `Live Quote` emerald pill (`Server-Verified`).
     - Breakdown (`<dl>`): `Items Subtotal (N)` → `Fulfillment`: `Demo Transaction ($0.00)` (NO fake CA 8% tax line!) → prominent `Total Due` in `USD` (`headline-lg font-bold`).
     - Amber Sandbox Callout (`bg-tertiary-fixed/45 border border-tertiary-fixed-dim/50 rounded-xl p-3.5 text-on-tertiary-fixed`): `"PAYPAL SANDBOX ENVIRONMENT ENABLED"` + verbatim required notice: `"ShopMate Sandbox demonstration. This is not a real retailer purchase. No goods are shipped. You are approving a test transaction only."`
     - `<PayPalCheckout />` real JS SDK buttons rendered seamlessly inside this summary card, followed by compact trust row (`Server-Verified Totals` • `Sandbox Capture`) and Stitch `09` 3-tile guarantee strip (`No Real Charges` • `Catalog Grounded` • `Server Verified`). Stitch's developer simulation drawers (`"Sandbox Simulation Controls"` in `09` and `"Sandbox Fallback Testing"` in `05`) are cleanly omitted so buyers see an uncluttered sandbox checkout and receipt flow.
4. **Payment Result & Confirmation View (`05`, rendered when `PayPalCheckout` emits verified `onCaptureSuccess`):**
   - Renders clean centered receipt layout on Mobile (with the `05` `<- Checkout Flow | SANDBOX | avatar` header and hidden bottom tab bar) & Desktop:
     - **Receipt Reload Persistence `(Our call)`:** Store the verified `PayPalCaptureSuccessEvent` + purchased items snapshot in `sessionStorage` (`shopmate.receipt.v1`) so accidental browser refreshes do not wipe the receipt; automatically clear the receipt snapshot when the user clicks `<-` (`Checkout Flow`), clicks `"Back to Discovery"`, or adds any new item (`addToCart`) to start a fresh cart.
     - Top amber `SANDBOX SIMULATION MODE` notice banner (`No real monetary funds were moved; no goods will ship`).
     - Hero Confirmation White Card (`rounded-2xl shadow-sm p-6 text-center`): `w-16 h-16` emerald circle with subtle `animate-ping` ring (`motion-safe`) + `• CAPTURED & SETTLED` pill + `Payment Confirmed & Captured` (`Sandbox payment captured`) + `#f5f2ff` boxed large `TOTAL AUTHORIZED & BILLED` amount (`$${capture.amount.value} ${capture.amount.currency}`).
     - Receipt Details Rows (`#f5f2ff` rows): **Order Reference** (`orderId` + working copy-to-clipboard button), **PayPal Capture ID** (`capture.captureId`), **Merchant** (`ShopMate AI Sandbox`), **Timestamp** (formatted ISO capture time), **Payment Method** (`PayPal Sandbox`).
     - **Items in Sandbox Dispatch** breakdown card: itemized thumbnails, quantities, prices, and final server-verified subtotal matching captured total.
     - Action Buttons: `Start New Shopping Research` (`/chat`), `Back to Discovery` (`/`), `Open AI Setup Guide` card linking to `/chat?q=...` tailored to the purchased product names!

---

## 7. Summary of Calls Made in This Spec (`(Our call)`)

To keep the redesign visually faithful to Stitch while upholding ShopMate's factual and security standards, these engineering decisions are settled as follows:

1. **Honest Metrics Substitution (`(Our call)`):** Replace Stitch's static marketing integers (`"4,820 Verified Items"`, `★ 4.8`, `-13%`, `96% AI Match`, `"CA ~8% $31.04 tax"`, `"1.84 kg CO2e saved"`) with real runtime values (`DEMO_PRODUCTS.length`, real `compareAtPrice` discounts only when `> price`, `$0.00` demo fulfillment, `Differing Specs` counts, and real agent/decision-engine badges).
2. **Icon Library Hybrid (`(Our call)`):** Load `Material Symbols Outlined` via Google Fonts in `layout.tsx` for pixel-accurate Stitch glyphs across cards, nav bars, and workspace headers while preserving SVG primitives on `<ShopMateLogo />` and fallback tiles.
3. **Breakpoint & Chrome Collision Management (`(Our call)`):** Show the 1-row Desktop Footer strictly at `lg+` (`hidden lg:block`) so mobile (`< 1024px`) displays only the Stitch 4-tab fixed bottom bar without double footers; position mobile floating docks/decision bars at `bottom-16` / `bottom-20` with generous `<main>` bottom padding.
4. **Dead Stitch Links -> Real Routes (`(Our call)`):** Map Stitch desktop footer utility links (`Discovery`, `AI Workspace`, `Product Matrix`, `Cart`) and mobile top search trigger (`#shopmate-mobile-search-sheet`) to working Next.js navigation and quick-search overlays—zero dead `<a href="#">` tags.
5. **Dynamic Spec Grouping in Matrix (`(Our call)`):** Categorize arbitrary `product.specs` keys dynamically (`Audio & Acoustics`, `Battery & Power`, `Build & Portability`, `Connectivity & Features`) and compute numeric lead highlights strictly when units match and `ProductAttribute.better` / known unit semantics apply.
6. **Cart Empty Restore Helper (`(Our call)`):** Include the Stitch `04` `"Restore Demo Cart"` button in the empty cart state wired safely to add two demo catalog picks via `addToCart` so empty cart evaluation takes one click.
7. **Strict 2-Column `/chat` Desktop Workspace `(Answered + Our call)`:** Follow Stitch `07`'s 2-column layout strictly on desktop (`xl:col-span-3` Left Constraints Rail + `xl:col-span-9` wide Stream with inline 2-up Synthesis Cards) instead of squeezing a permanent 3rd right-hand column; fold all decision-engine insight fields directly inside the inline cards and update `scripts/phase3-workspace-qa.mjs` to match. Retain `aside[aria-label="Shopping requirements & refinements"]`, `#chat-input`, and `#hero-search`.
8. **Confirmation `05` Mobile Shell & Reload Persistence `(Our call)`:** Hide the mobile bottom tab bar on the Screen `05` Confirmation view, wire `<- Checkout Flow` to dismiss the receipt back to the Cart view, and store the active receipt snapshot in `sessionStorage` (`shopmate.receipt.v1`), cleared automatically on dismissal, navigation via `"Back to Discovery"`, or starting a new cart.

---

## 8. Confirmed User Product Decisions

The following two product/UX decisions were confirmed directly by the user after builder check:

1. **Homepage Discovery Card Actions (`/` — Exact Stitch + Slide-Over Analysis Drawer):**
   - Homepage `ProductCard` (`src/components/shop/product-card.tsx`) renders Stitch's exact two-button footer (`[Compare / Compared | View Analysis]` on mobile `03`, `[Compare / Compared | Analysis >]` on desktop `11`/`12`).
   - Clicking `View Analysis` / `Analysis >` opens a sleek **Slide-Over Product Analysis Drawer / Modal** displaying complete documented specifications, provenance badge (`Demo data` vs `LIVE`), external merchant offer link (when present), `Ask AI Workspace` shortcut, and a primary **`Add to Cart` / `In Cart`** CTA.
   - `tests/stitch-ui.test.tsx` and `scripts/qa-runner.mjs` (Journey 9) are updated to match this exact interaction flow.
2. **Checkout & Confirmation Sandbox Experience (Clean Buyer Flow):**
   - Omit Stitch `09`'s developer `"Sandbox Simulation Controls"` panel and Stitch `05`'s `"Sandbox Fallback Testing"` card cleanly from `/cart` and Confirmation, leaving a streamlined buyer checkout and confirmation receipt backed 100% by real PayPal SDK + server capture verification.

---

## 9. Planned Verification After Implementation

Once approved, planned, and implemented, verification will require fresh runs of:
1. `npx tsc --noEmit` (zero TypeScript errors)
2. `npm run lint` (zero lint errors)
3. `npx vitest run --exclude tests/live-providers.test.ts` (all unit & integration tests passing, including updated `tests/stitch-ui.test.tsx`, `tests/brand-logo.test.tsx`, `tests/paypal-checkout.test.tsx`, `tests/compare.test.ts`)
4. `npm run build` (clean Next.js production build)
5. Headless Chromium multi-viewport QA & visual audit (`1440×900` Desktop and `390×844` Mobile) across `/`, `/chat`, `/compare`, `/cart`, and Confirmation state, comparing rendered screenshots directly against `stitch/*/screen.png` for layout fidelity, zero overflow, zero broken images, and zero console errors.

