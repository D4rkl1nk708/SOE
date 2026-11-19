import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { minutesSinceIso, shouldWarnNoCapture } from "@shared/sessionReport";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  Radio,
  Undo2,
  X,
} from "lucide-react";

export type TecTopicOption = { id: number; name: string };

type Props = {
  /** Início da sessão (ISO). O contador lê as tentativas com createdAt >= since. */
  since: string | null;
  /** Tópico alvo da sessão — usado pelo +Acertei/+Errei manual. */
  sessionTopicId?: number | null;
  sessionTopicName?: string | null;
  topicOptions: TecTopicOption[];
  /** Quando o usuário abriu o TEC nesta sessão (ms). */
  tecOpenedAt?: number | null;
  onChanged?: () => void;
};

function clockLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Contador ao vivo da Sessão Guiada (v6.9.5).
 *
 * O usuário vê na hora o que foi contabilizado — hora, #id, acerto/erro e
 * tópico — e pode corrigir o que a captura não pegou (+Acertei / +Errei /
 * Desfazer última). Também avisa quando o SOE concluiu sozinho a revisão de
 * teste no calendário, com Desfazer.
 */
export function TecSessionLivePanel({
  since,
  sessionTopicId,
  sessionTopicName,
  topicOptions,
  tecOpenedAt,
  onChanged,
}: Props) {
  const utils = trpc.useUtils();
  const [tick, setTick] = useState(() => Date.now());
  const [manualTopicId, setManualTopicId] = useState<number | null>(
    sessionTopicId ?? null,
  );
  const shownAuto = useRef<Set<number>>(new Set());
  const shownTheory = useRef<Set<number>>(new Set());

  useEffect(() => {
    setManualTopicId(sessionTopicId ?? null);
  }, [sessionTopicId]);

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const activity = trpc.tec.liveActivity.useQuery(
    { since: since || new Date().toISOString() },
    {
      enabled: !!since,
      refetchInterval: 5000,
      staleTime: 2000,
    },
  );

  const markCompleted = trpc.revision.markCompleted.useMutation({
    onSuccess: () => {
      void utils.tec.liveActivity.invalidate();
      void utils.dashboard.getStats.invalidate();
      void utils.calendar.getData.invalidate();
    },
  });

  const addManual = trpc.tec.addManualAnswer.useMutation({
    onSuccess: (result: any) => {
      if (result?.ok) {
        toast.success(
          result.correct
            ? "Acerto registrado à mão."
            : "Erro registrado à mão.",
        );
      } else {
        toast.error(result?.message || "Não foi possível registrar.");
      }
      void utils.tec.liveActivity.invalidate();
      void utils.study.masterySnapshot.invalidate();
      onChanged?.();
    },
    onError: (error) => toast.error(error.message),
  });

  const undoLast = trpc.tec.undoLastAnswer.useMutation({
    onSuccess: (result: any) => {
      if (result?.ok) {
        toast.success("Última resposta desfeita.");
      } else {
        toast.error(result?.message || "Nada para desfazer.");
      }
      void utils.tec.liveActivity.invalidate();
      void utils.study.masterySnapshot.invalidate();
      onChanged?.();
    },
    onError: (error) => toast.error(error.message),
  });

  const data = activity.data;

  // Revisão de teste concluída automaticamente: avisar com Desfazer.
  useEffect(() => {
    if (!data?.autoCompleted?.length) return;
    for (const item of data.autoCompleted) {
      if (shownAuto.current.has(item.revisionId)) continue;
      shownAuto.current.add(item.revisionId);
      toast.success(
        `Revisão de teste de ${item.topicName || "tópico"} concluída (${item.answersToday} questões hoje).`,
        {
          duration: 12000,
          action: {
            label: "Desfazer",
            onClick: () =>
              markCompleted.mutate(
                { id: item.revisionId, completed: false },
                {
                  onSuccess: () => {
                    shownAuto.current.delete(item.revisionId);
                    toast.success("Revisão reaberta.");
                  },
                  onError: (error) => toast.error(error.message),
                },
              ),
          },
        },
      );
    }
  }, [data?.autoCompleted, markCompleted]);

  // Revisão de TEORIA nunca é concluída sozinha: o app pergunta.
  useEffect(() => {
    const theory = data?.theorySuggestion;
    if (!theory || shownTheory.current.has(theory.revisionId)) return;
    shownTheory.current.add(theory.revisionId);
    toast(`Concluir revisão de ${theory.topicName}?`, {
      description: "Revisão de teoria pendente deste tópico.",
      duration: 12000,
      action: {
        label: "Concluir",
        onClick: () =>
          markCompleted.mutate(
            { id: theory.revisionId, completed: true },
            {
              onSuccess: () => toast.success("Revisão concluída."),
              onError: (error) => toast.error(error.message),
            },
          ),
      },
    });
  }, [data?.theorySuggestion, markCompleted]);

  // `tick` força o recálculo a cada 30s; a regra dos 4 min é pura e testada.
  const idleMinutes = useMemo(() => {
    if (!data) return null;
    const reference =
      data.lastCaptureAt ||
      (tecOpenedAt ? new Date(tecOpenedAt).toISOString() : null);
    return minutesSinceIso(reference);
  }, [data, tecOpenedAt, tick]);
  const idleWarning = shouldWarnNoCapture(idleMinutes);

  const manualTarget =
    manualTopicId ?? sessionTopicId ?? topicOptions[0]?.id ?? null;
  const manualDisabled = !since || !manualTarget || addManual.isPending;

  if (!since) return null;

  return (
    <div className="soe-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-primary" />
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Captura do TEC
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
              Contabilizadas: {data?.count ?? 0}
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                {data ? `${data.correct} acertos · ${data.errors} erros` : ""}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={manualDisabled}
            onClick={() =>
              addManual.mutate({
                correct: true,
                topicId: manualTarget ?? undefined,
              })
            }
          >
            {addManual.isPending ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <Check className="mr-1.5 h-3 w-3" />
            )}
            Acertei
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={manualDisabled}
            onClick={() =>
              addManual.mutate({
                correct: false,
                topicId: manualTarget ?? undefined,
              })
            }
          >
            <X className="mr-1.5 h-3 w-3" /> Errei
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            disabled={!since || undoLast.isPending || !data?.count}
            onClick={() => undoLast.mutate({ since })}
          >
            {undoLast.isPending ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <Undo2 className="mr-1.5 h-3 w-3" />
            )}
            Desfazer
          </Button>
        </div>
      </div>

      {!sessionTopicId && topicOptions.length > 1 && (
        <div className="mt-3 flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Tópico manual
          </label>
          <select
            value={manualTopicId ?? ""}
            onChange={(event) =>
              setManualTopicId(
                event.target.value ? Number(event.target.value) : null,
              )
            }
            className="h-8 max-w-[240px] flex-1 rounded-md border border-border bg-secondary/30 px-2 text-[11px] outline-none focus:border-primary/50"
          >
            <option value="">Escolher…</option>
            {topicOptions.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {sessionTopicName && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Lançamento manual vai para: {sessionTopicName}
        </p>
      )}

      {idleWarning && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 p-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Nenhuma resposta detectada há {idleMinutes} min — confira o
            contador. Se respondeu e não apareceu, use <b>+Acertei</b>/
            <b>+Errei</b>.
          </p>
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {(data?.items || []).length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Nenhuma captura ainda. Abra o TEC pelo botão acima e resolva a
            primeira questão.
          </p>
        )}
        {(data?.items || [])
          .slice()
          .reverse()
          .map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-md bg-secondary/20 px-2.5 py-1.5 text-[11px]"
            >
              <span className="tabular-nums text-muted-foreground">
                {clockLabel(item.at)}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {item.questionId
                  ? item.questionId.startsWith("qid:")
                    ? `#${item.questionId.slice(4)}`
                    : item.questionId.slice(0, 14)
                  : "sem id"}
              </span>
              {item.correct ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              ) : (
                <X className="h-3 w-3 text-red-500" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {item.topicName || (
                  <span className="text-amber-500">
                    aguardando classificação
                  </span>
                )}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                {item.source === "manual" ? "manual" : item.source}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

export default TecSessionLivePanel;
