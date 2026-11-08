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
import { ProductGrid } from "@/components/shop/product-grid";
import { ProductImage } from "@/components/shop/product-image";
import { Reveal } from "@/components/shop/reveal";
import { SectionHeading } from "@/components/shop/section-heading";
import { ShopMateLogo } from "@/components/brand/logo";
import {
  DEMO_CATEGORIES,
  getFeaturedDemoProducts,
  demoProductsInCategory,
  getDemoProduct,
} from "@/lib/demo-catalog";

export const metadata: Metadata = {
  title: "ShopMate AI — The AI Shopping Decision Engine",
  description:
    "Shop smarter. Choose with confidence. Describe what you need in plain language, compare verified trade-offs side by side, and let AI guide your purchase.",
};

const TINT_BG: Record<ProductTint, string> = {
  blue: "bg-blue-500/10 text-blue-400",
  red: "bg-red-500/10 text-red-400",
  green: "bg-emerald-500/10 text-emerald-400",
  amber: "bg-amber-500/10 text-amber-400",
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
    body: "Type your requirements in plain language. Specify your budget, preferred features, use case, or constraints without navigating rigid dropdown menus.",
  },
  {
    title: "2. Compare relevant options",
    body: "The assistant returns a curated shortlist of verified products, highlighting key specifications and missing data transparently.",
  },
  {
    title: "3. Understand the trade-offs",
    body: "Review structured comparisons detailing what each product gives up, ensuring you buy the exact match for your priorities.",
  },
  {
    title: "4. Choose confidently",
    body: "Drop your selection into your cart and complete checkout securely with server-verified PayPal sandbox execution.",
  },
];

const BENEFITS: Array<{
  title: string;
  body: string;
  Icon: LucideIcon;
  tint: ProductTint;
}> = [
  {
    title: "Intelligence over endless scrolling",
    body: "Instead of dozens of open browser tabs, get a structured recommendation tailored precisely to your constraints.",
    Icon: Compass,
    tint: "blue",
  },
  {
    title: "Transparent trade-offs",
    body: "Every product recommendation highlights its strengths and compromises so you never discover drawbacks after unboxing.",
    Icon: SlidersHorizontal,
    tint: "green",
  },
  {
    title: "Direct control over your cart",
    body: "You stay in command. Add, compare, and modify quantities with transparent price totals calculated securely on the server.",
    Icon: PackageCheck,
    tint: "amber",
  },
  {
    title: "Catalog integrity & provenance",
    body: "Powered by live Channel3 product feeds alongside clearly labeled demo records. No fabricated prices, fake reviews, or hidden fees.",
    Icon: ShieldCheck,
    tint: "red",
  },
];

const PANEL_SIDEBAR_PRODUCTS = [
  "demo-aurora-headphones",
  "demo-bloom-earbuds",
] as const;

