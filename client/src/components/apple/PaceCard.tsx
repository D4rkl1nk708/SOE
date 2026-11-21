import { Gauge, Timer } from "lucide-react";
import { Card, MetricRow, SectionLabel } from "@/components/apple";
import { cn } from "@/lib/utils";
import type { PaceSummary } from "@shared/examPace";

function formatSeconds(seconds: number): string {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return rest === 0 ? `${minutes} min` : `${minutes}min ${rest}s`;
}

export interface PaceCardProps {
  summary: PaceSummary | null | undefined;
  /** Relatório de simulado: inclui a frase de conclusão e os brancos. */
  showConclusion?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Bloco "Ritmo" (v6.9.7, item 4).
 *
 * Só mostra mediana/média/distribuição quando existe tempo por questão. Prova
 * antiga (sem `answerTimings`) recebe a explicação, não um gráfico inventado.
 */
export function PaceCard({
  summary,
  showConclusion = true,
  compact = false,
  className,
}: PaceCardProps) {
  if (!summary || summary.answered === 0) {
    return (
      <Card className={cn("p-4", className)}>
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-secondary text-muted-foreground">
            <Timer size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground">Ritmo</p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              {summary?.conclusion ||
                "Este simulado não guardou tempo por questão — rode um novo para medir ritmo."}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const maxCount = Math.max(...summary.histogram.map((item) => item.count), 1);

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>Ritmo</SectionLabel>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            Alvo {formatSeconds(summary.paceSeconds)} por questão
          </p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-secondary text-muted-foreground">
          <Gauge size={16} />
        </span>
      </div>

      <div className="mt-2">
        <MetricRow
          label="Mediana"
          value={formatSeconds(summary.medianSeconds)}
        />
        <MetricRow
          label="Média"
          value={formatSeconds(summary.averageSeconds)}
        />
        <MetricRow
          label="Acima do alvo"
          value={`${summary.aboveTargetCount} (${summary.pctAboveTarget}%)`}
        />
        {summary.blank > 0 && (
          <MetricRow
            label="Em branco"
            value={`${summary.blank} de ${summary.totalQuestions}`}
          />
        )}
        <MetricRow
          label="Tempo além do alvo"
          value={formatSeconds(summary.secondsOverTarget)}
        />
      </div>

      {!compact && (
        <div className="mt-3">
          <SectionLabel>Tempo por questão</SectionLabel>
          <div className="mt-2 flex items-end gap-1.5">
            {summary.histogram.map((bucket) => (
              <div
                key={bucket.label}
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
              >
                <div className="flex h-16 w-full items-end">
                  <div
                    className="w-full rounded-t-[3px]"
                    style={{
                      height: `${Math.max(
                        bucket.count === 0 ? 0 : 8,
                        (bucket.count / maxCount) * 100,
                      )}%`,
                      background:
                        bucket.from >= summary.paceSeconds
                          ? "color-mix(in srgb, var(--accent-amber) 70%, transparent)"
                          : "color-mix(in srgb, var(--primary) 55%, transparent)",
                    }}
                    title={`${bucket.count} questão(ões) em ${bucket.label}`}
                  />
                </div>
                <span className="apple-num text-[9.5px] text-muted-foreground">
                  {bucket.count}
                </span>
                <span className="truncate text-[9px] text-muted-foreground/80">
                  {bucket.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.questionsLostToLateness > 0 && (
        <div className="mt-3 rounded-[10px] border border-border bg-secondary/40 px-3 py-2">
          <p className="text-[12px] leading-5 text-foreground/90">
            No ritmo alvo você não perderia{" "}
            <b className="apple-num">{summary.questionsLostToLateness}</b>{" "}
            questão{summary.questionsLostToLateness === 1 ? "" : "ões"} de{" "}
            {summary.totalQuestions} — o atraso consumiu esse tempo.
          </p>
        </div>
      )}

      {showConclusion && summary.conclusion && (
        <p className="mt-3 text-[12px] leading-5 text-foreground/90">
          {summary.conclusion}
        </p>
      )}
    </Card>
  );
}
