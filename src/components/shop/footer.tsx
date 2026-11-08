import Link from "next/link";
import { ShopMateLogo } from "@/components/brand/logo";

/** Release year stamped into the footer. */
const COPYRIGHT_YEAR = 2026;

const EXPLORE_LINKS = [
  { href: "/", label: "Discover" },
  { href: "/chat", label: "AI Shopping Workspace" },
  { href: "/compare", label: "Product Comparison" },
  { href: "/cart", label: "Shopping Cart & Checkout" },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_0.8fr_0.8fr]">
          <div className="space-y-3.5">
            <Link href="/" className="inline-block transition-opacity hover:opacity-95" aria-label="ShopMate AI Home">
              <ShopMateLogo variant="horizontal" size="md" className="h-9 w-auto" />
            </Link>
            <p className="max-w-sm text-sm font-medium text-foreground/90">
              Shop smarter. Choose with confidence.
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              An intelligent shopping decision engine for modern consumers. Ask in plain
              language, compare verified trade-offs side by side, and check out with complete confidence.
            </p>
            <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground/80">
              Product discovery is powered by the live Channel3 catalog integration alongside clearly labeled demo records. PayPal payments run in Sandbox mode with server-verified order capture.
            </p>
          </div>

          <nav aria-label="Explore" className="space-y-3.5">
            <h2 className="text-sm font-semibold text-foreground">Navigation</h2>
            <ul className="space-y-2.5">
              {EXPLORE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-3.5">
            <h2 className="text-sm font-semibold text-foreground">Core Architecture</h2>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>Next.js App Router (Turbopack)</li>
              <li>Tailwind CSS v4 &amp; shadcn/ui</li>
              <li>Channel3 Catalog Integration</li>
              <li>Vercel AI SDK Tool Calling</li>
              <li>Server-Verified PayPal Sandbox</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {COPYRIGHT_YEAR} ShopMate AI. All rights reserved.</p>
          <p>Cart totals are verified server-side. Zero fabricated specifications or prices.</p>
        </div>
      </div>
    </footer>
  );
}
