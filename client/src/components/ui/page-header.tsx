import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/70">
            {eyebrow}
          </p>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-xs text-muted-foreground md:text-sm">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
