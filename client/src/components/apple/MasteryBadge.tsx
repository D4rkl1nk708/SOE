import { cn } from "@/lib/utils";
import type { MasteryLevel } from "@shared/mastery";
import { MASTERY_LEVEL_LABELS } from "@shared/mastery";

const TONES: Record<MasteryLevel, string> = {
  0: "var(--muted-foreground)",
  1: "var(--accent-blue)",
  2: "var(--accent-amber)",
  3: "var(--accent-amber)",
  4: "var(--accent-green)",
};

/**
 * Selo de domínio (v6.9.11, C5/4.1): 0–4 com o porquê no tooltip.
 * Nunca promete "dominado" sem recuperações espaçadas + questão nova.
 */
export function MasteryBadge({
  level,
  reason,
  className,
  showLabel = true,
}: {
  level?: MasteryLevel | number | null;
  reason?: string;
  className?: string;
  showLabel?: boolean;
}) {
  const value = Math.max(
    0,
    Math.min(4, Math.round(Number(level) || 0)),
  ) as MasteryLevel;
  const tone = TONES[value];
  const tooltip =
    reason ||
    `${MASTERY_LEVEL_LABELS[value]} — selo por recuperações espaçadas`;
  return (
    <span
      title={tooltip}
      aria-label={`Domínio nível ${value} de 4: ${tooltip}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider",
        className,
      )}
      style={{
        color: tone,
        borderColor: `color-mix(in srgb, ${tone} 35%, transparent)`,
        background: `color-mix(in srgb, ${tone} 10%, transparent)`,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: tone }}
      />
      {showLabel ? MASTERY_LEVEL_LABELS[value] : `N${value}`}
    </span>
  );
}
