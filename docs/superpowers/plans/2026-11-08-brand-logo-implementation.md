# ShopMate AI Brand Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the official ShopMate AI brand logo across the entire application using the master artwork and brand identity specifications.

**Architecture:** 
Generate production-ready vector SVG and high-resolution raster assets from the official artwork. Build a dedicated, accessible, zero-layout-shift `<ShopMateLogo />` component in `src/components/brand/logo.tsx`. Integrate the logo into the main Navbar, Footer, Next.js metadata, favicon, Open Graph tags, and hero/empty states, fully verified with unit tests and visual rendering checks on both desktop and mobile viewports.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript, Lucide Icons, Vitest, PIL/Puppeteer.

**Spec:** User prompt brand identity requirements + uploaded master logo artwork `media_1794129155991_cb0448c1.png`.

## Global Constraints
- Primary Background: Deep Navy `#0B0F19`
- Accent: Electric Violet `#8B5CF6` with Royal Blue `#3B82F6` and Cyan `#38BDF8`
- Text on Dark: White `#FFFFFF`, muted `#94A3B8`
- Tagline: "Shop smarter. Choose with confidence."
- Zero Layout Shifts: Fixed aspect ratio and width/height dimensions.
- Zero modifications to payment, AI, database, or shopping business logic.
- Do NOT deploy to Production.

## Review Focus
1. Navbar logo must be clickable, navigable to `/`, and accessible to screen readers.
2. High contrast against `#0B0F19` dark background (white "Shop" and radiant mascot/gradients).
3. Responsive scaling on compact mobile screens (375px) without wrapping or overflowing navbar.
4. Next.js metadata correctly serves the new favicon, icon, and apple-touch-icon.
5. All 442+ existing unit and integration tests continue to pass with 0 regressions.

---

### Task 1: Asset Generation from Master Artwork
**Files:**
- Create: `public/brand/mascot.png` (cropped transparent mascot icon)
- Create: `public/brand/logo.png` (high-res horizontal logo with dark-mode contrast)
- Create: `public/brand/logo-light.png` (high-res horizontal logo for light backgrounds)
- Create: `public/brand/og-image.png` (1200x630 social share card)
- Create: `public/brand/icon.png` (512x512 app icon)
- Create: `public/brand/logo.svg` (vector horizontal logo)
- Create: `public/brand/logo-icon.svg` (vector icon)
- Create: `src/app/icon.svg` (modern App Router favicon)
- Create: `src/app/apple-icon.png` (Apple touch icon)

- [ ] **Step 1: Write asset generation script in scratch directory**
- [ ] **Step 2: Generate all brand assets and verify dimensions, alpha transparency, and visual quality**
- [ ] **Step 3: Replace placeholder `src/app/favicon.ico`**

---

### Task 2: Brand Logo Component Implementation
**Files:**
- Create: `src/components/brand/logo.tsx`
- Create: `tests/brand-logo.test.tsx`

**Interfaces:**
- Produces: `ShopMateLogo` component with props:
  - `variant?: "horizontal" | "icon" | "full" | "mascot"` (default: `"horizontal"`)
  - `size?: "sm" | "md" | "lg" | "xl"` (default: `"md"`)
  - `showTagline?: boolean` (default: `false`)
  - `className?: string`
  - `priority?: boolean`

- [ ] **Step 1: Write failing component test in `tests/brand-logo.test.tsx`**
- [ ] **Step 2: Run test to confirm failure**
- [ ] **Step 3: Implement `ShopMateLogo` in `src/components/brand/logo.tsx`**
- [ ] **Step 4: Run test to confirm pass**

---

### Task 3: Application Integration
**Files:**
- Modify: `src/components/shop/navbar.tsx` (replace placeholder Sparkles + text with clickable `ShopMateLogo`)
- Modify: `src/components/shop/footer.tsx` (replace placeholder Sparkles + text with `ShopMateLogo variant="full" showTagline`)
- Modify: `src/app/layout.tsx` (configure metadata icons, OpenGraph image, and title)

- [ ] **Step 1: Update Navbar with clickable brand logo**
- [ ] **Step 2: Update Footer with brand logo and verified tagline**
- [ ] **Step 3: Update `layout.tsx` metadata with icons and OpenGraph banner**
- [ ] **Step 4: Check other pages/components for any primary brand placeholder icons**

---

### Task 4: Verification, Visual Inspection & Quality Gates
- [ ] **Step 1: Run unit and integration tests (`npm test`)**
- [ ] **Step 2: Run TypeScript compiler (`npx tsc --noEmit`)**
- [ ] **Step 3: Run ESLint (`npm run lint`)**
- [ ] **Step 4: Run Next.js build (`npm run build`)**
- [ ] **Step 5: Visual regression verification on Desktop and Mobile viewports via Puppeteer**
- [ ] **Step 6: Document screenshots and results in final report**

