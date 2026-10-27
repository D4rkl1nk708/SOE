import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";

export interface ShellMetric {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  color?: string;
}

export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  metrics,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  metrics?: ShellMetric[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full space-y-4 pb-10", className)}>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
      />
      {metrics && metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map((metric) => (
            <StatCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              sub={metric.sub}
              icon={metric.icon}
              color={metric.color}
            />
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
