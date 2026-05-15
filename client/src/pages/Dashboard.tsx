import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import { useState } from "react";
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

const EXTRA_WIDGETS = [
  { id: "recommendation", label: "Recomendação (IA)" },
  { id: "heatmap", label: "Histórico de Estudos" },
  { id: "dailyGoal", label: "Meta Diária" },
  { id: "todayRevisions", label: "Revisar Hoje" },
  { id: "quickActions", label: "Ações Rápidas" },
  { id: "notes", label: "Lembrete de Notas" },
  { id: "plateauRadar", label: "Radar de Estagnação" },
];

export default function Dashboard() {
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

  const [expandedDiscipline, setExpandedDiscipline] = useState<number | null>(
    null,
  );
  const [customizeOpen, setCustomizeOpen] = useState(false);

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

  const sortedExams = [...exams.exams].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const nowDate = new Date();
  const nextUpcomingExam =
    sortedExams.find((e) => differenceInDays(parseISO(e.date), nowDate) >= 0) ||
    sortedExams[0] ||
    null;
  const examDate = nextUpcomingExam ? parseISO(nextUpcomingExam.date) : null;
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

  return (
    <div className="space-y-8 w-full pb-10">
      {showOnboarding && (
        <OnboardingWizard
          onComplete={() => utils.dashboard.getStats.invalidate()}
        />
      )}

      <PreExamBanner />
      <SleepWarning />
      <MassStudyAlert />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Painel
          </h1>
          <p className="text-sm text-muted-foreground">
            Gestão centralizada do seu desempenho.
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none h-10 rounded-md bg-secondary/50 border-border text-[10px] font-bold uppercase tracking-wider"
            onClick={() => setCustomizeOpen(true)}
          >
            <LayoutDashboard size={14} className="mr-2 opacity-60" />{" "}
            Personalizar
          </Button>
          <Button
            variant="outline"
            className="flex-1 sm:flex-none h-10 rounded-md bg-secondary/50 border-border text-[10px] font-bold uppercase tracking-wider"
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
          <div className="absolute top-4 right-4 opacity-5">
            <Target size={40} />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground opacity-60 mb-2">
              Próxima Prova
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-amber-500">
                {daysToExam !== null && daysToExam >= 0 ? daysToExam : "—"}
              </span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-40">
                Dias
              </span>
            </div>
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
                <div className="flex items-center gap-4">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="font-bold text-[13px] text-foreground/90">
                    {d.name}
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
    </div>
  );
}
