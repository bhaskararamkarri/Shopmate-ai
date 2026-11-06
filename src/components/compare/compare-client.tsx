"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  GitCompareArrows,
  Trash,
  Sparkles,
  SlidersHorizontal,
  Bot,
  Plus,
} from "lucide-react";
import { DEMO_PRODUCTS } from "@/lib/demo-catalog";
import { useCompare } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shop/empty-state";
import { ProductGrid } from "@/components/shop/product-grid";
import { SectionHeading } from "@/components/shop/section-heading";
import { ComparisonTable } from "@/components/compare/comparison-table";
import { ComparisonNotes } from "@/components/compare/comparison-notes";

const PRESET_COMPARISONS = [
  {
    title: "Audio: Headphones vs Earbuds vs Speaker",
    description: "Compare form-factors, ANC, and battery endurance across audio gear.",
    ids: ["demo-aurora-headphones", "demo-bloom-earbuds", "demo-pulse-speaker"],
  },
  {
    title: "Wearables: GPS Watch vs Sleep Ring",
    description: "Compare tracking battery, water resistance, and sensor capabilities.",
    ids: ["demo-stride-watch", "demo-arc-ring"],
  },
  {
    title: "Workspace: Mechanical Keyboard & Mouse",
    description: "Compare ergonomic input hardware specs and wireless latency.",
    ids: ["demo-lithe-keyboard", "demo-marker-mouse"],
  },
];

export function CompareClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { compareProducts, toggleCompare, clearCompare, isComparing, setCompare } = useCompare();
  const [showDifferencesOnly, setShowDifferencesOnly] = useState(false);
  const syncedUrlRef = useRef<string | null>(null);

  // Ingest URL ?ids=id1,id2 on initial load
  useEffect(() => {
    const idsParam = searchParams.get("ids");
    if (idsParam && syncedUrlRef.current !== idsParam) {
      syncedUrlRef.current = idsParam;
      const parsedIds = idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsedIds.length > 0) {
        setCompare(parsedIds);
      }
    }
  }, [searchParams, setCompare]);

  const remainingProducts = DEMO_PRODUCTS.filter(
    (product) => !isComparing(product.id),
  );

  function handleOpenInAiWorkspace() {
    if (compareProducts.length === 0) {
      router.push("/chat");
      return;
    }
    const names = compareProducts.map((p) => p.name).join(" and ");
    const prompt = `Compare ${names} and tell me the main trade-offs and which one I should buy`;
    router.push(`/chat?q=${encodeURIComponent(prompt)}`);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6 md:py-12 space-y-8">
      {/* Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Side-by-Side Comparison
            </h1>
            {compareProducts.length > 0 ? (
              <Badge variant="secondary" className="font-mono text-xs">
                {compareProducts.length}/4 picks
              </Badge>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
            {compareProducts.length === 0
              ? "Select products to weigh real verified specs side-by-side, highlight differences, and get honest AI recommendations."
              : "Compare catalog specifications, spot key differences, and review advantages backed by verified attributes."}
          </p>
        </div>

        {compareProducts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant={showDifferencesOnly ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5 text-xs h-9"
              onClick={() => setShowDifferencesOnly((prev) => !prev)}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              {showDifferencesOnly ? "Showing differences only" : "Highlight differences"}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-9"
              onClick={handleOpenInAiWorkspace}
            >
              <Bot className="size-3.5 text-primary" aria-hidden="true" />
              Ask AI Workspace
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs h-9 text-muted-foreground hover:text-destructive"
              onClick={clearCompare}
            >
              <Trash className="size-3.5" aria-hidden="true" />
              Clear all
            </Button>
          </div>
        ) : null}
      </div>

      {/* Comparison View or Empty State */}
      {compareProducts.length > 0 ? (
        <div className="space-y-10">
          <ComparisonTable
            products={compareProducts}
            onRemove={toggleCompare}
            showDifferencesOnly={showDifferencesOnly}
          />

          <section aria-label="Advantages and trade-offs per pick" className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Advantages, Trade-offs & Analysis
              </h2>
              <p className="text-sm text-muted-foreground">
                Grounded strictly in verified catalog specifications. Missing or unverified data is transparently flagged.
              </p>
            </div>
            <ComparisonNotes products={compareProducts} />
          </section>
        </div>
      ) : (
        <div className="space-y-8">
          <EmptyState
            icon={GitCompareArrows}
            title="No products selected for comparison"
            description="Choose up to 4 products to compare specifications, prices, and trade-offs side by side."
            className="py-12"
          />

          {/* Preset Comparisons */}
          <div className="rounded-xl border border-border bg-card/60 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Try a Popular Comparison
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {PRESET_COMPARISONS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => setCompare(preset.ids)}
                  className="flex flex-col items-start gap-1.5 rounded-lg border border-border/80 bg-background/60 p-3.5 text-left transition hover:border-primary/50 hover:bg-muted/40"
                >
                  <span className="text-xs font-semibold text-foreground">
                    {preset.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-relaxed">
                    {preset.description}
                  </span>
                  <span className="mt-1 text-[11px] font-medium text-primary flex items-center gap-1">
                    <Plus className="size-3" /> Compare these
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add More Products Grid */}
      {remainingProducts.length > 0 ? (
        <section aria-label="Add more products to the comparison" className="pt-6 border-t border-border space-y-6">
          <SectionHeading
            title="Add products to compare"
            description={
              compareProducts.length >= 4
                ? "The comparison table is full (4 items maximum). Remove a product to add another."
                : "Select items from the catalog below to include in your side-by-side comparison."
            }
          />
          <ProductGrid
            products={remainingProducts}
            columns={4}
            ariaLabel="Catalog products you can add to the comparison"
          />
        </section>
      ) : compareProducts.length > 0 ? (
        <p className="text-center text-xs text-muted-foreground pt-4">
          All catalog products are currently added to the comparison table.
        </p>
      ) : null}
    </div>
  );
}
