import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = "var(--primary)",
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn("soe-card p-4 md:p-5 flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2">
        {Icon && (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary/60"
            style={{ color }}
          >
            <Icon size={13} />
          </span>
        )}
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="space-y-0.5">
        <p className="text-[22px] font-semibold tabular-nums leading-none text-foreground">
          {value}
        </p>
        {sub && (
          <p className="text-[10px] font-medium text-muted-foreground/80">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}
