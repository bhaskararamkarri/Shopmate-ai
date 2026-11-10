"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, SlidersHorizontal } from "lucide-react";
import { cn } from "cn";
import type { Product } from "@/types";
import { Button } from "@/components/ui/button";
import { ProductGrid } from "@/components/shop/product-grid";
import { SectionHeading } from "@/components/shop/section-heading";

type SortMode = "featured" | "price-asc" | "price-desc";

interface DiscoveryCatalogProps {
  products: Product[];
  featuredIds: string[];
}

/**
 * Interactive Stitch discovery grid & matrix filter strip on the homepage.
 * Uses real catalog categories & counts with zero fabricated scores or labels.
 */
export function DiscoveryCatalog({
  products,
  featuredIds,
}: DiscoveryCatalogProps) {
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

  return (
    <section
      id="discovery-catalog"
      className="border-t border-border bg-background py-16 md:py-20"
    >
      <div className="mx-auto w-full max-w-[1320px] px-4 md:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            title="Decision catalog"
            description="Compare verified specs directly inside each tile, pin picks to your floating comparison dock, or send your criteria to the AI workspace."
          />
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/chat">
              Open AI Workspace
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {/* Interactive Filter Pills + Sort Controls */}
        <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between stitch-tier-1">
          <div
            role="group"
            aria-label="Filter catalog by category"
            className="flex flex-wrap items-center gap-1.5"
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
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all",
                    active
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border bg-background text-muted-foreground hover:border-input hover:text-foreground",
                  )}
                >
                  <span>{cat.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 font-mono text-[10px]",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              Sort:
            </span>
            <div
              role="group"
              aria-label="Sort products"
              className="inline-flex rounded-lg border border-border bg-muted/60 p-0.5"
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
                    "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    sortMode === option.id
                      ? "bg-card text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4-Column Product Grid */}
        <div className="mt-6">
          <ProductGrid products={displayedProducts} columns={4} />
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          * Catalog tiles display clearly labeled demo records alongside live
          Channel3 integrations. Prices shown are authoritative record values;
          nothing here fabricates inventory or ratings.
        </p>
      </div>
    </section>
  );
}