export default function HomePage() {
  const featured = getFeaturedDemoProducts();

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[-220px] -z-10 size-[680px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]"
        />
        <div className="mx-auto w-full max-w-4xl px-4 text-center md:px-6 lg:max-w-6xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm mb-6">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            <span>Shop smarter. Choose with confidence.</span>
          </div>

          <h1 className="lines text-[36px] font-bold leading-[1.08] tracking-[-0.03em] text-foreground sm:text-[54px] md:text-[64px] lg:text-[76px] lg:leading-[1.02]">
            <span className="line">
              <span data-line style={{ "--i": 0 } as CSSProperties}>
                The right product.
              </span>
            </span>
            <span className="line">
              <span data-line style={{ "--i": 1 } as CSSProperties}>
                <span className="text-primary font-extrabold">Without the guesswork.</span>
              </span>
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            ShopMate AI is your intelligent shopping decision engine. Describe your needs in plain language, research verified trade-offs, and make confident purchases.
          </p>

          <HeroSearch
            className="mx-auto mt-9 max-w-2xl"
            placeholder="e.g. Find quiet wireless headphones under $250 for travel..."
            ctaText="Find my best match"
          />

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              Live Channel3 Catalog Data
            </span>
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              AI Recommendation Engine
            </span>
            <span className="flex items-center gap-1.5">
              <PackageCheck className="size-4 text-primary" aria-hidden="true" />
              Secure PayPal Sandbox Checkout
            </span>
          </div>
        </div>
      </section>

      {/* Discovery Categories */}
      <section id="categories" className="border-t border-border bg-card/20 py-16 md:py-24">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <Reveal>
            <SectionHeading
              title="Explore by shopping category"
              description="Select a curated shelf to launch the AI workspace with pre-loaded research intents and verified product options."
              className="max-w-2xl"
            />
          </Reveal>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {DEMO_CATEGORIES.map((category, index) => {
              const preset = CATEGORY_PRESETS[category.id];
              const Icon = preset?.Icon ?? Headphones;
              const tint = preset?.tint ?? "blue";
              const seed = preset?.seed ?? category.id;
              const imageUrl = preset?.imageUrl;
              const count = demoProductsInCategory(category.name).length;

              return (
                <li key={category.id}>
                  <Reveal delay={index * 60} kind="settle">
                    <Link
                      href={`/chat?q=${encodeURIComponent(category.prompt)}`}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-3 transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5"
                    >
                      <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl bg-secondary">
                        <Image
                          src={imageUrl || `https://picsum.photos/seed/${seed}/640/480`}
                          alt={category.name}
                          fill
                          sizes="(min-width: 1024px) 268px, (min-width: 640px) 46vw, 89vw"
                          className="tile-photo object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-70 transition-opacity group-hover:opacity-60"
                        />
                        <div
                          className={cn(
                            "absolute left-3 top-3 grid size-9 place-items-center rounded-lg border border-border/50 shadow-sm backdrop-blur-sm",
                            TINT_BG[tint],
                          )}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col pt-4 pb-2 px-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="text-base font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
                            {category.name}
                          </h3>
                          <span className="text-xs font-medium text-muted-foreground">
                            {count} {count === 1 ? "product" : "products"}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                          {category.tagline}
                        </p>
                        <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          <span>Explore in AI workspace</span>
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

      {/* Featured Products / Shortlist */}
      <section className="py-16 md:py-24 border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading
                title="Featured decision picks"
                description="Explore verified products with transparent pricing, provenance badges, and side-by-side comparison support."
              />
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/chat">
                  Open AI Workspace
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </Reveal>
          <Reveal delay={80} kind="settle">
            <div className="mt-10">
              <ProductGrid products={featured} columns={4} />
            </div>
          </Reveal>
          <p className="mt-6 text-xs text-muted-foreground">
            * Featured records include demo catalog items for preview testing alongside live Channel3 catalog integrations. No prices or ratings are fabricated.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-border bg-card/20 py-16 md:py-24">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 md:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 items-start">
          <div className="lg:sticky lg:top-24">
            <Reveal>
              <SectionHeading
                title="How ShopMate AI works"
                description="Designed from the ground up for clarity, speed, and absolute decision confidence."
              />
              <div className="mt-8">
                <Button asChild size="lg" className="shadow-md shadow-primary/25">
                  <Link href="/chat">Start shopping with AI</Link>
                </Button>
              </div>
            </Reveal>
          </div>
          <ol className="grid gap-6">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step.title}>
                <Reveal delay={index * 60}>
                  <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">
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

      {/* Benefits */}
      <section className="py-16 md:py-24 border-t border-border">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 md:px-6 lg:grid-cols-2">
          <div>
            <Reveal>
              <SectionHeading
                title="Why choose ShopMate AI?"
                description="Traditional ecommerce makes you do the research. ShopMate AI does the heavy lifting so you decide with absolute clarity."
              />
            </Reveal>
            <ul className="mt-8 grid gap-6">
              {BENEFITS.map((benefit, index) => (
                <li key={benefit.title}>
                  <Reveal delay={index * 50}>
                    <div className="flex gap-4">
                      <span
                        className={cn(
                          "mt-1 grid size-10 shrink-0 place-items-center rounded-xl",
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

          {/* Interactive Preview Card */}
          <Reveal delay={100} kind="settle">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-primary/5">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
                    <ShopMateLogo variant="icon" size="sm" className="size-6" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      ShopMate AI Assistant
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Active session · Channel3 feed
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </span>
              </div>
              <div className="mt-4 space-y-3">
                <div className="ml-auto w-max max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                  Quiet wireless headphones under $250 for travel?
                </div>
                <div className="rounded-2xl border border-border bg-secondary/60 p-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Recommended Shortlist (2 matches)
                  </p>
                  <div className="space-y-2">
                    {PANEL_SIDEBAR_PRODUCTS.map((productId) => {
                      const product = getDemoProduct(productId);
                      if (!product) return null;
                      return (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 rounded-xl bg-card p-2.5 border border-border/60"
                        >
                          <ProductImage
                            product={product}
                            variant="mini"
                            className="size-10 rounded-lg shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-foreground">
                              {product.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {product.brand} · {product.category}
                            </p>
                          </div>
                          <span className="text-xs font-bold text-foreground">
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

      {/* Call to Action */}
      <section className="py-16 md:py-24 border-t border-border bg-card/20">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-secondary p-8 text-center md:p-16 shadow-2xl">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-primary/10 blur-3xl"
              />
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl">
                Shop smarter. Choose with confidence.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
                Stop second-guessing your online purchases. Let ShopMate AI analyze your requirements and guide your next decision.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <Button asChild size="lg" className="h-12 px-8 text-base shadow-lg shadow-primary/25">
                  <Link href="/chat">Open AI Workspace</Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-12 px-8 text-base">
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
