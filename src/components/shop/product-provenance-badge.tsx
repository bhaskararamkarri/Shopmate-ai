import { Zap } from "lucide-react";
import { cn } from "cn";
import type { Product } from "@/types";

/**
 * Product provenance badge. Demo records always read "DEMO DATA"; live
 * Channel3 records read "LIVE" with an optional short merchant tag. The
 * distinction is explicit so mock listings can never pass as live inventory.
 */
export function ProductProvenanceBadge({
  product,
  showMerchant = true,
  className,
}: {
  product: Product;
  /** Show "via amazon.com" style merchant tag next to the live marker. */
  showMerchant?: boolean;
  className?: string;
}) {
  if (product.source === "channel3") {
    return (
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground",
          className,
        )}
      >
        <Zap className="size-3 shrink-0 text-primary" aria-hidden="true" />
        <span className="font-semibold tracking-wide text-foreground">LIVE</span>
        {showMerchant && product.merchant ? (
          <span className="truncate">via {product.merchant}</span>
        ) : null}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-[#FBF3DB] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#956400]",
        className,
      )}
      title="Demo record — mock data from the development catalog, not a live listing"
    >
      Demo data
    </span>
  );
}
