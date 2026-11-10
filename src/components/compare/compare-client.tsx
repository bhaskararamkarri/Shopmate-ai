"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Bot,
  Check,
  ChevronRight,
  GitCompareArrows,
  Plus,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash,
} from "lucide-react";
import { cn } from "cn";
import { DEMO_PRODUCTS } from "@/lib/demo-catalog";
import { buildComparisonMatrix } from "@/lib/compare/compare-matrix";
import { formatMoney } from "@/lib/format";
import { useCart, useCompare } from "@/lib/store";
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

function RadialGauge({
  valuePct,
  label,
  sublabel,
  tone = "primary",
}: {
  valuePct: number;
  label: string;
  sublabel: string;
  tone?: "primary" | "secondary";
}) {
  const safe = Math.max(0, Math.min(100, Math.round(valuePct)));
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex size-12 shrink-0 items-center justify-center">
        <svg className="size-12 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
          <path
            className="text-surface-container-highest"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className={
              tone === "secondary" ? "text-secondary" : "text-primary-container"
            }
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            strokeDasharray={`${safe}, 100`}
            strokeLinecap="round"
            strokeWidth="3"
          />
        </svg>
        <span className="absolute font-mono text-xs font-bold text-on-surface">
          {safe}%
        </span>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </div>
        <div className="text-xs font-semibold text-on-surface">{sublabel}</div>
      </div>
    </div>
  );
}

