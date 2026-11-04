import { cn } from "cn";
import type { Product } from "@/types";
import { ProductCard } from "@/components/shop/product-card";

/**
 * Column wrapper for lists of ProductCards. Kept presentational so it can be
 * used from server-rendered pages and client trees alike.
 */
export function ProductGrid({
  products,
  columns = 4,
  className,
  ariaLabel = "Product results",
}: {
  products: Product[];
  columns?: 2 | 3 | 4;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <ul
      aria-label={ariaLabel}
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2",
        columns === 3 && "lg:grid-cols-3",
        columns === 4 && "lg:grid-cols-4",
        className,
      )}
    >
      {products.map((product) => (
        <li key={product.id} className="min-w-0">
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
