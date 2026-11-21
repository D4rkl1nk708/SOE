import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { invalidateStudyState } from "@/lib/studyState";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { openTecBrowser } from "@/lib/openTecBrowser";
import { toast } from "sonner";
import {
  buildSessionReport,
  buildSessionReportFromAttempts,
  summarizeReport,
  type SessionReport,
  type TopicSnapshot,
} from "@shared/sessionReport";
import { TecSessionLivePanel } from "@/components/tec/TecSessionLivePanel";
import { TecPendingClassifications } from "@/components/tec/TecPendingClassifications";
import { CalibrationCard } from "@/components/apple/CalibrationCard";
import { calibrationAdvice, summarizeCalibration } from "@shared/calibration";
import { decideNextBlock, decideReviewGap } from "@shared/decisions";
import { addLocalDays, localDayISO } from "@shared/localDay";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  ExternalLink,
  Gauge,
  Play,
  Sparkles,
  Square,
  Target,
  AlertTriangle,
  Loader2,
  ThumbsUp,
  TrendingUp,
  TrendingDown,
  CheckCircle,
} from "lucide-react";

type GuidedBlock = {
  id?: string;
  revisionId?: number;
  kind?: string;
  title: string;
  subtitle?: string;
  reason?: string;
  minutes?: number;
  topicId?: number;
  topicName?: string;
  disciplineId?: number;
  disciplineName?: string;
  color?: string;
  lens?: string;
};

