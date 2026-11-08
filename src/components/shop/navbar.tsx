"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useShop } from "@/lib/store";
import { ShopMateLogo } from "@/components/brand/logo";

const NAV_LINKS = [
  { href: "/", label: "Discover" },
  { href: "/chat", label: "AI Workspace" },
  { href: "/compare", label: "Compare" },
] as const;

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const linkClasses = "inline-flex h-9 items-center rounded-lg px-3 text-sm transition-colors";
const linkIdleClasses = "text-muted-foreground hover:bg-secondary/70 hover:text-foreground";
const linkActiveClasses = "bg-secondary font-medium text-foreground";

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
        <span className="ml-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[12px] font-semibold leading-none tabular-nums text-primary-foreground">
          {cartCount}
        </span>
      ) : null}
    </Link>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
        <Link
          href="/"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2 rounded-lg transition-opacity hover:opacity-95 focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="ShopMate AI Home"
        >
          <ShopMateLogo variant="horizontal" size="md" className="h-9 w-auto" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = isLinkActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(linkClasses, active ? linkActiveClasses : linkIdleClasses)}
              >
                {link.label}
              </Link>
            );
          })}
          <CartLink />
        </nav>

        <div className="flex items-center gap-2.5">
          <Button asChild size="sm" className="hidden md:inline-flex shadow-sm shadow-primary/20">
            <Link href="/chat">Open AI Workspace</Link>
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
            {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <div
          id="shopmate-mobile-nav"
          className="animate-in fade-in slide-in-from-top-2 border-t border-border bg-background duration-200 md:hidden"
        >
          <nav
            aria-label="Mobile"
            className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-3"
          >
            {NAV_LINKS.map((link) => {
              const active = isLinkActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-10 items-center rounded-lg px-3 text-[15px] transition-colors",
                    active ? linkActiveClasses : linkIdleClasses,
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            <CartLink onNavigate={() => setMobileOpen(false)} />
            <Button asChild size="default" className="mt-2 h-10 w-full shadow-sm shadow-primary/20">
              <Link href="/chat" onClick={() => setMobileOpen(false)}>
                Open AI Workspace
              </Link>
            </Button>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
