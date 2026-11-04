import { Trash } from "lucide-react";
import { cn } from "cn";
import type { Product } from "@/types";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shop/product-image";
import { formatMoney } from "@/lib/format";

/**
 * Side-by-side comparison of demo products. The first column stays pinned
 * while the table scrolls horizontally on narrow screens (per Phase 2 spec).
 */
export function ComparisonTable({
  products,
  onRemove,
}: {
  products: Product[];
  onRemove: (productId: string) => void;
}) {
  // Spec row order: keys from the first pick, then any additional keys.
  const specKeys = Array.from(
    products.reduce((keys, product) => {
      for (const key of Object.keys(product.specs)) keys.add(key);
      return keys;
    }, new Set<string>() as Set<string>),
  );
  const minWidth = 150 + products.length * 220;

  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card">
      <table
        className="w-full border-separate border-spacing-0"
        style={{ minWidth }}
      >
        <caption className="sr-only">
          Attribute comparison of the selected demo products
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 bg-card p-4 align-bottom"
              style={{ minWidth: 150 }}
            >
              <span className="sr-only">Attribute</span>
            </th>
            {products.map((product) => (
              <th key={product.id} scope="col" className="p-4 align-top" style={{ minWidth: 220 }}>
                <article className="flex flex-col items-start gap-3">
                  <ProductImage product={product} variant="thumb" className="size-20" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold leading-snug tracking-tight text-foreground">
                      {product.name}
                    </p>
                    <p className="text-[13px] text-muted-foreground">{product.brand}</p>
                  </div>
                  <p className="text-[15px] font-semibold tabular-nums text-foreground">
                    {formatMoney(product.price, product.currency)}
                  </p>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${product.name} from comparison`}
                    onClick={() => onRemove(product.id)}
                  >
                    <Trash aria-hidden="true" />
                  </Button>
                </article>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {specKeys.map((key) => {
            const values = products.map(
              (product) => product.specs[key] ?? "—",
            );
            const identicalAcrossPicks = new Set(values).size === 1;

            return (
              <tr key={key}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-t border-border bg-card px-4 py-3 text-left align-top text-[13px] font-medium text-muted-foreground"
                >
                  {key}
                </th>
                {values.map((value, index) => (
                  <td
                    key={products[index].id}
                    className={cn(
                      "border-t border-border px-4 py-3 align-top text-[14px] leading-relaxed",
                      identicalAcrossPicks ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
