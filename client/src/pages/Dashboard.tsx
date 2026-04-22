import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  BookOpen, Clock, CheckCircle2, TrendingUp, Upload, Trophy, Target,
  Settings2, Pencil, Trash2, ChevronDown, ChevronRight, AlertCircle,
  LayoutDashboard, Eye, EyeOff, Plus, Brain, Library, FileText, BarChart2,
  AlertTriangle, BookMarked, Crosshair, ListChecks, Save, Check, X as XIcon,
} from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useState, useRef } from "react";
import { StudyHeatmap } from "@/components/StudyHeatmap";
import { DailyGoalWidget, TodayRevisions } from "@/components/DashboardWidgets";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { PreExamBanner } from "@/components/PreExamBanner";
import { MassStudyAlert } from "@/components/MassStudyAlert";
import { SleepWarning } from "@/components/SleepWarning";
import { EmotionLogger } from "@/components/EmotionLogger";
import { MentorBriefing } from "@/components/MentorBriefing";
import {
  useExams,
  useScheduleSettings,
  useTecImport,
  useQuestionsDialog,
  useDragReorder,
  useDashboardWidgets,
  useTimeEdit,
  formatStudyTime,
  type DisciplineStat,
} from "@/hooks/useDashboard";
import { ScheduleDialog } from "@/components/ScheduleDialog";

// ─── widget IDs ─────────────────────────────────────────────────────────────
const EXTRA_WIDGETS = [
  { id: "mentorBriefing", label: "Briefing da IA" },
  { id: "heatmap",        label: "Histórico de Estudos" },
  { id: "dailyGoal",      label: "Meta Diária" },
  { id: "todayRevisions", label: "Revisar Hoje" },
  { id: "quickActions",   label: "Ações Rápidas" },
  { id: "notes",          label: "Lembrete de Notas" },
];

