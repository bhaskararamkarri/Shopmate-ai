"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "cn";

/**
 * Scroll-reveal wrapper used on the marketing sections of the homepage.
 *
 * Progressive enhancement by design:
 * - The hidden state is applied via the `data-reveal` attribute from JS only,
 *   so the server-rendered markup (and the no-JS experience) shows everything.
 * - The CSS lives in globals.css behind `prefers-reduced-motion: no-preference`,
 *   so reduced-motion users never see the transform or the fade.
 * - No React state is involved; the observer flips the attribute directly.
 */
export function Reveal({
  children,
  delay = 0,
  kind = "rise",
  className,
}: {
  children: ReactNode;
  /** Stagger delay in ms, applied to the reveal transition only. */
  delay?: number;
  /**
   * Motion manner: "rise" for text blocks (fade + translateY), "settle" for
   * pictures (fade + slight scale). Under reduced motion both degrade to a
   * plain opacity fade; without JS nothing is hidden.
   */
  kind?: "rise" | "settle";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (!("IntersectionObserver" in window)) {
      element.dataset.reveal = "visible";
      return;
    }

    element.dataset.reveal = "hidden";
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.reveal = "visible";
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal-kind={kind}
      className={cn(className)}
      style={delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
