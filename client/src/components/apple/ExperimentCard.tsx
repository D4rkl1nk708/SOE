import { FlaskConical } from "lucide-react";
import { Card, SectionLabel } from "@/components/apple";
import { cn } from "@/lib/utils";
import type { ExperimentSummary } from "@shared/experiment";

/**
 * Card do A/B interno (v6.9.15, item B).
 *
 * Não existe estudo de gabarito em bloco × imediato em concurso público
 * brasileiro, então o app mede a própria política. O card mostra o nome do
 * experimento, o n de cada variante e o acerto em questão nova (retenção 7+
 * dias). Com amostra pequena ele NÃO escolhe vencedor: diz o n que falta.
 */
export function ExperimentCard({
  summary,
  className,
}: {
  summary: ExperimentSummary | null | undefined;
  className?: string;
}) {
  if (!summary) return null;
  const insufficient = summary.insufficient === true;

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>Experimento interno</SectionLabel>
          <p className="mt-1 text-[13px] font-medium text-foreground">
            {summary.name || "Gabarito em bloco × imediato"}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground">
            A variante decide só o padrão; quando você troca, a troca é
            registrada como override. Retenção = acerto em questão nova{" "}
            {summary.retentionDays || 7}+ dias depois.
          </p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-secondary text-muted-foreground">
          <FlaskConical size={16} />
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(summary.variants || []).map((variant) => (
          <div
            key={variant.variant}
            data-testid={`experiment-variant-${variant.variant}`}
            className="rounded-[10px] border border-border bg-secondary/20 px-3 py-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {variant.label}
              </span>
              <span className="apple-num text-[11px] text-muted-foreground">
                n={variant.n}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-foreground">
              <strong>{variant.accuracy}%</strong> no bloco
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              {variant.retentionN > 0
                ? `${variant.retentionAccuracy}% em questão nova (n=${variant.retentionN})`
                : "sem questão nova após 7 dias ainda"}
            </p>
            {variant.overrides > 0 && (
              <p className="mt-0.5 text-[10.5px] text-muted-foreground/80">
                {variant.overrides} troca{variant.overrides === 1 ? "" : "s"} da
                política ({variant.overrideRate}%)
              </p>
            )}
          </div>
        ))}
      </div>

      <p
        className={cn(
          "mt-3 text-[11.5px] leading-4",
          insufficient
            ? "rounded-[8px] border border-[color-mix(in_srgb,var(--accent-amber)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent-amber)_10%,transparent)] px-2.5 py-2 text-foreground/90"
            : "text-muted-foreground",
        )}
      >
        {insufficient
          ? `amostra insuficiente (n=${summary.minN}) — o app não conclui nada antes de ${summary.minSample} tentativas em cada variante.`
          : summary.message}
      </p>
    </Card>
  );
}

export default ExperimentCard;
