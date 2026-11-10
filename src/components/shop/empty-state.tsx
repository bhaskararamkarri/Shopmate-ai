import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

/** Composed empty state shared by the cart, comparison and chat pages. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "stitch-tier-1 flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-6 py-16 text-center",
        className,
      )}
    >
      <span className="grid size-14 place-items-center rounded-2xl border border-primary/15 bg-secondary text-primary">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {description ? (
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}
