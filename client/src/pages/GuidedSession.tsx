import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { openTecBrowser } from "@/lib/openTecBrowser";
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
} from "lucide-react";

type GuidedBlock = {
  id?: string;
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

  const { data: stats, refetch: refetchStats } =
    trpc.dashboard.getStats.useQuery();
  const { data: overview } = trpc.study.overview.useQuery(
    { minutes: Number((stats?.settings as any)?.dailyGoalMinutes) || 240 },
    { enabled: !!stats },
  );
  const { data: pushTokenData } = trpc.import.getICalUrl.useQuery();

  const apiKey = (stats?.settings as any)?.aiApiKey || "";
  const provider = (stats?.settings as any)?.aiProvider || "gemini";
  const recommendation = trpc.mentor.getMentorRecommendation.useQuery(
    { apiKey, provider },
    { enabled: !!apiKey, staleTime: 1000 * 60 * 30 },
  );

  const activeBlock = block || overview?.plan.blocks?.[0];

  useEffect(() => {
    if (phase !== "running" || !startedAt) return;
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [phase, startedAt]);

  const start = () => {
    setBefore(snapshot(stats));
    setStartedAt(Date.now());
    setElapsed(0);
    setPhase("running");
    try {
      localStorage.setItem(
        "soe_active_mission",
        JSON.stringify({ block: activeBlock, startedAt: Date.now() }),
      );
    } catch {}
    setTimeout(() => {
      void openTecBrowser(pushTokenData?.token || "");
    }, 250);
  };

  const finish = async () => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    const fresh = await refetchStats();
    setAfter(snapshot(fresh.data));
    setPhase("receipt");
    try {
      localStorage.removeItem("soe_active_mission");
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent("soe-guided-finished"));
    } catch {}
  };

  const questionDelta = Math.max(0, after.questions - before.questions);
  const accuracyDelta = after.accuracy - before.accuracy;
  const minutes = Math.max(0, Math.round(elapsed / 60));

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
                  onClick={() =>
                    void openTecBrowser(pushTokenData?.token || "")
                  }
                >
                  <ExternalLink className="mr-2 h-3.5 w-3.5" /> Abrir TEC
                </Button>
              </div>
            </div>
          </div>

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
              <Button onClick={finish} className="ml-auto">
                <Square className="mr-2 h-3.5 w-3.5" /> Encerrar sessão
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === "receipt" && (
        <div className="space-y-4">
          <div className="soe-card p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <h2 className="mt-2 text-xl font-semibold">Sessão encerrada</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {minutes} min de foco em {activeBlock?.title || "seu tema"}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Questões novas", value: questionDelta },
              { label: "Tempo", value: `${minutes} min` },
              {
                label: "Acurácia agora",
                value: `${after.accuracy}%`,
              },
              {
                label: "Variação",
                value: `${accuracyDelta >= 0 ? "+" : ""}${accuracyDelta}pp`,
              },
            ].map((item) => (
              <div key={item.label} className="soe-card p-4 text-center">
                <p className="text-lg font-semibold tabular-nums">
                  {item.value}
                </p>
                <p className="text-[9px] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>

          {questionDelta === 0 && (
            <div className="soe-card border-amber-500/20 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                <div>
                  <p className="text-xs font-semibold">
                    Nenhuma questão nova detectada.
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Se você respondeu no TEC, confira a linha “Última captura
                    TEC” no Treino e se o app está com a versão 6.1.6 ou
                    superior.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="soe-card p-5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Próximo passo
            </p>
            <p className="mt-2 text-sm">{actionPlan}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => navigate("/plan")}>
                <Play className="mr-2 h-3.5 w-3.5" /> Ver plano
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/question-errors")}
              >
                Revisar erros
              </Button>
              <Button variant="outline" onClick={explain}>
                <Brain className="mr-2 h-3.5 w-3.5" /> IA explica
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
