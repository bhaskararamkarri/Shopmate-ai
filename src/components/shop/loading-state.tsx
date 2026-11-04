import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton loading states shaped to their destination layout:
 * - "chat-bubble" mimics an assistant reply while the mock reply waits.
 * - "product-grid" mimics a four-up product rail.
 */
export function LoadingState({
  variant = "chat-bubble",
  className,
}: {
  variant?: "chat-bubble" | "product-grid";
  className?: string;
}) {
  if (variant === "product-grid") {
    return (
      <ul
        aria-label="Loading products"
        className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}
      >
        {[0, 1, 2, 3].map((index) => (
          <li key={index}>
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <Skeleton className="aspect-4/3 w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4 rounded-md" />
              <Skeleton className="h-4 w-1/2 rounded-md" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={cn("flex gap-3", className)} aria-label="Assistant reply loading">
      <Skeleton className="size-7 shrink-0 rounded-lg" />
      <div className="max-w-[85%] space-y-2.5 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-1.5 py-1" aria-hidden="true">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="motion-safe:animate-pulse size-1.5 rounded-full bg-foreground/30"
              style={{ animationDelay: `${dot * 160}ms` }}
            />
          ))}
        </div>
        <Skeleton className="h-3.5 w-56 rounded-md" />
        <Skeleton className="h-3.5 w-44 rounded-md" />
      </div>
    </div>
  );
}
