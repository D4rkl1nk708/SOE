import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { openTecBrowser } from "@/lib/openTecBrowser";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Clock,
  CheckCircle2,
  Upload,
  Trophy,
  Target,
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Calendar,
  ArrowRight,
  Globe,
  Play,
  Layers,
  Star,
  ClipboardX,
  Sparkles,
} from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import { StudyHeatmap } from "@/components/StudyHeatmap";
import { DailyGoalWidget, TodayRevisions } from "@/components/DashboardWidgets";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { PreExamBanner } from "@/components/PreExamBanner";
import { MassStudyAlert } from "@/components/MassStudyAlert";
import { SleepWarning } from "@/components/SleepWarning";
import { ConfusionMatrixWidget } from "@/components/ConfusionMatrixWidget";
import { PlateauRadarWidget } from "@/components/PlateauRadarWidget";
import {
  useExams,
  useScheduleSettings,
  useTecImport,
  useQuestionsDialog,
  useDragReorder,
  useDashboardWidgets,
  formatStudyTime,
  type DisciplineStat,
} from "@/hooks/useDashboard";
import { ScheduleDialog } from "@/components/ScheduleDialog";
import { RecommendationCard } from "@/components/RecommendationCard";
import { HomeV2 } from "@/components/home/HomeV2";

const EXTRA_WIDGETS = [
  { id: "recommendation", label: "Recomendação (IA)" },
  { id: "heatmap", label: "Histórico de Estudos" },
  { id: "dailyGoal", label: "Meta Diária" },
  { id: "todayRevisions", label: "Revisar Hoje" },
  { id: "quickActions", label: "Ações Rápidas" },
  { id: "notes", label: "Lembrete de Notas" },
  { id: "plateauRadar", label: "Radar de Estagnação" },
];

