import Link from "next/link";
import { ShoppingBag } from "lucide-react";

/** Release year stamped into the footer. */
const COPYRIGHT_YEAR = 2026;

const EXPLORE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/chat", label: "AI Shopping chat" },
  { href: "/compare", label: "Product comparison" },
  { href: "/cart", label: "Shopping cart" },
] as const;

export function Footer() {

  return (
    <footer className="bg-secondary/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <ShoppingBag className="size-4" aria-hidden="true" />
              </span>
              <span className="text-base font-semibold tracking-tight text-foreground">
                ShopMate AI
              </span>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              An AI shopping agent for considered purchases — ask in plain
              language, compare the trade-offs side by side, and build a cart
              you actually want.
            </p>
            <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              Product search runs on the live Channel3 catalog, with demo data
              clearly labeled wherever it is used. The AI chat model and PayPal
              checkout arrive in later phases.
            </p>
          </div>

          <nav aria-label="Explore" className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Explore</h2>
            <ul className="space-y-2">
              {EXPLORE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">The stack</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Next.js App Router</li>
              <li>Tailwind CSS v4 + shadcn/ui</li>
              <li>lucide icons</li>
              <li>PayPal-ready checkout (planned)</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 text-[13px] text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
          <p>© {COPYRIGHT_YEAR} ShopMate AI. Catalog by Channel3 · demo picks labeled.</p>
          <p>Cart totals shown here are estimates; payment totals are validated server-side.</p>
        </div>
      </div>
    </footer>
  );
}
