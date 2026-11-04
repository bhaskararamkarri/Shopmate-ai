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
import {
  DEMO_CATEGORIES,
  getFeaturedDemoProducts,
  demoProductsInCategory,
  getDemoProduct,
} from "@/lib/demo-catalog";

export const metadata: Metadata = {
  description:
    "The ShopMate AI homepage: describe what you need in plain language, browse four demo categories, and meet the assistant ranked on honest trade-offs.",
};

const TINT_BG: Record<ProductTint, string> = {
  blue: "bg-[#E1F3FE] text-[#1F6C9F]",
  red: "bg-[#FDEBEC] text-[#9F2F2D]",
  green: "bg-[#EDF3EC] text-[#346538]",
  amber: "bg-[#FBF3DB] text-[#956400]",
};

/* Duotone multiply washes for the photo-backed category tiles. */
const TINT_DUOTONE: Record<ProductTint, string> = {
  blue: "bg-[#3E7DB0]",
  red: "bg-[#C47070]",
  green: "bg-[#6B9062]",
  amber: "bg-[#C7A463]",
};

interface CategoryPreset {
  Icon: LucideIcon;
  tint: ProductTint;
  /** Deterministic picsum seed behind the duotone treatment. */
  seed: string;
}

const CATEGORY_PRESETS: Record<string, CategoryPreset> = {
  audio: { Icon: Headphones, tint: "blue", seed: "shopmate-audio" },
  wearables: { Icon: Watch, tint: "green", seed: "shopmate-wearables" },
  workspace: { Icon: Keyboard, tint: "amber", seed: "shopmate-workspace" },
  photography: { Icon: Camera, tint: "red", seed: "shopmate-photography" },
};

const HOW_IT_WORKS: Array<{ title: string; body: string }> = [
  {
    title: "Ask plainly",
    body: "First, type what you need the way you would say it out loud. No filters, no dropdowns, no keyword gymnastics.",
  },
  {
    title: "See the trade-offs",
    body: "Next, every reply lines up comparable demo products and states what each one gives up before you commit to anything.",
  },
  {
    title: "Compare, then check out",
    body: "Then, pin a shortlist to the side-by-side table, drop the winners into your cart, and pay once checkout goes live.",
  },
];

