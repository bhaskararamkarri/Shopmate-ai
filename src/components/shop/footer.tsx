import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ShopMateLogo } from "@/components/brand/logo";

/** Release year stamped into the footer. */
const COPYRIGHT_YEAR = 2026;

const EXPLORE_LINKS = [
  { href: "/", label: "Discovery Catalog" },
  { href: "/chat", label: "AI Shopping Workspace" },
  { href: "/compare", label: "Product Comparison Matrix" },
  { href: "/cart", label: "Shopping Cart & Checkout" },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto w-full max-w-[1320px] px-4 py-12 md:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_0.8fr_0.9fr]">
          <div className="space-y-3.5">
            <Link
              href="/"
              className="inline-block text-foreground transition-opacity hover:opacity-90"
              aria-label="ShopMate AI Home"
            >
              <ShopMateLogo
                variant="horizontal"
                size="md"
                className="h-9 w-auto text-foreground"
              />
            </Link>
            <p className="max-w-sm text-sm font-semibold tracking-tight text-foreground">
              Shop smarter. Choose with confidence.
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              An AI shopping decision engine built for transparent product research.
              Ask in plain language, compare documented trade-offs side by side,
              and verify checkout totals cleanly.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-[#047857]">
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
              <span>Channel3 Live Catalog + Demo Records · PayPal Sandbox</span>
            </div>
          </div>

          <nav aria-label="Explore" className="space-y-3.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Navigation
            </h2>
            <ul className="space-y-2.5">
              {EXPLORE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-3.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              System Architecture
            </h2>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>Next.js App Router &amp; Tailwind CSS v4</li>
              <li>Channel3 Catalog Integration + Demo Fallback</li>
              <li>Vercel AI SDK Tool-Calling Decision Engine</li>
              <li>Currency-Safe Specification Comparison Matrix</li>
              <li>Server-Verified PayPal Sandbox Capture</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {COPYRIGHT_YEAR} ShopMate AI. All rights reserved.</p>
          <p>
            Cart totals are recalculated server-side. Zero fabricated prices, stock
            counts, or ratings.
          </p>
        </div>
      </div>
    </footer>
  );
}
