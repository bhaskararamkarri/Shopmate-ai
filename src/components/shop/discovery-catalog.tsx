"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import type { Product } from "@/types";
import { ProductGrid } from "@/components/shop/product-grid";
import { DEMO_CATEGORIES } from "@/lib/demo-catalog";
import { useShop } from "@/lib/store";

type SortMode = "featured" | "price-asc" | "price-desc";

interface DiscoveryCatalogProps {
  products: Product[];
  featuredIds: string[];
}

function categoryIconFor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("audio")) return "headphones";
  if (lower.includes("wearable")) return "watch";
  if (lower.includes("workspace")) return "keyboard";
  if (lower.includes("photo")) return "photo_camera";
  if (lower === "featured") return "auto_awesome";
  return "apps";
}

/**
 * Interactive Stitch Discovery Catalog Grid (`03` Mobile, `06`/`10`/`11` Desktop).
 *
 * Includes category tiles with real catalog counts, segmented sort toggle,
 * 4-column product grid, factual Catalog Attribute Profile strip, and mobile
 * Instant Matrix callout banner.
 */
export function DiscoveryCatalog({
  products,
  featuredIds,
}: DiscoveryCatalogProps) {
  const { compareIds } = useShop();
  const [selectedCategory, setSelectedCategory] = useState<string>("Featured");
  const [sortMode, setSortMode] = useState<SortMode>("featured");

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      const cat = p.category || "Other";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return [
      { key: "Featured", label: "Featured", count: featuredIds.length },
      { key: "All", label: "All Catalog", count: products.length },
      ...Array.from(counts.entries()).map(([name, count]) => ({
        key: name,
        label: name,
        count,
      })),
    ];
  }, [products, featuredIds.length]);

  const displayedProducts = useMemo(() => {
    let base: Product[];
    if (selectedCategory === "Featured") {
      const featuredSet = new Set(featuredIds);
      base = featuredIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p));
      if (base.length === 0) {
        base = products.filter((p) => featuredSet.has(p.id));
      }
    } else if (selectedCategory === "All") {
      base = [...products];
    } else {
      base = products.filter((p) => p.category === selectedCategory);
    }

    if (sortMode === "price-asc") {
      return [...base].sort((a, b) => a.price - b.price);
    }
    if (sortMode === "price-desc") {
      return [...base].sort((a, b) => b.price - a.price);
    }
    return base;
  }, [products, featuredIds, selectedCategory, sortMode]);

  const activeCategoryMeta = DEMO_CATEGORIES.find(
    (c) => c.name === selectedCategory,
  );

  // Build real catalog attribute telemetry bars from displayed items
  const telemetrySamples = useMemo(() => {
    const sample = displayedProducts.slice(0, 4);
    const maxPrice = Math.max(...sample.map((p) => p.price), 1);
    return sample.map((p) => ({
      id: p.id,
      name: p.name.split(" ").slice(0, 2).join(" "),
      price: p.price,
      specCount: Object.keys(p.specs ?? {}).length,
      priceRatio: Math.max(12, Math.round((p.price / maxPrice) * 100)),
    }));
  }, [displayedProducts]);

  return (
    <section
      id="discovery-catalog"
      className="w-full pb-16 pt-2"
    >
      <div className="mx-auto w-full max-w-[1440px] px-4 md:px-6 lg:px-8">
        {/* Stitch Category Tile Strip (03 Mobile Carousel / 06 Desktop Row) */}
        <div className="py-2">
          <div className="mb-2.5 flex items-center justify-between lg:hidden">
            <h2 className="font-heading text-[16px] font-medium text-on-surface">
              Explore Categories
            </h2>
            <span className="font-heading text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {categories.length} Sectors
            </span>
          </div>

          <div
            role="group"
            aria-label="Filter catalog by category"
            className="flex items-stretch gap-3 overflow-x-auto pb-2 no-scrollbar"
          >
            {categories.map((cat) => {
              const active = selectedCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setSelectedCategory(cat.key)}
                  aria-pressed={active}
                  className={cn(
                    "group flex min-w-[152px] shrink-0 flex-1 items-center gap-3 rounded-xl p-3 text-left transition-all sm:min-w-[144px]",
                    active
                      ? "stitch-tier-1 border border-primary/35 bg-surface-card ring-1 ring-primary/15"
                      : "stitch-tier-1 border border-border-subtle bg-surface-card hover:bg-surface-container-low",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
                      active
                        ? "bg-primary-fixed text-primary"
                        : "bg-surface-container-high text-on-surface-variant",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined text-[20px]"
                    >
                      {categoryIconFor(cat.key)}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-heading text-[14px] font-semibold text-on-surface">
                      {cat.label}
                    </span>
                    <span className="font-mono text-[11px] text-text-muted">
                      {cat.count} {cat.count === 1 ? "item" : "items"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Curated Filter & Sort Header Bar */}
        <div className="mb-5 mt-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[22px] text-primary"
            >
              auto_awesome_motion
            </span>
            <h2 className="font-heading text-[18px] font-semibold tracking-tight text-on-surface">
              Curated Recommendations
            </h2>
            <span className="hidden text-text-muted sm:inline" aria-hidden="true">
              •
            </span>
            <span className="font-heading text-xs font-medium text-text-muted">
              Sorted by catalog order &amp; price
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedCategory !== "Featured" ? (
              <button
                type="button"
                onClick={() => setSelectedCategory("Featured")}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-card px-3 py-1 font-mono text-xs text-on-surface shadow-2xs transition-colors hover:border-error/40"
              >
                <span className="text-text-muted">Filter:</span>
                <span className="font-semibold text-primary">
                  {selectedCategory === "All" ? "All Catalog" : selectedCategory}
                </span>
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[14px] text-text-muted"
                >
                  close
                </span>
              </button>
            ) : null}

            {activeCategoryMeta ? (
              <Link
                href={`/chat?q=${encodeURIComponent(activeCategoryMeta.prompt)}`}
                className="inline-flex items-center gap-1 rounded-full bg-primary-fixed/60 px-3 py-1 font-heading text-xs font-semibold text-primary transition-colors hover:bg-primary-fixed"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                  auto_awesome
                </span>
                <span>Ask AI about {activeCategoryMeta.name}</span>
              </Link>
            ) : (
              <Link
                href="/chat"
                className="inline-flex items-center gap-1 rounded-full bg-primary-fixed/50 px-3 py-1 font-heading text-xs font-semibold text-primary transition-colors hover:bg-primary-fixed"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                  auto_awesome
                </span>
                <span>Open AI Workspace</span>
              </Link>
            )}

            {/* Segmented Sort Switcher */}
            <div
              role="group"
              aria-label="Sort products"
              className="flex items-center gap-1 rounded-lg bg-surface-container-high p-0.5"
            >
              {(
                [
                  { id: "featured", label: "Featured" },
                  { id: "price-asc", label: "Lowest Price" },
                  { id: "price-desc", label: "Highest Price" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSortMode(option.id)}
                  aria-pressed={sortMode === option.id}
                  className={cn(
                    "rounded px-2.5 py-1 font-heading text-[11px] transition-colors",
                    sortMode === option.id
                      ? "bg-surface-card font-semibold text-on-surface shadow-2xs"
                      : "text-on-surface-variant hover:text-on-surface",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4-Column Product Grid */}
        <ProductGrid products={displayedProducts} columns={4} />

        {/* Honest Catalog Attribute Profile Telemetry Card (Stitch 06 Strip) */}
        {telemetrySamples.length > 0 ? (
          <div className="stitch-tier-1 mt-8 flex flex-col items-center justify-between gap-6 rounded-2xl border border-border-subtle bg-surface-card p-5 lg:flex-row lg:p-6">
            <div className="flex max-w-md items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-primary">
                <span aria-hidden="true" className="material-symbols-outlined text-[24px]">
                  analytics
                </span>
              </div>
              <div>
                <h3 className="font-heading text-[16px] font-semibold text-on-surface">
                  Catalog Attribute Profile
                </h3>
                <p className="mt-0.5 text-[13px] leading-relaxed text-text-muted">
                  Real price spread and documented specification counts across your current{" "}
                  {displayedProducts.length} displayed catalog picks.
                </p>
              </div>
            </div>

            <div className="flex w-full max-w-xl flex-1 items-center gap-4 rounded-xl bg-surface-container-low px-4 py-3">
              <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                {telemetrySamples.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-1 font-mono text-[11px]">
                      <span className="truncate font-medium text-on-surface">
                        {item.name}
                      </span>
                      <span className="font-semibold text-primary">
                        ${item.price}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
                      <div
                        className="h-full rounded-full bg-primary-container"
                        style={{ width: `${item.priceRatio}%` }}
                      />
                    </div>
                    <p className="font-mono text-[10px] text-text-muted">
                      {item.specCount} documented specs
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* Mobile Instant Matrix Gradient Banner (Stitch 03) */}
        <div className="relative mt-5 overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary-container to-brand-deep-indigo p-4 text-on-primary shadow-md lg:hidden">
          <div className="relative z-10 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-heading text-[11px] font-semibold uppercase tracking-wide">
                Instant Matrix
              </span>
              <span className="font-mono text-xs text-on-primary-container">
                {compareIds.length}/4 slots pinned
              </span>
            </div>
            <div>
              <h3 className="font-heading text-[18px] font-semibold tracking-tight text-white">
                Need side-by-side analysis?
              </h3>
              <p className="mt-1 text-[13px] leading-snug text-on-primary-container">
                Generate an instant side-by-side technical matrix of documented specs and trade-offs.
              </p>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex -space-x-2" aria-hidden="true">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-card text-xs font-bold text-on-surface shadow-xs">
                  1
                </div>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-container text-xs font-bold text-on-surface shadow-xs">
                  2
                </div>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-fixed text-xs font-bold text-primary shadow-xs">
                  +
                </div>
              </div>
              <Link
                href="/compare"
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface-card px-4 py-2 font-heading text-xs font-semibold text-on-surface shadow-sm transition-transform hover:bg-surface-bright active:scale-95"
              >
                <span>Launch Matrix</span>
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  arrow_forward
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
