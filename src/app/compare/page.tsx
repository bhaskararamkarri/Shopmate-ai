import { Suspense } from "react";
import type { Metadata } from "next";
import { CompareClient } from "@/components/compare/compare-client";

export const metadata: Metadata = {
  title: "Compare Products - ShopMate AI",
  description: "Evidence-grounded side-by-side product comparison powered by ShopMate AI.",
};

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground animate-pulse">
            Loading comparison...
          </p>
        </div>
      }
    >
      <CompareClient />
    </Suspense>
  );
}
