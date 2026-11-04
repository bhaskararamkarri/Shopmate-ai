"use client";

import { GitCompareArrows, Trash } from "lucide-react";
import { DEMO_PRODUCTS } from "@/lib/demo-catalog";
import { useShop } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shop/empty-state";
import { ProductGrid } from "@/components/shop/product-grid";
import { SectionHeading } from "@/components/shop/section-heading";
import { ComparisonTable } from "@/components/compare/comparison-table";
import { ComparisonNotes } from "@/components/compare/comparison-notes";

export function CompareClient() {
  const { compareProducts, toggleCompare, clearCompare, isComparing } = useShop();

  const remainingProducts = DEMO_PRODUCTS.filter(
    (product) => !isComparing(product.id),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          title="Side-by-side comparison"
          description={
            compareProducts.length === 0
              ? "Pick two or more products below and the table fills in with every spec worth weighing."
              : "Specs come straight from the demo catalog, dimmed when a row is identical across the picks. Up to four products share the table."
          }
        />
        {compareProducts.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={clearCompare}
          >
            <Trash aria-hidden="true" />
            Clear selection
          </Button>
        ) : null}
      </div>

      {compareProducts.length > 0 ? (
        <div className="mt-8 space-y-8">
          <ComparisonTable
            products={compareProducts}
            onRemove={toggleCompare}
          />
          <section aria-label="Advantages and trade-offs per pick">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Advantages and trade-offs
            </h2>
            <p className="mt-1 text-[15px] text-muted-foreground">
              Derived from each product record&apos;s own attributes — demo
              records ship mock attributes, live records carry real merchant
              specs.
            </p>
            <div className="mt-5">
              <ComparisonNotes products={compareProducts} />
            </div>
          </section>
        </div>
      ) : (
        <EmptyState
          icon={GitCompareArrows}
          title="Nothing to compare yet"
          description="Add products from the grid below. Two to four picks make the strongest comparison."
          className="mt-8"
        />
      )}

      {remainingProducts.length > 0 ? (
        <section aria-label="Add more products to the comparison" className="mt-14">
          <SectionHeading
            title="Add more products"
            description={
              compareProducts.length >= 4
                ? "The table is full — remove a pick before adding another."
                : undefined
            }
          />
          <ProductGrid
            products={remainingProducts}
            columns={4}
            className="mt-6"
            ariaLabel="Demo products you can add to the comparison"
          />
        </section>
      ) : compareProducts.length > 0 ? (
        <p className="mt-12 text-[13px] text-muted-foreground">
          Every product in the demo catalog is already pinned to the table.
        </p>
      ) : null}
    </div>
  );
}
