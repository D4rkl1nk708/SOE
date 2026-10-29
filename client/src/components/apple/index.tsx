import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

/**
 * Primitivas do layout focado (Fase 0 do plano dos prints).
 *
 * São apenas apresentação: nenhuma regra de negócio vive aqui. O layout
 * clássico não usa estes componentes, então nada muda para quem escolhe
 * "Clássico · completo" nas configurações.
 */

export function PageTitle({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="apple-title text-foreground">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground first-letter:uppercase">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 md:shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}

export function SectionLabel({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="apple-label">{children}</span>
      {action}
    </div>
  );
}

export function Card({
  children,
  className,
  style,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={cn("apple-card", className)} style={style}>
      {children}
    </Tag>
  );
}

export function GroupedList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("apple-list", className)}>{children}</div>;
}

export function ListRow({
  icon: Icon,
  title,
  subtitle,
  meta,
  right,
  href,
  onClick,
  chevron = true,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  meta?: string;
  right?: ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {Icon && (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-secondary text-muted-foreground">
          <Icon size={15} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-5 text-foreground">
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[11.5px] leading-4 text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      {meta && (
        <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
          {meta}
        </span>
      )}
      {right}
      {chevron && (
        <ChevronRight size={15} className="shrink-0 text-muted-foreground/60" />
      )}
    </>
  );

  const shared =
    "apple-row flex w-full items-center gap-3 px-4 py-3 text-left transition-colors";
  if (href) {
    return (
      <Link
        href={href}
        className={cn(shared, "hover:bg-secondary/40", className)}
      >
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(shared, "hover:bg-secondary/40", className)}
    >
      {body}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[10px] border border-border bg-secondary/70 p-0.5",
        className,
      )}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatTile({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("apple-tile px-3 py-2.5", className)}>
      <p className="text-[10.5px] font-medium text-muted-foreground">{label}</p>
      <p className="apple-num mt-1 text-[17px] font-semibold leading-6 text-foreground">
        {value}
      </p>
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "var(--primary)",
  className,
}: {
  value: number;
  tone?: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-secondary",
        className,
      )}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: tone }}
      />
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warn";
  className?: string;
}) {
  const tones = {
    neutral: "border-border bg-secondary/60 text-muted-foreground",
    primary: "border-primary/25 bg-primary/10 text-primary",
    success:
      "border-[color-mix(in_srgb,var(--accent-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent-green)_12%,transparent)] text-[var(--accent-green)]",
    warn: "border-[color-mix(in_srgb,var(--accent-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent-amber)_12%,transparent)] text-[var(--accent-amber)]",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[7px] border px-2 py-[3px] text-[10.5px] font-medium leading-4",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-[12px] leading-5 text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function MetricRow({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between py-2", className)}>
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span className="apple-num text-[12.5px] font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}
