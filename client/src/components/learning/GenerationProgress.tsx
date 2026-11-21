import { Loader2, RotateCcw, X } from "lucide-react";
import { ProgressBar } from "@/components/apple";
import { Button } from "@/components/ui/button";
import type { GenerationJobState } from "./useGenerationJob";

/**
 * Barra de geração: estágio, %, tempo decorrido, cancelar e tentar de novo.
 * O botão de repetir aparece sempre que a geração falhou — erro nunca deixa o
 * aluno sem saída.
 */
export function GenerationProgress({
  job,
  title = "Gerando com IA",
}: {
  job: GenerationJobState;
  title?: string;
}) {
  const { view, running, error } = job;
  if (!view && !running && !error) return null;

  const percent = Math.max(0, Math.min(100, job.percent));
  const elapsed = job.elapsedSeconds;
  const stageLabel = error ? "Não deu certo" : job.stage || "Preparando";

  return (
    <div
      data-testid="generation-progress"
      data-status={view?.status ?? (error ? "error" : "running")}
      className="rounded-[10px] border border-border bg-secondary/40 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {running && !error ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          ) : null}
          <span className="truncate text-[12px] font-medium text-foreground">
            {error ? "Geração interrompida" : title}
          </span>
        </div>
        <span
          data-testid="generation-percent"
          className="apple-num shrink-0 text-[12px] font-semibold text-foreground"
        >
          {percent}%
        </span>
      </div>

      {!error && (
        <ProgressBar value={percent} className="mt-2" tone="var(--primary)" />
      )}

      <p
        data-testid="generation-stage"
        className="mt-1.5 text-[11.5px] leading-4 text-muted-foreground"
      >
        {stageLabel}
        {job.stage === "gerando" ? "" : ""}
        {running
          ? ` · ${elapsed}s`
          : view?.status === "done"
            ? ` · ${elapsed}s`
            : ""}
      </p>
      {job.message && job.message !== stageLabel && (
        <p className="mt-1 text-[11.5px] leading-4 text-foreground/70">
          {job.message}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {running && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-[11px]"
            onClick={() => void job.cancel()}
          >
            <X className="h-3 w-3" />
            Cancelar
          </Button>
        )}
        {!running && job.canRetry && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-[11px]"
            onClick={() => void job.retry()}
          >
            <RotateCcw className="h-3 w-3" />
            Tentar de novo
          </Button>
        )}
      </div>
    </div>
  );
}

export default GenerationProgress;
