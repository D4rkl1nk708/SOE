import { useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { openTecBrowser } from "@/lib/openTecBrowser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useExams } from "@/hooks/useDashboard";
import { toast } from "sonner";
import {
  ArrowRight,
  Brain,
  CalendarDays,
  CheckCircle2,
  ClipboardX,
  Clock,
  Flame,
  Globe,
  Layers,
  Play,
  Sparkles,
  Star,
  Target,
  TrendingUp,
} from "lucide-react";

function Bar({
  value,
  color = "var(--primary)",
}: {
  value: number;
  color?: string;
}) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: color,
        }}
      />
    </div>
  );
}

export function HomeV2() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: me } = trpc.auth.me.useQuery();
  const examState = useExams();
  const { data: overview } = trpc.study.overview.useQuery({
    minutes: Number((stats?.settings as any)?.dailyGoalMinutes) || 240,
  });
  const { data: weekly } = trpc.study.weeklyReview.useQuery();
  const { data: pushTokenData } = trpc.import.getICalUrl.useQuery();
  const updateSettings = trpc.v10.updateV10Settings.useMutation({
    onSuccess: () => utils.dashboard.getStats.invalidate(),
    onError: (error) => toast.error(error.message),
  });

  const settings = (stats?.settings || {}) as any;
  const baseIds: number[] = Array.isArray(settings.baseDisciplineIds)
    ? settings.baseDisciplineIds
    : [];
  const focusBlock = overview?.plan?.blocks?.[0];
  const coverage = overview?.coverage;
  const base = overview?.base;
  const calibration = overview?.calibration;

  const apiKey = settings.aiApiKey || "";
  const provider = settings.aiProvider || "gemini";
  const recQuery = trpc.mentor.getMentorRecommendation.useQuery(
    { apiKey, provider },
    { enabled: !!apiKey, staleTime: 1000 * 60 * 30 },
  );
  const rec = recQuery.data as any;

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const exam = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (examState.exams || [])
      .filter((item) => item.date)
      .map((item) => ({
        ...item,
        days: Math.ceil(
          (new Date(`${item.date}T00:00:00`).getTime() - today.getTime()) /
            86400000,
        ),
      }))
      .filter((item) => item.days >= 0)
      .sort((a, b) => a.days - b.days)[0];
  }, [examState.exams]);

  const week = useMemo(() => {
    const log = (settings.studySessionLog || []) as Array<{
      date: string;
      durationMin?: number;
    }>;
    const byDate = new Map<string, number>();
    for (const session of log) {
      if (!session.date) continue;
      byDate.set(
        session.date,
        (byDate.get(session.date) || 0) + (Number(session.durationMin) || 0),
      );
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      const iso = date.toISOString().slice(0, 10);
      const minutes = byDate.get(iso) || 0;
      return {
        iso,
        label: new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
          .format(date)
          .replace(".", ""),
        day: date.getDate(),
        minutes,
        today: index === 6,
      };
    });
  }, [settings.studySessionLog]);

  const disciplines = ((stats?.disciplineStats || []) as any[])
    .slice()
    .sort((a, b) => {
      const aBase = baseIds.includes(a.disciplineId) ? 0 : 1;
      const bBase = baseIds.includes(b.disciplineId) ? 0 : 1;
      return aBase - bBase;
    });
  const baseSubjects = disciplines.slice(0, 6);

  const toggleBase = (disciplineId: number) => {
    const next = baseIds.includes(disciplineId)
      ? baseIds.filter((id) => id !== disciplineId)
      : [...baseIds, disciplineId];
    updateSettings.mutate({ baseDisciplineIds: next });
  };

  const startGuided = () => {
    if (!focusBlock) {
      navigate("/plan");
      return;
    }
    sessionStorage.setItem("soe_guided_block", JSON.stringify(focusBlock));
    navigate("/guided");
  };

  const explain = () => {
    const title = rec?.topicName || focusBlock?.title || "meu próximo passo";
    sessionStorage.setItem(
      "soe_mentor_prefill",
      `Me explique o tema "${title}" e por que ele é prioridade agora. Quais são as pegadinhas da banca e o que devo estudar primeiro?`,
    );
    navigate("/mentor");
  };

  const title =
    rec?.topicName || focusBlock?.title || "Defina sua próxima missão";
  const subtitle =
    rec?.diagnostic ||
    focusBlock?.reason ||
    "O mentor ainda está montando seu plano. Abra o plano para começar.";
  const editalPct = coverage?.weightedCoveragePct ?? 0;
  const basePct = base?.coveragePct ?? 0;
  const readiness = coverage?.readiness ?? 0;
  const todayMinutes = week[6]?.minutes || 0;
  const goalMinutes = Number(settings.dailyGoalMinutes) || 240;
  const pending = stats?.pendingRevisions || 0;
  const totalQuestions = ((stats?.disciplineStats || []) as any[]).reduce(
    (sum, discipline) => sum + (discipline.performance?.questionsResolved || 0),
    0,
  );
  const totalCorrect = ((stats?.disciplineStats || []) as any[]).reduce(
    (sum, discipline) => sum + (discipline.performance?.correctCount || 0),
    0,
  );
  const overallAccuracy =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {greeting}, {me?.name?.split(" ")[0] || "Estudante"}
          </h1>
          <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">
            {dateLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[9px] font-semibold text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]" />
            Base <b className="text-foreground">{basePct}%</b>
          </span>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[9px] font-semibold text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-amber)]" />
            Edital <b className="text-foreground">{editalPct}%</b>
          </span>
          {exam && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[9px] font-semibold text-muted-foreground">
              Prova em <b className="text-foreground">{exam.days}d</b>
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <section className="rounded-lg border border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_7%,var(--card)),var(--card))] p-5">
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
            <Sparkles size={13} /> Próxima missão
          </div>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
                {subtitle}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded border border-border bg-secondary/40 px-2 py-1 text-[9px] text-muted-foreground">
                  {focusBlock?.minutes || rec?.minutes || 25} min
                </span>
                <span className="rounded border border-border bg-secondary/40 px-2 py-1 text-[9px] text-muted-foreground">
                  10 questões
                </span>
                {focusBlock?.lens && (
                  <span className="rounded border border-border bg-secondary/40 px-2 py-1 text-[9px] capitalize text-muted-foreground">
                    {focusBlock.lens === "base"
                      ? "rotina base"
                      : focusBlock.lens}
                  </span>
                )}
                {focusBlock?.disciplineName && (
                  <span className="rounded border border-border bg-secondary/40 px-2 py-1 text-[9px] text-muted-foreground">
                    {focusBlock.disciplineName}
                  </span>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={startGuided}
                  className="h-8 text-[10px]"
                >
                  <Play size={12} className="mr-1.5" /> Começar sessão
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={explain}
                  className="h-8 text-[10px]"
                >
                  <Sparkles size={12} className="mr-1.5" /> Me explicar
                </Button>
                <button
                  onClick={() => navigate("/plan")}
                  className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  ver plano completo
                </button>
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-col items-center rounded-lg border border-border bg-card/70 px-3 py-3">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Prontidão
              </span>
              <span className="mt-1 text-2xl font-semibold tabular-nums text-primary">
                {readiness}%
              </span>
              <span className="text-[8px] uppercase tracking-wider text-muted-foreground">
                no edital
              </span>
            </div>
          </div>
        </section>

        <aside className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Seu estado
            </span>
            <span className="text-[9px] text-muted-foreground">hoje</span>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))] text-xs font-bold text-primary">
              {overallAccuracy}%
            </div>
            <div>
              <p className="text-xs font-semibold">Desempenho geral</p>
              <p className="text-[9.5px] leading-snug text-muted-foreground">
                {totalQuestions > 0
                  ? `${totalCorrect} acertos em ${totalQuestions} questões`
                  : "Registre questões para medir seu desempenho."}
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-2.5">
            <div>
              <div className="mb-1 flex justify-between text-[9.5px] text-muted-foreground">
                <span>Rotina base</span>
                <b className="text-foreground">{basePct}%</b>
              </div>
              <Bar value={basePct} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[9.5px] text-muted-foreground">
                <span>Edital</span>
                <b className="text-foreground">{editalPct}%</b>
              </div>
              <Bar value={editalPct} color="var(--accent-blue, #60a5fa)" />
            </div>
            <div className="flex items-center justify-between text-[9px] text-muted-foreground">
              <span className="truncate">{exam?.name || "Concurso alvo"}</span>
              <b className="text-foreground">{editalPct}%</b>
            </div>
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Esta semana
              </span>
              <span className="text-[9px] text-muted-foreground">
                {week.filter((day) => day.minutes > 0).length} de 7 dias
              </span>
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {week.map((day) => (
                <div
                  key={day.iso}
                  className={`rounded border py-1 text-center ${
                    day.today
                      ? "border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))]"
                      : "border-border bg-secondary/30"
                  }`}
                  title={`${day.minutes} min`}
                >
                  <span className="block text-[7px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {day.label}
                  </span>
                  <span className="block text-[10px] font-semibold">
                    {day.day}
                  </span>
                  <span
                    className="mx-auto mt-1 block h-0.5 w-3 rounded-full"
                    style={{
                      background:
                        day.minutes > 0 ? "var(--primary)" : "var(--border)",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={() =>
              exam ? examState.openEdit(exam) : examState.openCreate()
            }
            className="mt-3 flex w-full items-end justify-between border-t border-border pt-3 text-left"
            title={exam ? "Editar próxima prova" : "Adicionar prova"}
          >
            <div>
              <span className="text-[8.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Próxima prova
              </span>
              <p className="mt-0.5 text-[11px] font-semibold">
                {exam?.name || "Adicionar prova"}
              </p>
              <p className="text-[9px] text-muted-foreground">
                {exam
                  ? new Date(`${exam.date}T00:00:00`).toLocaleDateString(
                      "pt-BR",
                    )
                  : "defina no Plano"}
              </p>
            </div>
            <div className="text-right">
              <span className="block text-xl font-semibold tabular-nums">
                {exam?.days ?? "—"}
              </span>
              <span className="text-[8px] uppercase tracking-wider text-muted-foreground">
                dias
              </span>
            </div>
          </button>
        </aside>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Roteiro de hoje
            </span>
            <span className="text-[9px] text-muted-foreground">
              {overview?.plan?.plannedMinutes || 0} min
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {[
              {
                label: "Treino TEC",
                icon: Globe,
                action: () => void openTecBrowser(pushTokenData?.token || ""),
              },
              {
                label: "Simulado 10q",
                icon: ClipboardX,
                action: () => navigate("/simulado"),
              },
              { label: "Tirar dúvida", icon: Brain, action: explain },
              {
                label: "Revisar erros",
                icon: Target,
                action: () => navigate("/question-errors"),
              },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className="flex items-center gap-2 rounded border border-border bg-secondary/30 px-2.5 py-2 text-left text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <item.icon size={12} /> {item.label}
              </button>
            ))}
          </div>
          <div className="mt-2 divide-y divide-border">
            {(overview?.plan?.blocks || [])
              .slice(0, 3)
              .map((block: any, index: number) => (
                <button
                  key={block.id}
                  onClick={() => {
                    sessionStorage.setItem(
                      "soe_guided_block",
                      JSON.stringify(block),
                    );
                    navigate("/guided");
                  }}
                  className="flex w-full items-center gap-3 py-2 text-left"
                >
                  <span
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold ${
                      index === 0
                        ? "bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))] text-primary"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium">
                      {block.title}
                    </span>
                    <span className="block truncate text-[9px] text-muted-foreground">
                      {block.subtitle || block.reason}
                    </span>
                  </span>
                  {index === 0 && (
                    <span className="rounded border border-[color-mix(in_srgb,var(--primary)_25%,var(--border))] px-1.5 py-0.5 text-[7.5px] font-bold uppercase tracking-wider text-primary">
                      agora
                    </span>
                  )}
                  <span className="text-[9px] tabular-nums text-muted-foreground">
                    {block.minutes} min
                  </span>
                </button>
              ))}
            {!overview?.plan?.blocks?.length && (
              <p className="py-4 text-[11px] text-muted-foreground">
                Sem tarefas para hoje. Abra o plano para montar.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Esta semana
            </span>
            <span className="text-[9px] text-muted-foreground">recibo</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {[
              { label: "Questões", value: weekly?.answered ?? 0 },
              { label: "Acurácia", value: `${weekly?.accuracy ?? 0}%` },
              {
                label: "Tempo",
                value: `${Math.round((weekly?.minutes || 0) / 60)}h`,
              },
              { label: "Revisões", value: weekly?.revisionsCompleted ?? 0 },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded border border-border bg-secondary/20 px-2 py-1.5"
              >
                <span className="block text-[7.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </span>
                <b className="text-[12px] font-semibold">{item.value}</b>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[9.5px] leading-relaxed text-muted-foreground">
            {weekly?.risks?.[0] || "Manteve a base. Continue no ritmo atual."}
          </p>
          <div className="mt-2 border-t border-border pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[8.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Calibração
              </span>
              <span className="text-[8.5px] text-muted-foreground">
                {calibration?.calibrated || 0} tentativas
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[9px]">
              <span className="text-muted-foreground">
                Excesso de confiança
              </span>
              <b>{calibration?.overconfidence || 0}</b>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Matérias base
            </span>
            <button
              onClick={() => navigate("/profile#settings")}
              className="text-[9px] font-semibold text-primary hover:underline"
            >
              Gerenciar →
            </button>
          </div>
          <div className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {baseSubjects.map((discipline) => {
              const pct = Math.round(discipline.performance?.accuracy || 0);
              const isBase = baseIds.includes(discipline.disciplineId);
              return (
                <div
                  key={discipline.disciplineId}
                  className="flex items-center gap-2 border-b border-border py-2 last:border-b-0"
                >
                  <button
                    onClick={() => toggleBase(discipline.disciplineId)}
                    title={
                      isBase ? "Remover da rotina base" : "Marcar como base"
                    }
                    className={
                      isBase
                        ? "text-[var(--accent-amber)]"
                        : "text-muted-foreground/40"
                    }
                  >
                    <Star size={12} fill={isBase ? "currentColor" : "none"} />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium">
                    {discipline.name}
                  </span>
                  <span className="text-[9px] tabular-nums text-muted-foreground">
                    {pct}%
                  </span>
                  <span className="w-11">
                    <Bar
                      value={pct}
                      color={
                        pct >= 70
                          ? "var(--accent-green)"
                          : "var(--accent-amber)"
                      }
                    />
                  </span>
                </div>
              );
            })}
            {!baseSubjects.length && (
              <p className="py-3 text-[11px] text-muted-foreground">
                Cadastre disciplinas para começar.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Mapa do edital
            </span>
            <button
              onClick={() => navigate("/edital")}
              className="text-[9px] font-semibold text-primary hover:underline"
            >
              Abrir →
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
            {(coverage?.disciplines || [])
              .slice(0, 4)
              .map((discipline: any, index: number) => (
                <div key={`${discipline.name}-${index}`}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[9.5px] font-medium">
                      {discipline.name}
                    </span>
                    <span className="text-[8px] tabular-nums text-muted-foreground">
                      {Math.round(discipline.weightedCoverage)}%
                    </span>
                  </div>
                  <div className="mt-1">
                    <Bar
                      value={discipline.weightedCoverage}
                      color={
                        discipline.weightedCoverage >= 70
                          ? "var(--accent-green)"
                          : "var(--accent-amber)"
                      }
                    />
                  </div>
                </div>
              ))}
          </div>
          <div className="mt-2 rounded border border-border bg-secondary/20 px-2 py-1.5 text-[8.5px] leading-relaxed text-muted-foreground">
            <b className="text-foreground">Onde você ganha mais nota:</b>{" "}
            concentre nas lacunas de maior peso.
          </div>
        </section>
      </div>

      <Dialog
        open={examState.dialogOpen}
        onOpenChange={examState.setDialogOpen}
      >
        <DialogContent className="rounded-lg border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {examState.editingId ? "Editar prova" : "Adicionar prova"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Nome e data da prova. O Início usa isso para calcular os dias
              restantes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Nome
              </Label>
              <Input
                value={examState.examNameInput}
                onChange={(event) =>
                  examState.setExamNameInput(event.target.value)
                }
                placeholder="Ex: TCE/MS — Auditor"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Data
              </Label>
              <Input
                type="date"
                value={examState.examDateInput}
                onChange={(event) =>
                  examState.setExamDateInput(event.target.value)
                }
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {examState.editingId && (
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => examState.handleRemove(examState.editingId!)}
              >
                Excluir
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => examState.setDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={examState.handleSave}
              disabled={examState.isSaving}
            >
              {examState.isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