export function CompareClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToCart } = useCart();
  const { compareProducts, toggleCompare, clearCompare, isComparing, setCompare } =
    useCompare();
  const [showDifferencesOnly, setShowDifferencesOnly] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
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

  const matrix = useMemo(
    () =>
      compareProducts.length > 0
        ? buildComparisonMatrix(compareProducts)
        : null,
    [compareProducts],
  );
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
  const bestOverallChoiceId =
    compareProducts.find(
      (p) => matrix?.insights.get(p.id)?.badge === "Best Overall",
    )?.id ?? compareProducts[0]?.id;

  let completenessPct = 100;
  let variancePct = 0;
  if (matrix && matrix.totalSpecsCount > 0 && compareProducts.length > 0) {
    const totalCells = matrix.totalSpecsCount * compareProducts.length;
    let documented = 0;
    for (const row of matrix.specRows) {
      for (const product of compareProducts) {
        if (!row.values[product.id]?.isMissing) {
          documented += 1;
        }
      }
    }
    completenessPct = Math.round((documented / totalCells) * 100);
    variancePct = Math.round(
      (matrix.differingSpecsCount / matrix.totalSpecsCount) * 100,
    );
  }
  const gaugeMetrics = { completenessPct, variancePct };

  function handleOpenInAiWorkspace() {
    if (compareProducts.length === 0) {
      router.push("/chat");
      return;
    }
    const names = compareProducts.map((p) => p.name).join(" and ");
    const prompt = `Compare ${names} and tell me the main trade-offs and which one I should buy`;
    router.push(`/chat?q=${encodeURIComponent(prompt)}`);
  }

  async function handleShareMatrix() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 1800);
      }
    } catch {
      // Ignore clipboard failures gracefully
    }
  }

  function handleScrollToPicker() {
    const picker = document.getElementById("add-products-picker");
    if (picker && typeof picker.scrollIntoView === "function") {
      picker.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handleChooseAndCheckout(productId: string) {
    addToCart(productId);
    router.push("/cart");
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-8 px-4 py-8 pb-36 md:px-6 md:py-10 lg:px-8 lg:pb-28">
      {/* Breadcrumb + Header & Actions */}
      <div className="space-y-4 border-b border-border-subtle pb-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-muted"
        >
          <Link href="/" className="transition-colors hover:text-primary">
            Discovery
          </Link>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span className="font-semibold text-primary">Comparison Matrix</span>
        </nav>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-on-surface md:text-3xl">
                Product Comparison Matrix
              </h1>
              {compareProducts.length > 0 ? (
                <Badge
                  variant="secondary"
                  className="bg-surface-container-high font-mono text-xs font-semibold text-primary"
                >
                  {compareProducts.length}/4 picks
                </Badge>
              ) : null}
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
              {compareProducts.length === 0
                ? "Select up to four products to inspect documented specifications, currency-safe pricing spreads, and honest trade-offs."
                : "Side-by-side specification matrix grounded in catalog data. Differing attributes and missing fields are surfaced explicitly."}
            </p>
          </div>

          {compareProducts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {remainingProducts.length > 0 && compareProducts.length < 4 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 gap-1.5 rounded-lg bg-surface-container-high text-xs font-semibold text-on-surface hover:bg-surface-container-highest"
                  onClick={handleScrollToPicker}
                >
                  <Plus className="size-3.5 text-primary" aria-hidden="true" />
                  Add Product
                </Button>
              ) : null}

              <Button
                type="button"
                variant={showDifferencesOnly ? "default" : "outline"}
                size="sm"
                className="h-9 gap-1.5 rounded-lg text-xs font-medium"
                onClick={() => setShowDifferencesOnly((prev) => !prev)}
              >
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                {showDifferencesOnly
                  ? "Differences only"
                  : "Highlight differences"}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg text-xs font-medium"
                onClick={handleShareMatrix}
              >
                {copiedLink ? (
                  <>
                    <Check className="size-3.5 text-secondary" aria-hidden="true" />
                    Copied link
                  </>
                ) : (
                  <>
                    <Share2 className="size-3.5" aria-hidden="true" />
                    Share
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg text-xs font-medium"
                onClick={handleOpenInAiWorkspace}
              >
                <Bot className="size-3.5 text-primary" aria-hidden="true" />
                Ask AI Workspace
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 rounded-lg text-xs text-text-muted hover:bg-error-container/50 hover:text-error"
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
          {/* Stitch 08 AI Synthesized Verdict Card */}
          <section
            aria-label="Comparison summary overview"
            className="relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-card p-5 shadow-sm md:p-6"
          >
            <div
              className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-primary-container/10 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative z-10 flex flex-col justify-between gap-6 xl:flex-row xl:items-center">
              <div className="max-w-3xl space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-md bg-primary-container text-on-primary">
                    <span
                      className="material-symbols-outlined text-[15px]"
                      aria-hidden="true"
                    >
                      psychology
                    </span>
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    AI Synthesized Verdict
                  </span>
                  {priceInfo &&
                  !priceInfo.hasCurrencyMismatch &&
                  priceInfo.minPrice !== undefined &&
                  priceInfo.maxPrice !== undefined ? (
                    <span className="rounded-full bg-secondary-container px-2.5 py-0.5 font-mono text-[11px] font-semibold text-on-secondary-container">
                      {formatMoney(priceInfo.minPrice, currency)} –{" "}
                      {formatMoney(priceInfo.maxPrice, currency)}
                      {priceInfo.formattedDelta && compareProducts.length > 1
                        ? ` (${priceInfo.formattedDelta} spread)`
                        : ""}
                    </span>
                  ) : null}
                </div>

                <p className="text-[15px] leading-relaxed text-on-surface">
                  <strong className="font-semibold text-primary">
                    Executive Takeaway:{" "}
                  </strong>
                  {topLeaderProduct && topInsightEntry?.[1]?.whyItMatches ? (
                    <>
                      <strong className="font-semibold">
                        {topLeaderProduct.name}
                      </strong>{" "}
                      ({topInsightEntry[1].badge ?? "Top Match"}):{" "}
                      {topInsightEntry[1].whyItMatches}{" "}
                    </>
                  ) : null}
                  Comparing{" "}
                  <strong className="font-mono font-semibold">
                    {compareProducts.length}
                  </strong>{" "}
                  picks across{" "}
                  <strong className="font-mono font-semibold">
                    {matrix.differingSpecsCount} of {matrix.totalSpecsCount}
                  </strong>{" "}
                  differing catalog attributes.
                </p>
              </div>

              {/* Genuine SVG Radial Telemetry Gauges */}
              <div className="flex w-full shrink-0 flex-col gap-4 rounded-xl bg-surface-container-low p-4 sm:flex-row sm:items-center xl:w-auto">
                <RadialGauge
                  valuePct={gaugeMetrics.completenessPct}
                  label="Spec Completeness"
                  sublabel="Documented fields"
                  tone="primary"
                />
                <div className="hidden h-10 w-px bg-surface-container-highest sm:block" />
                <RadialGauge
                  valuePct={gaugeMetrics.variancePct}
                  label="Spec Variance"
                  sublabel={`${matrix.differingSpecsCount} of ${matrix.totalSpecsCount} differ`}
                  tone="secondary"
                />
              </div>
            </div>
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
              <h2 className="text-lg font-bold tracking-tight text-on-surface">
                Advantages, Trade-offs &amp; Disclosures
              </h2>
              <p className="text-sm text-text-muted">
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
          <div className="space-y-4 rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h3 className="text-sm font-semibold text-on-surface">
                Try a Popular Comparison
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {PRESET_COMPARISONS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => setCompare(preset.ids)}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-border-subtle bg-surface-container-low p-4 text-left transition-all hover:border-primary/40 hover:bg-surface-container"
                >
                  <span className="text-xs font-semibold text-on-surface">
                    {preset.title}
                  </span>
                  <span className="text-[11px] leading-relaxed text-text-muted">
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
          id="add-products-picker"
          aria-label="Add more products to the comparison"
          className="space-y-6 border-t border-border-subtle pt-8"
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
        <p className="pt-4 text-center text-xs text-text-muted">
          All catalog products are currently added to the comparison table.
        </p>
      ) : null}

      {/* Fixed Bottom Decision Choice CTA Bar (Stitch 08 Desktop & 01 Mobile) */}
      {compareProducts.length >= 2 ? (
        <div
          aria-label="Quick comparison checkout bar"
          className="fixed inset-x-0 bottom-16 z-30 border-t border-border-subtle bg-surface-card/95 px-4 py-3 shadow-[0_-6px_24px_rgba(19,22,39,0.08)] backdrop-blur-xl lg:bottom-0 lg:px-8"
        >
          <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="hidden items-center gap-2 text-xs text-text-muted xl:flex">
              <span
                className="material-symbols-outlined text-[18px] text-primary"
                aria-hidden="true"
              >
                verified
              </span>
              <span>
                Verified catalog prices • Adds item and continues to PayPal checkout
              </span>
            </div>

            <div className="flex w-full items-center justify-end gap-2 sm:gap-2.5 xl:w-auto">
              {compareProducts.slice(0, 2).map((product) => {
                const insight = matrix?.insights.get(product.id);
                const isPrimary = product.id === bestOverallChoiceId;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleChooseAndCheckout(product.id)}
                    className={cn(
                      "flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-all active:scale-[0.99] sm:flex-initial sm:px-4",
                      isPrimary
                        ? "bg-primary text-on-primary shadow-sm hover:bg-surface-tint"
                        : "bg-brand-deep-indigo text-white shadow-sm hover:bg-brand-deep-indigo/90",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold md:text-sm">
                        Choose {product.name} —{" "}
                        {formatMoney(product.price, product.currency)}
                      </div>
                      <div
                        className={cn(
                          "truncate text-[10px] font-medium",
                          isPrimary ? "text-on-primary-container" : "text-white/75",
                        )}
                      >
                        {insight?.badge ?? product.brand}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "material-symbols-outlined shrink-0 text-[18px]",
                        isPrimary ? "text-on-primary" : "text-secondary-fixed",
                      )}
                      aria-hidden="true"
                    >
                      arrow_forward
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
