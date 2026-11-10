# Exact Stitch UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every route (`/`, `/chat`, `/compare`, `/cart`, confirmation receipt) and chrome shell in `shopmate-ai` with the exact Stitch UI (`stitch/DESIGN.md`, Mobile `01`–`05`, Desktop `06`–`12`), verify via TDD + TypeScript + lint + build + Chromium multi-viewport visual audit, then push to GitHub and deploy to Vercel Preview and Production.

**Architecture:** Build on top of existing verified stores (`src/lib/store.tsx`, `src/lib/chat-store.ts`), comparison engine (`src/lib/compare/compare-matrix.ts`), catalog safety (`isSafeHttpUrl`), and PayPal Checkout (`PayPalCheckout`), extending `ShopProvider` with `sessionStorage` receipt state (`shopmate.receipt.v1`) so mobile header/tab-bar confirmation visibility and cart confirmation survive reload and clear cleanly on new shopping actions. Decompose category grouping & unit-safe numeric lead detection cleanly in `src/lib/compare/spec-groups.ts` and slide-over product details in `src/components/shop/product-analysis-drawer.tsx`.

**Tech Stack:** Next.js `16.4.4`, React `19.3.0`, Tailwind CSS v4, TypeScript, Material Symbols Outlined + Geist / Inter / Geist_Mono, Vitest + `@testing-library/react` (`jsdom`), Puppeteer + headless Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`), Vercel CLI.

**Spec:** `docs/superpowers/specs/2026-11-10-exact-stitch-ui-design.md`

## Global Constraints

- Exact Stitch tonal palette: ground `#fcf8ff` (`--surface`/`--background`), card `#ffffff` (`--surface-card`), thumbnail well `#FAFAFC` (`--canvas-bg`), recessed container `#f5f2ff` (`--surface-container-low`), container `#efecfb` (`--surface-container`), high container `#e9e6f5` (`--surface-container-high`), highest `#e4e1ef` (`--surface-container-highest`), primary `#412cdd` / `#5b4cf5` (`--primary` / `--primary-container`), primary fixed `#e3dfff` / `#120068`, secondary `#006c49` / `#6cf8bb`, tertiary `#734700` / `#ffddb8`, error `#ba1a1a` / `#ffdad6`, ink `#1b1b25`, muted `#747482`, deep indigo `#131627`, border `#EEEEF2` / `#E5E7EB` / `#c8c4d8`.
- Fonts: `Geist` (`--font-geist-sans`), `Inter` (`--font-inter`), `Geist_Mono` (`--font-geist-mono`) via `next/font/google` plus `Material Symbols Outlined` stylesheet in `src/app/layout.tsx`.
- Breakpoint split: Mobile shell (`< 1024px`, `< lg`) renders compact header + 4-tab fixed `MobileBottomNav`; Desktop shell (`>= 1024px`, `lg+`) renders full fixed-glass nav bar + 1-row `Footer` (`hidden lg:block`).
- Preserved `<ShopMateLogo />` invariants (`tests/brand-logo.test.tsx`): `role="img"`, `aria-label="ShopMate AI"`, `fill="currentColor"` on `Shop`, variants (`horizontal`, `icon`, `full`, `mascot`), tagline, and size classes (`h-7`/`h-9`/`h-11`/`h-14`).
- Preserved `<PayPalCheckout />` invariants (`tests/paypal-checkout.test.tsx`): `layout: "vertical"`, order payload `{ items: [{ productId, quantity }], currency: "USD" }`, header `X-ShopMate-Capture-Token`, verbatim copy (`"ShopMate Sandbox demonstration"`, `"not a real retailer purchase"`, `"No goods are shipped"`, `"Sandbox payment captured"`, `"Confirming payment with PayPal"`, `"Capture pending — payment not complete"`, `"Payment outcome unknown"`, `"Do not retry"`, `"Checkout cancelled — no payment was taken."`). Omit developer simulation drawers from Cart and Confirmation.
- Strict honesty: zero fabricated stock counts (`4,820`), ratings (`4.8`), fake discounts (`compareAtPrice > price` only), fake CA 8% tax (`$31.04`), fake savings/CO2e (`1.84 kg CO2e`), or dead `href="#"` links.
- Accessibility landmarks retained: `<header>`, `<nav aria-label="Main">`, `<main id="main-content">`, `<footer>`, `#hero-search`, `#chat-input`, `<aside aria-label="Shopping requirements & refinements">`, `aria-label="Recommended products"`, `<article>`.
- SSR Hydration Safety: `useSyncExternalStore` and post-mount `useEffect` storage hydration (`localStorage` / `sessionStorage`) only; server render always matches initial client render.

## Review Focus

- **Receipt Reload & Reset Edge Case:** Adding a product (`addToCart`) or clicking `<- Checkout Flow` clears `shopmate.receipt.v1` in `sessionStorage` so stale receipts never reappear after starting a new cart, while refreshing during Confirmation restores the verified receipt cleanly with zero hydration mismatch (`Task 1`, `Task 5`).
- **Untrusted Live Product Data & Missing Discounts:** Live `channel3` items carrying unsafe URLs (`javascript:`, `data:`) in `buyUrl` must omit external links in `ProductAnalysisDrawer`, and cards without strictly greater `compareAtPrice` must never render percentage discount pills (`Task 2`).
- **Partial/Empty Assistant Payloads & Specs:** `ChatMessageItem` must gracefully render assistant messages where `recommendations` is omitted or incomplete and `product.specs` is empty without inventing fit percentages or crashing (`Task 3`).
- **Cross-Currency & Mixed-Unit Spec Comparison:** `spec-groups` and `ComparisonTable` must suppress numeric winner (`SPEC LEAD` / `BEST`) badges and progress bar comparisons when units mismatch (e.g., `"8 hours buds, 24 with case"` vs `"34 hours"`, `"1.3 lb"` vs `"9.6 oz"`) or currencies differ (`Task 4`).
- **Fixed Mobile Chrome Collision:** Below `lg`, Confirmation mode hides `MobileBottomNav`, mobile floating `ComparisonDrawer` clears `MobileBottomNav` at `bottom-20`, mobile `/compare` choice bar sits at `bottom-16`, and `/chat` sticky composer clears bottom navigation safely (`Task 1`, `Task 2`, `Task 3`, `Task 4`).

---