export default function Dashboard() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading } = trpc.dashboard.getStats.useQuery();
  const { data: notes } = trpc.note.list.useQuery();
  const { data: heatmapData } = trpc.dashboard.getHeatmap.useQuery({ months: 5 });

  // ─── Custom hooks ────────────────────────────────────────────────────────
  const exams = useExams();
  const schedule = useScheduleSettings(() => utils.dashboard.getStats.invalidate());
  const tec = useTecImport();
  const questions = useQuestionsDialog();
  const drag = useDragReorder((stats?.disciplineStats ?? []) as DisciplineStat[]);
  const widgets = useDashboardWidgets(stats?.settings as unknown as Record<string, unknown> | null);
  const timeEdit = useTimeEdit();

  const [expandedDiscipline, setExpandedDiscipline] = useState<number | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Mutation for TEC error origin classification (used in TEC error queue dialog)
  const setTecPerf = trpc.topic.setPerformance.useMutation({
    onError: (err) => toast.error(err.message),
  });

  // Onboarding
  const onboardingCompleted = (stats?.settings as Record<string, unknown> | undefined)?.onboardingCompleted as boolean | undefined;
  const hasAnyDisciplines = (stats?.disciplineStats ?? []).length > 0;
  const showOnboarding = !isLoading && !onboardingCompleted && !hasAnyDisciplines;

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3" style={{ color: "var(--muted-text)" }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
        <p className="text-sm tracking-wide">Carregando...</p>
      </div>
    </div>
  );

  const sortedExams = [...exams.exams].sort((a, b) => a.date.localeCompare(b.date));
  const nowDate = new Date();
  const nextUpcomingExam = sortedExams.find(e => differenceInDays(parseISO(e.date), nowDate) >= 0) || sortedExams[0] || null;
  const examDate = nextUpcomingExam ? parseISO(nextUpcomingExam.date) : null;
  const daysToExam = examDate ? differenceInDays(examDate, nowDate) : null;
  const totalStudyTime = drag.orderedStats.reduce((acc, d) => acc + (d.studyTimeSeconds || 0), 0);
  const totalQuestions = drag.orderedStats.reduce((acc, d) => acc + (d.performance?.questionsResolved || 0), 0);
  const totalCorrect = drag.orderedStats.reduce((acc, d) => acc + (d.performance?.correctCount || 0), 0);
  const avgAccuracy = totalQuestions > 0
    ? Math.round((totalCorrect / totalQuestions) * 100)
    : 0;
  const accuracyColor = avgAccuracy >= 70 ? "var(--accent-green)" : avgAccuracy >= 50 ? "var(--accent-amber)" : "var(--accent-red, #dc2626)";

  return (
    <div className="space-y-6 w-full pb-10">
      {showOnboarding && <OnboardingWizard onComplete={() => utils.dashboard.getStats.invalidate()} />}

      <PreExamBanner />
      <SleepWarning />
      <MassStudyAlert />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2.5" style={{ color: "var(--app-fg)" }}>
            Painel
          </h1>
          <p className="text-sm opacity-60">Gestão centralizada do seu desempenho.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" size="lg" className="flex-1 sm:flex-none h-11 rounded-2xl bg-white/5 border-white/5 text-[10px] font-black uppercase tracking-widest" onClick={() => setCustomizeOpen(true)}>
            <LayoutDashboard className="h-4 w-4 mr-2 opacity-40" /> Personalizar
          </Button>
          <Button variant="outline" size="lg" className="flex-1 sm:flex-none h-11 rounded-2xl bg-white/5 border-white/5 text-[10px] font-black uppercase tracking-widest" disabled={tec.isImporting} onClick={() => tec.setDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2 opacity-40" /> {tec.isImporting ? "..." : "Importar"}
          </Button>
          <input ref={tec.fileInputRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={tec.handleFileUpload} />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <div className="soe-card p-4 md:p-6 flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 md:p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Trophy className="w-10 h-10 md:w-12 md:h-12" />
            </div>
            <div>
              <p className="text-[9px] md:text-[10px] font-black tracking-widest uppercase mb-1 opacity-60">Aproveitamento</p>
              <span className="text-3xl md:text-4xl font-black tabular-nums" style={{ color: accuracyColor }}>{avgAccuracy}%</span>
            </div>
            <div className="mt-3 md:mt-4">
              <Progress value={avgAccuracy} className="h-1.5" />
              <p className="text-[10px] md:text-xs mt-2 opacity-60 font-medium">{totalQuestions} questões resolvidas</p>
            </div>
        </div>

        <div className="soe-card p-4 md:p-6 flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 md:p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <CheckCircle2 className="w-10 h-10 md:w-12 md:h-12" />
            </div>
            <div>
              <p className="text-[9px] md:text-[10px] font-black tracking-widest uppercase mb-1 opacity-60">Revisões</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl md:text-4xl font-black tabular-nums text-emerald-500">{stats?.completedRevisions || 0}</span>
                <span className="text-xs font-bold opacity-40">/ {stats?.pendingRevisions || 0}</span>
              </div>
            </div>
            <div className="mt-3 md:mt-4 flex gap-1 md:gap-1.5">
              {Array.from({length: 6}).map((_, i) => (
                <div key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < (stats?.completedRevisions || 0) / 10 ? 'var(--accent-green)' : 'var(--card-border)' }} />
              ))}
            </div>
        </div>

        <div className="soe-card p-4 md:p-6 flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 md:p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Clock className="w-10 h-10 md:w-12 md:h-12" />
            </div>
            <div>
              <p className="text-[9px] md:text-[10px] font-black tracking-widest uppercase mb-1 opacity-60">Tempo de Estudo</p>
              <span className="text-3xl md:text-4xl font-black tabular-nums" style={{ color: "var(--primary)" }}>{formatStudyTime(totalStudyTime)}</span>
            </div>
            <div className="mt-3 md:mt-4">
              <p className="text-[10px] md:text-xs opacity-60 font-medium truncate">{stats?.totalTopics || 0} temas catalogados</p>
            </div>
        </div>

        <div className="soe-card p-4 md:p-6 flex flex-col justify-between relative overflow-hidden group cursor-pointer hover:bg-white/[0.02] transition-all border-amber-500/10"
          onClick={() => exams.openCreate()}>
            <div className="absolute top-0 right-0 p-3 md:p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Target className="w-10 h-10 md:w-12 md:h-12" />
            </div>
            <div>
              <p className="text-[9px] md:text-[10px] font-black tracking-widest uppercase mb-1 opacity-60">Próxima Prova</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl md:text-4xl font-black tabular-nums" style={{ color: "var(--accent-amber)" }}>
                  {daysToExam !== null && daysToExam >= 0 ? daysToExam : "—"}
                </span>
                <span className="text-[10px] md:text-xs font-black opacity-40 uppercase tracking-widest">Dias</span>
              </div>
            </div>
        </div>
      </div>

      {widgets.showExtra("heatmap") && (
        <div className="soe-card p-6">
          <StudyHeatmap logs={heatmapData as any} compact showStreakCard />
        </div>
      )}

      <div className="soe-card overflow-hidden">
        <div className="p-3 space-y-3">
          {drag.orderedStats.map((d) => (
            <div key={d.disciplineId}>
              <div className="cursor-pointer rounded-2xl px-4 py-4 hover:bg-white/[0.03] transition-all flex justify-between items-center"
                onClick={() => setExpandedDiscipline(expandedDiscipline === d.disciplineId ? null : d.disciplineId)}>
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="font-black text-sm">{d.name}</span>
                </div>
                {expandedDiscipline === d.disciplineId ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
              {expandedDiscipline === d.disciplineId && (
                <div className="mx-4 mb-4 space-y-2">
                  {(d.topics ?? []).map(t => (
                    <div key={t.id} className="p-4 rounded-xl bg-white/5 flex justify-between items-center cursor-pointer hover:bg-white/10" onClick={() => questions.openDialog(t)}>
                      <span className="text-xs font-bold">{t.name}</span>
                      <span className="text-xs opacity-40">{t.performance?.accuracy ?? 0}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {widgets.showExtra("mentorBriefing") && <div className="lg:col-span-1"><MentorBriefing /></div>}
        <div className="lg:col-span-3 space-y-6">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {widgets.showExtra("dailyGoal") && <DailyGoalWidget />}
              {widgets.showExtra("todayRevisions") && <TodayRevisions />}
           </div>
        </div>
      </div>

      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Personalizar</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {EXTRA_WIDGETS.map(w => (
              <Button key={w.id} variant="ghost" className="w-full justify-between" onClick={() => widgets.toggleExtra(w.id)}>
                {w.label} {widgets.showExtra(w.id) ? <Eye size={14} /> : <EyeOff size={14} />}
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
        <DialogContent>
          <DialogHeader><DialogTitle>Questões</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <Input type="number" placeholder="Acertos" value={questions.correctInput} onChange={e => questions.setCorrectInput(e.target.value)} />
            <Input type="number" placeholder="Erros" value={questions.wrongInput} onChange={e => questions.setWrongInput(e.target.value)} />
            <Button className="w-full" onClick={questions.handleSave}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={tec.dialogOpen} onOpenChange={tec.setDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>Importar TEC</DialogTitle></DialogHeader><Button onClick={() => { tec.setDialogOpen(false); tec.fileInputRef.current?.click(); }}>Selecionar Arquivo</Button></DialogContent>
      </Dialog>

      <Dialog open={exams.dialogOpen} onOpenChange={exams.setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Provas</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Nome" value={exams.examNameInput} onChange={e => exams.setExamNameInput(e.target.value)} />
            <Input type="date" value={exams.examDateInput} onChange={e => exams.setExamDateInput(e.target.value)} />
            <Button className="w-full" onClick={exams.handleSave}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
