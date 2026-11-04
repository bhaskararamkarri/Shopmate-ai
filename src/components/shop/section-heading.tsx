import { cn } from "cn";

export function SectionHeading({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2.5", className)}>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[30px]">
        {title}
      </h2>
      {description ? (
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}