### Task 1: Stitch Visual System, Receipt Shell Store & Global Mobile/Desktop Chrome

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/lib/store.tsx`
- Modify: `src/components/shop/navbar.tsx`
- Create: `src/components/shop/mobile-bottom-nav.tsx`
- Modify: `src/components/shop/footer.tsx`
- Create: `tests/shell-chrome.test.tsx`

**Interfaces:**
- Consumes: `useShop()`, `ShopProvider` (`src/lib/store.tsx`), `ShopMateLogo` (`src/components/brand/logo.tsx`), `ComparisonDrawer` (`src/components/compare/comparison-drawer.tsx`).
- Produces in `src/lib/store.tsx`:
  - `export interface ReceiptItemSnapshot { product: Product; quantity: number; }`
  - `export interface ShopReceiptSnapshot { orderId: string; captureId: string; amount: { currency: string; value: string }; purchasedItems: ReceiptItemSnapshot[]; capturedAt: string; }`
  - `useShop()` extended with `{ activeReceipt: ShopReceiptSnapshot | null; setActiveReceipt: (receipt: ShopReceiptSnapshot) => void; clearActiveReceipt: () => void; }` (`addToCart(...)` automatically clears `activeReceipt` and `sessionStorage["shopmate.receipt.v1"]`).
- Produces components: `<Navbar />` (Desktop `06`–`12` + Mobile `01`–`04` + Mobile Confirmation `05` variant + `#shopmate-mobile-search-sheet`), `<MobileBottomNav />`, `<Footer />`.

- [ ] **Step 1: Write the failing test in `tests/shell-chrome.test.tsx`**

```tsx
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

let mockPathname = "/";
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ShopProvider, useShop } from "@/lib/store";
import { Navbar } from "@/components/shop/navbar";
import { MobileBottomNav } from "@/components/shop/mobile-bottom-nav";
import { Footer } from "@/components/shop/footer";

beforeEach(() => {
  mockPathname = "/";
  mockPush.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

function ReceiptHarness() {
  const { activeReceipt, setActiveReceipt, clearActiveReceipt, addToCart } = useShop();
  return (
    <div>
      <span data-testid="receipt-id">{activeReceipt?.orderId ?? "none"}</span>
      <button
        type="button"
        onClick={() =>
          setActiveReceipt({
            orderId: "ORD-123",
            captureId: "CAP-456",
            amount: { currency: "USD", value: "249.00" },
            purchasedItems: [],
            capturedAt: "10:15 AM",
          })
        }
      >
        Set Receipt
      </button>
      <button type="button" onClick={() => clearActiveReceipt()}>
        Clear Receipt
      </button>
      <button type="button" onClick={() => addToCart("demo-aurora-headphones")}>
        Add Item
      </button>
    </div>
  );
}

describe("Stitch Global Chrome & Receipt Shell", () => {
  it("persists receipt in sessionStorage and clears automatically on addToCart or clear", () => {
    render(
      <ShopProvider>
        <ReceiptHarness />
      </ShopProvider>,
    );
    expect(screen.getByTestId("receipt-id").textContent).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "Set Receipt" }));
    expect(screen.getByTestId("receipt-id").textContent).toBe("ORD-123");
    expect(window.sessionStorage.getItem("shopmate.receipt.v1")).toContain("ORD-123");

    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
    expect(screen.getByTestId("receipt-id").textContent).toBe("none");
    expect(window.sessionStorage.getItem("shopmate.receipt.v1")).toBeNull();
  });

  it("hides MobileBottomNav and renders Checkout Flow back button when activeReceipt exists on /cart", () => {
    mockPathname = "/cart";
    window.sessionStorage.setItem(
      "shopmate.receipt.v1",
      JSON.stringify({
        orderId: "ORD-999",
        captureId: "CAP-999",
        amount: { currency: "USD", value: "249.00" },
        purchasedItems: [],
        capturedAt: "11:00 AM",
      }),
    );
    render(
      <ShopProvider>
        <Navbar />
        <MobileBottomNav />
      </ShopProvider>,
    );
    expect(screen.queryByRole("navigation", { name: /mobile bottom/i })).toBeNull();
    const backBtn = screen.getByRole("button", { name: /back from checkout confirmation/i });
    expect(backBtn).toBeDefined();
    fireEvent.click(backBtn);
    expect(screen.getByRole("navigation", { name: /mobile bottom/i })).toBeDefined();
  });

  it("opens mobile quick search drawer and submits query to /chat", () => {
    render(
      <ShopProvider>
        <Navbar />
      </ShopProvider>,
    );
    const openBtn = screen.getByRole("button", { name: /open quick search/i });
    fireEvent.click(openBtn);
    const input = screen.getByLabelText(/ask shopmate ai/i);
    fireEvent.change(input, { target: { value: "wireless buds" } });
    fireEvent.submit(input.closest("form")!);
    expect(mockPush).toHaveBeenCalledWith("/chat?q=wireless%20buds");
  });

  it("renders Footer with 4 internal navigable links and zero hash placeholders", () => {
    render(<Footer />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      expect(href.startsWith("/")).toBe(true);
      expect(href).not.toBe("#");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shopmate-ai; npx vitest run tests/shell-chrome.test.tsx`
Expected: FAIL because `MobileBottomNav` does not exist and `useShop()` does not provide `activeReceipt` / `setActiveReceipt`.

- [ ] **Step 3: Implement Stitch tokens (`globals.css`), fonts/icons & shell (`layout.tsx`), `ShopProvider` receipt state (`store.tsx`), `Navbar`, `MobileBottomNav`, and 1-row `Footer`**

