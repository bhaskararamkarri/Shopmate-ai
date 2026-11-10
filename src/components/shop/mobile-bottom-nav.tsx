"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { useShop } from "@/lib/store";

function isTabActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { cartCount, compareIds, activeReceipt } = useShop();

  // Hide the persistent mobile tab bar on Screen 05 (Payment Result & Confirmation).
  if (pathname === "/cart" && activeReceipt !== null) {
    return null;
  }

  const tabs = [
    { href: "/", label: "Home", icon: "explore", count: 0, badgeTone: "neutral" as const },
    { href: "/chat", label: "AI Assistant", icon: "auto_awesome", count: 0, badgeTone: "neutral" as const },
    { href: "/compare", label: "Compare", icon: "view_column", count: compareIds.length, badgeTone: "neutral" as const },
    { href: "/cart", label: "Cart", icon: "shopping_bag", count: cartCount, badgeTone: "primary" as const },
  ] as const;

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle/80 bg-surface/90 backdrop-blur-xl pb-safe shadow-[0_-2px_12px_rgba(23,23,33,0.04)] lg:hidden"
    >
      <div className="flex h-16 items-center justify-around px-2">
        {tabs.map((tab) => {
          const active = isTabActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 transition-colors",
                active
                  ? "font-semibold text-primary"
                  : "text-text-muted hover:text-on-surface",
              )}
            >
              <div className="relative flex items-center justify-center">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[22px]"
                  style={
                    active
                      ? { fontVariationSettings: "'FILL' 1, 'wght' 500" }
                      : undefined
                  }
                >
                  {tab.icon}
                </span>
                {tab.count > 0 ? (
                  <span
                    className={cn(
                      "absolute -right-2.5 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-semibold leading-none tabular-nums",
                      tab.badgeTone === "primary"
                        ? "bg-primary text-on-primary"
                        : "bg-primary-fixed text-on-primary-fixed",
                    )}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </div>
              <span className="font-heading text-[11px] leading-[14px] tracking-tight">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
