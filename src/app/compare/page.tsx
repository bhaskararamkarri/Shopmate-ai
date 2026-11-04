import type { Metadata } from "next";
import { CompareClient } from "@/components/compare/compare-client";

export const metadata: Metadata = {
  title: "Products compared",
  description:
    "Compare demo products side by side — specs, prices, advantages and trade-offs in one table.",
};

export default function ComparePage() {
  return <CompareClient />;
}