Implementation guidance per Spec Sections 3, 4, 5:
- `src/app/globals.css`: Define all Stitch CSS variables (`--surface: #fcf8ff`, `--background: #fcf8ff`, `--surface-card: #ffffff`, `--surface-container-lowest: #ffffff`, `--canvas-bg: #FAFAFC`, `--surface-container-low: #f5f2ff`, `--surface-container: #efecfb`, `--surface-container-high: #e9e6f5`, `--surface-container-highest: #e4e1ef`, `--surface-dim: #dbd8e7`, `--surface-variant: #e4e1ef`, `--on-surface: #1b1b25`, `--on-surface-variant: #464556`, `--text-muted: #747482`, `--brand-deep-indigo: #131627`, `--primary: #412cdd`, `--primary-container: #5b4cf5`, `--primary-fixed: #e3dfff`, `--primary-fixed-dim: #c4c0ff`, `--on-primary-fixed: #120068`, `--on-primary: #ffffff`, `--secondary: #006c49`, `--secondary-container: #6cf8bb`, `--secondary-fixed: #6ffbbe`, `--on-secondary-container: #00714d`, `--tertiary: #734700`, `--tertiary-fixed: #ffddb8`, `--tertiary-fixed-dim: #ffb95f`, `--on-tertiary-fixed: #2a1700`, `--on-tertiary-fixed-variant: #653e00`, `--error: #ba1a1a`, `--error-container: #ffdad6`, `--outline: #777587`, `--outline-variant: #c8c4d8`, `--border-subtle: #EEEEF2`, `--border-strong: #E5E7EB`), map them into `@theme inline`, define `.material-symbols-outlined`, `.pb-safe`, `.pt-safe`, `.no-scrollbar`, `.stitch-tier-1/2/3`.
- `src/app/layout.tsx`: Keep `Geist`, `Inter`, `Geist_Mono`, `Instrument_Serif`, add Material Symbols Outlined stylesheet link `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" />` inside `<head>`, wrap `<main id="main-content" className="flex flex-1 flex-col pb-24 lg:pb-8">`, render `<Navbar />`, `<Footer />`, `<MobileBottomNav />`, `<ComparisonDrawer />`.
- `src/lib/store.tsx`: Manage `activeReceipt` inside `createShopStore()` hydrated post-mount from `window.sessionStorage.getItem("shopmate.receipt.v1")` with schema validation; expose `activeReceipt`, `setActiveReceipt`, `clearActiveReceipt`; automatically clear `activeReceipt` + storage inside `addToCart(...)`.
- `src/components/shop/navbar.tsx`: Render Desktop `h-16` glass bar (`ShopMateLogo`, `SANDBOX MODE` pill, centered `#navbar-quick-search` with `⌘K` shortcut, `nav[aria-label="Main"]` with active `bg-primary-fixed/60 text-primary`, notification bell popover showing current cart/compare updates, indigo avatar) + Mobile `< lg` compact Stitch header (`ShopMate` + `v2.0`, `SANDBOX` pill, Search trigger opening `#shopmate-mobile-search-sheet` modal form submitting to `/chat?q=...`, notification bell, avatar; swaps to `<-` `aria-label="Back from checkout confirmation"` + `"Checkout Flow"` title + `SANDBOX` + avatar when `pathname === "/cart" && activeReceipt !== null`).
- `src/components/shop/mobile-bottom-nav.tsx`: Export `MobileBottomNav` (`<nav aria-label="Mobile bottom navigation" ...>`), hidden when `pathname === "/cart" && activeReceipt !== null`, hidden on `lg:hidden`, 4 equal tabs (`Home` `/`, `AI Assistant` `/chat`, `Compare` `/compare` with badge, `Cart` `/cart` with primary badge).
- `src/components/shop/footer.tsx`: Export `Footer` (`hidden lg:block`), 1-row Stitch system bar (`Catalog Engine: Ready (Channel3 + Demo)` • `Server-Verified PayPal Sandbox` | `Discovery` `/`, `AI Workspace` `/chat`, `Product Matrix` `/compare`, `Cart & Checkout` `/cart`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd shopmate-ai; npx vitest run tests/shell-chrome.test.tsx tests/brand-logo.test.tsx`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
cd shopmate-ai
git add src/app/globals.css src/app/layout.tsx src/lib/store.tsx src/components/shop/navbar.tsx src/components/shop/mobile-bottom-nav.tsx src/components/shop/footer.tsx tests/shell-chrome.test.tsx
git commit -m "feat(ui): apply Stitch design tokens, receipt shell store, and mobile/desktop navigation chrome"
```

---

### Task 2: Discovery Homepage (`/`), Slide-Over `ProductAnalysisDrawer`, `ProductCard`, `HeroSearch`, `DiscoveryCatalog`, and `ComparisonDrawer`

**Files:**
- Create: `src/components/shop/product-analysis-drawer.tsx`
- Modify: `src/components/shop/product-card.tsx`
- Modify: `src/components/shop/hero-search.tsx`
- Modify: `src/components/shop/discovery-catalog.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/compare/comparison-drawer.tsx`
- Modify: `tests/stitch-ui.test.tsx`

**Interfaces:**
- Consumes: `useShop()` (`src/lib/store.tsx`), `isSafeHttpUrl` (`src/lib/catalog/url.ts`), `formatMoney` (`src/lib/format.ts`), `buildComparisonMatrix` (`src/lib/compare/compare-matrix.ts`), `ProductImage`, `ProductProvenanceBadge`.
- Produces in `src/components/shop/product-analysis-drawer.tsx`:
  - `export function ProductAnalysisDrawer({ product, open, onClose }: { product: Product | null; open: boolean; onClose: () => void; })`
- Produces updated `ProductCard` (`[Compare / Compared | Analysis >]` / `View Analysis` opening `ProductAnalysisDrawer`), `CompactProductCard`, `HeroSearch`, `DiscoveryCatalog`, `ComparisonDrawer`.

- [ ] **Step 1: Write failing tests in `tests/stitch-ui.test.tsx`**

Update/extend `tests/stitch-ui.test.tsx` to verify:
1. `ProductCard` renders exact Stitch buttons (`Compare` + `Analysis` / `View Analysis`), clicking `Compare` switches to `Compared`, and clicking `Analysis` opens `ProductAnalysisDrawer` (`role="dialog"`) displaying full specs `<dl>`, `ProductProvenanceBadge`, and primary `Add to cart` CTA (`Add to cart` -> `In cart`).
2. Review Focus: `ProductAnalysisDrawer` omits any `buyUrl` link for `channel3` items whose URL uses `javascript:` or `data:`, while rendering safe `https://` `See at <merchant>` links; `ProductCard` renders `-XX%` discount pill only when `compareAtPrice > price`.
3. `DiscoveryCatalog` category bar (`Audio`, `Wearables`, `Workspace`, `Photography`, `All Catalog`, `Featured`) filters and sorts (`Featured`, `Lowest Price`, `Highest Price`) interactively and renders `Catalog Attribute Profile` telemetry card + mobile `Instant Matrix` banner.
4. `ComparisonDrawer` renders floating dock with `X/4 Selected`, expands `Side-by-Side Spec Breakdown` cards, hides on `/chat`, `/compare`, `/cart`, and clears mobile bottom tab bar (`bottom-20`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shopmate-ai; npx vitest run tests/stitch-ui.test.tsx`
Expected: FAIL (`ProductAnalysisDrawer` missing; `ProductCard` still renders old button order/copy).

- [ ] **Step 3: Implement `ProductAnalysisDrawer`, `ProductCard`, `HeroSearch`, `DiscoveryCatalog`, `page.tsx`, and `ComparisonDrawer`**

Implementation guidance per Spec Sections 6.1 & 8:
- `src/components/shop/product-analysis-drawer.tsx`: Slide-over right sheet (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`), closes on `Escape` and backdrop/close button click, locks body scroll cleanly while open, renders large `#FAFAFC` `ProductImage`, `ProductProvenanceBadge`, price + conditional `compareAtPrice` (`> price`), safe `isSafeHttpUrl(buyUrl)` link (`See at <merchant>`), complete `Object.entries(product.specs)` list, `Ask AI Workspace` link (`/chat?q=...`), secondary `Compare / Compared` toggle, and primary `Add to Cart` / `In Cart` CTA (`min-h-[44px]`).
- `src/components/shop/product-card.tsx`:
  - `ProductCard`: Top row with `ProductProvenanceBadge` + merchant/category pill; `#FAFAFC` media well (`h-44` desktop / `w-24 h-24` mobile compact layout or responsive card matching `03` below `sm` and `11`/`12` above `sm`) with top-right `Compare`/`Compared` badge + hover tooltip `"Added to Matrix • N/4 slots used"`, bottom-left honest provenance/status pill; bold price + conditional real `compareAtPrice > price` strikethrough + `-XX%` emerald badge; 3-row `#f5f2ff` (`bg-surface-container-low`) spec preview box with Material Symbols; exact two-button footer `[Compare / Compared | Analysis >]` (responsive label shows `View Analysis` / `Analysis` cleanly) opening `<ProductAnalysisDrawer />`. Keep `CompactProductCard` styling updated cleanly with `#ffffff` + `#f5f2ff` tokens.
- `src/components/shop/hero-search.tsx`: Desktop Stitch `06` omni-search with bot icon tile (`smart_toy`), `#hero-search` (`/` keyboard shortcut), `Decision Engine` indicator chip, clear button, `Synthesize ->` CTA, and internal border-t `SUGGESTED:` chips; Mobile `03` compact sparkle layout with circular `arrow_upward` button and horizontally scrollable snap chips below.
- `src/components/shop/discovery-catalog.tsx` & `src/app/page.tsx`:
  - Remove legacy *How ShopMate AI works*, *Why choose ShopMate AI*, and dark bottom CTA band completely.
  - Hero zone with top-center & top-right ambient radial glows, honest status pill `"Catalog Synced · ${DEMO_PRODUCTS.length} Curated Demo Items · Live Channel3 Search Ready"`, gradient H1 (`Shop smarter. Compare better. Buy with confidence.`), subtitle, `<HeroSearch />`.
  - 5-tile Stitch category bar (`Featured` / `All Catalog` + `Audio`, `Wearables`, `Workspace`, `Photography` from `DEMO_CATEGORIES` with real `"N items"` counts and `"Ask AI"` shortcut link `/chat?q=...`).
  - Curated filter/sort bar (`Curated Recommendations` / `Curated Catalog Picks`, active dismissible filter pill, segmented sort switcher `Featured | Lowest Price | Highest Price`), 4-column (`md:grid-cols-2 lg:grid-cols-4`) grid, `Catalog Attribute Profile` honest SVG comparison card below grid, and mobile `Instant Matrix` gradient banner linking `/compare`.
- `src/components/compare/comparison-drawer.tsx`: Exact Stitch `12` floating `#131627/95` (`bg-brand-deep-indigo/95`) dock (`max-w-[1360px]`), `bottom-20 lg:bottom-3` so it sits above `MobileBottomNav` on `< lg`, peek bar with `compare_arrows`, `Instant Comparison Matrix`, `N/4 Selected` pill, stacked circular thumbnails, `Launch Matrix ->` CTA, expandable `Side-by-Side Spec Breakdown` cards + factual `Quick Verdict` card with price range / differing spec count.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd shopmate-ai; npx vitest run tests/stitch-ui.test.tsx`
Expected: PASS (all Discovery, Card, Drawer, and Dock tests green).

- [ ] **Step 5: Commit**

```bash
cd shopmate-ai
git add src/components/shop/product-analysis-drawer.tsx src/components/shop/product-card.tsx src/components/shop/hero-search.tsx src/components/shop/discovery-catalog.tsx src/app/page.tsx src/components/compare/comparison-drawer.tsx tests/stitch-ui.test.tsx
git commit -m "feat(discovery): implement exact Stitch homepage, analysis drawer, product cards, and sliding comparison dock"
```

---

### Task 3: AI Shopping Workspace (`/chat`) Strict 2-Column Desktop & Mobile Experience (`02`, `07`)

**Files:**
- Modify: `src/components/chat/chat-client.tsx`
- Modify: `src/components/chat/requirements-panel.tsx`
- Modify: `src/components/chat/chat-message.tsx`
- Modify: `src/components/chat/chat-input.tsx`
- Modify: `src/components/chat/shortlist-panel.tsx`
- Create: `tests/chat-workspace.test.tsx`

**Interfaces:**
- Consumes: `chatStore` (`src/lib/chat-store.ts`), `sendChatMessage` (`src/lib/chat-api.ts`), `buildHistory` (`src/lib/chat-history.ts`), `useShop()` (`src/lib/store.tsx`), `isSafeHttpUrl`, `formatMoney`.
- Produces: Strictly 2-column desktop workspace (`aside[aria-label="Shopping requirements & refinements"]` `xl:col-span-3` + `xl:col-span-9` wide stream with `aria-label="Recommended products"` 2-up inline Synthesis Cards inside `ChatMessageItem`), plus mobile `< lg` `Chat | Context | Shortlist` tabs (`ShortlistPanel` rendered cleanly inside mobile Shortlist tab + inline `5px` left-border Stitch `02` cards in chat stream) and `#chat-input` sticky glass composer clearing `bottom-16` bottom nav.

- [ ] **Step 1: Write failing tests in `tests/chat-workspace.test.tsx`**

```tsx
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ShopProvider } from "@/lib/store";
import { ChatMessageItem } from "@/components/chat/chat-message";
import { ChatClient } from "@/components/chat/chat-client";
import { chatStore } from "@/lib/chat-store";
import { getDemoProduct } from "@/lib/demo-catalog";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  chatStore.replaceAll([]);
});

afterEach(() => {
  cleanup();
});

describe("Stitch AI Shopping Workspace (/chat)", () => {
  it("renders inline 2-up synthesis cards with recommendation insights and Add/Compare actions", () => {
    const aurora = getDemoProduct("demo-aurora-headphones")!;
    render(
      <ShopProvider>
        <ChatMessageItem
          message={{
            id: "msg-1",
            role: "assistant",
            content: "Here are two grounded picks.",
            createdAt: "2026-11-10T10:00:00Z",
            products: [aurora],
            recommendations: [
              {
                productId: aurora.id,
                badge: "Best Overall",
                whyItMatches: "Matches your ANC travel criteria.",
                requirementsSatisfied: ["Battery >= 25h"],
                failedRequirements: ["Price slightly above $200 ideal"],
                missingOrUnverified: ["Codec bitrate unlisted"],
                tradeOffs: ["Over-ear form factor is bulkier than earbuds."],
                whoShouldChoose: "Frequent flyers prioritizing ANC endurance.",
              },
            ],
            agentMeta: {
              mode: "ai",
              model: "gemini-2.5-flash",
              toolsUsed: ["search_catalog"],
              catalog: { source: "demo" },
            },
          }}
        />
      </ShopProvider>,
    );

    const list = screen.getByRole("list", { name: /recommended products/i });
    expect(list).toBeDefined();
    expect(screen.getByText("Best Overall")).toBeDefined();
    expect(screen.getByText(/Over-ear form factor/i)).toBeDefined();
    expect(screen.getByText(/Price slightly above \$200 ideal/i)).toBeDefined();
    const addBtn = screen.getByRole("button", { name: /add to cart/i });
    fireEvent.click(addBtn);
    expect(screen.getByRole("button", { name: /in cart/i })).toBeDefined();
  });

  it("handles missing recommendations and empty specs without throwing or fabricating scores", () => {
    const bareProduct = {
      ...getDemoProduct("demo-aurora-headphones")!,
      specs: {},
    };
    render(
      <ShopProvider>
        <ChatMessageItem
          message={{
            id: "msg-2",
            role: "assistant",
            content: "Found one bare record.",
            createdAt: "2026-11-10T10:00:00Z",
            products: [bareProduct],
          }}
        />
      </ShopProvider>,
    );
    expect(screen.queryByText(/98% FIT SCORE/i)).toBeNull();
    expect(screen.getByText("Aurora ANC Headphones")).toBeDefined();
  });

  it("uses strict 2-column desktop workspace (Requirements rail + Conversation stream, no 3rd desktop Shortlist rail)", () => {
    render(
      <ShopProvider>
        <ChatClient />
      </ShopProvider>,
    );
    expect(screen.getByRole("complementary", { name: /shopping requirements & refinements/i })).toBeDefined();
    expect(screen.queryByRole("complementary", { name: /live product shortlist & decision insights/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shopmate-ai; npx vitest run tests/chat-workspace.test.tsx`
Expected: FAIL (`ChatClient` still renders `ShortlistPanel` aside on desktop; `ChatMessageItem` does not display recommendation insights/badges/Add-to-Cart price).

- [ ] **Step 3: Implement Stitch Workspace components (`chat-client.tsx`, `requirements-panel.tsx`, `chat-message.tsx`, `chat-input.tsx`, `shortlist-panel.tsx`)**

Implementation guidance per Spec Section 6.2 & 7 #7:
- `src/components/chat/chat-client.tsx`: Top `SHOPMATE WORKSPACE` ribbon (query topic pill + status indicator `Ready` / `Evaluating` + `Export Thread` download/copy JSON/markdown helper + `Reset` button); mobile `< lg` compact active research strip + `Chat | Context | Shortlist` segmented switcher; desktop `lg+` strictly **2-column** `max-w-[1440px] px-4 md:px-6 lg:px-8 grid-cols-12 gap-6` (`lg:col-span-4 xl:col-span-3` `<RequirementsPanel />` left rail; `lg:col-span-8 xl:col-span-9` conversation stream without any `lg:block` right Shortlist rail). Mobile renders `ShortlistPanel` strictly when `mobileTab === "shortlist"`. Ensure sticky composer sits cleanly without mobile bottom tab bar collision.
- `src/components/chat/requirements-panel.tsx`: Stitch `07` left rail cards (`Active Stream` progress meter `"Criteria Captured"`, `Active Constraints` with `Reset` / budget preset pills `< $50`..`< $500` / priorities / use-case presets, dynamic `Catalog Metrics Extracted` SVG chart grounded strictly in shortlisted product prices/attributes when available, and `Quick Exploration Prompts`). Keep `<aside aria-label="Shopping requirements & refinements">`.
- `src/components/chat/chat-message.tsx`:
  - Accept optional `recommendations` + `onFollowUp?: (query: string) => void` on `ChatMessageItem`.
  - User message: Stitch `#efecfb` on desktop (`md:bg-surface-container md:text-on-surface`) and `#131627` white-text on mobile (`bg-brand-deep-indigo text-white`) with user icon & formatted timestamp.
  - Telemetry divider pill centered between user & assistant turns (`Analyzed N records · Tools: ... · Source: ...`).
  - Assistant white Copilot card (`bg-surface-card rounded-2xl border border-border-subtle p-4 md:p-6 shadow-sm`) with `auto_awesome` indigo avatar, `"ShopMate Research Copilot"`, honest provenance badge (`LIVE Catalog` vs `Demo Fallback`), copy-reply button, narrative copy, clarifications box, and `ul[aria-label="Recommended products"]` (`grid-cols-1 lg:grid-cols-2 gap-4`).
  - Inline Stitch Synthesis Cards: Left-border accent on mobile (`border-l-[5px] border-l-primary-container` for Best Overall / rank 0, `border-l-secondary` for Best Value / rank 1), top badge (`insight?.badge` + `ProductProvenanceBadge`), `w-20 h-20` `#FAFAFC` thumbnail + title + `#412cdd` price + merchant, `2×2` recessed `#f5f2ff` spec tiles (first 4 real specs or clean fallback copy if empty), `Key Trade-off:` callout box (`insight?.tradeOffs[0] || insight?.whyItMatches`), `failedRequirements` inline alert when present, collapsible `Specifications & Checks` disclosure (`requirementsSatisfied`, `missingOrUnverified`, `whoShouldChoose`), and `[Add to Cart ($Price) | Compare]` footer + `Suggested Exploration Paths` follow-up pills when `onFollowUp` provided.
- `src/components/chat/chat-input.tsx`: Sticky Stitch Tier-3 glass composer (`#chat-input`) with model indicator pill, shortcut caption (`Enter` to send), and primary indigo circular `arrow_upward` button.
- `src/components/chat/shortlist-panel.tsx`: Update mobile-tab Shortlist styling cleanly to `#fcf8ff` / `#ffffff` / `#f5f2ff` Stitch palette.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd shopmate-ai; npx vitest run tests/chat-workspace.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd shopmate-ai
git add src/components/chat/chat-client.tsx src/components/chat/requirements-panel.tsx src/components/chat/chat-message.tsx src/components/chat/chat-input.tsx src/components/chat/shortlist-panel.tsx tests/chat-workspace.test.tsx
git commit -m "feat(chat): implement Stitch 2-column desktop workspace and inline synthesis cards"
```

---

### Task 4: Product Comparison Matrix (`/compare`) Categorized Specs, AI Verdict & Choice CTA (`01`, `08`)

**Files:**
- Create: `src/lib/compare/spec-groups.ts`
- Modify: `src/components/compare/compare-client.tsx`
- Modify: `src/components/compare/comparison-table.tsx`
- Modify: `src/components/compare/comparison-notes.tsx`
- Create: `tests/compare-ui.test.tsx`

**Interfaces:**
- Consumes: `buildComparisonMatrix` (`src/lib/compare/compare-matrix.ts`), `notesForProduct` (`src/components/compare/comparison-notes.tsx`), `useShop()` (`src/lib/store.tsx`), `formatMoney` (`src/lib/format.ts`).
- Produces in `src/lib/compare/spec-groups.ts`:
  - `export interface SpecGroup { id: string; title: string; subtitle: string; icon: string; rows: SpecRow[]; }`
  - `export interface NumericLeadResult { winnerIds: string[]; ratioByProductId: Record<string, number>; deltaLabel: string | null; }`
  - `export function groupComparisonSpecRows(rows: SpecRow[]): SpecGroup[]`
  - `export function computeUnitSafeLead(row: SpecRow, products: Product[]): NumericLeadResult | null`

- [ ] **Step 1: Write failing tests in `tests/compare-ui.test.tsx`**

```tsx
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/compare",
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams("ids=demo-aurora-headphones,demo-pulse-speaker"),
}));

