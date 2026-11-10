import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/", label: "Discovery" },
  { href: "/chat", label: "AI Workspace" },
  { href: "/compare", label: "Product Matrix" },
  { href: "/cart", label: "Cart & Checkout" },
] as const;

export function Footer() {
  return (
    <footer className="hidden w-full border-t border-border-subtle bg-surface-card lg:block">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-6 px-8 py-5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full bg-secondary animate-pulse"
              aria-hidden="true"
            />
            <span className="font-heading text-xs font-medium text-on-surface-variant">
              Catalog Engine: Ready (Channel3 + Demo)
            </span>
          </div>
          <span className="text-outline-variant" aria-hidden="true">
            •
          </span>
          <div className="flex items-center gap-1.5 text-[13px] text-text-muted">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[16px] text-secondary"
            >
              verified_user
            </span>
            <span>Server-Verified PayPal Sandbox</span>
          </div>
        </div>

        <nav aria-label="Explore" className="flex items-center gap-6 text-[13px] text-text-muted">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
