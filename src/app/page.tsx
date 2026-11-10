import type { Metadata } from "next";
import { HeroSearch } from "@/components/shop/hero-search";
import { DiscoveryCatalog } from "@/components/shop/discovery-catalog";
import {
  DEMO_PRODUCTS,
  FEATURED_PRODUCT_IDS,
} from "@/lib/demo-catalog";

export const metadata: Metadata = {
  title: "ShopMate AI — Shop smarter. Compare better. Buy with confidence.",
  description:
    "Shop smarter. Compare better. Buy with confidence. Describe what you need in plain language, inspect verified catalog specs, and compare side by side.",
};

export default function HomePage() {
  return (
    <div className="w-full bg-surface">
      {/* Top Hero / AI Omni-Search Terminal Zone (Stitch 03 Mobile + 06 Desktop) */}
      <section className="relative overflow-hidden pb-6 pt-6 lg:pb-10 lg:pt-10">
        {/* Ambient Violet & Emerald Radial Glows */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 h-[360px] w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-b from-primary-container/10 via-primary-container/5 to-transparent blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-6 top-16 h-64 w-64 rounded-full bg-secondary-container/15 blur-2xl"
        />

        <div className="relative z-10 mx-auto flex max-w-[1440px] flex-col items-start px-4 md:px-6 lg:items-center lg:px-8 lg:text-center">
          {/* Honest Live Catalog Telemetry Pill */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-3 py-1 shadow-2xs lg:mb-6">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary" />
            </span>
            <span className="font-mono text-[12px] font-medium text-on-surface-variant">
              Catalog Synced
            </span>
            <span className="text-outline-variant" aria-hidden="true">
              •
            </span>
            <span className="font-mono text-[12px] font-semibold text-on-surface">
              {DEMO_PRODUCTS.length} Curated Demo Items
            </span>
            <span className="hidden text-outline-variant sm:inline" aria-hidden="true">
              •
            </span>
            <span className="hidden font-mono text-[12px] font-medium text-secondary sm:inline">
              Live Channel3 Search Ready
            </span>
          </div>

          {/* Stitch Headline */}
          <h1 className="max-w-3xl font-heading text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] text-on-surface sm:text-[36px] lg:text-[48px] lg:leading-[54px] lg:tracking-[-0.03em]">
            Shop smarter. Compare better.{" "}
            <span className="bg-gradient-to-r from-primary to-primary-container bg-clip-text text-transparent">
              Buy with confidence.
            </span>
          </h1>

          {/* Concise Subtitle */}
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-text-muted sm:text-[16px]">
            AI shopping assistant built on documented specifications, transparent trade-offs, and server-verified sandbox checkout.
          </p>

          {/* Stitch Tier-3 Omni-Search Bar */}
          <HeroSearch className="mt-6 max-w-3xl lg:mt-8" />
        </div>
      </section>

      {/* Interactive Discovery Grid, Attribute Profile & Mobile Matrix Callout */}
      <DiscoveryCatalog
        products={DEMO_PRODUCTS}
        featuredIds={FEATURED_PRODUCT_IDS}
      />
    </div>
  );
}
