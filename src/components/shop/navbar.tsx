"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { useShop } from "@/lib/store";
import { ShopMateLogo } from "@/components/brand/logo";

const DESKTOP_LINKS = [
  { href: "/", label: "Discovery" },
  { href: "/chat", label: "AI Workspace" },
  { href: "/compare", label: "Product Matrix" },
] as const;

const QUICK_SEARCH_PRESETS = [
  "Noise-cancelling headphones under $300",
  "Compact mechanical keyboard & desk setup",
  "Health tracking smartwatch vs ring",
] as const;

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { cartCount, compareIds, activeReceipt, clearActiveReceipt } = useShop();

  const [quickQuery, setQuickQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const quickSearchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const isMobileConfirmation = pathname === "/cart" && activeReceipt !== null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (window.innerWidth >= 768 && quickSearchRef.current) {
          quickSearchRef.current.focus();
        } else {
          setMobileSearchOpen(true);
        }
      } else if (event.key === "Escape") {
        setMobileSearchOpen(false);
        setNotificationsOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (mobileSearchOpen) {
      mobileSearchRef.current?.focus();
    }
  }, [mobileSearchOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [notificationsOpen]);

  function submitQuickSearch(rawQuery: string) {
    const trimmed = rawQuery.trim();
    if (!trimmed) return;
    setQuickQuery("");
    setMobileSearchOpen(false);
    router.push(`/chat?q=${encodeURIComponent(trimmed)}`);
  }

  const hasActivity = cartCount > 0 || compareIds.length > 0 || activeReceipt !== null;

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border-subtle/80 bg-surface-card/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(23,23,33,0.04)] pt-safe">
        {/* Desktop Top Navigation Bar (Stitch 06–12) */}
        <div className="mx-auto hidden h-16 max-w-[1440px] items-center justify-between gap-4 px-6 lg:flex lg:px-8">
          {/* Left: Brand Lockup + SANDBOX MODE pill */}
          <div className="flex shrink-0 items-center gap-4">
            <Link
              href="/"
              className="group flex items-center gap-2 rounded-lg text-on-surface transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
              aria-label="ShopMate AI Home"
            >
              <ShopMateLogo variant="icon" size="sm" className="h-8 w-8" />
              <div className="flex items-baseline gap-1">
                <span className="font-heading text-[18px] font-semibold tracking-[-0.015em] text-on-surface">
                  ShopMate
                </span>
                <span className="font-heading text-[11px] font-bold uppercase tracking-wide text-primary">
                  AI
                </span>
              </div>
            </Link>

            <div className="hidden items-center rounded-full border border-tertiary-fixed-dim/40 bg-tertiary-fixed px-2.5 py-0.5 text-on-tertiary-fixed xl:inline-flex">
              <span
                className="mr-1.5 h-1.5 w-1.5 rounded-full bg-tertiary animate-pulse"
                aria-hidden="true"
              />
              <span className="font-heading text-[11px] font-semibold uppercase tracking-wider">
                SANDBOX MODE
              </span>
            </div>
          </div>

          {/* Center: Omni Quick Search (⌘K) */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitQuickSearch(quickQuery);
            }}
            className="relative flex-1 max-w-md"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted"
            >
              search
            </span>
            <label htmlFor="navbar-quick-search" className="sr-only">
              Quick search in AI Workspace
            </label>
            <input
              id="navbar-quick-search"
              ref={quickSearchRef}
              type="search"
              value={quickQuery}
              onChange={(event) => setQuickQuery(event.target.value)}
              placeholder="Search catalog, models, or prompt AI..."
              className="h-9 w-full rounded-lg bg-surface-container-low pl-9 pr-12 text-[13px] text-on-surface placeholder:text-text-muted transition-all focus:bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary-container"
            />
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded bg-surface-card px-1.5 py-0.5 font-mono text-[11px] leading-none text-text-muted shadow-2xs sm:inline-flex"
            >
              ⌘K
            </kbd>
          </form>

          {/* Right: Main Nav Links + Utility Controls */}
          <div className="flex items-center gap-2">
            <nav aria-label="Main" className="flex items-center gap-1">
              {DESKTOP_LINKS.map((link) => {
                const active = isLinkActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[14px] whitespace-nowrap transition-colors",
                      active
                        ? "bg-primary-fixed/60 font-semibold text-primary"
                        : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
                    )}
                  >
                    <span>{link.label}</span>
                    {link.href === "/compare" && compareIds.length > 0 ? (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary-fixed px-1.5 font-mono text-[11px] font-semibold leading-none tabular-nums text-on-primary-fixed">
                        {compareIds.length}
                      </span>
                    ) : null}
                  </Link>
                );
              })}

              <Link
                href="/cart"
                aria-current={isLinkActive(pathname, "/cart") ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[14px] whitespace-nowrap transition-colors",
                  isLinkActive(pathname, "/cart")
                    ? "bg-primary-fixed/60 font-semibold text-primary"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
                )}
              >
                <span>Cart</span>
                {cartCount > 0 ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary-container px-1.5 font-mono text-[11px] font-semibold leading-none tabular-nums text-on-primary">
                    {cartCount}
                  </span>
                ) : null}
              </Link>
            </nav>

            <div className="relative ml-1 flex items-center gap-2" ref={notificationsRef}>
              <button
                type="button"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                  notifications
                </span>
                {hasActivity ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-surface-card"
                  />
                ) : null}
              </button>

              <Link
                href="/cart"
                aria-label="Session Account & Cart"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary shadow-2xs transition-opacity hover:opacity-90"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  person
                </span>
              </Link>

              {notificationsOpen ? (
                <div
                  role="region"
                  aria-label="Session updates"
                  className="stitch-tier-2 absolute right-0 top-12 z-50 w-72 rounded-2xl border border-border-strong bg-surface-card p-3.5 text-left"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-heading text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Workspace Activity
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      className="text-xs text-primary hover:underline"
                    >
                      Close
                    </button>
                  </div>
                  <ul className="space-y-2 text-xs text-on-surface-variant">
                    <li className="rounded-xl bg-surface-container-low px-3 py-2">
                      <span className="font-semibold text-on-surface">
                        Comparison Matrix:
                      </span>{" "}
                      {compareIds.length}/4 items selected
                    </li>
                    <li className="rounded-xl bg-surface-container-low px-3 py-2">
                      <span className="font-semibold text-on-surface">
                        Sandbox Cart:
                      </span>{" "}
                      {cartCount} {cartCount === 1 ? "item" : "items"} staged
                    </li>
                    {activeReceipt ? (
                      <li className="rounded-xl bg-secondary-container/40 px-3 py-2 text-on-secondary-fixed">
                        <span className="font-semibold">Confirmed Order:</span>{" "}
                        {activeReceipt.orderId}
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Mobile Compact Glass Header (< lg, Stitch 01–04 & Screen 05 Confirmation Variant) */}
        <div className="flex h-16 items-center justify-between gap-2 px-4 lg:hidden">
          {isMobileConfirmation ? (
            <>
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Back from checkout confirmation"
                  onClick={() => clearActiveReceipt()}
                  className="-ml-2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-on-surface transition-colors hover:text-primary"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                    arrow_back_ios_new
                  </span>
                </button>
                <ShopMateLogo variant="icon" size="sm" className="h-7 w-7" />
                <span className="ml-1 truncate font-heading text-[18px] font-semibold tracking-tight text-on-surface">
                  Checkout Flow
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-full bg-tertiary-fixed px-2 py-0.5 font-heading text-[11px] font-semibold uppercase tracking-wide text-on-tertiary-fixed">
                  Sandbox
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary shadow-2xs">
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                    person
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <Link
                href="/"
                aria-label="ShopMate AI Home"
                className="flex min-w-0 items-center gap-2 text-on-surface"
              >
                <ShopMateLogo variant="icon" size="sm" className="h-7 w-7" />
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-heading text-[17px] font-semibold tracking-tight text-on-surface">
                    ShopMate AI
                  </span>
                  <span className="rounded-full bg-surface-container px-1.5 py-0.5 font-mono text-[11px] font-medium text-text-muted">
                    v2.0
                  </span>
                </div>
              </Link>

              <div className="flex shrink-0 items-center gap-1">
                <span className="rounded-full bg-tertiary-fixed px-2 py-0.5 font-heading text-[11px] font-semibold uppercase tracking-wide text-on-tertiary-fixed">
                  Sandbox
                </span>
                <button
                  type="button"
                  aria-label="Open quick search"
                  aria-expanded={mobileSearchOpen}
                  aria-controls="shopmate-mobile-search-sheet"
                  onClick={() => setMobileSearchOpen(true)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:text-on-surface"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                    search
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Mobile notifications"
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                  className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:text-on-surface"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                    notifications
                  </span>
                  {hasActivity ? (
                    <span
                      aria-hidden="true"
                      className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-primary"
                    />
                  ) : null}
                </button>
                <Link
                  href="/cart"
                  aria-label="Open Cart"
                  className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary shadow-2xs"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                    person
                  </span>
                </Link>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Accessible Mobile Quick Search Drawer Modal */}
      {mobileSearchOpen ? (
        <div
          id="shopmate-mobile-search-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Quick AI Search"
          className="fixed inset-0 z-[60] flex items-start justify-center bg-brand-deep-indigo/40 p-4 pt-20 backdrop-blur-xs"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setMobileSearchOpen(false);
            }
          }}
        >
          <div className="stitch-tier-3 w-full max-w-md rounded-3xl border border-border-strong bg-surface-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-fixed text-primary">
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                    auto_awesome
                  </span>
                </span>
                <span className="font-heading text-sm font-semibold text-on-surface">
                  Ask ShopMate AI
                </span>
              </div>
              <button
                type="button"
                aria-label="Close quick search"
                onClick={() => setMobileSearchOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-container hover:text-on-surface"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  close
                </span>
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitQuickSearch(quickQuery);
              }}
              className="space-y-3"
            >
              <label htmlFor="mobile-quick-search" className="sr-only">
                Ask ShopMate AI
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-border-strong bg-surface-container-low px-3 py-2 focus-within:border-primary focus-within:bg-surface-card">
                <input
                  id="mobile-quick-search"
                  ref={mobileSearchRef}
                  type="search"
                  value={quickQuery}
                  onChange={(event) => setQuickQuery(event.target.value)}
                  placeholder="Describe what you're looking for..."
                  className="w-full bg-transparent text-sm text-on-surface placeholder:text-text-muted focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Submit quick search"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary transition-colors hover:bg-primary-container"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                    arrow_forward
                  </span>
                </button>
              </div>
            </form>

            <div className="mt-3 space-y-1.5">
              <p className="font-heading text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Quick Prompts
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SEARCH_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => submitQuickSearch(preset)}
                    className="rounded-full bg-surface-container-low px-3 py-1.5 text-left text-xs font-medium text-on-surface-variant transition-colors hover:bg-primary-fixed hover:text-primary"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