function ClassicDashboard() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading } = trpc.dashboard.getStats.useQuery();
  const { data: heatmapData } = trpc.dashboard.getHeatmap.useQuery({
    months: 5,
  });

  const exams = useExams();
  const schedule = useScheduleSettings(() =>
    utils.dashboard.getStats.invalidate(),
  );
  const tec = useTecImport();
  const questions = useQuestionsDialog();
  const drag = useDragReorder(
    (stats?.disciplineStats ?? []) as DisciplineStat[],
  );
  const widgets = useDashboardWidgets(
    stats?.settings as unknown as Record<string, unknown> | null,
  );
  const [, navigate] = useLocation();
  const dailyGoalMinutes =
    Number(
      (stats?.settings as Record<string, unknown> | undefined)
        ?.dailyGoalMinutes,
    ) || 240;
  const { data: overview } = trpc.study.overview.useQuery({
    minutes: dailyGoalMinutes,
  });
  const { data: pushTokenData } = trpc.import.getICalUrl.useQuery();
  const focusBlock = overview?.plan.blocks?.[0];

  const [expandedDiscipline, setExpandedDiscipline] = useState<number | null>(
    null,
  );
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [baseDisciplineIds, setBaseDisciplineIds] = useState<number[]>([]);
  const updateBaseSettings = trpc.v10.updateV10Settings.useMutation({
    onSuccess: () => utils.dashboard.getStats.invalidate(),
    onError: (error) => toast.error(error.message),
  });

  const savedBaseIds = (stats?.settings as any)?.baseDisciplineIds;
  useEffect(() => {
    if (!Array.isArray(savedBaseIds)) return;
    setBaseDisciplineIds((current) =>
      current.length === savedBaseIds.length &&
      current.every((id, index) => id === savedBaseIds[index])
        ? current
        : savedBaseIds,
    );
  }, [JSON.stringify(savedBaseIds)]);

  const toggleBaseDiscipline = (disciplineId: number) => {
    const next = baseDisciplineIds.includes(disciplineId)
      ? baseDisciplineIds.filter((id) => id !== disciplineId)
      : [...baseDisciplineIds, disciplineId];
    setBaseDisciplineIds(next);
    updateBaseSettings.mutate({ baseDisciplineIds: next });
  };

  if (isLoading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] font-bold uppercase tracking-widest">
            Carregando...
          </p>
        </div>
      </div>
    );

  const sortedExams = [...(exams.exams || [])].sort((a, b) =>
    (a.date || "").localeCompare(b.date || ""),
  );
  const nowDate = new Date();
  const nextUpcomingExam =
    sortedExams.find(
      (e) => e.date && differenceInDays(parseISO(e.date), nowDate) >= 0,
    ) ||
    sortedExams[0] ||
    null;
  const examDate =
    nextUpcomingExam?.date && !isNaN(parseISO(nextUpcomingExam.date).getTime())
      ? parseISO(nextUpcomingExam.date)
      : null;
  const daysToExam = examDate ? differenceInDays(examDate, nowDate) : null;
  const totalStudyTime = drag.orderedStats.reduce(
    (acc, d) => acc + (d.studyTimeSeconds || 0),
    0,
  );
  const totalQuestions = drag.orderedStats.reduce(
    (acc, d) => acc + (d.performance?.questionsResolved || 0),
    0,
  );
  const totalCorrect = drag.orderedStats.reduce(
    (acc, d) => acc + (d.performance?.correctCount || 0),
    0,
  );
  const avgAccuracy =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const accuracyColor =
    avgAccuracy >= 70
      ? "var(--accent-green)"
      : avgAccuracy >= 50
        ? "var(--accent-amber)"
        : "var(--accent-red)";

  const onboardingCompleted = (
    stats?.settings as Record<string, unknown> | undefined
  )?.onboardingCompleted as boolean | undefined;
  const hasAnyDisciplines = (stats?.disciplineStats ?? []).length > 0;
  const showOnboarding =
    !isLoading && !onboardingCompleted && !hasAnyDisciplines;

  const startFocus = (block: any) => {
    if (!block) {
      navigate("/plan");
      return;
    }
    if (block.kind === "mapear") {
      navigate("/edital");
      return;
    }
    sessionStorage.setItem("soe_guided_block", JSON.stringify(block));
    navigate("/guided");
  };

  return (
    <div className="space-y-6 w-full pb-10">
      {showOnboarding && (
        <OnboardingWizard
          onComplete={() => utils.dashboard.getStats.invalidate()}
        />
      )}

      <PreExamBanner />
      <SleepWarning />
      <MassStudyAlert />

      <PageHeader
        eyebrow="Visão geral"
        title="Painel"
        description="O essencial para decidir o próximo passo — sem ruído."
        actions={
          <>
            <Button
              variant="outline"
              className="h-9 rounded-md bg-secondary/50 border-border text-[10px] font-bold uppercase tracking-wider"
              onClick={() => setCustomizeOpen(true)}
            >
              <LayoutDashboard size={14} className="mr-2 opacity-60" />{" "}
              Personalizar
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-md bg-secondary/50 border-border text-[10px] font-bold uppercase tracking-wider"
              disabled={tec.isImporting}
              onClick={() => tec.setDialogOpen(true)}
            >
              <Upload size={14} className="mr-2 opacity-60" />{" "}
              {tec.isImporting ? "..." : "Importar"}
            </Button>
            <input
              ref={tec.fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls"
              onChange={tec.handleFileUpload}
            />
          </>
        }
      />

      <div className="soe-card overflow-hidden border-primary/20 bg-[var(--primary-bg-subtle)]">
        <div className="grid gap-6 p-5 md:grid-cols-[1.35fr_1fr] md:p-6">
          <div className="flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
                  Foco agora
                </span>
                {overview && (
                  <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                    {overview.coverage.weightedCoveragePct}% do edital coberto
                  </span>
                )}
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
                {focusBlock?.title || "Defina seu próximo passo"}
              </h2>
              <p className="max-w-xl text-xs text-muted-foreground md:text-sm">
                {focusBlock?.reason ||
                  "Importe o edital ou abra o plano para o SOE montar seu roteiro do dia."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-9 rounded-md text-[10px] font-bold uppercase tracking-wider"
                onClick={() => startFocus(focusBlock)}
              >
                <Play size={13} className="mr-2" />
                {focusBlock ? "Começar agora" : "Montar plano"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-md text-[10px] font-bold uppercase tracking-wider"
                onClick={() => navigate("/plan")}
              >
                Ver plano completo <ArrowRight size={13} className="ml-2" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-md text-[10px] font-bold uppercase tracking-wider"
                onClick={() => void openTecBrowser(pushTokenData?.token || "")}
              >
                <Globe size={13} className="mr-2" /> Abrir TEC
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-md text-[10px] font-bold uppercase tracking-wider"
                onClick={() => navigate("/simulado")}
              >
                <ClipboardX size={13} className="mr-2" /> Simulado
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-md text-[10px] font-bold uppercase tracking-wider"
                onClick={() => {
                  const block = focusBlock;
                  sessionStorage.setItem(
                    "soe_mentor_prefill",
                    block
                      ? `Me explique o foco de hoje: ${block.title}. Motivo: ${block.reason}. O que preciso entender e como praticar?`
                      : "Me diga o que estudar agora e por quê, olhando meu desempenho atual.",
                  );
                  navigate("/mentor");
                }}
              >
                <Sparkles size={13} className="mr-2" /> IA explica
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Roteiro de hoje
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground">
                {overview?.plan.plannedMinutes || 0}min
              </span>
            </div>
            {overview?.plan.blocks?.length ? (
              <div className="space-y-2">
                {overview.plan.blocks
                  .slice(0, 3)
                  .map((block: any, index: number) => (
                    <button
                      key={block.id}
                      onClick={() => startFocus(block)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary/50"
                    >
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-secondary text-[9px] font-bold text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground/90">
                        {block.title}
                      </span>
                      <span className="text-[9px] font-medium text-muted-foreground">
                        {block.minutes}min
                      </span>
                    </button>
                  ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 py-4 text-[11px] text-muted-foreground">
                <Layers size={14} /> Sem tarefas para hoje.
              </div>
            )}
          </div>
        </div>
      </div>

      {widgets.showExtra("recommendation") && <RecommendationCard />}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {/* Aproveitamento */}
        <div className="soe-card p-5 flex flex-col justify-between relative group">
          <div className="absolute top-4 right-4 opacity-5">
            <Trophy size={40} />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground opacity-60 mb-2">
              Aproveitamento
            </p>
            <span
              className="text-3xl font-bold tabular-nums"
              style={{ color: accuracyColor }}
            >
              {avgAccuracy}%
            </span>
          </div>
          <div className="mt-6 space-y-2">
            <div className="h-1 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${avgAccuracy}%`,
                  backgroundColor: accuracyColor,
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider opacity-40">
              {totalQuestions} questões resolvidas
            </p>
          </div>
        </div>

        {/* Revisões */}
        <div className="soe-card p-5 flex flex-col justify-between relative group">
          <div className="absolute top-4 right-4 opacity-5">
            <CheckCircle2 size={40} />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground opacity-60 mb-2">
              Revisões
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-emerald-500">
                {stats?.completedRevisions || 0}
              </span>
              <span className="text-[10px] font-bold text-muted-foreground opacity-30">
                / {stats?.pendingRevisions || 0}
              </span>
            </div>
          </div>
          <div className="mt-6 flex gap-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full"
                style={{
                  background:
                    i < (stats?.completedRevisions || 0) / 5
                      ? "var(--accent-green)"
                      : "var(--border)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Tempo de Estudo */}
        <div className="flex flex-col gap-4">
          <div
            className={`soe-card p-5 flex flex-col justify-between relative group ${widgets.showExtra("dailyGoal") ? "" : "h-full"}`}
          >
            <div className="absolute top-4 right-4 opacity-5">
              <Clock size={36} />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground opacity-60 mb-2">
                Tempo de Estudo
              </p>
              <span className="text-3xl font-bold tabular-nums text-primary">
                {formatStudyTime(totalStudyTime)}
              </span>
            </div>
            {!widgets.showExtra("dailyGoal") && (
              <div className="mt-6">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider opacity-40">
                  {stats?.totalTopics || 0} temas catalogados
                </p>
              </div>
            )}
          </div>

          {widgets.showExtra("dailyGoal") && <DailyGoalWidget />}
        </div>

        {/* Próxima Prova */}
        <div
          className="soe-card p-5 flex flex-col justify-between relative group cursor-pointer hover:bg-secondary/30 transition-all border-amber-500/10"
          onClick={() => exams.openCreate()}
        >
          <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Target size={40} className="text-amber-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground opacity-60">
                Próxima Prova
              </p>
              <span className="text-[9px] font-semibold text-amber-500/80 group-hover:text-amber-400 transition-colors">
                {exams.exams && exams.exams.length > 0
                  ? "Gerenciar"
                  : "+ Adicionar"}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-amber-500">
                {daysToExam !== null && daysToExam >= 0 ? daysToExam : "—"}
              </span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-40">
                Dias
              </span>
            </div>
            {nextUpcomingExam && (
              <p className="text-xs font-semibold text-foreground/80 truncate mt-1.5">
                {nextUpcomingExam.name}
              </p>
            )}
          </div>
        </div>
      </div>

      {widgets.showExtra("heatmap") && (
        <div className="soe-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
              Frequência de Estudo
            </h3>
          </div>
          <StudyHeatmap logs={heatmapData as any} compact showStreakCard />
        </div>
      )}

      <div className="soe-card overflow-hidden border-border/50">
        <div className="divide-y divide-border/30">
          {drag.orderedStats.map((d) => (
            <div key={d.disciplineId}>
              <div
                className="cursor-pointer px-5 py-4 hover:bg-secondary/20 transition-all flex justify-between items-center"
                onClick={() =>
                  setExpandedDiscipline(
                    expandedDiscipline === d.disciplineId
                      ? null
                      : d.disciplineId,
                  )
                }
              >
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleBaseDiscipline(d.disciplineId);
                    }}
                    title={
                      baseDisciplineIds.includes(d.disciplineId)
                        ? "Remover da rotina base"
                        : "Marcar como matéria base"
                    }
                    className={`flex-shrink-0 rounded p-0.5 transition-colors ${
                      baseDisciplineIds.includes(d.disciplineId)
                        ? "text-amber-400"
                        : "text-muted-foreground/30 hover:text-amber-400"
                    }`}
                  >
                    <Star
                      size={14}
                      fill={
                        baseDisciplineIds.includes(d.disciplineId)
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>
                  <div
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="truncate text-[13px] font-bold text-foreground/90">
                    {d.name}
                  </span>
                  <span className="text-[10px] font-semibold tabular-nums text-muted-foreground/30">
                    {Math.round(d.performance?.accuracy || 0)}%
                  </span>
                </div>
                {expandedDiscipline === d.disciplineId ? (
                  <ChevronDown size={14} className="text-muted-foreground" />
                ) : (
                  <ChevronRight size={14} className="text-muted-foreground" />
                )}
              </div>
              {expandedDiscipline === d.disciplineId && (
                <div className="px-5 pb-5 pt-1 space-y-2">
                  {(d.topics ?? []).map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-md bg-secondary/30 border border-border/40 flex justify-between items-center cursor-pointer hover:bg-secondary/50 transition-all"
                      onClick={() => questions.openDialog(t)}
                    >
                      <span className="text-[11px] font-bold text-foreground/80">
                        {t.name}
                      </span>
                      <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
                        {t.performance?.accuracy ?? 0}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {widgets.showExtra("plateauRadar") && <PlateauRadarWidget />}
          <ConfusionMatrixWidget />
        </div>
        <div className="lg:col-span-3 space-y-6">
          {widgets.showExtra("todayRevisions") && <TodayRevisions />}
        </div>
      </div>

      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="rounded-lg border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Personalizar Painel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {EXTRA_WIDGETS.map((w) => (
              <Button
                key={w.id}
                variant="ghost"
                className="w-full justify-between h-10 px-4 rounded-md text-[11px] font-bold uppercase tracking-wider"
                onClick={() => widgets.toggleExtra(w.id)}
              >
                {w.label}{" "}
                {widgets.showExtra(w.id) ? (
                  <Eye size={14} className="text-primary" />
                ) : (
                  <EyeOff size={14} className="opacity-30" />
                )}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ScheduleDialog
        open={schedule.scheduleDialogOpen}
        onOpenChange={schedule.setScheduleDialogOpen}
        testInterval={schedule.testIntervalInput}
        setTestInterval={schedule.setTestIntervalInput}
        revisionInterval={schedule.revisionIntervalInput}
        setRevisionInterval={schedule.setRevisionIntervalInput}
        revisionSecondPhase={schedule.revisionSecondPhaseInput}
        setRevisionSecondPhase={schedule.setRevisionSecondPhaseInput}
        onSave={schedule.handleSaveSchedule}
        isSaving={schedule.isSaving}
      />

      <Dialog open={questions.open} onOpenChange={questions.setOpen}>
        <DialogContent className="rounded-lg border-border bg-card max-w-lg md:max-w-[50%]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Lançar Questões
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                Acertos
              </label>
              <Input
                type="number"
                placeholder="Ex: 10"
                value={questions.correctInput}
                onChange={(e) => questions.setCorrectInput(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                Erros
              </label>
              <Input
                type="number"
                placeholder="Ex: 2"
                value={questions.wrongInput}
                onChange={(e) => questions.setWrongInput(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full h-10 rounded-md font-bold text-[10px] uppercase tracking-wider"
              onClick={questions.handleSave}
            >
              Salvar Desempenho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Gerenciamento de Provas */}
      <Dialog open={exams.dialogOpen} onOpenChange={exams.setDialogOpen}>
        <DialogContent className="rounded-xl border-border bg-card max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Target size={18} className="text-amber-500" />
              {exams.editingId
                ? "Editar Prova"
                : "Gerenciar Provas / Concursos"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Cadastre a data da sua prova para ativar a contagem regressiva e
              as recomendações do Modo Pré-Prova.
            </DialogDescription>
          </DialogHeader>

          {/* Lista de provas cadastradas */}
          {exams.exams && exams.exams.length > 0 && !exams.editingId && (
            <div className="space-y-2 mb-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-70">
                Provas Cadastradas
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {exams.exams.map((ex: any) => {
                  const dDate = ex.date ? parseISO(ex.date) : null;
                  const diff =
                    dDate && !isNaN(dDate.getTime())
                      ? differenceInDays(dDate, nowDate)
                      : null;
                  return (
                    <div
                      key={ex.id}
                      className="p-3 rounded-lg bg-secondary/40 border border-border/50 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-foreground truncate">
                          {ex.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {ex.date}{" "}
                          {diff !== null
                            ? `(${diff >= 0 ? `${diff} dias restantes` : "Encerrada"})`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => exams.openEdit(ex)}
                          title="Editar"
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => exams.handleRemove(ex.id)}
                          title="Excluir"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Formulário de cadastro / edição */}
          <div className="space-y-3.5 py-1">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-70">
                Nome do Concurso / Prova
              </label>
              <Input
                placeholder="Ex: CNU - Bloco 4, PF, Receita Federal..."
                value={exams.examNameInput}
                onChange={(e) => exams.setExamNameInput(e.target.value)}
                className="bg-secondary/50 border-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-70">
                  Data da Prova
                </label>
                <Input
                  type="date"
                  value={exams.examDateInput}
                  onChange={(e) => exams.setExamDateInput(e.target.value)}
                  className="bg-secondary/50 border-border"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-70">
                  Meta (%)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={exams.examTargetInput}
                  onChange={(e) => exams.setExamTargetInput(e.target.value)}
                  className="bg-secondary/50 border-border"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center gap-2 mt-2">
            {exams.editingId && (
              <Button
                variant="ghost"
                className="h-10 text-xs font-semibold"
                onClick={() => exams.openCreate()}
              >
                Cancelar Edição
              </Button>
            )}
            <Button
              className="flex-1 h-10 rounded-md font-bold text-xs uppercase tracking-wider bg-amber-600 hover:bg-amber-500 text-white"
              onClick={exams.handleSave}
              disabled={exams.isSaving}
            >
              {exams.isSaving
                ? "Salvando..."
                : exams.editingId
                  ? "Atualizar Prova"
                  : "Cadastrar Prova"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const layoutMode = (stats?.settings as any)?.layoutMode;
  if (layoutMode === "classic") return <ClassicDashboard />;
  return <HomeV2 />;
}
