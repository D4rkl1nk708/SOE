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

  // data-tour attrs added via wrappers below
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
  const disciplinesWithData = drag.orderedStats.filter(d => d.performance);
  const avgAccuracy = disciplinesWithData.length
    ? Math.round(disciplinesWithData.reduce((acc, d) => acc + (d.performance?.accuracy || 0), 0) / disciplinesWithData.length)
    : 0;
  const accuracyColor = avgAccuracy >= 70 ? "var(--accent-green)" : avgAccuracy >= 50 ? "var(--accent-amber)" : "var(--accent-red, #dc2626)";

  return (
    <div className="space-y-6 w-full pb-10">
      {showOnboarding && <OnboardingWizard onComplete={() => utils.dashboard.getStats.invalidate()} />}

      {/* F16 - Modo pré-prova, F15 - Aviso de madrugada, F05 - Alerta de estudo em massa */}
      <PreExamBanner />
      <SleepWarning />
      <MassStudyAlert />

      {/* Header */}
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--primary)" }}>Painel de Controle</h1>
          <p className="text-sm font-medium opacity-60" style={{ color: "var(--muted-text)" }}>Gestão centralizada do seu desempenho e metas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs rounded-xl" onClick={() => setCustomizeOpen(true)}>
            <LayoutDashboard className="h-3.5 w-3.5" /> Personalizar
          </Button>
          <Button data-tour="import-tec" variant="outline" size="sm" className="gap-1.5 text-xs rounded-xl" disabled={tec.isImporting} onClick={() => tec.setDialogOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> {tec.isImporting ? "Importar TEC" : "Importar TEC"}
          </Button>
          <input ref={tec.fileInputRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={tec.handleFileUpload} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUNA ESQUERDA: ANALYTICS (8 colunas) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Core stats row */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            {/* Taxa de Acerto */}
            <div className="soe-card p-4 flex flex-col justify-between relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <Trophy className="w-10 h-10" />
               </div>
               <div>
                 <p className="text-[9px] font-bold tracking-widest uppercase mb-1 opacity-60">Aproveitamento</p>
                 <span className="text-3xl font-black tabular-nums" style={{ color: accuracyColor }}>{avgAccuracy}%</span>
               </div>
               <div className="mt-3">
                 <Progress value={avgAccuracy} className="h-1" />
                 <p className="text-[9px] mt-1.5 opacity-60 font-medium">{totalQuestions} questões</p>
               </div>
            </div>

            {/* Revisões */}
            <div className="soe-card p-4 flex flex-col justify-between relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <CheckCircle2 className="w-10 h-10" />
               </div>
               <div>
                 <p className="text-[9px] font-bold tracking-widest uppercase mb-1 opacity-60">Revisões</p>
                 <div className="flex items-baseline gap-2">
                   <span className="text-3xl font-black tabular-nums text-emerald-500">{stats?.completedRevisions || 0}</span>
                   <span className="text-xs font-bold opacity-40">/ {stats?.pendingRevisions || 0}</span>
                 </div>
               </div>
               <div className="mt-3 flex gap-1">
                  {Array.from({length: 5}).map((_, i) => (
                    <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i < (stats?.completedRevisions || 0) / 10 ? 'var(--accent-green)' : 'var(--card-border)' }} />
                  ))}
               </div>
            </div>

            {/* Tempo de Estudo */}
            <div className="soe-card p-4 flex flex-col justify-between relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <Clock className="w-10 h-10" />
               </div>
               <div>
                 <p className="text-[9px] font-bold tracking-widest uppercase mb-1 opacity-60">Tempo de Estudo</p>
                 <span className="text-2xl font-black tabular-nums" style={{ color: "var(--primary)" }}>{formatStudyTime(totalStudyTime)}</span>
               </div>
               <div className="mt-3">
                 <p className="text-[9px] opacity-60 font-medium">{stats?.totalTopics || 0} temas</p>
                 <div className="flex items-center gap-1 mt-1">
                   <TrendingUp className="w-2.5 h-2.5" style={{ color: "var(--primary)" }} />
                   <span className="text-[8px] font-bold uppercase" style={{ color: "var(--primary)" }}>Em progresso</span>
                 </div>
               </div>
            </div>
          </div>

          {/* Heatmap */}
          {widgets.showExtra("heatmap") && (
            <div className="soe-card p-4">
              <h3 className="text-xs font-bold uppercase tracking-widest mb-4 opacity-60">Consistência de Estudo</h3>
              <StudyHeatmap compact showStreakCard />
            </div>
          )}

          {/* Discipline Performance Table */}
          <div className="soe-card overflow-hidden">
            <div className="px-5 py-4 flex justify-between items-center bg-white/5" style={{ borderBottom: "1px solid var(--card-border)" }}>
              <div>
                <h2 className="text-sm font-black uppercase tracking-tight">Gestão de Disciplinas</h2>
                <p className="text-[10px] opacity-50">Distribuição e progresso por matéria</p>
              </div>
              <Library className="w-4 h-4 opacity-30" />
            </div>
            <div className="p-2 space-y-1">
              {drag.orderedStats.map((d) => (
                <div key={d.disciplineId}>
                  <div className="cursor-pointer rounded-2xl px-4 py-3.5 transition-all hover:bg-white/5 group"
                    draggable onDragStart={() => drag.setDraggingDisciplineId(d.disciplineId)}
                    onDragOver={(e) => e.preventDefault()} onDrop={() => drag.handleDropDiscipline(d.disciplineId)}
                    onClick={() => setExpandedDiscipline(expandedDiscipline === d.disciplineId ? null : d.disciplineId)}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: d.color, boxShadow: `0 0 10px ${d.color}44` }} />
                        <span className="font-bold text-sm tracking-tight">{d.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1.5 h-4 opacity-60 font-black">{d.topicCount} temas</Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] font-bold opacity-40 uppercase">Acurácia</p>
                          <p className="text-sm font-black" style={{ color: (d.performance?.accuracy || 0) >= 70 ? "var(--accent-green)" : (d.performance?.accuracy || 0) >= 50 ? "var(--accent-amber)" : "var(--accent-red)" }}>
                            {d.performance?.accuracy || 0}%
                          </p>
                        </div>
                        {expandedDiscipline === d.disciplineId ? <ChevronDown className="h-4 w-4 opacity-30" /> : <ChevronRight className="h-4 w-4 opacity-30" />}
                      </div>
                    </div>
                  </div>

                  {expandedDiscipline === d.disciplineId && (
                    <div className="mx-2 mb-4 mt-2 rounded-2xl overflow-hidden border border-white/5 bg-black/20">
                      {d.topics?.length > 0 ? (
                        <>
                          <div className="grid grid-cols-6 text-[9px] font-black uppercase tracking-widest py-2.5 px-4 bg-white/5 opacity-50">
                            <span className="col-span-2">Assunto</span>
                            <span className="text-center">Taxa</span>
                            <span className="text-center">Acertos</span>
                            <span className="text-center">Erros</span>
                            <span className="text-center">Revisão</span>
                          </div>
                          {(d.topics ?? []).map((t) => (
                            <div key={t.id} className="grid grid-cols-6 items-center py-3 px-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); questions.openDialog(t); }}>
                              <div className="col-span-2 min-w-0">
                                <p className="font-bold text-xs truncate">{t.name}</p>
                                <p className="text-[10px] opacity-40">{t.studyDate ? format(parseISO(t.studyDate), "dd MMM") : "—"}</p>
                              </div>
                              <div className="text-center font-black text-xs" style={{ color: (t.performance?.accuracy ?? 0) >= 70 ? "var(--accent-green)" : (t.performance?.accuracy ?? 0) >= 50 ? "var(--accent-amber)" : "var(--accent-red)" }}>
                                {t.performance?.accuracy ?? 0}%
                              </div>
                              <div className="text-center text-xs font-bold text-emerald-500/80">{t.performance?.correctCount ?? "—"}</div>
                              <div className="text-center text-xs font-bold text-rose-500/80">{t.performance?.errorCount ?? "—"}</div>
                              <div className="text-center text-xs opacity-60 font-medium">
                                {t.completedRevisions} rev.
                              </div>
                            </div>
                          ))}
                        </>
                      ) : <p className="text-xs py-6 text-center opacity-30 font-medium">Lista vazia para esta disciplina.</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: ACTIONABLE (4 colunas) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Próxima Prova Card (Destaque) */}
          <div className="soe-card p-6 bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20 relative overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform"
            onClick={() => exams.openCreate()}>
            <div className="absolute top-0 right-0 p-2">
              <div className="bg-amber-500/20 p-2 rounded-full">
                <Target className="w-5 h-5 text-amber-500" />
              </div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 mb-4">Próxima Prova</p>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-5xl font-black tracking-tighter text-white">{daysToExam !== null && daysToExam >= 0 ? daysToExam : "—"}</span>
              <span className="text-lg font-bold text-amber-500/70">DIAS</span>
            </div>
            <p className="text-sm font-black text-white/90 truncate">{nextUpcomingExam?.name || "Definir Próxima Prova"}</p>
            {daysToExam !== null && daysToExam >= 0 && (
              <div className="mt-6 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)] transition-all duration-1000" style={{ width: `${Math.max(2, Math.min(100, 100 - (daysToExam / 365) * 100))}%` }} />
              </div>
            )}
          </div>

          {/* Quick Actions (Compact) */}
          {widgets.showExtra("quickActions") && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { href: "/flashcards", label: "Flashcards", color: "var(--primary)", icon: Brain },
                { href: "/revisions", label: "Revisar", color: "var(--accent-amber)", icon: Library },
                { href: "/notes", label: "Anotações", color: "var(--accent-green)", icon: FileText },
                { href: "/statistics", label: "Análise", color: "var(--accent-blue)", icon: BarChart2 },
              ].map(({ href, label, color, icon: Icon }) => (
                <a key={href} href={href} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all hover:-translate-y-1">
                  <Icon className="w-6 h-6" style={{ color }} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/70">{label}</span>
                </a>
              ))}
            </div>
          )}

          {/* IA Mentor Briefing */}
          {widgets.showExtra("mentorBriefing") && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-2">
                <Brain className="w-4 h-4 text-amber-400" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-500/80">Mentor Estratégico</h3>
              </div>
              <MentorBriefing />
            </div>
          )}

          {/* Metas e Revisões Hoje */}
          <div className="space-y-4">
            {widgets.showExtra("dailyGoal") && <DailyGoalWidget />}
            {widgets.showExtra("todayRevisions") && <TodayRevisions />}
          </div>

          {/* Notes Reminder */}
          {widgets.showExtra("notes") && (notes?.length ?? 0) > 0 && (
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex items-start gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <BookMarked className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-500">Anotações Salvas</p>
                <p className="text-[10px] text-white/50">{notes!.length} notas prontas para revisão.</p>
              </div>
            </div>
          )}

        </div>
      </div>

      {widgets.showExtra("notes") && (notes?.length ?? 0) > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(176,104,32,0.06)", border: "1px solid rgba(176,104,32,0.16)" }}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--accent-amber)" }}>{notes!.length} anotação{notes!.length !== 1 ? "ões" : ""}</p>
            {notes![0] && <p className="text-xs truncate" style={{ color: "var(--muted-text)" }}>Última: {notes![0].title}</p>}
          </div>
        </div>
      )}

      {/* ── Customize Dialog ── */}
      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Widgets Adicionais
            </DialogTitle>
            <DialogDescription>Adicione blocos extras ao dashboard.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {EXTRA_WIDGETS.map(w => {
              const enabled = widgets.showExtra(w.id);
              return (
                <button key={w.id} onClick={() => widgets.toggleExtra(w.id)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                  style={{
                    background: enabled ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--stat-bg)",
                    border: `1px solid ${enabled ? "color-mix(in srgb, var(--primary) 25%, var(--card-border))" : "var(--card-border)"}`,
                  }}>
                  <span className="text-sm font-medium" style={{ color: "var(--app-fg)" }}>{w.label}</span>
                  {enabled ? <Eye className="h-4 w-4" style={{ color: "var(--primary)" }} /> : <EyeOff className="h-4 w-4" style={{ color: "var(--muted-text)" }} />}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setCustomizeOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Questions Dialog ── */}
      <Dialog open={questions.open} onOpenChange={questions.setOpen}>
        <DialogContent className="w-[min(calc(100vw-2rem),420px)] p-0 overflow-hidden">
          {/* Colored header */}
          <div className="px-5 py-4" style={{ background: "var(--primary)", color: "white" }}>
            <h2 className="font-bold text-base">Registrar Questões</h2>
            <p className="text-xs mt-0.5 opacity-80 line-clamp-2">{questions.selectedTopic?.name}</p>
          </div>

          <div className="p-5 space-y-4">
            {/* Stats atual */}
            {questions.selectedTopic?.performance && (
              <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--muted-text)" }}>Acertos</p>
                  <p className="text-xl font-black" style={{ color: "var(--accent-green)" }}>{questions.selectedTopic.performance.correctCount}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--muted-text)" }}>Erros</p>
                  <p className="text-xl font-black" style={{ color: "var(--accent-red, #dc2626)" }}>{questions.selectedTopic.performance.errorCount}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--muted-text)" }}>Taxa</p>
                  <p className="text-xl font-black" style={{ color: "var(--primary)" }}>{questions.selectedTopic.performance.accuracy}%</p>
                </div>
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex gap-1.5 p-1 rounded-xl" style={{ background: "var(--stat-bg)" }}>
              <button className="flex-1 text-sm py-2 rounded-lg font-semibold transition-all"
                style={{ background: questions.mode === "add" ? "var(--primary)" : "transparent", color: questions.mode === "add" ? "white" : "var(--muted-text)" }}
                onClick={() => { questions.setMode("add"); questions.setCorrectInput(""); questions.setWrongInput(""); }}>
                + Adicionar
              </button>
              <button className="flex-1 text-sm py-2 rounded-lg font-semibold transition-all"
                style={{ background: questions.mode === "set" ? "var(--primary)" : "transparent", color: questions.mode === "set" ? "white" : "var(--muted-text)" }}
                onClick={() => { questions.setMode("set"); questions.setCorrectInput(String(questions.selectedTopic?.performance?.correctCount ?? "")); questions.setWrongInput(String(questions.selectedTopic?.performance?.errorCount ?? "")); }}>
                Substituir
              </button>
            </div>

            {/* Inputs acertos/erros */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3 space-y-2" style={{ background: "color-mix(in srgb, var(--accent-green) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-green) 25%, transparent)" }}>
                <Label className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--accent-green)" }}>Acertos</Label>
                <Input type="number" min={0} placeholder="0" value={questions.correctInput} onChange={e => questions.setCorrectInput(e.target.value)}
                  className="text-center text-2xl font-black border-0 bg-transparent p-0 h-auto focus-visible:ring-0"
                  style={{ color: "var(--accent-green)" }} />
              </div>
              <div className="rounded-xl p-3 space-y-2" style={{ background: "color-mix(in srgb, #dc2626 8%, transparent)", border: "1px solid color-mix(in srgb, #dc2626 25%, transparent)" }}>
                <Label className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--accent-red, #dc2626)" }}>Erros</Label>
                <Input type="number" min={0} placeholder="0" value={questions.wrongInput} onChange={e => questions.setWrongInput(e.target.value)}
                  className="text-center text-2xl font-black border-0 bg-transparent p-0 h-auto focus-visible:ring-0"
                  style={{ color: "var(--accent-red, #dc2626)" }} />
              </div>
            </div>

            {/* Error origin */}
            {(parseInt(questions.wrongInput) || 0) > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Origem do Erro</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: "attention",  label: "Atenção",      Icon: AlertTriangle, color: "#f59e0b" },
                    { id: "forgetting", label: "Esquecimento",  Icon: Brain,         color: "#3b82f6" },
                    { id: "theory",     label: "Teoria",        Icon: BookMarked,    color: "#8b5cf6" },
                    { id: "trap",       label: "Pegadinha",     Icon: Crosshair,     color: "#ef4444" },
                  ] as const).map(o => (
                    <button key={o.id} onClick={() => questions.setErrorOrigin(prev => prev === o.id ? null : o.id)}
                      className="text-sm py-2.5 px-3 rounded-xl font-medium transition-all border text-left flex items-center gap-2"
                      style={{
                        background: questions.errorOrigin === o.id ? `color-mix(in srgb, ${o.color} 18%, transparent)` : "var(--stat-bg)",
                        color: questions.errorOrigin === o.id ? o.color : "var(--muted-text)",
                        borderColor: questions.errorOrigin === o.id ? o.color : "var(--card-border)",
                        fontWeight: questions.errorOrigin === o.id ? 700 : 500,
                      }}>
                      <o.Icon className="w-3.5 h-3.5 shrink-0" />
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Preview result */}
            {(questions.correctInput || questions.wrongInput) && (() => {
              const c = parseInt(questions.correctInput)||0, w = parseInt(questions.wrongInput)||0;
              let fc=c, fw=w;
              if (questions.mode==="add") { fc=(questions.selectedTopic?.performance?.correctCount??0)+c; fw=(questions.selectedTopic?.performance?.errorCount??0)+w; }
              const t=fc+fw, pct=t>0?Math.round(fc/t*100):0;
              const barColor = pct >= 70 ? "var(--accent-green)" : pct >= 50 ? "var(--accent-amber)" : "#dc2626";
              return (
                <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
                  <div className="flex justify-between text-xs" style={{ color: "var(--muted-text)" }}>
                    <span>Resultado após salvar</span>
                    <strong style={{ color: barColor }}>{pct}%</strong>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--card-border)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span style={{ color: "var(--accent-green)" }}>{fc} acertos</span>
                    <span style={{ color: "var(--accent-red, #dc2626)" }}>{fw} erros</span>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="px-5 pb-5 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => questions.setOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={questions.handleSave} disabled={questions.isSaving}>
              {questions.isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Time Edit Dialog ── */}
      <Dialog open={!!timeEdit.dialog} onOpenChange={open => { if (!open) timeEdit.setDialog(null); }}>
        <DialogContent className="w-[min(calc(100vw-2rem),360px)] p-0 overflow-hidden">
          <div className="px-5 py-4" style={{ background: "var(--primary)", color: "white" }}>
            <h2 className="font-bold text-base">Editar Tempo de Estudo</h2>
            <p className="text-xs mt-0.5 opacity-80 line-clamp-2">{timeEdit.dialog?.topicName}</p>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm" style={{ color: "var(--muted-text)" }}>
              Ajuste manualmente o tempo registrado para este tema.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Horas</Label>
                <Input
                  type="number" min={0} max={9999}
                  value={timeEdit.dialog?.hours ?? 0}
                  onChange={e => timeEdit.setDialog(prev => prev ? { ...prev, hours: Math.max(0, parseInt(e.target.value) || 0) } : null)}
                  className="text-center text-2xl font-black"
                />
              </div>
              <span className="text-2xl font-black mt-5" style={{ color: "var(--muted-text)" }}>:</span>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Minutos</Label>
                <Input
                  type="number" min={0} max={59}
                  value={timeEdit.dialog?.minutes ?? 0}
                  onChange={e => timeEdit.setDialog(prev => prev ? { ...prev, minutes: Math.max(0, Math.min(59, parseInt(e.target.value) || 0)) } : null)}
                  className="text-center text-2xl font-black"
                />
              </div>
            </div>
            {timeEdit.dialog && (
              <div className="rounded-xl py-2 px-3 text-center text-sm font-semibold" style={{ background: "var(--stat-bg)", color: "var(--primary)" }}>
                Total: {timeEdit.dialog.hours}h {timeEdit.dialog.minutes}m = {timeEdit.dialog.hours * 3600 + timeEdit.dialog.minutes * 60}s
              </div>
            )}
          </div>
          <div className="px-5 pb-5 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => timeEdit.setDialog(null)}>Cancelar</Button>
            <Button className="flex-1" disabled={timeEdit.isSaving} onClick={() => {
              if (!timeEdit.dialog) return;
              const totalSeconds = timeEdit.dialog.hours * 3600 + timeEdit.dialog.minutes * 60;
              timeEdit.handleSave();
            }}>
              <Save className="w-4 h-4 mr-1" />
              {timeEdit.isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── TEC Import — Classificação de Erros ── */}
      {tec.errorQueue.length > 0 && (() => {
        const current = tec.errorQueue[tec.currentErrorIndex];
        const isLast = tec.currentErrorIndex >= tec.errorQueue.length - 1;
        const TEC_ORIGINS = [
          { id: "attention"  as const, label: "Atenção",      Icon: AlertTriangle, color: "#f59e0b" },
          { id: "forgetting" as const, label: "Esquecimento",  Icon: Brain,         color: "#3b82f6" },
          { id: "theory"     as const, label: "Teoria",        Icon: BookMarked,    color: "#8b5cf6" },
          { id: "trap"       as const, label: "Pegadinha",     Icon: Crosshair,     color: "#ef4444" },
        ];
        const advanceTec = async (origin: typeof tec.currentOrigin) => {
          if (origin && current) {
            // Salva a origem acumulada no tema
            try {
              await setTecPerf.mutateAsync({
                topicId: current.topicId,
                correctCount: 0, // placeholder — back-end vai somar (hack: usamos updateTopicPerformance se existir)
                errorCount: 0,
                errorByAttention:  origin === "attention"  ? current.newErrors : 0,
                errorByForgetting: origin === "forgetting" ? current.newErrors : 0,
                errorByTheory:     origin === "theory"     ? current.newErrors : 0,
                errorByTrap:       origin === "trap"       ? current.newErrors : 0,
              });
            } catch {}
          }
          if (isLast) {
            tec.setErrorDialogOpen(false);
            // errorQueue cleared naturally when dialog reopens next import
            tec.setCurrentErrorIndex(0);
          } else {
            tec.setCurrentErrorIndex(i => i + 1);
          }
          tec.setCurrentOrigin(null);
        };
        return (
          <Dialog open={tec.errorDialogOpen} onOpenChange={() => {}}>
            <DialogContent className="w-[min(calc(100vw-2rem),420px)] p-0 overflow-hidden" onPointerDownOutside={e => e.preventDefault()}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ background: "var(--accent-red, #dc2626)", color: "white" }}>
                <div>
                  <p className="text-xs opacity-75 font-semibold">Importação TEC — Erros novos detectados</p>
                  <h2 className="font-bold text-base mt-0.5">{current?.topicName}</h2>
                </div>
                <span className="text-sm font-bold opacity-75">{tec.currentErrorIndex + 1}/{tec.errorQueue.length}</span>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "color-mix(in srgb, #dc2626 8%, transparent)", border: "1px solid color-mix(in srgb, #dc2626 20%, transparent)" }}>
                  <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "var(--accent-red, #dc2626)" }} />
                  <p className="text-sm" style={{ color: "var(--app-fg)" }}>
                    <strong>{current?.newErrors}</strong> erro(s) novo(s) neste tema. Qual foi a origem predominante?
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {TEC_ORIGINS.map(o => {
                    const Icon = o.Icon;
                    return (
                      <button key={o.id} onClick={() => tec.setCurrentOrigin(prev => prev === o.id ? null : o.id)}
                        className="p-3 rounded-xl text-left transition-all border flex items-center gap-2"
                        style={{
                          background: tec.currentOrigin === o.id ? `color-mix(in srgb, ${o.color} 15%, transparent)` : "var(--stat-bg)",
                          borderColor: tec.currentOrigin === o.id ? o.color : "var(--card-border)",
                          color: tec.currentOrigin === o.id ? o.color : "var(--muted-text)",
                          fontWeight: tec.currentOrigin === o.id ? 700 : 500,
                        }}>
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="text-sm">{o.label}</span>
                        {tec.currentOrigin === o.id && <Check className="w-3.5 h-3.5 ml-auto" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-5 pb-5 flex gap-2">
                <button onClick={() => advanceTec(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--muted-text)" }}>
                  Pular
                </button>
                <Button className="flex-1" onClick={() => advanceTec(tec.currentOrigin)}>
                  {isLast ? "Concluir" : "Próximo"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      <Dialog open={tec.dialogOpen} onOpenChange={tec.setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Importar planilha TEC Concursos</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-3 p-3 rounded-xl" style={{ background: "rgba(176,104,32,0.06)", border: "1px solid rgba(176,104,32,0.16)" }}>
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--accent-amber)" }} />
              <p className="text-sm">O nome de cada tema deve ser <strong>exatamente igual</strong> ao cadastrado no site.</p>
            </div>
            <p className="text-sm" style={{ color: "var(--muted-text)" }}>Colunas: Hierarquia, Índice, Questões Resolvidas, Acertos (%), Qtd. acertos, Erros (%), Qtd. erros.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => tec.setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => { tec.setDialogOpen(false); tec.fileInputRef.current?.click(); }}>Selecionar planilha</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={schedule.scheduleDialogOpen} onOpenChange={schedule.setScheduleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Configurar Revisões e Testes</DialogTitle><DialogDescription>Intervalos para revisões.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Testes a cada (dias)</Label><Input type="number" min={1} max={30} placeholder="3" value={schedule.testIntervalInput} onChange={e => schedule.setTestIntervalInput(e.target.value)} /></div>
            <div className="space-y-2"><Label>Revisões - fase 1 (dias)</Label><Input type="number" min={0} max={365} placeholder="25" value={schedule.revisionIntervalInput} onChange={e => schedule.setRevisionIntervalInput(e.target.value)} /><p className="text-xs" style={{ color: "var(--muted-text)" }}>0 = desativar revisões</p></div>
            <div className="space-y-2"><Label>Revisões - fase 2 (dias)</Label><Input type="number" min={1} max={365} placeholder="50" value={schedule.revisionSecondPhaseInput} onChange={e => schedule.setRevisionSecondPhaseInput(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => schedule.setScheduleDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              const td=parseInt(schedule.testIntervalInput,10), rd=parseInt(schedule.revisionIntervalInput,10), r2d=parseInt(schedule.revisionSecondPhaseInput,10);
              if (isNaN(td)||td<1||td>30) { toast.error("Testes: 1-30 dias."); return; }
              if (isNaN(rd)||rd<0||rd>365) { toast.error("Revisões fase 1: 0-365."); return; }
              if (rd>0&&(isNaN(r2d)||r2d<1||r2d>365)) { toast.error("Revisões fase 2: 1-365."); return; }
              schedule.handleSaveSchedule();
            }} disabled={schedule.isSaving}>{schedule.isSaving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exams.dialogOpen} onOpenChange={exams.setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Gerenciar Provas</DialogTitle><DialogDescription>A mais próxima aparece no card.</DialogDescription></DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-3">
              <p className="text-sm font-medium">Provas cadastradas</p>
              {!sortedExams.length ? <p className="text-sm" style={{ color: "var(--muted-text)" }}>Nenhuma prova.</p> : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {sortedExams.map(exam => (
                    <div key={exam.id} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ border: "1px solid var(--card-border)" }}>
                      <div><p className="text-sm font-medium">{exam.name}</p><p className="text-xs" style={{ color: "var(--muted-text)" }}>{format(parseISO(exam.date), "dd/MM/yyyy", { locale: ptBR })}</p></div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => exams.openEdit(exam)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => exams.handleRemove(exam.id)} disabled={false}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Nome do Concurso</Label><Input placeholder="Ex: SEFAZ-CE..." value={exams.examNameInput} onChange={e => exams.setExamNameInput(e.target.value)} /></div>
              <div className="space-y-2"><Label>Data da Prova</Label><Input type="date" value={exams.examDateInput} onChange={e => exams.setExamDateInput(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => exams.setDialogOpen(false)}>Cancelar</Button>
            <Button variant="outline" onClick={() => exams.openCreate()}>Novo</Button>
            <Button onClick={() => { if (!exams.examNameInput.trim()||!exams.examDateInput) { toast.error("Preencha nome e data."); return; } exams.handleSave(); }} disabled={exams.isSaving || !exams.examNameInput.trim() || !exams.examDateInput}>{exams.isSaving ? "Salvando..." : exams.editingId ? "Atualizar" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