import { groupComparisonSpecRows, computeUnitSafeLead } from "@/lib/compare/spec-groups";
import { buildComparisonMatrix } from "@/lib/compare/compare-matrix";
import { getDemoProduct } from "@/lib/demo-catalog";
import { ShopProvider } from "@/lib/store";
import { CompareClient } from "@/components/compare/compare-client";
import type { Product } from "@/types";

beforeEach(() => {
  mockPush.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Stitch Comparison Matrix & Unit-Safe Spec Grouping", () => {
  it("groups arbitrary catalog specs into deterministic non-empty Stitch categories", () => {
    const p1 = getDemoProduct("demo-aurora-headphones")!;
    const p2 = getDemoProduct("demo-pulse-speaker")!;
    const matrix = buildComparisonMatrix([p1, p2]);
    const groups = groupComparisonSpecRows(matrix.specRows);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups.every((g) => g.rows.length > 0)).toBe(true);
    expect(groups.some((g) => g.title.includes("Battery"))).toBe(true);
  });

  it("computes SPEC LEAD only for single-number matching units and rejects mixed units", () => {
    const aurora = getDemoProduct("demo-aurora-headphones")!; // 34 hours, 9.6 oz
    const speaker = getDemoProduct("demo-pulse-speaker")!; // 18 hours, 1.3 lb
    const earbuds = getDemoProduct("demo-bloom-earbuds")!; // "8 hours buds, 24 with case"

    const hoursMatrix = buildComparisonMatrix([aurora, speaker]);
    const batteryRow = hoursMatrix.specRows.find((r) => r.key === "Battery life")!;
    const batteryLead = computeUnitSafeLead(batteryRow, [aurora, speaker]);
    expect(batteryLead?.winnerIds).toEqual([aurora.id]);
    expect(batteryLead?.ratioByProductId[aurora.id]).toBe(100);
    expect(batteryLead?.ratioByProductId[speaker.id]).toBeLessThan(100);

    // Weight: 9.6 oz vs 1.3 lb -> mixed units must return null (never crown 1.3 < 9.6 falsely)
    const weightRow = hoursMatrix.specRows.find((r) => r.key === "Weight")!;
    expect(computeUnitSafeLead(weightRow, [aurora, speaker])).toBeNull();

    // Compound prose battery string ("8 hours buds, 24 with case") -> must return null
    const compoundMatrix = buildComparisonMatrix([aurora, earbuds]);
    const compoundBatteryRow = compoundMatrix.specRows.find((r) => r.key === "Battery life")!;
    expect(computeUnitSafeLead(compoundBatteryRow, [aurora, earbuds])).toBeNull();
  });

  it("renders fixed bottom choice bar that adds chosen item to cart and navigates to /cart", () => {
    render(
      <ShopProvider>
        <CompareClient />
      </ShopProvider>,
    );
    expect(screen.getByText(/Product Comparison/i)).toBeDefined();
    const chooseBtn = screen.getAllByRole("button", { name: /choose aurora/i })[0]!;
    fireEvent.click(chooseBtn);
    expect(mockPush).toHaveBeenCalledWith("/cart");
  });

  it("renders currency mismatch alert without crashing when currencies differ", () => {
    const usd: Product = { ...getDemoProduct("demo-aurora-headphones")!, currency: "USD" };
    const eur: Product = { ...getDemoProduct("demo-pulse-speaker")!, currency: "EUR" };
    const matrix = buildComparisonMatrix([usd, eur]);
    expect(matrix.priceComparison.hasCurrencyMismatch).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shopmate-ai; npx vitest run tests/compare-ui.test.tsx`
Expected: FAIL (`@/lib/compare/spec-groups` does not exist).

- [ ] **Step 3: Implement `spec-groups.ts` and Stitch Compare screens (`comparison-table.tsx`, `comparison-notes.tsx`, `compare-client.tsx`)**

Implementation guidance per Spec Section 6.3:
- `src/lib/compare/spec-groups.ts`:
  - `groupComparisonSpecRows`: Deterministic keyword categorization (`Audio & Acoustics`, `Battery & Power Delivery`, `Build, Ergonomics & Portability`, `Connectivity & Features`), numbering displayed groups sequentially and dropping empty groups cleanly.
  - `computeUnitSafeLead`: Strictly parses values matching `^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z%°/+-]+(?:\s+[a-zA-Z]+)?)\s*$` across all non-missing products (`>= 2` present, no commas/multi-clause prose like `"8 hours buds, 24 with case"`), checks normalized units match cleanly across every non-missing product, determines direction (`lower` when `ProductAttribute.better === "lower"` or weight/latency/price-like keys `"weight"`, `"charge"`, `"charging"`, `"latency"`; otherwise `"higher"` if `ProductAttribute.better === "higher"` or `"battery"`, `"brightness"`, `"output"`, `"waterproof"`, `"warranty"`, `"resolution"`), avoids ties, and returns `{ winnerIds, ratioByProductId, deltaLabel }`.
- `src/components/compare/comparison-table.tsx`: Preserve `ComparisonTable` props (`products`, `onRemove`, `showDifferencesOnly`); render currency mismatch notice cleanly; render Sticky Product Deck (`sticky top-16 z-20`) with Stitch `08` desktop columns (`w-16 h-16` image, verdict badge, name, price, `[Add to Cart | Remove]`) and Stitch `01` compact mobile 2-col deck; render each `SpecGroup` in white `rounded-2xl` cards with `#f5f2ff` (`bg-surface-container-low`) section banner, `SPEC LEAD` / delta badges & proportional bars where `computeUnitSafeLead` returns non-null, `"Not documented"` pills for missing specs, and mobile side-by-side 2-col `#f5f2ff` spec sub-cards + emerald `Verified Catalog Specs` banner.
- `src/components/compare/comparison-notes.tsx`: Keep `notesForProduct` export verbatim (`tests/compare.test.ts` uses it directly!) and restyle `<ComparisonNotes />` with Stitch `#ffffff` / `#f5f2ff` / `#006c49` tokens.
- `src/components/compare/compare-client.tsx`: Breadcrumb (`Discovery > Comparison Matrix`), `+ Add Product` scroll-to-picker trigger, `Differences Only` toggle, `Share` button (`navigator.clipboard.writeText`), `Ask AI Workspace`, `Clear All`; Stitch `08` white `AI Synthesized Verdict` card with 2 genuine SVG radial gauges (e.g. `Spec Completeness` % and `Difference Spread` %) and executive takeaway; empty state with `PRESET_COMPARISONS` and catalog picker grid (`remainingProducts`); fixed bottom Choice CTA bar (`fixed bottom-16 inset-x-0 lg:bottom-0 z-30` when `compareProducts.length >= 2`) with `Choose [Short Name]` buttons (`addToCart` + `router.push("/cart")`). Add bottom padding to `<CompareClient />` container (`pb-36 lg:pb-24`) so content never hides behind the bottom choice bar.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd shopmate-ai; npx vitest run tests/compare-ui.test.tsx tests/compare.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd shopmate-ai
git add src/lib/compare/spec-groups.ts src/components/compare/compare-client.tsx src/components/compare/comparison-table.tsx src/components/compare/comparison-notes.tsx tests/compare-ui.test.tsx
git commit -m "feat(compare): implement Stitch categorized comparison matrix, unit-safe spec leads, and sticky verdict deck"
```

---

### Task 5: Shopping Cart (`/cart`), PayPal Sandbox Checkout & Confirmation Receipt (`04`, `05`, `09`)

**Files:**
- Modify: `src/components/cart/paypal-checkout.tsx`
- Modify: `src/components/cart/cart-item.tsx`
- Modify: `src/components/cart/cart-summary.tsx`
- Modify: `src/components/cart/cart-client.tsx`
- Modify: `src/components/shop/empty-state.tsx`
- Create: `tests/cart-ui.test.tsx`

**Interfaces:**
- Consumes: `useShop()`, `useCart()`, `useCompare()` (`src/lib/store.tsx`), `DEMO_PRODUCTS` (`src/lib/demo-catalog.ts`), `formatMoney` (`src/lib/format.ts`).
- Extends `PayPalCheckout` props optionally: `{ items: PayPalCheckoutItem[]; onCaptureSuccess?: (result: PayPalCaptureSuccessEvent) => void; onPhaseChange?: (phase: CheckoutPhase) => void; }` (`CheckoutPhase` exported cleanly; ZERO change to existing request bodies, capture verification, or copied strings tested by `tests/paypal-checkout.test.tsx`!).
- Uses `setActiveReceipt` & `clearActiveReceipt` on `useShop()` so `/cart` Confirmation renders cleanly across reloads and toggles mobile confirmation chrome automatically!

- [ ] **Step 1: Write failing tests in `tests/cart-ui.test.tsx`**

```tsx
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/cart",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ShopProvider } from "@/lib/store";
import { CartClient } from "@/components/cart/cart-client";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Stitch Cart & Confirmation UI (/cart)", () => {
  it("renders 'Your Cart is Quiet' empty state and restores 2 demo items on click", () => {
    render(
      <ShopProvider>
        <CartClient />
      </ShopProvider>,
    );
    expect(screen.getByText(/Your Cart is Quiet/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Restore Demo Cart/i }));
    expect(screen.getByText(/Aurora ANC Headphones/i)).toBeDefined();
    expect(screen.getByText(/2 items/i)).toBeDefined();
  });

  it("renders complementary catalog upgrades and honest $0.00 Fulfillment without fabricated tax", () => {
    window.sessionStorage.removeItem("shopmate.receipt.v1");
    render(
      <ShopProvider>
        <CartClient />
      </ShopProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Restore Demo Cart/i }));
    expect(screen.getByText(/Demo Transaction \(\$0\.00\)/i)).toBeDefined();
    expect(screen.queryByText(/\$31\.04/)).toBeNull();
    expect(screen.queryByText(/Sandbox Simulation Controls/i)).toBeNull();
    expect(screen.getByText(/Frequently Complemented Upgrades/i)).toBeDefined();
  });

  it("renders Stitch 05 Confirmation View from persisted verified session receipt without dev fallback drawer", () => {
    window.sessionStorage.setItem(
      "shopmate.receipt.v1",
      JSON.stringify({
        orderId: "ORD-VERIFIED-7",
        captureId: "CAP-VERIFIED-9",
        amount: { currency: "USD", value: "249.00" },
        purchasedItems: [],
        capturedAt: "14:32 UTC",
      }),
    );
    render(
      <ShopProvider>
        <CartClient />
      </ShopProvider>,
    );
    expect(screen.getByText(/Payment Confirmed & Captured/i)).toBeDefined();
    expect(screen.getByText("ORD-VERIFIED-7")).toBeDefined();
    expect(screen.getByText("CAP-VERIFIED-9")).toBeDefined();
    expect(screen.queryByText(/Sandbox Fallback Testing/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shopmate-ai; npx vitest run tests/cart-ui.test.tsx`
Expected: FAIL (`"Your Cart is Quiet"` & `"Restore Demo Cart"` do not exist yet; receipt does not read from `activeReceipt`).

- [ ] **Step 3: Implement Stitch Cart, PayPal Checkout styling & Receipt flow (`paypal-checkout.tsx`, `cart-item.tsx`, `cart-summary.tsx`, `cart-client.tsx`, `empty-state.tsx`)**

Implementation guidance per Spec Section 6.4 & 8 #2:
- `src/components/cart/paypal-checkout.tsx`: Export `CheckoutPhase`; add optional `onPhaseChange?: (phase: CheckoutPhase) => void` invoked cleanly in effect/phase changes; refresh Stitch surface palette (`bg-surface-container-low`, `bg-tertiary-fixed/45`, `#006c49` secondary tokens) while keeping EVERY `tests/paypal-checkout.test.tsx` string, payload (`{ items, currency: "USD" }`), capture header (`X-ShopMate-Capture-Token`), and `style: { layout: "vertical", ... }` untouched!
- `src/components/cart/cart-item.tsx`: Stitch `w-24 h-24 sm:w-28 sm:h-28` `#FAFAFC` media thumbnail with bottom-right category badge pill, provenance + brand meta, spec summary chips, recessed `#f5f2ff` (`bg-surface-container-low`) qty stepper (`- [qty] +`), `"Save to Compare"` button (`toggleCompare(product.id)` when comparing/canToggleCompare) & `"Remove"` button, right-aligned tabular line subtotal.
- `src/components/cart/cart-summary.tsx`: Sticky `Order Summary` card (`Live Quote · Server-Verified`), `<dl>` with `Items Subtotal (N)`, `Fulfillment: Demo Transaction ($0.00)` (ZERO fake CA tax!), `Total Due` (`USD`), amber `PAYPAL SANDBOX ENVIRONMENT ENABLED` callout (`"ShopMate Sandbox demonstration. This is not a real retailer purchase. No goods are shipped. You are approving a test transaction only."`), `<PayPalCheckout />`, 3-tile guarantee grid (`No Real Charges` • `Catalog Grounded` • `Server Verified`), 2-step `Clear All` & `Ask AI Workspace` link. NO developer `"Sandbox Simulation Controls"` drawer.
- `src/components/cart/cart-client.tsx`:
  - Renders Screen `05` Confirmation Receipt when `activeReceipt !== null`, syncing `CheckoutPipeline` Step `1 -> 2 -> 3` dynamically via `onPhaseChange`; displays `SANDBOX SIMULATION MODE` banner, emerald pulsing `check_circle` hero card (`CAPTURED & SETTLED`, `Payment Confirmed & Captured`, `#f5f2ff` boxed `$Amount USD`), Order Reference (with copy button), PayPal Capture ID (with copy button), Merchant (`ShopMate AI Sandbox`), Timestamp, Payment Method (`PayPal Sandbox`), `Items in Sandbox Dispatch` card, `Back to Discovery` (clears receipt and navigates `/`), `Start New Shopping Research` (clears receipt and navigates `/chat`), and `Ask ShopMate AI for setup guide` card (`/chat?q=...`). Zero `"Sandbox Fallback Testing"` dev drawer.
  - Empty cart view: `"Your Cart is Quiet"` Stitch card with `"Browse Discovery"` (`/`) + `"Restore Demo Cart"` button (adds `demo-aurora-headphones` and `demo-bloom-earbuds` via `addToCart`).
  - Active cart view: Desktop 3-step `CheckoutPipeline`, cart items list, honest violet-indigo `AI Order Optimization` banner (`"$0.00 Fulfillment · Server-Calculated USD Total"`, zero fake CO2e/logistics numbers), and 2-col `Frequently Complemented Upgrades` picking 2 demo items not in `cartItems`.
- `src/components/shop/empty-state.tsx`: Harmonize border/card styling with `#ffffff` / `#f5f2ff` Stitch palette.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd shopmate-ai; npx vitest run tests/cart-ui.test.tsx tests/paypal-checkout.test.tsx tests/e2e-payment-security.test.ts`
Expected: PASS (100% PayPal Checkout + Cart + Confirmation security & UI assertions green).

- [ ] **Step 5: Commit**

```bash
cd shopmate-ai
git add src/components/cart/paypal-checkout.tsx src/components/cart/cart-item.tsx src/components/cart/cart-summary.tsx src/components/cart/cart-client.tsx src/components/shop/empty-state.tsx tests/cart-ui.test.tsx
git commit -m "feat(cart): implement Stitch shopping cart, live PayPal pipeline, and persisted confirmation receipt"
```

---

### Task 6: Sync Browser QA Scripts, Complete Verification, Screenshot Audit, GitHub Push & Vercel Deployment

**Files:**
- Modify: `scripts/qa-runner.mjs`
- Modify: `scripts/phase3-workspace-qa.mjs`

**Interfaces:**
- Consumes built Next.js server (`npm run build` + `npm run start`), Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`), GitHub `origin/main`, Vercel CLI (`vercel --yes`, `vercel --prod --yes`).

- [ ] **Step 1: Update `scripts/qa-runner.mjs` and `scripts/phase3-workspace-qa.mjs` for Stitch UI selectors**

Update in lockstep per Spec Section 3 #5, Section 6.2 & Section 8 #1:
- `scripts/qa-runner.mjs`:
  - Journey 3 Mobile Navigation: test Mobile 4-tab fixed `nav[aria-label="Mobile bottom navigation"]` + Mobile search sheet trigger (`button[aria-label="Open quick search"]` -> `#shopmate-mobile-search-sheet` open/close/navigate) instead of legacy burger `#shopmate-mobile-nav`.
  - Journey 7 Category cards: match both Discovery category `/chat?q=...` links and interactive filtering tiles.
  - Journey 9 Add-to-Cart: click `[Compare | Analysis]` -> `Analysis` / `View Analysis` button inside first `<article>` to open `[role="dialog"]` (`ProductAnalysisDrawer`), click `"Add to cart"` inside the dialog, close dialog, verify Desktop Header (`Cart 1`) and Mobile Bottom Nav badge (`1`) update cleanly, and capture screenshots at `1440×900` & `390×844` across `/`, `/chat`, `/compare?ids=demo-aurora-headphones,demo-bloom-earbuds`, `/cart` (after adding item), and Confirmation state (seeded via test sessionStorage receipt if verifying layout visually in script!).
- `scripts/phase3-workspace-qa.mjs`:
  - Verify Desktop 2-column workspace (`aside[aria-label="Shopping requirements & refinements"]` present, permanent desktop `ShortlistPanel` absent, `#chat-input` present); send query -> `waitForSelector("ul[aria-label='Recommended products'] li")` -> check inline category/budget/badge/trade-off extraction & `"Add to Cart"` click inside inline card -> verify mobile `390×844` 0 horizontal overflow and `Chat | Context | Shortlist` tabs.

- [ ] **Step 2: Run full static & test verification gate**

Run:
```bash
cd shopmate-ai
npx tsc --noEmit
npm run lint
npx vitest run --exclude tests/live-providers.test.ts
npm run build
```
Expected: All 4 commands exit `0` with zero errors.

- [ ] **Step 3: Boot production server, execute QA runners + full Desktop & Mobile screenshot capture, and inspect every PNG with `read_file`**

Run `npm run start` as daemon; execute `node scripts/qa-runner.mjs` and `node scripts/phase3-workspace-qa.mjs`; capture full visual PNGs to `.superpowers/sdd/audit-screenshots/` (or OS temp) covering Desktop (`1440×900`) and Mobile (`390×844`) for `/`, `/chat`, `/compare?ids=demo-aurora-headphones,demo-bloom-earbuds`, `/cart` (populated + empty), and Confirmation Receipt (`05`); stop daemon cleanly; inspect screenshots side-by-side against `stitch/*/screen.png` using `read_file`. Fix any visual misalignment, clipping, overflow, or overlap via RED->GREEN, then clean any temporary screenshot files outside `.superpowers/`.

- [ ] **Step 4: Commit synchronized QA scripts + perform Final Whole-Branch Review**

```bash
cd shopmate-ai
git add scripts/qa-runner.mjs scripts/phase3-workspace-qa.mjs
git commit -m "chore(qa): update browser QA suites for exact Stitch UI and 2-column workspace"
```

Dispatch or execute final code review package per `executing-plans` (comparing full diff from `9d65c6b`..`HEAD` against the Spec & Review Focus; fix Critical/Important issues in ONE RED->GREEN pass if found, or log `Final review clean`). Delete `.superpowers/sdd/2026-11-10-exact-stitch-ui-plan/` scratch directory once clean.

- [ ] **Step 5: Push to GitHub `origin main` and complete Vercel Preview + Production deployments**

Run:
```bash
cd shopmate-ai
git status
git push origin main
vercel --yes
vercel --prod --yes
vercel ls
```
Verify live HTTP `200` on deployed URLs and report verified commit SHAs, test/build results, and live URLs.
