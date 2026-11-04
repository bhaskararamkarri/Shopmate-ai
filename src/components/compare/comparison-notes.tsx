import { Check, CircleAlert } from "lucide-react";
import type { CSSProperties } from "react";
import type { Product, ProductAttribute } from "@/types";
import { formatMoney } from "@/lib/format";

interface AttributeNote {
  tone: "pro" | "con";
  text: string;
}

/** Parses a leading number from an attribute value like "34 hours". */
function leadingNumber(value: string): number | null {
  const match = /^(\d[\d,]*(?:\.\d+)?)/.exec(value.trim());
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function findAttribute(product: Product, label: string): ProductAttribute | undefined {
  return (product.attributes ?? []).find((attribute) => attribute.label === label);
}

/**
 * Advantage/trade-off notes derived strictly from the mock attributes the
 * demo catalog supplies (price plus any attributes carrying a `better`
 * direction). Nothing is invented beyond comparing those values.
 */
export function notesForProduct(
  product: Product,
  others: Product[],
): AttributeNote[] {
  if (others.length === 0) return [];
  const notes: AttributeNote[] = [];

  const prices = [product.price, ...others.map((other) => other.price)];
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  if (product.price === minPrice && others.some((other) => other.price !== product.price)) {
    notes.push({
      tone: "pro",
      text: `Lowest price in this set — ${formatMoney(product.price, product.currency)}`,
    });
  } else if (product.price === maxPrice && others.some((other) => other.price !== product.price)) {
    notes.push({
      tone: "con",
      text: `Highest price in this set — ${formatMoney(
        product.price,
        product.currency,
      )} (+${formatMoney(product.price - minPrice, product.currency)})`,
    });
  }

  for (const attribute of product.attributes ?? []) {
    if (!attribute.better) continue;
    const mine = leadingNumber(attribute.value);
    if (mine === null) continue;

    const theirValues: Array<number | null> = others.map((other) => {
      const theirs = findAttribute(other, attribute.label);
      if (!theirs || !theirs.better) return null;
      return leadingNumber(theirs.value);
    });
    // Only compare when the whole set carries the same labeled attribute.
    if (theirValues.some((value) => value === null)) continue;

    const set = [mine, ...(theirValues as number[])];
    const best = attribute.better === "higher" ? Math.max(...set) : Math.min(...set);
    const worst = attribute.better === "higher" ? Math.min(...set) : Math.max(...set);
    if (mine === best && set.filter((v) => v === best).length === 1) {
      notes.push({ tone: "pro", text: `Best-in-set ${attribute.label.toLowerCase()}: ${attribute.value}` });
    }
    if (mine === worst && set.filter((v) => v === worst).length === 1) {
      notes.push({ tone: "con", text: `Weakest ${attribute.label.toLowerCase()} here: ${attribute.value}` });
    }
  }

  return notes;
}

/**
 * Per-pick advantages and trade-offs sitting under the comparison table.
 */
export function ComparisonNotes({ products }: { products: Product[] }) {
  if (products.length === 0) return null;

  return (
    <ul
      className="grid gap-3 sm:grid-cols-2 lg:[grid-template-columns:var(--notes-columns)]"
      style={
        {
          "--notes-columns": `repeat(${Math.min(products.length, 4)}, minmax(0, 1fr))`,
        } as CSSProperties
      }
    >
      {products.map((product) => {
        const others = products.filter((other) => other.id !== product.id);
        const notes = notesForProduct(product, others);
        const pros = notes.filter((note) => note.tone === "pro");
        const cons = notes.filter((note) => note.tone === "con");

        return (
          <li
            key={product.id}
            className="space-y-3 rounded-xl border border-border bg-card p-4"
          >
            <div>
              <p className="text-sm font-semibold leading-snug tracking-tight text-foreground">
                {product.name}
              </p>
              <p className="text-[13px] text-muted-foreground">{product.brand}</p>
            </div>

            {pros.length > 0 ? (
              <div>
                <p className="text-[13px] font-medium text-foreground">Strengths</p>
                <ul className="mt-1.5 space-y-1.5">
                  {pros.map((note) => (
                    <li key={note.text} className="flex items-start gap-2 text-[13px] leading-relaxed">
                      <Check
                        className="mt-0.5 size-3.5 shrink-0 text-[#346538]"
                        aria-hidden="true"
                      />
                      <span className="text-foreground/90">{note.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {cons.length > 0 ? (
              <div>
                <p className="text-[13px] font-medium text-foreground">Trade-offs</p>
                <ul className="mt-1.5 space-y-1.5">
                  {cons.map((note) => (
                    <li key={note.text} className="flex items-start gap-2 text-[13px] leading-relaxed">
                      <CircleAlert
                        className="mt-0.5 size-3.5 shrink-0 text-[#9F2F2D]"
                        aria-hidden="true"
                      />
                      <span className="text-foreground/90">{note.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {pros.length === 0 && cons.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Balanced against the other picks — no standout either way from
                the recorded attributes.
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