const BENEFITS: Array<{
  title: string;
  body: string;
  Icon: LucideIcon;
  tint: ProductTint;
}> = [
  {
    title: "One question instead of twelve tabs",
    body: "The agent answers a single natural-language prompt across the whole demo catalog, then shows why its picks ordered that way.",
    Icon: Compass,
    tint: "blue",
  },
  {
    title: "Trade-offs in the open",
    body: "Recommendations list what each product gives up, so you decide with the drawbacks on the table rather than buried in a spec sheet.",
    Icon: SlidersHorizontal,
    tint: "green",
  },
  {
    title: "A cart you steer",
    body: "Add, remove and adjust quantities yourself. Nothing auto-checks out, and every total stays visible while you shop.",
    Icon: PackageCheck,
    tint: "amber",
  },
  {
    title: "Honest demo rails",
    body: "This preview is clearly labeled mock data. The live catalog and chat model swap in later without changing the interface you learn now.",
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
      {/* Attention — cinematic, search-first hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[-260px] -z-10 size-[760px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl"
        />
        <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-16 text-center md:px-6 md:pb-24 md:pt-24 lg:max-w-7xl">
          <h1 className="lines text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] text-foreground sm:text-[56px] md:text-[64px] md:leading-[1.03] lg:text-[clamp(96px,8.2vw,120px)] lg:leading-[0.98]">
            <span className="line">
              <span data-line style={{ "--i": 0 } as CSSProperties}>
                Ask once.
              </span>
            </span>
            <span className="line">
              <span data-line style={{ "--i": 1 } as CSSProperties}>
                Buy the right thing.
              </span>
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Describe what you need. Get ranked picks, honest trade-offs, and a
            cart you steer — in one thread.
          </p>
          <HeroSearch className="mx-auto mt-9 max-w-2xl" />
          <p className="mt-5 text-[14px] text-muted-foreground">
            Frontend preview · demo catalog and mock responses · live product
            feed and checkout arrive in later phases
          </p>
        </div>
      </section>

      {/* Interest — demo categories */}
      <section className="py-16 md:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <Reveal>
            <SectionHeading
              title="Start with a shelf"
              description="Four demo categories, each seeded with a starter prompt. Every tile opens the chat already pointed somewhere useful."
              className="max-w-2xl"
            />
          </Reveal>
          <ul className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {DEMO_CATEGORIES.map((category, index) => {
              const preset = CATEGORY_PRESETS[category.id];
              const Icon = preset?.Icon ?? Headphones;
              const tint = preset?.tint ?? "blue";
              const seed = preset?.seed ?? category.id;
              const count = demoProductsInCategory(category.name).length;

              return (
                <li key={category.id}>
                  <Reveal delay={index * 60} kind="settle">
                    <Link href={`/chat?q=${encodeURIComponent(category.prompt)}`} className="group block">
                      <span className="relative block aspect-4/3 w-full overflow-hidden rounded-2xl isolate bg-secondary">
                        <Image
                          src={`https://picsum.photos/seed/${seed}/640/480`}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 268px, (min-width: 640px) 46vw, 89vw"
                          className="tile-photo object-cover grayscale"
                        />
                        {/* Flat duotone multiply wash over the photograph */}
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute inset-0 mix-blend-multiply opacity-80",
                            TINT_DUOTONE[tint],
                          )}
                        />
                        <span
                          aria-hidden="true"
                          className="absolute left-3.5 top-3.5 grid size-9 place-items-center rounded-lg bg-white/90 text-navy"
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                      </span>
                      <span className="mt-4 block px-0.5">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-lg font-semibold tracking-tight text-foreground">
                            {category.name}
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted-foreground">
                            {count} demo {count === 1 ? "product" : "products"}
                            <ArrowUpRight
                              className="size-3.5 motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
                              aria-hidden="true"
                            />
                          </span>
                        </span>
                        <span className="mt-1.5 block text-base leading-relaxed text-muted-foreground line-clamp-2">
                          {category.tagline}
                        </span>
                      </span>
                    </Link>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Featured products */}
      <section
        id="featured-products"
        className="bg-secondary/40 py-16 md:py-20"
      >
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading
                title="Handpicked for this preview"
                description="A few demo records the assistant ranks highly. Add them to your cart, or pin them for a side-by-side comparison."
              />
              <Button asChild variant="ghost" size="sm" className="gap-1">
                <Link href="/chat">
                  Open the chat
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </Reveal>
          <Reveal delay={80} kind="settle">
            <ProductGrid products={featured} columns={4} className="mt-9" />
          </Reveal>
          <p className="mt-5 text-[14px] text-muted-foreground">
            Demo products — mock listings created for development. Nothing here
            is real inventory, a real price, or a live retailer feed.
          </p>
        </div>
      </section>

      {/* How it works — large-type rows, order in the words */}
      <section className="py-16 md:py-24">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 md:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Reveal>
              <SectionHeading
                title="How the agent works"
                description="Three steps, no configuration. The value sits in the trade-offs you would otherwise never see in one sitting."
              />
            </Reveal>
          </div>
          <ol className="space-y-12">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step.title}>
                <Reveal delay={index * 70}>
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2.5 max-w-lg text-base leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-secondary/40 py-16 md:py-24">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 md:px-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Reveal>
              <SectionHeading
                title="Why ask an agent instead of a search box"
                description="The interface stays quiet on purpose — the reasoning is where the work happens."
              />
            </Reveal>
            <ul className="mt-9 space-y-6">
              {BENEFITS.map((benefit, index) => (
                <li key={benefit.title}>
                  <Reveal delay={index * 50}>
                    <div className="flex gap-4">
                      <span
                        className={cn(
                          "mt-1 grid size-9 shrink-0 place-items-center rounded-lg",
                          TINT_BG[benefit.tint],
                        )}
                      >
                        <benefit.Icon className="size-4" aria-hidden="true" />
                      </span>
                      <div>
                        <h3 className="text-base font-semibold tracking-tight text-foreground">
                          {benefit.title}
                        </h3>
                        <p className="mt-1 max-w-xl text-base leading-relaxed text-muted-foreground">
                          {benefit.body}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>

          {/* Static conversation preview, rendered from real demo data */}
          <Reveal delay={120} kind="settle">
            <div className="mx-auto w-full max-w-md">
              <div className="rounded-2xl bg-background p-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Sparkles className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      ShopMate
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      Demo assistant · mock catalog
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="ml-auto w-max max-w-[85%] rounded-xl bg-primary px-3.5 py-2.5 text-[14px] leading-relaxed text-primary-foreground">
                    Quiet wireless headphones under $250?
                  </div>
                  <div className="max-w-[95%] space-y-2.5 rounded-xl bg-card px-3.5 py-3">
                    <p className="text-[14px] leading-relaxed text-foreground">
                      Ranked for quiet, battery and value — three closest picks
                      from the demo catalog:
                    </p>
                    <ul className="space-y-2">
                      {PANEL_SIDEBAR_PRODUCTS.map((productId) => {
                        const product = getDemoProduct(productId);
                        if (!product) return null;
                        return (
                          <li
                            key={product.id}
                            className="flex items-center gap-3 rounded-lg bg-secondary/70 p-2.5"
                          >
                            <ProductImage
                              product={product}
                              variant="mini"
                              className="size-10"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-medium text-foreground">
                                {product.name}
                              </p>
                              <p className="text-[13px] text-muted-foreground">
                                {product.brand}
                              </p>
                            </div>
                            <p className="shrink-0 text-[14px] font-semibold tabular-nums text-foreground">
                              ${product.price}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Action */}
      <section aria-labelledby="cta-heading" className="py-16 md:py-24">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <Reveal>
            <div className="rounded-2xl bg-navy px-6 py-14 text-center md:px-12 md:py-16">
              <h2
                id="cta-heading"
                className="text-2xl font-semibold tracking-tight text-white sm:text-[30px]"
              >
                Ask first. Buy once.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-lg leading-relaxed text-white/70">
                One plain-language question beats a tab of filters. The demo
                assistant is ready when you are.
              </p>
              <Button
                asChild
                size="lg"
                className="mt-8 h-11 bg-white px-7 text-navy hover:bg-white/90"
              >
                <Link href="/chat">Start a chat</Link>
              </Button>
              <p className="mt-4 text-[14px] text-white/70">
                Demo data only — no live AI, inventory or payments in this
                preview.
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
