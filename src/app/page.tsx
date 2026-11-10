import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ArrowUpRight,
  Camera,
  Compass,
  Headphones,
  Keyboard,
  PackageCheck,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Watch,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import type { ProductTint } from "@/types";
import { Button } from "@/components/ui/button";
import { HeroSearch } from "@/components/shop/hero-search";
import { DiscoveryCatalog } from "@/components/shop/discovery-catalog";
import { ProductImage } from "@/components/shop/product-image";
import { Reveal } from "@/components/shop/reveal";
import { SectionHeading } from "@/components/shop/section-heading";
import { ShopMateLogo } from "@/components/brand/logo";
import {
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
  FEATURED_PRODUCT_IDS,
  demoProductsInCategory,
  getDemoProduct,
} from "@/lib/demo-catalog";

export const metadata: Metadata = {
  title: "ShopMate AI — The AI Shopping Decision Engine",
  description:
    "Shop smarter. Choose with confidence. Describe what you need in plain language, compare verified trade-offs side by side, and let AI guide your purchase.",
};

const TINT_BG: Record<ProductTint, string> = {
  blue: "bg-[#EEF4FF] text-[#3B5CCC] border-[#DCE7FF]",
  red: "bg-[#FEF1F2] text-[#B4232C] border-[#FDE2E4]",
  green: "bg-[#ECFDF5] text-[#047857] border-[#D1FAE5]",
  amber: "bg-[#FFFBEB] text-[#B45309] border-[#FEF3C7]",
};

interface CategoryPreset {
  Icon: LucideIcon;
  tint: ProductTint;
  seed: string;
  imageUrl: string;
}

const CATEGORY_PRESETS: Record<string, CategoryPreset> = {
  audio: {
    Icon: Headphones,
    tint: "blue",
    seed: "shopmate-audio",
    imageUrl:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80",
  },
  wearables: {
    Icon: Watch,
    tint: "green",
    seed: "shopmate-wearables",
    imageUrl:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80",
  },
  workspace: {
    Icon: Keyboard,
    tint: "amber",
    seed: "shopmate-workspace",
    imageUrl:
      "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80",
  },
  photography: {
    Icon: Camera,
    tint: "red",
    seed: "shopmate-photography",
    imageUrl:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80",
  },
};

const HOW_IT_WORKS: Array<{ title: string; body: string }> = [
  {
    title: "1. Tell us what you need",
    body: "Describe your budget, preferred features, use case, or constraints in plain language without hunting through nested filters.",
  },
  {
    title: "2. Inspect verified specifications",
    body: "ShopMate searches the catalog and surfaces real specs, merchant offers, and missing-data flags side by side.",
  },
  {
    title: "3. Weigh honest trade-offs",
    body: "Understand what each pick wins on — and what it gives up — before you add anything to your cart.",
  },
  {
    title: "4. Verify totals and check out",
    body: "Approve sandbox checkout with totals recalculated and captured directly on the server by PayPal.",
  },
];

const BENEFITS: Array<{
  title: string;
  body: string;
  Icon: LucideIcon;
  tint: ProductTint;
}> = [
  {
    title: "Clarity over endless tabs",
    body: "Turn scattered product pages into a structured shortlist shaped around your actual requirements.",
    Icon: Compass,
    tint: "blue",
  },
  {
    title: "Honest trade-off disclosure",
    body: "Every pick calls out strengths, unmet requirements, and unverified fields transparently.",
    Icon: SlidersHorizontal,
    tint: "green",
  },
  {
    title: "Currency-safe comparisons",
    body: "Numerical deltas and rankings are computed safely per currency with strict server-verified cart pricing.",
    Icon: PackageCheck,
    tint: "amber",
  },
  {
    title: "Explicit catalog provenance",
    body: "Live Channel3 merchant records carry LIVE tags while demo catalog items are labeled Demo data — never mixed or disguised.",
    Icon: ShieldCheck,
    tint: "red",
  },
];

const PANEL_SIDEBAR_PRODUCTS = [
  "demo-aurora-headphones",
  "demo-bloom-earbuds",
] as const;

