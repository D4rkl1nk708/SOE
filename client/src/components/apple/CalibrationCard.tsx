import { AlertTriangle, BarChart3, Dices, ShieldCheck } from "lucide-react";
import { Card, ProgressBar, SectionLabel, StatTile } from "@/components/apple";
import { cn } from "@/lib/utils";
import type { CalibrationSummary } from "@shared/calibration";

type Bucket = CalibrationSummary["buckets"][number];

const TONES: Record<string, string> = {
  certeza: "var(--accent-green)",
  duvida: "var(--accent-amber)",
  chute: "var(--accent-red)",
  nao_declarado: "var(--muted-foreground)",
};

export interface CalibrationCardProps {
  summary: CalibrationSummary | null | undefined;
  advice?: string[];
  byDiscipline?: Array<
    CalibrationSummary & { disciplineId: number; disciplineName?: string }
  >;
  /** Relatório de sessão: sem tiles grandes, sem recorte por disciplina. */
  compact?: boolean;
  className?: string;
  /** v6.9.11 (B4/4.7): previsão antes do bloco × resultado obtido. */
  predictions?: {
    available: boolean;
    sample: number;
    predictedAvg: number;
    actualAvg: number;
    gapPoints: number;
    message: string;
  };
  /** Curva de calibração por faixa de previsão. */
  predictionCurve?: Array<{
    from: number;
    to: number;
    sample: number;
    predicted: number;
    actual: number;
  }>;
  /** Brier dos blocos previstos (menor = melhor). */
  brier?: number | null;
}

/**
 * Card "Calibração" (v6.9.7, item 1).
 *
 * Quando mais de 80% das tentativas não têm confiança declarada (ou não há
 * nenhuma), mostra o convite curto em vez de um gráfico vazio — regra do item.
 */
export function CalibrationCard({
  summary,
  advice = [],
  byDiscipline = [],
  compact = false,
  className,
  predictions,
  predictionCurve = [],
  brier,
}: CalibrationCardProps) {
  const total = summary?.total ?? 0;
  const invite =
    !summary ||
    total === 0 ||
    !summary.calibrated ||
    (summary.undeclaredPct ?? 0) > 80;

  if (invite) {
    return (
      <Card className={cn("p-4", className)}>
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-secondary text-muted-foreground">
            <Dices size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground">
              Calibração
            </p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              Passe a marcar certeza/dúvida/chute no TEC para ver sua
              calibração.
            </p>
            {total > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                {total} tentativa{total === 1 ? "" : "s"} registrada
                {total === 1 ? "" : "s"} · {summary?.undeclaredPct ?? 0}% sem
                confiança declarada
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  const buckets: Bucket[] = summary.buckets.filter(
    (bucket) => bucket.total > 0,
  );
  const maiorTotal = Math.max(...buckets.map((bucket) => bucket.total), 1);

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>Calibração</SectionLabel>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            O que você declarou × o que acertou
          </p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-secondary text-muted-foreground">
          <BarChart3 size={16} />
        </span>
      </div>

      {!compact && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatTile
            label="Índice de confiança"
            value={`${summary.indiceConfianca}%`}
          />
          <StatTile label="Taxa de chute" value={`${summary.taxaChute}%`} />
          <StatTile label="Chutes acertados" value={summary.chutesAcertados} />
        </div>
      )}

      <div className="mt-3 space-y-2.5">
        {buckets.map((bucket) => (
          <div key={bucket.level}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-medium text-foreground">
                {bucket.label}
              </span>
              <span className="apple-num text-[11.5px] text-muted-foreground">
                {bucket.correct}/{bucket.total} · {bucket.accuracy}%
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ProgressBar
                  value={(bucket.total / maiorTotal) * 100}
                  tone={TONES[bucket.level]}
                />
              </div>
              <span className="apple-num w-9 shrink-0 text-right text-[11px] text-muted-foreground">
                {Math.round(
                  (bucket.total / Math.max(summary.answered, 1)) * 100,
                )}
                %
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* v6.9.11 (B4/4.7): previsto × obtido, erro em pontos e Brier. */}
      {predictions && (
        <div className="mt-3 rounded-[10px] border border-border bg-secondary/20 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Previsão × resultado
            </span>
            {predictions.available && (
              <span className="apple-num text-[11px] text-muted-foreground">
                Brier {typeof brier === "number" ? brier.toFixed(3) : "—"}
              </span>
            )}
          </div>
          {predictions.available ? (
            <>
              <p className="mt-1 text-[12px] text-foreground">
                Previu <strong>{predictions.predictedAvg}%</strong>, obteve{" "}
                <strong>{predictions.actualAvg}%</strong> ·{" "}
                <span
                  style={{
                    color:
                      Math.abs(predictions.gapPoints) < 5
                        ? "var(--accent-green)"
                        : "var(--accent-amber)",
                  }}
                >
                  {predictions.gapPoints > 0 ? "+" : ""}
                  {predictions.gapPoints} p.p.
                </span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {predictions.message}
              </p>
              {predictionCurve.length > 0 && (
                <div className="mt-2 space-y-1">
                  {predictionCurve.map((bucket) => (
                    <div
                      key={`${bucket.from}-${bucket.to}`}
                      className="flex items-center gap-2 text-[10.5px] text-muted-foreground"
                    >
                      <span className="w-16 shrink-0 tabular-nums">
                        {bucket.from}–{bucket.to}%
                      </span>
                      <span className="min-w-0 flex-1">
                        previsto {bucket.predicted}% · obtido {bucket.actual}%
                      </span>
                      <span className="shrink-0 tabular-nums">
                        n={bucket.sample}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {predictions.message} — faça uma previsão antes do bloco para ver
              a curva.
            </p>
          )}
        </div>
      )}

      {advice.length > 0 && (
        <div className="mt-3 rounded-[10px] border border-[color-mix(in_srgb,var(--accent-amber)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent-amber)_10%,transparent)] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={14}
              className="mt-0.5 shrink-0 text-[var(--accent-amber)]"
            />
            <div className="min-w-0 space-y-1">
              {advice.map((line) => (
                <p
                  key={line}
                  className="text-[12px] leading-5 text-foreground/90"
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {!compact && byDiscipline.length > 0 && (
        <div className="mt-4">
          <SectionLabel>Onde o chute pesa</SectionLabel>
          <div className="mt-2 space-y-2">
            {byDiscipline.map((row) => (
              <div key={row.disciplineId} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                  {row.disciplineName}
                </span>
                <span className="apple-num shrink-0 text-[11.5px] text-muted-foreground">
                  {row.chutesAcertados} chute
                  {row.chutesAcertados === 1 ? "" : "s"} certo
                  {row.chutesAcertados === 1 ? "" : "s"} · {row.overallAccuracy}
                  %
                </span>
                {row.chutesAcertados === 0 && (
                  <ShieldCheck
                    size={13}
                    className="shrink-0 text-[var(--accent-green)]"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {compact && (
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          {summary.answered} resposta{summary.answered === 1 ? "" : "s"} nesta
          sessão · {summary.taxaChute}% de chute
        </p>
      )}
    </Card>
  );
}
