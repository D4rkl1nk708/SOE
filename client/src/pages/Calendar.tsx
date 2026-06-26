import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  EyeOff,
  ExternalLink,
  Link as LinkIcon,
  PlayCircle,
  Check,
  X as XIcon,
  Calendar as CalendarIcon,
  Camera,
  Settings2,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isPast,
  parseISO,
  addDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";
import SubjectiveEssayModal from "@/components/SubjectiveEssayModal";
import { useScheduleSettings } from "@/hooks/useDashboard";
import { ScheduleDialog } from "@/components/ScheduleDialog";

const LS_LINKS = "soe_tec_links";
function getLinks(): Record<number, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_LINKS) || "{}");
  } catch {
    return {};
  }
}

export default function Calendar() {
  const [location, navigate] = useLocation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [icalDialogOpen, setIcalDialogOpen] = useState(false);
  const [expandedLinkId, setExpandedLinkId] = useState<number | null>(null);
  const [savedLinks, setSavedLinks] =
    useState<Record<number, string>>(getLinks());
  const [linkDraft, setLinkDraft] = useState<Record<number, string>>({});
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false);
  const [dayFilter, setDayFilter] = useState<
    "all" | "pending" | "revision" | "test"
  >("all");

  // Subjective Modal State
  const [subjectiveOpen, setSubjectiveOpen] = useState(false);
  const [activeSubjective, setActiveSubjective] = useState<any>(null);

  const utils = trpc.useUtils();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const schedule = useScheduleSettings(() =>
    utils.dashboard.getStats.invalidate(),
  );

  const saveLinkMut = trpc.calendar.saveLink.useMutation({
    onSuccess: () => {
      toast.success("Link salvo!");
      utils.calendar.getActivities.invalidate();
    },
  });

  const markCompletedMut = trpc.calendar.markCompleted.useMutation({
    onSuccess: () => {
      utils.calendar.getActivities.invalidate();
      utils.dashboard.getStats.invalidate();
    },
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const { data: activities = [] } = trpc.calendar.getActivities.useQuery({
    startDate: calendarStart.toISOString().split("T")[0],
    endDate: calendarEnd.toISOString().split("T")[0],
  });

  const getDayActivities = (day: Date) =>
    activities.filter((a) => isSameDay(parseISO(a.date), day));

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const handleStudyNow = (
    topicId: number,
    topicName: string,
    disciplineId: number,
  ) => {
    sessionStorage.setItem(
      "qs_prefill",
      JSON.stringify({ topicId, topicName, disciplineId, autoStart: true }),
    );
    navigate("/question-session");
    setIsDayDetailOpen(false);
  };

  const toggleCompleted = (revisionId: number, current: boolean) => {
    markCompletedMut.mutate({ revisionId, completed: !current });
  };

  const handleOpenSubjective = (activity: any) => {
    setActiveSubjective({
      revisionId: activity.id,
      topicId: activity.topicId,
      topicName: activity.topicName,
      disciplineName: activity.disciplineName,
      revisionLabel:
        activity.type === "revision" ? `Revisão #${activity.id}` : "Teste",
    });
    setSubjectiveOpen(true);
  };

  return (
    <div className="space-y-5" style={{ maxWidth: "100%" }}>
      {/* Header - Adaptive for Mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[var(--primary-bg-subtle)] rounded-2xl border border-[var(--primary-border)] shadow-lg shadow-[var(--primary-shadow)]">
            <CalendarDays className="w-6 h-6 text-[var(--primary)]" />
          </div>
          <div className="space-y-1">
            <h1
              className="text-3xl font-black tracking-tight"
              style={{ color: "var(--app-fg)" }}
            >
              Agenda
            </h1>
            <p className="text-sm opacity-60">Sua jornada organizada.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none h-11 rounded-2xl bg-white/5 border-white/5 text-[0.7rem] font-black uppercase tracking-widest"
            onClick={() => {
              const settings = stats?.settings as any;
              schedule.setTestIntervalInput(
                String(settings?.testIntervalDays ?? 3),
              );
              schedule.setRevisionIntervalInput(
                String(settings?.revisionIntervalDays ?? 25),
              );
              schedule.setRevisionSecondPhaseInput(
                String(settings?.revisionSecondPhaseDays ?? 50),
              );
              schedule.setScheduleDialogOpen(true);
            }}
          >
            <Settings2 className="h-4 w-4 mr-2 opacity-40" /> Config
          </Button>
          <Button
            variant="outline"
            className="flex-1 sm:flex-none h-11 rounded-2xl bg-white/5 border-white/5 text-[0.7rem] font-black uppercase tracking-widest"
            onClick={() => setIcalDialogOpen(true)}
          >
            <CalendarIcon className="h-4 w-4 mr-2 opacity-40" /> Exportar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 items-start">
        {/* Main Calendar View */}
        <div className="space-y-4">
          <div className="soe-card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.01]">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black uppercase tracking-widest opacity-80">
                  {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
                </h2>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={prevMonth}
                  className="p-2 hover:bg-white/5 rounded-xl transition-all"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date())}
                  className="px-3 py-1 text-[0.7rem] font-black uppercase tracking-widest hover:bg-white/5 rounded-lg"
                >
                  Hoje
                </button>
                <button
                  onClick={nextMonth}
                  className="p-2 hover:bg-white/5 rounded-xl transition-all"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-white/5 bg-white/[0.01]">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((d) => (
                <div
                  key={d}
                  className="py-3 text-center text-[0.65rem] font-black uppercase tracking-widest opacity-20"
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 auto-rows-fr">
              {days.map((day, idx) => {
                const dayActivities = getDayActivities(day);
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, monthStart);

                return (
                  <div
                    key={day.toString()}
                    onClick={() => {
                      setSelectedDay(day);
                      setDayFilter("all");
                      setIsDayDetailOpen(true);
                    }}
                    className={`min-h-[100px] md:min-h-[140px] p-2 border-r border-b border-white/5 transition-all cursor-pointer relative group
                        ${!isCurrentMonth ? "opacity-[0.15] bg-black/20" : "hover:bg-white/[0.02]"}
                        ${isSelected ? "bg-[var(--primary-bg-subtle)] !opacity-100" : ""}
                        ${isToday ? "ring-2 ring-inset ring-[var(--primary)]/50 bg-[var(--primary-bg-subtle)]/30 shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]" : ""}
                      `}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span
                        className={`text-[0.75rem] font-black px-1.5 py-0.5 rounded-md ${isToday ? "bg-[var(--primary)] text-white shadow-lg" : isSelected ? "text-[var(--primary)]" : "opacity-40"}`}
                      >
                        {format(day, "d")}
                      </span>
                      {isToday && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
                      )}
                    </div>

                    <div className="mt-1 space-y-1">
                      {/* Desktop list */}
                      <div className="hidden md:block space-y-1">
                        {dayActivities.slice(0, 3).map((a) => (
                          <div
                            key={a.id}
                            className={`text-[0.6rem] font-black uppercase tracking-tight px-1.5 py-0.5 rounded-md truncate border flex items-center gap-1 
                            ${a.completed ? "opacity-30 line-through border-white/5" : a.type === "test" ? "opacity-50 border-dashed border-white/20" : "border-white/5"}`}
                            style={{
                              backgroundColor: `${a.disciplineColor}15`,
                              color: a.disciplineColor,
                            }}
                          >
                            {a.completed ? (
                              <Check size={8} />
                            ) : (
                              <div
                                className="w-1 h-1 rounded-full shrink-0"
                                style={{ backgroundColor: a.disciplineColor }}
                              />
                            )}
                            {a.topicName}
                          </div>
                        ))}
                        {dayActivities.length > 3 && (
                          <div className="text-[0.6rem] font-black opacity-20 px-1">
                            + {dayActivities.length - 3} itens
                          </div>
                        )}
                      </div>
                      {/* Mobile dots */}
                      <div className="md:hidden flex flex-wrap gap-0.5">
                        {dayActivities.map((a) => (
                          <div
                            key={a.id}
                            className={`w-1.5 h-1.5 rounded-full ${a.completed ? "opacity-20" : ""}`}
                            style={{ background: a.disciplineColor }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Day Detail Modal — Command Center Redesign */}
      <Dialog open={isDayDetailOpen} onOpenChange={setIsDayDetailOpen}>
        <DialogContent className="!bg-[#0a0a0a] !border-white/10 !w-[95vw] !max-w-6xl rounded-[2.5rem] p-0 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9)] border-[0.5px] [&>button]:hidden">
          {selectedDay && (
            <div className="flex flex-col h-[85vh] md:h-auto max-h-[90vh]">
              {/* Ultra-Compact Header */}
              <div className="px-10 py-8 border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent flex items-end justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                    <DialogTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">
                      Programação Diária
                    </DialogTitle>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/10">
                      • {getDayActivities(selectedDay).length} Tarefas
                    </span>
                    <DialogDescription className="sr-only">
                      Detalhes das atividades para o dia selecionado
                    </DialogDescription>
                  </div>
                  <h3 className="text-4xl font-black tracking-tight flex items-baseline gap-3">
                    {format(selectedDay, "dd", { locale: ptBR })}
                    <span className="text-xl font-medium opacity-20 lowercase">
                      de {format(selectedDay, "MMMM", { locale: ptBR })}
                    </span>
                  </h3>
                </div>
                <div className="px-5 py-2 rounded-2xl bg-white/5 border border-white/5">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40">
                    {format(selectedDay, "EEEE", { locale: ptBR })}
                  </span>
                </div>
              </div>

              {/* Activity Timeline List */}
              <div className="p-10 overflow-y-auto custom-scrollbar flex-1 bg-[#0a0a0a] flex flex-col gap-6">
                {/* Filtros Rápidos */}
                {getDayActivities(selectedDay).length > 0 && (
                  <div className="flex flex-wrap gap-2 pb-4 border-b border-white/5">
                    {[
                      {
                        id: "all",
                        label: "Todas",
                        count: getDayActivities(selectedDay).length,
                      },
                      {
                        id: "pending",
                        label: "Pendentes",
                        count: getDayActivities(selectedDay).filter(
                          (a) => !a.completed,
                        ).length,
                      },
                      {
                        id: "revision",
                        label: "Revisões",
                        count: getDayActivities(selectedDay).filter(
                          (a) => a.type === "revision",
                        ).length,
                      },
                      {
                        id: "test",
                        label: "Simulados",
                        count: getDayActivities(selectedDay).filter(
                          (a) => a.type === "test",
                        ).length,
                      },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setDayFilter(f.id as any)}
                        className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 select-none
                          ${
                            dayFilter === f.id
                              ? "bg-white text-black border-white"
                              : "bg-white/5 border-white/5 text-white/40 hover:text-white hover:bg-white/10"
                          }
                        `}
                      >
                        {f.label}
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold
                          ${dayFilter === f.id ? "bg-black/10 text-black/60" : "bg-white/5 text-white/40"}
                        `}
                        >
                          {f.count}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {(() => {
                  const filteredActivities = getDayActivities(
                    selectedDay,
                  ).filter((activity) => {
                    if (dayFilter === "pending") return !activity.completed;
                    if (dayFilter === "revision")
                      return activity.type === "revision";
                    if (dayFilter === "test") return activity.type === "test";
                    return true;
                  });

                  if (filteredActivities.length > 0) {
                    return (
                      <div className="space-y-3 relative">
                        {/* Vertical Timeline Line */}
                        <div className="absolute left-[27px] top-4 bottom-4 w-[1px] bg-white/5 hidden md:block" />

                        {filteredActivities.map((activity) => {
                          const isTest = activity.type === "test";
                          const isCompleted = activity.completed;

                          return (
                            <div
                              key={activity.id}
                              className={`group relative flex items-start gap-6 p-5 rounded-[2rem] border transition-all duration-300
                                ${
                                  isCompleted
                                    ? "bg-white/[0.01] border-white/5 opacity-40"
                                    : "bg-white/[0.03] border-white/5 hover:border-white/20 hover:bg-white/[0.05] hover:shadow-2xl"
                                }
                              `}
                            >
                              {/* Timeline Node Indicator — Interactive */}
                              <button
                                onClick={() =>
                                  toggleCompleted(activity.id, isCompleted)
                                }
                                className="relative z-10 mt-3 hidden md:block group/node"
                              >
                                <span className="sr-only">
                                  Marcar como feito
                                </span>
                                <div
                                  className={`w-14 h-14 rounded-2xl border flex items-center justify-center transition-all duration-500 shadow-2xl
                                      ${isCompleted ? "bg-emerald-500 border-emerald-500 text-black shadow-emerald-500/20" : "bg-black border-white/10 text-white/20 group-hover/node:border-[var(--primary)] group-hover/node:text-[var(--primary)] group-hover/node:scale-110 active:scale-95"}`}
                                >
                                  {isCompleted ? (
                                    <Check size={20} strokeWidth={3} />
                                  ) : (
                                    <div className="w-2 h-2 rounded-full bg-current" />
                                  )}
                                </div>
                              </button>

                              {/* Content Wrapper */}
                              <div className="flex-1 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                                <div className="space-y-2 flex-1">
                                  <div className="flex items-center gap-3">
                                    <span
                                      className="px-2.5 py-0.5 rounded-lg text-[0.6rem] font-black uppercase tracking-widest border border-white/5"
                                      style={{
                                        color: activity.disciplineColor,
                                        backgroundColor: `${activity.disciplineColor}10`,
                                      }}
                                    >
                                      {activity.disciplineName}
                                    </span>
                                    <span className="text-[0.6rem] font-bold text-white/20 uppercase tracking-widest">
                                      {isTest ? "Simulado" : "Revisão"}
                                    </span>
                                  </div>
                                  <h4
                                    className={`text-lg font-bold tracking-tight leading-tight ${isCompleted ? "line-through" : "text-white/90"}`}
                                  >
                                    {activity.topicName}
                                    {(activity as any).questionsResolved > 0 &&
                                      typeof (activity as any).accuracy ===
                                        "number" && (
                                        <span className="text-white/20 font-medium ml-2 select-none">
                                          - {(activity as any).accuracy}%
                                        </span>
                                      )}
                                  </h4>
                                </div>

                                {/* Actions — Horizontal & Compact */}
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() =>
                                      handleStudyNow(
                                        activity.topicId,
                                        activity.topicName,
                                        activity.disciplineId,
                                      )
                                    }
                                    className={`h-11 px-6 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all
                                        ${isCompleted ? "bg-white/5 text-white/20" : "bg-white text-black hover:scale-[1.05] shadow-lg"}`}
                                  >
                                    <PlayCircle size={14} /> Treinar
                                  </button>

                                  <div className="h-11 w-[1px] bg-white/5 mx-1" />

                                  <div className="flex gap-1.5">
                                    {!isTest && (
                                      <button
                                        onClick={() =>
                                          handleOpenSubjective(activity)
                                        }
                                        className="w-11 h-11 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/20 hover:text-white transition-all"
                                      >
                                        <Camera size={16} />
                                      </button>
                                    )}

                                    {activity.link && (
                                      <a
                                        href={activity.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-11 h-11 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                                      >
                                        <LinkIcon size={16} />
                                      </a>
                                    )}

                                    <button
                                      onClick={() =>
                                        setExpandedLinkId(
                                          expandedLinkId === activity.id
                                            ? null
                                            : activity.id,
                                        )
                                      }
                                      className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-all
                                          ${expandedLinkId === activity.id ? "bg-[var(--primary)] border-[var(--primary)] text-white" : "bg-white/5 border-white/5 text-white/20 hover:text-white"}`}
                                    >
                                      <Settings2 size={16} />
                                    </button>

                                    <button
                                      onClick={() =>
                                        toggleCompleted(
                                          activity.id,
                                          isCompleted,
                                        )
                                      }
                                      className={`md:hidden w-11 h-11 rounded-xl border flex items-center justify-center transition-all
                                          ${isCompleted ? "bg-emerald-500 border-emerald-500 text-black" : "bg-white/5 border-white/5 text-white/20"}`}
                                    >
                                      <Check size={16} />
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Link Editor — Integrated Overlay */}
                              {expandedLinkId === activity.id && (
                                <div className="absolute left-0 right-0 top-full mt-2 z-20 p-5 rounded-2xl bg-black border border-white/10 shadow-2xl animate-in fade-in zoom-in-95">
                                  <div className="flex gap-3">
                                    <input
                                      type="text"
                                      placeholder="URL do caderno..."
                                      value={
                                        linkDraft[activity.id] ??
                                        activity.link ??
                                        ""
                                      }
                                      onChange={(e) =>
                                        setLinkDraft((prev) => ({
                                          ...prev,
                                          [activity.id]: e.target.value,
                                        }))
                                      }
                                      className="flex-1 bg-white/5 border border-white/5 rounded-xl px-4 py-2 text-xs outline-none focus:border-white/20"
                                    />
                                    <button
                                      onClick={() => {
                                        const link =
                                          linkDraft[activity.id] ??
                                          activity.link ??
                                          "";
                                        saveLinkMut.mutate({
                                          revisionId: activity.id,
                                          link,
                                        });
                                        setExpandedLinkId(null);
                                      }}
                                      className="px-4 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest"
                                    >
                                      Salvar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  } else {
                    return (
                      <div className="py-20 text-center space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto opacity-20">
                          <EyeOff size={32} />
                        </div>
                        <p className="text-sm font-bold opacity-30 uppercase tracking-[0.2em]">
                          {dayFilter === "all"
                            ? "Nenhuma tarefa programada"
                            : "Nenhuma tarefa corresponde ao filtro"}
                        </p>
                      </div>
                    );
                  }
                })()}
              </div>

              <div className="px-10 py-6 border-t border-white/5 flex justify-end bg-white/[0.01]">
                <Button
                  variant="ghost"
                  onClick={() => setIsDayDetailOpen(false)}
                  className="h-10 px-8 rounded-xl font-black uppercase text-[10px] tracking-widest opacity-40 hover:opacity-100 transition-all"
                >
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Configuration Modals */}
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

      {activeSubjective && (
        <SubjectiveEssayModal
          open={subjectiveOpen}
          onClose={() => setSubjectiveOpen(false)}
          revisionId={activeSubjective.revisionId}
          topicId={activeSubjective.topicId}
          topicName={activeSubjective.topicName}
          disciplineName={activeSubjective.disciplineName}
          revisionLabel={activeSubjective.revisionLabel}
          onMarkCompleted={() => {
            markCompletedMut.mutate({
              revisionId: activeSubjective.revisionId,
              completed: true,
            });
            setSubjectiveOpen(false);
          }}
        />
      )}

      <Dialog open={icalDialogOpen} onOpenChange={setIcalDialogOpen}>
        <DialogContent className="soe-card !bg-[var(--app-bg)] !border-white/10 max-w-sm rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">
              Exportar Calendário
            </DialogTitle>
            <DialogDescription className="text-xs opacity-60">
              Sincronize sua agenda com Google Calendar ou Outlook.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
              <p className="text-[0.7rem] font-black uppercase tracking-widest opacity-40 mb-2">
                Seu Link iCal
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value="http://localhost:3000/api/calendar/feed"
                  className="flex-1 bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-[0.7rem] font-mono"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      "http://localhost:3000/api/calendar/feed",
                    );
                    toast.success("Copiado!");
                  }}
                  className="p-2 bg-[var(--primary)] rounded-xl"
                >
                  <Check size={16} />
                </button>
              </div>
            </div>
            <Button
              onClick={() => setIcalDialogOpen(false)}
              className="w-full py-6 rounded-2xl bg-white/5 border-white/5 font-black uppercase text-[0.7rem] tracking-widest"
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