export default function HomePage() {
  return (
    <div className="w-full">
      {/* Hero Section — Stitch Light Canvas + Atmospheric Electric Violet Wash */}
      <section className="relative overflow-hidden bg-card pt-12 pb-16 md:pt-20 md:pb-24">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-36 left-1/2 -z-0 size-[760px] -translate-x-1/2 rounded-full bg-radial from-primary/[0.08] via-primary/[0.02] to-transparent blur-3xl"
        />
        <div className="relative z-10 mx-auto w-full max-w-[1320px] px-4 text-center md:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground stitch-tier-1">
              <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
              <span>AI Shopping Decision Engine · Channel3 &amp; Demo Catalog</span>
            </div>

            <h1 className="lines text-[34px] font-bold leading-[1.08] tracking-[-0.03em] text-foreground sm:text-[52px] md:text-[62px]">
              <span className="line">
                <span data-line style={{ "--i": 0 } as CSSProperties}>
                  The right product.
                </span>
              </span>
              <span className="line">
                <span data-line style={{ "--i": 1 } as CSSProperties}>
                  <span className="bg-gradient-to-r from-primary to-[#412CDD] bg-clip-text font-extrabold text-transparent">
                    Choose with confidence.
                  </span>
                </span>
              </span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Describe what you need in plain language. ShopMate evaluates verified
              catalog specs, surfaces honest trade-offs, and prepares your PayPal
              Sandbox checkout.
            </p>

            <HeroSearch
              className="mx-auto mt-8 max-w-2xl"
              placeholder="e.g. Mechanical keyboard for two computers under $150"
              ctaText="Run Analysis"
            />

            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-emerald-600" aria-hidden="true" />
                Live Provenance Badges
              </span>
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                Side-by-Side Matrix
              </span>
              <span className="flex items-center gap-1.5">
                <PackageCheck className="size-4 text-amber-600" aria-hidden="true" />
                Server-Verified PayPal Sandbox
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Discovery Categories */}
      <section
        id="categories"
        className="border-t border-border bg-background py-14 md:py-20"
      >
        <div className="mx-auto w-full max-w-[1320px] px-4 md:px-6 lg:px-8">
          <Reveal>
            <SectionHeading
              title="Explore by shopping category"
              description="Jump straight into the AI Workspace with curated prompts grounded in real catalog records."
              className="max-w-2xl"
            />
          </Reveal>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {DEMO_CATEGORIES.map((category, index) => {
              const preset = CATEGORY_PRESETS[category.id];
              const Icon = preset?.Icon ?? Headphones;
              const tint = preset?.tint ?? "blue";
              const seed = preset?.seed ?? category.id;
              const imageUrl = preset?.imageUrl;
              const count = demoProductsInCategory(category.name).length;

              return (
                <li key={category.id}>
                  <Reveal delay={index * 50} kind="settle">
                    <Link
                      href={`/chat?q=${encodeURIComponent(category.prompt)}`}
                      className="stitch-tier-1 group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-3 transition-all duration-300 hover:border-primary/40 hover:shadow-[0_10px_25px_-5px_rgba(23,23,33,0.06)]"
                    >
                      <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl border border-border bg-[#FAFAFC]">
                        <Image
                          src={
                            imageUrl ||
                            `https://picsum.photos/seed/${seed}/640/480`
                          }
                          alt={category.name}
                          fill
                          sizes="(min-width: 1024px) 288px, (min-width: 640px) 46vw, 89vw"
                          className="tile-photo object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div
                          className={cn(
                            "absolute left-2.5 top-2.5 grid size-8 place-items-center rounded-lg border shadow-xs backdrop-blur-sm",
                            TINT_BG[tint],
                          )}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col px-1 pt-3.5 pb-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
                            {category.name}
                          </h3>
                          <span className="font-mono text-xs font-medium text-muted-foreground">
                            {count} {count === 1 ? "item" : "items"}
                          </span>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                          {category.tagline}
                        </p>
                        <div className="mt-3.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          <span>Ask AI Workspace</span>
                          <ArrowUpRight
                            className="size-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                    </Link>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Interactive Discovery & Filter Catalog */}
      <DiscoveryCatalog
        products={DEMO_PRODUCTS}
        featuredIds={FEATURED_PRODUCT_IDS}
      />

      {/* How It Works */}
      <section className="border-t border-border bg-card py-16 md:py-20">
        <div className="mx-auto grid w-full max-w-[1320px] items-start gap-12 px-4 md:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-8">
          <div className="lg:sticky lg:top-24">
            <Reveal>
              <SectionHeading
                title="How ShopMate AI works"
                description="Built around verifiable attributes, calm spatial hierarchy, and server-side checkout truth."
              />
              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild size="lg" className="shadow-xs">
                  <Link href="/chat">Start shopping with AI</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/compare">Open Matrix</Link>
                </Button>
              </div>
            </Reveal>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step.title}>
                <Reveal delay={index * 50}>
                  <div className="stitch-tier-1 h-full rounded-2xl border border-border bg-background p-5">
                    <h3 className="text-base font-semibold tracking-tight text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Benefits & Interactive Light Preview */}
      <section className="border-t border-border bg-background py-16 md:py-20">
        <div className="mx-auto grid w-full max-w-[1320px] items-center gap-12 px-4 md:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <Reveal>
              <SectionHeading
                title="Why choose ShopMate AI?"
                description="Precision comparison tools and transparent AI reasoning instead of guesswork."
              />
            </Reveal>
            <ul className="mt-8 grid gap-5">
              {BENEFITS.map((benefit, index) => (
                <li key={benefit.title}>
                  <Reveal delay={index * 45}>
                    <div className="flex gap-4">
                      <span
                        className={cn(
                          "mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border",
                          TINT_BG[benefit.tint],
                        )}
                      >
                        <benefit.Icon className="size-5" aria-hidden="true" />
                      </span>
                      <div>
                        <h3 className="text-base font-semibold tracking-tight text-foreground">
                          {benefit.title}
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {benefit.body}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>

          {/* Stitch Tier-2 Light Workspace Preview Card */}
          <Reveal delay={90} kind="settle">
            <div className="stitch-tier-2 rounded-2xl border border-input bg-card p-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-secondary text-primary border border-primary/15">
                    <ShopMateLogo variant="icon" size="sm" className="size-6" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      ShopMate Decision Workspace
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Channel3 catalog + transparent trade-off engine
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-[#047857]">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Ready
                </span>
              </div>
              <div className="mt-4 space-y-3">
                <div className="ml-auto w-max max-w-[85%] rounded-2xl rounded-tr-sm bg-[#131627] px-4 py-2.5 text-sm text-white shadow-xs">
                  Quiet wireless headphones under $250 for travel?
                </div>
                <div className="space-y-3 rounded-2xl border border-border bg-secondary/60 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Evaluated Catalog Shortlist (Sample)
                  </p>
                  <div className="space-y-2">
                    {PANEL_SIDEBAR_PRODUCTS.map((productId) => {
                      const product = getDemoProduct(productId);
                      if (!product) return null;
                      return (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 stitch-tier-1"
                        >
                          <ProductImage
                            product={product}
                            variant="mini"
                            className="size-10 shrink-0 rounded-lg"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-foreground">
                              {product.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {product.brand} · {product.category}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-bold text-foreground">
                            ${product.price}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Bottom Closing Deep Indigo CTA Card */}
      <section className="border-t border-border bg-card py-16 md:py-20">
        <div className="mx-auto w-full max-w-[1320px] px-4 md:px-6 lg:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#131627] p-8 text-center text-white shadow-[0_20px_50px_rgba(19,22,39,0.2)] md:p-14">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-[#5B4CF5]/25 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-16 -bottom-16 size-72 rounded-full bg-emerald-500/15 blur-3xl"
              />
              <h2 className="relative z-10 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
                Shop smarter. Choose with confidence.
              </h2>
              <p className="relative z-10 mx-auto mt-3 max-w-xl text-base text-white/75 md:text-lg">
                Start in the AI Workspace to generate a ranked shortlist, or pin products to the live Comparison Matrix.
              </p>
              <div className="relative z-10 mt-8 flex flex-wrap items-center justify-center gap-3.5">
                <Button asChild size="lg" className="h-11 px-7 text-sm font-semibold">
                  <Link href="/chat">Launch AI Workspace</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="h-11 border-white/20 bg-white/10 px-7 text-sm font-semibold text-white hover:bg-white/20 hover:text-white"
                >
                  <Link href="/compare">Compare Products</Link>
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
