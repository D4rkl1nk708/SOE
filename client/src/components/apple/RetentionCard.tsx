import { Activity, Gauge, Target } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, SectionLabel, StatTile } from "@/components/apple";

/**
 * Card "Retenção" (v6.9.11, C4 / seção 6 da pesquisa).
 *
 * Troca vaidade por resultado: acerto em questão nova a 7/25/50 dias, retenção
 * por hora estudada, cobertura ponderada × proficiência, Brier e nota esperada
 * com intervalo. Amostra pequena mostra "amostra insuficiente (n=X)".
 */
export function RetentionCard({ className }: { className?: string }) {
  const { data, isLoading } = trpc.study.retentionMetrics.useQuery();
  if (isLoading || !data) {
    return (
      <Card className={className}>
        <SectionLabel>Retenção</SectionLabel>
        <p className="mt-2 text-[12px] text-muted-foreground">Calculando…</p>
      </Card>
    );
  }

  const horizons = data.horizons;
  const expected = data.expectedScore;

  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>Retenção</SectionLabel>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            O que você mantém, não o que você estudou
          </p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-secondary text-muted-foreground">
          <Activity size={16} />
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {horizons.map((horizon) => (
          <StatTile
            key={horizon.days}
            label={
              horizon.available
                ? `${horizon.days} dias · n=${horizon.sample}`
                : `${horizon.days} dias`
            }
            value={horizon.available ? `${horizon.accuracy}%` : "—"}
          />
        ))}
      </div>

      <div className="mt-3 space-y-2 text-[12px] leading-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Questão nova</span>
          <span className="font-medium text-foreground">
            {data.fresh.label}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Retenção por hora</span>
          <span className="font-medium text-foreground">
            {data.perHour.label}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Target size={12} /> Cobertura × proficiência
          </span>
          <span className="font-medium text-foreground">
            {data.coverage.available
              ? `${data.coverage.combined}% (${Math.round(
                  data.coverage.weightedCoveragePct,
                )}% × ${data.coverage.proficiency}%)`
              : "sem edital mapeado"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Gauge size={12} /> Brier
          </span>
          <span className="font-medium text-foreground">
            {data.brier.available
              ? data.brier.score?.toFixed(3)
              : `amostra insuficiente (n=${data.brier.sample})`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
          <span className="text-muted-foreground">Nota esperada</span>
          <span className="font-semibold text-foreground">
            {expected.label}
          </span>
        </div>
      </div>
    </Card>
  );
}
