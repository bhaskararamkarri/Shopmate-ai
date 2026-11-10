import { Zap } from "lucide-react";
import { cn } from "cn";
import type { Product } from "@/types";

/**
 * Product provenance badge. Demo records always read "Demo data"; live
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
          "inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium tracking-wide text-[#047857]",
          className,
        )}
      >
        <Zap className="size-3 shrink-0 text-emerald-600" aria-hidden="true" />
        <span className="font-semibold tracking-wide text-[#065F46]">LIVE</span>
        {showMerchant && product.merchant ? (
          <span className="truncate font-normal text-[#047857]/85">
            via {product.merchant}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#B45309]",
        className,
      )}
      title="Demo record — mock data from the development catalog, not a live listing"
    >
      Demo data
    </span>
  );
}