function readBlock(): GuidedBlock | null {
  try {
    const raw = sessionStorage.getItem("soe_guided_block");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function snapshot(stats: any) {
  const disciplines = stats?.disciplineStats || [];
  const questions = disciplines.reduce(
    (sum: number, d: any) => sum + (d.performance?.questionsResolved || 0),
    0,
  );
  const correct = disciplines.reduce(
    (sum: number, d: any) => sum + (d.performance?.correctCount || 0),
    0,
  );
  return {
    questions,
    correct,
    accuracy: questions > 0 ? Math.round((correct / questions) * 100) : 0,
  };
}

export default function GuidedSession() {
  const [, navigate] = useLocation();
  const [block] = useState<GuidedBlock | null>(() => readBlock());
  const [phase, setPhase] = useState<"briefing" | "running" | "receipt">(
    "briefing",
  );
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [before, setBefore] = useState(() => ({
    questions: 0,
    correct: 0,
    accuracy: 0,
  }));
  const [after, setAfter] = useState(() => ({
    questions: 0,
    correct: 0,
    accuracy: 0,
  }));
  const [receipt, setReceipt] = useState<any>(null);
  const [report, setReport] = useState<SessionReport | null>(null);
  // v6.9.7 (item 1): tentativas da sessão (com confiança) para o card de calibração.
  const [sessionAttempts, setSessionAttempts] = useState<any[]>([]);
  const sessionCalibration = useMemo(
    () =>
      sessionAttempts.length > 0 ? summarizeCalibration(sessionAttempts) : null,
    [sessionAttempts],
  );
  const [revisionDone, setRevisionDone] = useState(false);
  // v6.9.8 (item 1.2): fechamento único da sessão (um clique, um toast).
  const [closeIncludeBacklog, setCloseIncludeBacklog] = useState(true);
  const [closeTheory, setCloseTheory] = useState(false);
  const [closing, setClosing] = useState(false);
  // Quando o usuário abriu o TEC nesta sessão: base do aviso "nenhuma resposta
  // detectada há X min".
  const [tecOpenedAt, setTecOpenedAt] = useState<number | null>(null);
  const [feynmanText, setFeynmanText] = useState("");
  const [feynmanSave, setFeynmanSave] = useState(false);
  const [feedback, setFeedback] = useState<{
    score: number;
    veredito: string;
    acertos: string[];
    lacunas: string[];
    correcao: string;
    pergunta: string;
    saved: boolean;
  } | null>(null);
  const beforeMastery = useRef<TopicSnapshot[]>([]);

  const { data: stats, refetch: refetchStats } =
    trpc.dashboard.getStats.useQuery();
  const { data: overview, refetch: refetchOverview } =
    trpc.study.overview.useQuery(
      { minutes: Number((stats?.settings as any)?.dailyGoalMinutes) || 240 },
      { enabled: !!stats },
    );
  const { data: pushTokenData } = trpc.import.getICalUrl.useQuery();
  const masteryQuery = trpc.study.masterySnapshot.useQuery();
  const utils = trpc.useUtils();
  const { data: topicsData } = trpc.topic.list.useQuery();
  const { data: disciplinesData } = trpc.discipline.list.useQuery();
  // v6.9.8 (item 2.1): este arquivo não invalidava NADA — era a tela que mais
  // deixava o plano desatualizado depois de concluir uma revisão.
  const markRevisionDone = trpc.revision.markCompleted.useMutation({
    onSuccess: () => {
      void invalidateStudyState(utils, "revision");
    },
  });
  const recordSession = trpc.study.recordSession.useMutation({
    onSuccess: () => {
      void invalidateStudyState(utils, "session");
    },
  });
  const feynman = trpc.mentor.evaluateExplanation.useMutation();

  const apiKey = (stats?.settings as any)?.aiApiKey || "";
  const provider = (stats?.settings as any)?.aiProvider || "gemini";
  const recommendation = trpc.mentor.getMentorRecommendation.useQuery(
    { apiKey, provider },
    { enabled: !!apiKey, staleTime: 1000 * 60 * 30 },
  );

  const activeBlock = block || overview?.plan.blocks?.[0];
  const cadernoQuery = trpc.learning.cadernoForDiscipline.useQuery(
    { disciplineName: activeBlock?.disciplineName || "" },
    { enabled: !!activeBlock?.disciplineName },
  );
  const applyRevision = trpc.study.applySessionRevision.useMutation();
  const completeBacklog = trpc.revision.completeTopicBacklog.useMutation({
    onSuccess: () => {
      void invalidateStudyState(utils, "revision");
    },
  });
  // v6.9.8 (item 1.2): o N do checkbox vem do servidor (offline usa localDb).
  const backlogQuery = trpc.revision.topicBacklog.useQuery(
    { topicId: activeBlock?.topicId as number },
    { enabled: Boolean(activeBlock?.topicId) && phase === "running" },
  );
  const backlogPrevious = backlogQuery.data?.previous ?? 0;
  // A revisão de TEORIA pendente deixou de ser toast solto: virou checkbox.
  const theoryQuery = trpc.tec.liveActivity.useQuery(
    {
      since: startedAt
        ? new Date(startedAt).toISOString()
        : new Date().toISOString(),
    },
    {
      enabled: phase === "running" && Boolean(startedAt),
      refetchInterval: 10_000,
    },
  );
  const theorySuggestion = theoryQuery.data?.theorySuggestion ?? null;

  useEffect(() => {
    if (backlogPrevious > 0) setCloseIncludeBacklog(true);
  }, [backlogPrevious]);
  const [revisionRescheduledTo, setRevisionRescheduledTo] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (phase !== "running" || !startedAt) return;
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [phase, startedAt]);

  const start = async () => {
    setBefore(snapshot(stats));
    setReport(null);
    setRevisionDone(false);
    try {
      const fresh = await masteryQuery.refetch();
      beforeMastery.current = fresh.data?.topics ?? [];
    } catch {
      beforeMastery.current = masteryQuery.data?.topics ?? [];
    }
    setStartedAt(Date.now());
    setElapsed(0);
    setPhase("running");
    try {
      localStorage.setItem(
        "soe_active_mission",
        JSON.stringify({ block: activeBlock, startedAt: Date.now() }),
      );
    } catch {}
    setTecOpenedAt(Date.now());
    setTimeout(() => {
      void openTecBrowser(pushTokenData?.token || "");
    }, 250);
  };

  const finish = async () => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    const [fresh, freshOverview, freshMastery] = await Promise.all([
      refetchStats(),
      refetchOverview(),
      masteryQuery.refetch(),
    ]);
    const afterSnapshot = snapshot(fresh.data);
    // v6.9.5: a fonte da verdade do relatório são as `questionAttempts` com
    // createdAt dentro de [início, fim] — o delta de domínio por tópico só é
    // usado quando não há tentativa nenhuma na janela (fallback).
    const endedIso = new Date().toISOString();
    const startedIso = new Date(
      startedAt ?? Date.now() - elapsed * 1000,
    ).toISOString();
    const deltaReport = buildSessionReport({
      before: beforeMastery.current,
      after: freshMastery.data?.topics ?? [],
      globalBefore: before.accuracy,
      globalAfter: afterSnapshot.accuracy,
    });
    let sessionReport: SessionReport = deltaReport;
    try {
      const live = (await utils.tec.liveActivity.fetch({
        since: startedIso,
        until: endedIso,
      })) as any;
      const fromAttempts = buildSessionReportFromAttempts({
        attempts: live?.attempts || [],
        startedAt: startedIso,
        endedAt: endedIso,
        topics: (((topicsData as any)?.topics as any[]) || []).map(
          (topic: any) => ({
            id: topic.id,
            name: topic.name,
            disciplineId: topic.disciplineId,
          }),
        ),
        disciplines: ((disciplinesData as any[]) || []).map((d: any) => ({
          id: d.id,
          name: d.name,
        })),
        before: beforeMastery.current,
        after: freshMastery.data?.topics ?? [],
        globalBefore: before.accuracy,
        globalAfter: afterSnapshot.accuracy,
      });
      if (!fromAttempts.noData) sessionReport = fromAttempts;
      // v6.9.7 (item 1): a calibração da sessão vem das mesmas tentativas.
      setSessionAttempts((live?.attempts as any[]) || []);
    } catch {
      // servidor antigo/offline: mantém o relatório por delta
    }
    // A escolha do próximo bloco vem da árvore de decisão: respeita tempo,
    // prioriza revisão vencida e não repete o tema que acabou de ser feito.
    const planBlocksAll = (freshOverview.data?.plan?.blocks || []) as any[];
    // v6.9.8 (item 1.2): o recibo aponta um bloco de OUTRO tópico quando há
    // alternativa — antes o mesmo tema voltava no "Iniciar próximo".
    const hasOtherTopic = planBlocksAll.some(
      (block) => block.topicId && block.topicId !== activeBlock?.topicId,
    );
    const planBlocks = hasOtherTopic
      ? planBlocksAll.filter(
          (block) => !block.topicId || block.topicId !== activeBlock?.topicId,
        )
      : planBlocksAll;
    const decision = decideNextBlock({
      blocks: planBlocks.map((block) => ({
        id: block.id,
        kind: block.kind,
        minutes: block.minutes,
        topicId: block.topicId,
        score: block.score,
        completed: block.completed,
        topicName: block.topicName,
        disciplineName: block.disciplineName,
        reason: block.reason,
      })),
      minutesAvailable:
        Number((fresh.data as any)?.settings?.dailyGoalMinutes) || 240,
      lastTopicId: activeBlock?.topicId ?? null,
      overdueRevisions: freshOverview.data?.plan?.overdueRevisions ?? 0,
    });
    const nextBlock = decision.block
      ? planBlocks.find((block) => block.id === decision.block?.id)
      : null;
    const record = {
      date: new Date().toISOString(),
      title: activeBlock?.title || "Sessão de estudo",
      minutes: Math.max(0, Math.round(elapsed / 60)),
      questions: sessionReport.questions,
      accuracy: sessionReport.accuracy,
      delta: sessionReport.accuracyAfter - sessionReport.accuracyBefore,
      summary: summarizeReport(sessionReport),
      nextWhy: decision.why,
      strengths: sessionReport.strengths,
      weaknesses: sessionReport.weaknesses,
      nextBlock: nextBlock
        ? {
            id: nextBlock.id,
            title: nextBlock.title,
            minutes: nextBlock.minutes,
            reason: nextBlock.reason,
            kind: nextBlock.kind,
            revisionId: nextBlock.revisionId,
            topicId: nextBlock.topicId,
            topicName: nextBlock.topicName,
            disciplineId: nextBlock.disciplineId,
            disciplineName: nextBlock.disciplineName,
            lens: nextBlock.lens,
          }
        : null,
    };
    setAfter(afterSnapshot);
    setReport(sessionReport);
    setReceipt(record);
    setPhase("receipt");
    // Sessão como dado: sem isso não existe histórico, nem relatório por sessão.
    try {
      recordSession.mutate({
        startedAt: new Date(
          startedAt ?? Date.now() - elapsed * 1000,
        ).toISOString(),
        endedAt: new Date().toISOString(),
        minutes,
        accuracy: sessionReport.accuracy,
        questions: sessionReport.questions,
        correct: sessionReport.correct,
        topicId: activeBlock?.topicId ?? undefined,
        topicName: activeBlock?.topicName || activeBlock?.title,
        disciplineId: activeBlock?.disciplineId ?? undefined,
        blockId: activeBlock?.id,
      });
    } catch {}
    try {
      localStorage.setItem("soe_last_session_receipt", JSON.stringify(record));
      localStorage.removeItem("soe_active_mission");
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent("soe-guided-finished"));
    } catch {}
  };

  const refreshReport = async () => {
    const [freshStats, freshMastery] = await Promise.all([
      refetchStats(),
      masteryQuery.refetch(),
    ]);
    const afterSnapshot = snapshot(freshStats.data);
    setAfter(afterSnapshot);
    setReport(
      buildSessionReport({
        before: beforeMastery.current,
        after: freshMastery.data?.topics ?? [],
        globalBefore: before.accuracy,
        globalAfter: afterSnapshot.accuracy,
      }),
    );
    toast.success("Análise recalculada.");
  };

  const completeRevision = async () => {
    if (!activeBlock?.revisionId) return;
    markRevisionDone.mutate(
      { id: activeBlock.revisionId, completed: true },
      {
        onSuccess: async () => {
          setRevisionDone(true);
          const fresh = await refetchOverview();
          const next = fresh.data?.plan?.blocks?.[0];
          if (next) {
            setReceipt((previous: any) => ({
              ...(previous || {}),
              nextBlock: {
                id: next.id,
                title: next.title,
                minutes: next.minutes,
                reason: next.reason,
                kind: next.kind,
                revisionId: next.revisionId,
                topicId: next.topicId,
                topicName: next.topicName,
                disciplineId: next.disciplineId,
                disciplineName: next.disciplineName,
                lens: next.lens,
              },
            }));
          }
          // item 2.5: uma ação, um toast (id estável).
          notify.once(
            "revision-completed",
            "Revisão concluída — o plano já foi recalculado.",
          );
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  /**
   * v6.9.8 (item 1.2): UM fechamento de sessão.
   *
   * Registra a sessão, conclui a revisão ativa, o lote do tópico (só as
   * vencidas) e a teoria pendente, recalcula o plano e mostra UM toast.
   */
  const closeSession = async (options: { complete: boolean }) => {
    if (closing) return;
    setClosing(true);
    let completed = 0;
    let theoryCompleted = false;
    try {
      if (options.complete && activeBlock?.topicId) {
        if (closeIncludeBacklog && backlogPrevious > 0) {
          const result = await completeBacklog.mutateAsync({
            topicId: activeBlock.topicId,
            today: localDayISO(),
          });
          completed = result.completed;
        } else if (activeBlock.revisionId) {
          await markRevisionDone.mutateAsync({
            id: activeBlock.revisionId,
            completed: true,
          });
          completed = 1;
        }
        if (closeTheory && theorySuggestion) {
          await markRevisionDone.mutateAsync({
            id: theorySuggestion.revisionId,
            completed: true,
          });
          theoryCompleted = true;
        }
        setRevisionDone(completed > 0);
      }
    } catch (error) {
      notify.once(
        "guided-close-error",
        "Não foi possível concluir a revisão.",
        {
          variant: "error",
          description: error instanceof Error ? error.message : undefined,
        },
      );
      setClosing(false);
      return;
    }
    await finish();
    const parts = ["Sessão encerrada"];
    if (completed > 0) {
      parts.push(
        completed > 1
          ? `revisão concluída (+${completed - 1} anteriores)`
          : "revisão concluída",
      );
    }
    if (theoryCompleted) parts.push("teoria concluída");
    // id fixo: o sonner substitui em vez de empilhar dois toasts iguais.
    notify.once("guided-close", parts.join(" · "), { duration: 6000 });
    setClosing(false);
  };

  const startBlock = (target: any) => {
    if (!target) {
      navigate("/plan");
      return;
    }
    sessionStorage.setItem("soe_guided_block", JSON.stringify(target));
    window.location.reload();
  };

  const minutes = Math.max(0, Math.round(elapsed / 60));

  // Sugestão de quando revisar (árvore T6). Não escreve no calendário 25/50:
  // o agendamento oficial continua sendo o do FSRS/calendário.
  const reviewGap =
    report && !report.noData
      ? decideReviewGap({
          accuracy: report.accuracy,
          hadErrors: report.errors > 0,
        })
      : null;
  const reviewDateIso =
    reviewGap && reviewGap.days > 0
      ? addLocalDays(localDayISO(), reviewGap.days)
      : null;
  const reviewDate = reviewDateIso
    ? new Date(`${reviewDateIso}T00:00:00`).toLocaleDateString("pt-BR")
    : null;

  const startQuestions = () => {
    if (!activeBlock) return;
    sessionStorage.setItem(
      "qs_prefill",
      JSON.stringify({
        topicId: activeBlock.topicId,
        topicName: activeBlock.topicName || activeBlock.title,
        disciplineId: activeBlock.disciplineId,
        autoStart: true,
      }),
    );
    navigate("/question-session");
  };

  const explain = () => {
    if (!activeBlock) return;
    sessionStorage.setItem(
      "soe_mentor_prefill",
      `Me explique de forma prática o tema "${activeBlock.topicName || activeBlock.title}" ` +
        `(${activeBlock.disciplineName || "concurso"}). Por que ele é importante, ` +
        `quais são as pegadinhas da banca e o que devo estudar primeiro?`,
    );
    navigate("/mentor");
  };

  const submitFeynman = () => {
    if (!activeBlock) return;
    if (!apiKey) {
      toast.error("Configure a chave de IA no Perfil para usar a correção.");
      return;
    }
    setFeedback(null);
    feynman.mutate(
      {
        topicName: activeBlock.topicName || activeBlock.title,
        disciplineName: activeBlock.disciplineName || "",
        explanation: feynmanText.trim(),
        apiKey,
        // O router só aceita os providers conhecidos.
        provider: (["claude", "gemini", "openai"] as const).includes(
          provider as any,
        )
          ? (provider as "claude" | "gemini" | "openai")
          : "gemini",
        saveNote: feynmanSave,
        topicId: activeBlock.topicId ?? undefined,
        disciplineId: activeBlock.disciplineId ?? undefined,
      },
      {
        onSuccess: (data) => {
          setFeedback(data as any);
          if ((data as any)?.saved) toast.success("Anotação salva no tema.");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const rec = recommendation.data;
  const diagnostic =
    rec?.diagnostic ||
    activeBlock?.reason ||
    "Vamos organizar o próximo passo.";
  const actionPlan =
    rec?.actionPlan ||
    "Abra o TEC, resolva questões do tema e volte para registrar o que mudou.";
  const prediction =
    rec?.prediction ||
    "Sem uma sessão curta e focada, o esquecimento reduz o retorno do que você já estudou.";

  const headerActions = useMemo(
    () => (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate("/plan")}
        className="h-9"
      >
        <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Plano
      </Button>
    ),
    [navigate],
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-20">
      <PageHeader
        eyebrow="Sessão guiada"
        title={activeBlock?.title || "O que estudar agora"}
        description="O mentor escolhe, explica e acompanha. Você só executa."
        actions={headerActions}
      />
      {phase === "briefing" && (
        <div className="space-y-4">
          <div className="soe-card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  Diagnóstico do mentor
                </p>
                <p className="mt-1 text-sm leading-relaxed">{diagnostic}</p>
                <div className="mt-4 rounded-md border border-primary/15 bg-primary/5 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-primary">
                    Plano de ação
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">{actionPlan}</p>
                </div>
                <p className="mt-3 text-[10px] italic text-muted-foreground">
                  {prediction}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="rounded-full border border-border bg-card px-3 py-1 text-[10px] font-semibold text-muted-foreground">
                  {activeBlock?.minutes || 25} min
                </span>
                {activeBlock?.lens && (
                  <span className="rounded-full border border-border px-3 py-1 text-[9px] font-semibold uppercase text-muted-foreground">
                    {activeBlock.lens === "base"
                      ? "Rotina base"
                      : activeBlock.lens}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={start}
              className="soe-card group p-5 text-left transition-all hover:border-primary/40"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Play className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold">Começar sessão</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Marca o início, abre o TEC e mede o que mudou.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                Iniciar <ArrowRight className="h-3 w-3" />
              </span>
            </button>

            <button
              onClick={explain}
              className="soe-card group p-5 text-left transition-all hover:border-primary/40"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                <Brain className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold">Entender com IA</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                O mentor explica o tema, as pegadinhas e a ordem de estudo.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Abrir explicação <ArrowRight className="h-3 w-3" />
              </span>
            </button>
          </div>

          <div className="soe-card p-5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              O que conta nesta sessão
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md bg-secondary/30 p-3">
                <p className="text-lg font-semibold tabular-nums">
                  {activeBlock?.minutes || 25}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {" "}
                    min
                  </span>
                </p>
                <p className="text-[9px] text-muted-foreground">Foco</p>
              </div>
              <div className="rounded-md bg-secondary/30 p-3">
                <p className="text-lg font-semibold tabular-nums">
                  {overview?.plan.blocks?.length || 0}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  Blocos no dia
                </p>
              </div>
              <div className="rounded-md bg-secondary/30 p-3">
                <p className="text-lg font-semibold tabular-nums">
                  {activeBlock?.topicId ? "1" : "—"}
                </p>
                <p className="text-[9px] text-muted-foreground">Tema alvo</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {phase === "running" && (
        <div className="space-y-4">
          <div className="soe-card p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-primary">
                  Sessão em andamento
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  {activeBlock?.title || "Sessão de estudo"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeBlock?.disciplineName || "Tema escolhido"} · {minutes}{" "}
                  min decorridos
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-md border border-border bg-secondary/30 px-4 py-2 text-center">
                  <p className="font-mono text-xl font-semibold tabular-nums">
                    {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
                    {String(elapsed % 60).padStart(2, "0")}
                  </p>
                  <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                    Cronômetro
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setTecOpenedAt(Date.now());
                    void openTecBrowser(pushTokenData?.token || "");
                  }}
                >
                  <ExternalLink className="mr-2 h-3.5 w-3.5" /> Abrir TEC
                </Button>
              </div>
            </div>
          </div>

          <TecSessionLivePanel
            since={startedAt ? new Date(startedAt).toISOString() : null}
            sessionTopicId={activeBlock?.topicId ?? null}
            sessionTopicName={
              activeBlock?.topicName || activeBlock?.title || null
            }
            topicOptions={(((topicsData as any)?.topics as any[]) || []).map(
              (topic: any) => ({
                id: topic.id,
                name: topic.name,
              }),
            )}
            tecOpenedAt={tecOpenedAt}
            onChanged={() => {
              void masteryQuery.refetch();
              void refetchStats();
            }}
          />

          <TecPendingClassifications />

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Questões antes",
                value: before.questions,
                icon: Target,
              },
              {
                label: "Acurácia antes",
                value: `${before.accuracy}%`,
                icon: Gauge,
              },
              {
                label: "Meta",
                value: `${activeBlock?.minutes || 25} min`,
                icon: Clock,
              },
            ].map((item) => (
              <div key={item.label} className="soe-card p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <item.icon className="h-3.5 w-3.5" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">
                    {item.label}
                  </span>
                </div>
                <p className="text-xl font-semibold tabular-nums">
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="soe-card p-5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Como executar
            </p>
            <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
              <li>1. Abra o TEC pelo botão acima.</li>
              <li>
                2. Resolva questões do tema até o tempo ou até sentir o padrão.
              </li>
              <li>3. Volte e encerre a sessão para ver o recibo.</li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={startQuestions}>
                <Target className="mr-2 h-3.5 w-3.5" /> Fazer no SOE
              </Button>
              <Button variant="outline" onClick={explain}>
                <Brain className="mr-2 h-3.5 w-3.5" /> IA explica
              </Button>
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">
              Para encerrar, use <b>Fechar o ciclo</b> logo abaixo: encerrar,
              concluir a revisão e recalcular o plano no mesmo clique.
            </p>
          </div>

          {/* v6.9.8 (item 1.2): um único fechamento de sessão */}
          <div className="soe-card p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Fechar o ciclo
              </p>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Um clique: encerra a sessão, conclui a revisão de hoje e recalcula
              o plano.
            </p>
            <div className="mt-3 space-y-2.5">
              <label className="flex items-start gap-2 text-[11.5px] leading-snug">
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 accent-primary"
                  checked={closeIncludeBacklog && backlogPrevious > 0}
                  disabled={backlogPrevious === 0 || closing}
                  onChange={(event) =>
                    setCloseIncludeBacklog(event.target.checked)
                  }
                />
                <span>
                  Concluir também as <b>{backlogPrevious}</b>{" "}
                  {backlogPrevious === 1
                    ? "revisão anterior"
                    : "revisões anteriores"}{" "}
                  deste tópico
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    Só as que já venceram — o calendário 25/50 fica intacto.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-[11.5px] leading-snug">
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 accent-primary"
                  checked={closeTheory && Boolean(theorySuggestion)}
                  disabled={!theorySuggestion || closing}
                  onChange={(event) => setCloseTheory(event.target.checked)}
                />
                <span>
                  Concluir revisão de teoria pendente
                  {theorySuggestion ? ` (${theorySuggestion.topicName})` : ""}
                  {!theorySuggestion && (
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      Nenhuma revisão de teoria pendente neste tópico.
                    </span>
                  )}
                </span>
              </label>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                className="w-full sm:w-auto"
                onClick={() => void closeSession({ complete: true })}
                disabled={closing}
              >
                {closing ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-3.5 w-3.5" />
                )}
                Encerrar sessão e concluir
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => void closeSession({ complete: false })}
                disabled={closing}
              >
                <Square className="mr-2 h-3.5 w-3.5" /> Encerrar sem concluir
              </Button>
            </div>
          </div>

          <div className="soe-card p-5">
            <div className="flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-primary" />
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Explique com as suas palavras
              </p>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Técnica Feynman: se não sai em linguagem simples, você ainda não
              aprendeu. A IA aponta o que ficou vago e o que faltou.
            </p>
            <textarea
              value={feynmanText}
              onChange={(event) => setFeynmanText(event.target.value)}
              rows={5}
              placeholder={`Explique ${activeBlock?.topicName || "o tema"} como se estivesse ensinando alguém que não conhece o assunto...`}
              className="mt-3 w-full resize-y rounded-md border border-border bg-secondary/30 p-3 text-xs leading-relaxed outline-none focus:border-primary/50"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={feynmanSave}
                  onChange={(event) => setFeynmanSave(event.target.checked)}
                />
                Salvar como anotação do tema
              </label>
              <Button
                size="sm"
                className="ml-auto"
                onClick={submitFeynman}
                disabled={feynman.isPending || feynmanText.trim().length < 40}
              >
                {feynman.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                )}
                Corrigir com IA
              </Button>
            </div>

            {feedback && (
              <div className="mt-3 space-y-2.5 rounded-md border border-border bg-secondary/20 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    Correção da sua explicação
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {feedback.score}/100
                  </p>
                </div>
                {feedback.veredito && (
                  <p className="text-[11.5px] leading-snug">
                    {feedback.veredito}
                  </p>
                )}
                {feedback.acertos.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-500">
                      Você acertou
                    </p>
                    <ul className="mt-1 space-y-1">
                      {feedback.acertos.map((item) => (
                        <li key={item} className="text-[11px] leading-snug">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {feedback.lacunas.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-amber-500">
                      Ficou de fora
                    </p>
                    <ul className="mt-1 space-y-1">
                      {feedback.lacunas.map((item) => (
                        <li key={item} className="text-[11px] leading-snug">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {feedback.correcao && (
                  <p className="text-[11px] leading-snug">
                    <b className="text-foreground">Como fica certo:</b>{" "}
                    <span className="text-muted-foreground">
                      {feedback.correcao}
                    </span>
                  </p>
                )}
                {feedback.pergunta && (
                  <p className="text-[11px] italic leading-snug text-muted-foreground">
                    Pergunta para fechar a lacuna: {feedback.pergunta}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {phase === "receipt" && (
        <div className="space-y-4">
          <div className="soe-card p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-500">
                  Sessão encerrada · {minutes} min
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  {activeBlock?.title || "Sessão de estudo"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {report && !report.noData
                    ? `${report.questions} questões · ${report.correct} acertos · ${report.errors} ${report.errors === 1 ? "erro" : "erros"}`
                    : "Nenhuma questão nova capturada nesta sessão."}
                </p>
              </div>
              {report && !report.noData && (
                <div className="rounded-md border border-border bg-secondary/30 px-4 py-2 text-center">
                  <p className="text-2xl font-semibold tabular-nums">
                    {report.accuracy}%
                  </p>
                  <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                    acerto na sessão
                  </p>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    geral {report.accuracyBefore}% → {report.accuracyAfter}%
                  </p>
                </div>
              )}
            </div>
          </div>

          <TecPendingClassifications />

          {report && ((report as any).unclassified || 0) > 0 && (
            <p className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-muted-foreground">
              {(report as any).unclassified as number} resposta(s) entraram sem
              tópico porque o rótulo do TEC está pendente de classificação —
              resolva no cartão acima para elas aparecerem no tópico certo.
            </p>
          )}

          {report?.noData && (
            <div className="soe-card border-amber-500/20 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                <div>
                  <p className="text-xs font-semibold">
                    Nenhuma questão nova detectada.
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    As questões do TEC entram pela captura automática: confira a
                    linha “Última captura TEC” no Treino e se o app está
                    atualizado. Sessão sem questão não gera análise — só tempo.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={refreshReport}
                    disabled={masteryQuery.isFetching}
                  >
                    {masteryQuery.isFetching ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : null}
                    Atualizar análise
                  </Button>
                </div>
              </div>
            </div>
          )}

          {report && !report.noData && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="soe-card p-5">
                <div className="flex items-center gap-2 text-emerald-500">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">
                    Pontos fortes
                  </span>
                </div>
                {report.strengths.length ? (
                  <ul className="mt-3 space-y-1.5">
                    {report.strengths.map((item) => (
                      <li key={item} className="text-[11.5px] leading-snug">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Amostra pequena: nenhum tópico com 3+ questões acima de 70%.
                  </p>
                )}
              </div>
              <div className="soe-card p-5">
                <div className="flex items-center gap-2 text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">
                    Pontos fracos
                  </span>
                </div>
                {report.weaknesses.length ? (
                  <ul className="mt-3 space-y-1.5">
                    {report.weaknesses.map((item) => (
                      <li key={item} className="text-[11.5px] leading-snug">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Nada abaixo do esperado nesta sessão.
                  </p>
                )}
              </div>
            </div>
          )}

          {sessionCalibration && (
            <CalibrationCard
              summary={sessionCalibration}
              advice={calibrationAdvice(sessionCalibration)}
              compact
              className="soe-card bg-transparent"
            />
          )}

          {report && report.topics.length > 0 && (
            <div className="soe-card p-5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Por tópico nesta sessão
              </p>
              <div className="mt-2 divide-y divide-border">
                {report.topics.map((topic) => (
                  <div
                    key={topic.topicId}
                    className="flex items-center gap-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">
                        {topic.topicName}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {topic.disciplineName}
                      </p>
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {topic.correct}/{topic.questions}
                    </span>
                    <span
                      className={`w-10 text-right text-[11.5px] font-semibold tabular-nums ${
                        topic.accuracy >= 70
                          ? "text-emerald-500"
                          : topic.accuracy < 50
                            ? "text-amber-500"
                            : ""
                      }`}
                    >
                      {topic.accuracy}%
                    </span>
                    <span
                      className={`flex w-14 items-center justify-end gap-1 text-[10px] tabular-nums ${
                        topic.readinessDelta >= 0
                          ? "text-emerald-500"
                          : "text-amber-500"
                      }`}
                    >
                      {topic.readinessDelta >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {topic.readinessDelta >= 0 ? "+" : ""}
                      {topic.readinessDelta}pp
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeBlock?.revisionId && !revisionDone && (
            <div className="soe-card p-5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Revisão do plano
              </p>
              <p className="mt-1 text-sm">
                Este bloco era uma revisão vencida. Se você já revisou o tema,
                conclua para o plano andar — era isso que fazia o mesmo tema
                voltar sempre.
              </p>
              <Button
                className="mt-3"
                onClick={completeRevision}
                disabled={markRevisionDone.isPending}
              >
                {markRevisionDone.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-3.5 w-3.5" />
                )}
                Concluir revisão e avançar
              </Button>
            </div>
          )}

          {activeBlock?.revisionId && revisionDone && (
            <div className="soe-card flex items-center gap-2 p-4 text-xs text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Revisão concluída. O plano já mostra o próximo tema.
            </div>
          )}

          {receipt?.nextBlock && (
            <div className="soe-card p-5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Próximo no plano
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {receipt.nextBlock.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {receipt.nextBlock.reason ||
                      "Próximo bloco do plano atualizado."}
                  </p>
                  {receipt.nextWhy && (
                    <p className="mt-1 text-[10px] italic text-muted-foreground/80">
                      Por quê: {receipt.nextWhy}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startBlock(receipt.nextBlock)}
                >
                  Iniciar próximo
                </Button>
              </div>
            </div>
          )}

          <div className="soe-card p-5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Fechar o ciclo
            </p>
            {reviewDate && reviewGap && (
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                Próxima revisão sugerida: <b>{reviewDate}</b> — {reviewGap.why}
              </p>
            )}
            {reviewDateIso && activeBlock?.topicId && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    applyRevision.isPending || revisionRescheduledTo !== null
                  }
                  onClick={() =>
                    applyRevision.mutate(
                      {
                        topicId: activeBlock.topicId as number,
                        suggestedDate: reviewDateIso,
                      },
                      {
                        onSuccess: (result) => {
                          if (result.rescheduled) {
                            setRevisionRescheduledTo(result.newDate);
                            toast.success(
                              `Revisão reagendada para ${new Date(
                                `${result.newDate}T00:00:00`,
                              ).toLocaleDateString("pt-BR")}.`,
                            );
                          } else {
                            toast(
                              "Nenhuma revisão pendente deste tópico para reagendar.",
                            );
                          }
                        },
                        onError: (error) => toast.error(error.message),
                      },
                    )
                  }
                >
                  {applyRevision.isPending ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Clock className="mr-2 h-3.5 w-3.5" />
                  )}
                  Reagendar revisão
                </Button>
                {revisionRescheduledTo && (
                  <span className="text-[10px] text-emerald-500">
                    reagendada para{" "}
                    {new Date(
                      `${revisionRescheduledTo}T00:00:00`,
                    ).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={startQuestions}>
                <Target className="mr-2 h-3.5 w-3.5" /> Praticar no SOE
              </Button>
              <Button variant="outline" onClick={explain}>
                <Brain className="mr-2 h-3.5 w-3.5" /> IA explica
              </Button>
              {cadernoQuery.data?.url && (
                <Button
                  variant="outline"
                  onClick={() =>
                    void openTecBrowser(
                      pushTokenData?.token || "",
                      cadernoQuery.data?.url || undefined,
                    )
                  }
                >
                  <ExternalLink className="mr-2 h-3.5 w-3.5" /> TEC do caderno
                </Button>
              )}
              <Button
                variant="outline"
                onClick={async () => {
                  const tema = activeBlock?.topicName || activeBlock?.title;
                  if (!tema) return;
                  try {
                    await navigator.clipboard.writeText(tema);
                    toast.success("Tema copiado — cole na busca do TEC.");
                  } catch {
                    toast.error("Não foi possível copiar o tema.");
                  }
                }}
              >
                <ExternalLink className="mr-2 h-3.5 w-3.5" /> Copiar tema p/ TEC
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/question-errors")}
              >
                Revisar erros
              </Button>
              <Button className="ml-auto" onClick={() => navigate("/plan")}>
                <Play className="mr-2 h-3.5 w-3.5" /> Ver plano
              </Button>
            </div>
          </div>
        </div>
      )}{" "}
    </div>
  );
}
