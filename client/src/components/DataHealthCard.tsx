import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { invalidateStudyState } from "@/lib/studyState";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type HealthAction = {
  id:
    | "reorder-disciplines"
    | "delete-empty-mock-exams"
    | "mark-errors-statement-pending"
    | "reschedule-stale-flashcards";
  label: string;
  count: number;
};

/**
 * Cartão "Saúde dos dados" (v6.9.8, item 2.4).
 *
 * Lista só o que o aluno pode resolver com um clique — e cada correção grava
 * backup antes de tocar no banco. Sem achado acionável, nada de alarme.
 */
export function DataHealthCard({ className = "" }: { className?: string }) {
  const utils = trpc.useUtils();
  const health = trpc.study.dataHealth.useQuery(undefined, {
    staleTime: 60_000,
  });
  const fix = trpc.study.fixDataHealth.useMutation();
  const [pending, setPending] = useState<string | null>(null);

  const data = health.data;
  const actions = (data?.actions || []) as HealthAction[];

  const apply = async (action: HealthAction) => {
    setPending(action.id);
    try {
      const result = await fix.mutateAsync({ fix: action.id });
      notify.once(
        `data-health-fix-${action.id}`,
        `${action.label}: ${result.affected} corrigido(s).`,
        {
          description: result.backup
            ? `Backup salvo antes da correção.`
            : "Nada precisava ser alterado.",
        },
      );
      await health.refetch();
      void invalidateStudyState(utils);
    } catch (error) {
      notify.once(
        `data-health-fix-error-${action.id}`,
        "Não foi possível corrigir agora.",
        {
          variant: "error",
          description: error instanceof Error ? error.message : undefined,
        },
      );
    } finally {
      setPending(null);
    }
  };

  if (health.isLoading) return null;
  if (!data) return null;

  const insights: string[] = [];
  if (data.topicBacklog > 0) {
    insights.push(
      `${data.topicBacklog} tópico(s) com mais de 30 revisões vencidas — use o encerramento em lote na sessão guiada.`,
    );
  }
  if (data.incoherentPerformance > 0) {
    insights.push(
      `${data.incoherentPerformance} tópico(s) com acertos + erros diferente do total resolvido (dado antigo).`,
    );
  }
  if (data.attemptsWithoutTopic > 0) {
    insights.push(
      `${data.attemptsWithoutTopic} tentativa(s) sem tópico — não entram no domínio por assunto.`,
    );
  }

  return (
    <div className={`soe-card p-5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Saúde dos dados
            </p>
            <p className="mt-0.5 text-sm font-semibold">
              {data.healthy
                ? "Nenhuma correção pendente"
                : `${actions.length} correção(ões) segura(s) disponível(is)`}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={health.isFetching}
          onClick={() => void health.refetch()}
        >
          {health.isFetching ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3 w-3" />
          )}
          Verificar de novo
        </Button>
      </div>

      {data.healthy ? (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-[11px] text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
          Disciplinas, revisões, erros, simulados e flashcards estão coerentes.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {actions.map((action) => (
            <div
              key={action.id}
              className="flex flex-col gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                <p className="text-[11.5px] leading-snug">
                  {action.label}
                  <span className="ml-1 text-muted-foreground">
                    ({action.count})
                  </span>
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0"
                disabled={pending !== null}
                onClick={() => void apply(action)}
              >
                {pending === action.id ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : null}
                Corrigir
              </Button>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            Toda correção grava um backup em <code>data/backups/</code> antes de
            alterar qualquer registro.
          </p>
        </div>
      )}

      {insights.length > 0 && (
        <div className="mt-3 space-y-1">
          {insights.map((insight) => (
            <p
              key={insight}
              className="flex items-start gap-1.5 text-[10.5px] leading-snug text-muted-foreground"
            >
              <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
              {insight}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default DataHealthCard;
