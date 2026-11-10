"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Bot,
  ChevronRight,
  GitCompareArrows,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash,
} from "lucide-react";
import { DEMO_PRODUCTS } from "@/lib/demo-catalog";
import { buildComparisonMatrix } from "@/lib/compare/compare-matrix";
import { formatMoney } from "@/lib/format";
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
    description: "Compare ergonomic input hardware specs and wireless endurance.",
    ids: ["demo-lithe-keyboard", "demo-marker-mouse"],
  },
];

export function CompareClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { compareProducts, toggleCompare, clearCompare, isComparing, setCompare } =
    useCompare();
  const [showDifferencesOnly, setShowDifferencesOnly] = useState(false);
  const syncedUrlRef = useRef<string | null>(null);

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

  const matrix =
    compareProducts.length > 0 ? buildComparisonMatrix(compareProducts) : null;
  const priceInfo = matrix?.priceComparison;
  const currency = priceInfo?.currencies[0] ?? "USD";

  const topInsightEntry = matrix
    ? Array.from(matrix.insights.entries()).find(
        ([, rec]) => rec.badge === "Best Overall",
      ) ?? Array.from(matrix.insights.entries())[0]
    : undefined;
  const topLeaderProduct = topInsightEntry
    ? compareProducts.find((p) => p.id === topInsightEntry[0])
    : undefined;

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
    <div className="mx-auto w-full max-w-[1320px] space-y-8 px-4 py-8 md:px-6 md:py-10 lg:px-8">
      {/* Breadcrumb + Header & Actions */}
      <div className="space-y-4 border-b border-border pb-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Discovery
          </Link>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span className="font-medium text-foreground">Comparison Matrix</span>
        </nav>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                Product Comparison Matrix
              </h1>
              {compareProducts.length > 0 ? (
                <Badge
                  variant="secondary"
                  className="font-mono text-xs font-semibold text-primary"
                >
                  {compareProducts.length}/4 picks
                </Badge>
              ) : null}
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              {compareProducts.length === 0
                ? "Select up to four products to inspect documented specifications, currency-safe pricing spreads, and honest trade-offs."
                : "Review verified catalog specifications side by side. Differing attributes and missing data points are highlighted explicitly."}
            </p>
          </div>

          {compareProducts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={showDifferencesOnly ? "secondary" : "outline"}
                size="sm"
                className="h-9 gap-1.5 text-xs font-medium"
                onClick={() => setShowDifferencesOnly((prev) => !prev)}
              >
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                {showDifferencesOnly
                  ? "Showing differences only"
                  : "Highlight differences"}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs font-medium"
                onClick={handleOpenInAiWorkspace}
              >
                <Bot className="size-3.5 text-primary" aria-hidden="true" />
                Ask AI Workspace
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                onClick={clearCompare}
              >
                <Trash className="size-3.5" aria-hidden="true" />
                Clear all
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Comparison View or Empty State */}
      {compareProducts.length > 0 && matrix ? (
        <div className="space-y-8">
          {/* Stitch Synthesized Matrix Summary Banner (100% factual from matrix) */}
          <section
            aria-label="Comparison summary overview"
            className="stitch-tier-1 flex flex-col justify-between gap-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-secondary/90 via-card to-card p-5 lg:flex-row lg:items-center"
          >
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                <Sparkles className="size-3" aria-hidden="true" />
                Decision Matrix Overview
              </span>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm text-foreground">
                {priceInfo &&
                !priceInfo.hasCurrencyMismatch &&
                priceInfo.minPrice !== undefined &&
                priceInfo.maxPrice !== undefined ? (
                  <span>
                    <span className="text-muted-foreground">Price range: </span>
                    <strong className="font-mono font-semibold">
                      {formatMoney(priceInfo.minPrice, currency)} –{" "}
                      {formatMoney(priceInfo.maxPrice, currency)}
                    </strong>
                    {priceInfo.formattedDelta && compareProducts.length > 1
                      ? ` (${priceInfo.formattedDelta} spread)`
                      : ""}
                  </span>
                ) : null}
                <span>
                  <span className="text-muted-foreground">Attributes: </span>
                  <strong className="font-mono font-semibold">
                    {matrix.differingSpecsCount} of {matrix.totalSpecsCount} differ
                  </strong>
                </span>
                {topLeaderProduct && topInsightEntry?.[1]?.badge ? (
                  <span>
                    <span className="text-muted-foreground">
                      {topInsightEntry[1].badge}:{" "}
                    </span>
                    <strong className="font-semibold text-primary">
                      {topLeaderProduct.name}
                    </strong>
                  </span>
                ) : null}
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={handleOpenInAiWorkspace}
              className="shrink-0 gap-1.5 self-start lg:self-auto"
            >
              <Bot className="size-4" aria-hidden="true" />
              Deep-dive in AI Workspace
            </Button>
          </section>

          <ComparisonTable
            products={compareProducts}
            onRemove={toggleCompare}
            showDifferencesOnly={showDifferencesOnly}
          />

          <section
            aria-label="Advantages and trade-offs per pick"
            className="space-y-4"
          >
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                Advantages, Trade-offs &amp; Disclosures
              </h2>
              <p className="text-sm text-muted-foreground">
                Derived strictly from documented catalog specifications. Missing
                or unverified fields are disclosed below.
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
            description="Choose up to 4 products to compare specifications, prices, and documented trade-offs side by side."
            className="py-12"
          />

          {/* Preset Comparisons */}
          <div className="stitch-tier-1 space-y-4 rounded-2xl border border-border bg-card p-6">
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
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-border bg-background p-4 text-left transition-all hover:border-primary/40 hover:bg-secondary/50"
                >
                  <span className="text-xs font-semibold text-foreground">
                    {preset.title}
                  </span>
                  <span className="text-[11px] leading-relaxed text-muted-foreground">
                    {preset.description}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-primary">
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
        <section
          aria-label="Add more products to the comparison"
          className="space-y-6 border-t border-border pt-8"
        >
          <SectionHeading
            title="Add products to compare"
            description={
              compareProducts.length >= 4
                ? "The comparison table is full (4 items maximum). Remove a product above to swap in another."
                : "Pin items from the catalog below to add them to your side-by-side matrix."
            }
          />
          <ProductGrid
            products={remainingProducts}
            columns={4}
            ariaLabel="Catalog products you can add to the comparison"
          />
        </section>
      ) : compareProducts.length > 0 ? (
        <p className="pt-4 text-center text-xs text-muted-foreground">
          All catalog products are currently added to the comparison table.
        </p>
      ) : null}
    </div>
  );
}
