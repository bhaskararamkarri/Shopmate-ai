"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, Search, Sparkles, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useShop } from "@/lib/store";
import { ShopMateLogo } from "@/components/brand/logo";

const NAV_LINKS = [
  { href: "/", label: "Discovery" },
  { href: "/chat", label: "AI Workspace" },
  { href: "/compare", label: "Product Matrix" },
] as const;

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const linkClasses =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors whitespace-nowrap";
const linkIdleClasses =
  "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground";
const linkActiveClasses =
  "bg-secondary font-medium text-primary border border-primary/15";

function CompareCountPill() {
  const { compareIds } = useShop();
  if (compareIds.length === 0) return null;
  return (
    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 font-mono text-[11px] font-semibold leading-none tabular-nums text-accent-foreground">
      {compareIds.length}
    </span>
  );
}

function CartLink({ onNavigate }: { onNavigate?: () => void }) {
  const { cartCount } = useShop();
  const pathname = usePathname();
  const active = isLinkActive(pathname, "/cart");

  return (
    <Link
      href="/cart"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(linkClasses, active ? linkActiveClasses : linkIdleClasses)}
    >
      Cart
      {cartCount > 0 ? (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 font-mono text-[11px] font-semibold leading-none tabular-nums text-primary-foreground">
          {cartCount}
        </span>
      ) : null}
    </Link>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const quickSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        quickSearchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function submitQuickSearch() {
    const trimmed = quickQuery.trim();
    if (!trimmed) return;
    setQuickQuery("");
    setMobileOpen(false);
    router.push(`/chat?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(23,23,33,0.03)]">
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
        {/* Brand Lockup */}
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg text-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="ShopMate AI Home"
          >
            <ShopMateLogo
              variant="horizontal"
              size="md"
              className="h-9 w-auto text-foreground"
            />
          </Link>

          <span className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-[#9A5B00]">
            <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            SANDBOX MODE
          </span>
        </div>

        {/* Desktop Navigation */}
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = isLinkActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  linkClasses,
                  active ? linkActiveClasses : linkIdleClasses,
                )}
              >
                <span>{link.label}</span>
                {link.href === "/compare" ? <CompareCountPill /> : null}
              </Link>
            );
          })}
          <CartLink />
        </nav>

        {/* Quick AI Search + Studio CTA */}
        <div className="flex items-center gap-2.5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitQuickSearch();
            }}
            className="relative hidden lg:block"
          >
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <label htmlFor="navbar-quick-search" className="sr-only">
              Quick search in AI Workspace
            </label>
            <input
              id="navbar-quick-search"
              ref={quickSearchRef}
              type="search"
              value={quickQuery}
              onChange={(event) => setQuickQuery(event.target.value)}
              placeholder="Ask AI or search…"
              className="h-9 w-48 rounded-lg border border-border bg-muted/60 pl-8 pr-11 text-xs text-foreground placeholder:text-muted-foreground transition-all outline-none focus:w-64 focus:border-primary focus:bg-card focus:ring-2 focus:ring-ring/15"
            />
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-card px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground"
            >
              ⌘K
            </kbd>
          </form>

          <Button
            asChild
            size="sm"
            className="hidden sm:inline-flex gap-1.5 shadow-xs"
          >
            <Link href="/chat">
              <Sparkles className="size-3.5" aria-hidden="true" />
              <span>AI Studio</span>
            </Link>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="md:hidden"
            aria-expanded={mobileOpen}
            aria-controls="shopmate-mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? (
              <X aria-hidden="true" />
            ) : (
              <Menu aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <div
          id="shopmate-mobile-nav"
          className="animate-in fade-in slide-in-from-top-2 border-t border-border bg-card duration-200 md:hidden"
        >
          <nav
            aria-label="Mobile"
            className="mx-auto flex w-full max-w-[1320px] flex-col gap-1 px-4 py-3"
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitQuickSearch();
              }}
              className="relative mb-2"
            >
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <label htmlFor="mobile-quick-search" className="sr-only">
                Ask ShopMate AI
              </label>
              <input
                id="mobile-quick-search"
                type="search"
                value={quickQuery}
                onChange={(event) => setQuickQuery(event.target.value)}
                placeholder="Describe what you're looking for…"
                className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/15"
              />
            </form>

            {NAV_LINKS.map((link) => {
              const active = isLinkActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-10 items-center justify-between rounded-lg px-3 text-[15px] transition-colors",
                    active ? linkActiveClasses : linkIdleClasses,
                  )}
                >
                  <span>{link.label}</span>
                  {link.href === "/compare" ? <CompareCountPill /> : null}
                </Link>
              );
            })}
            <CartLink onNavigate={() => setMobileOpen(false)} />
            <Button asChild size="default" className="mt-2 h-10 w-full">
              <Link href="/chat" onClick={() => setMobileOpen(false)}>
                <Sparkles className="size-4" aria-hidden="true" />
                Launch AI Studio
              </Link>
            </Button>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
