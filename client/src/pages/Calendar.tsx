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

      {/* Day Detail Modal */}
      <Dialog open={isDayDetailOpen} onOpenChange={setIsDayDetailOpen}>
        <DialogContent className="soe-card !bg-[var(--app-bg)] !border-white/10 !w-[95vw] !max-w-[1600px] rounded-[3.5rem] p-0 overflow-hidden shadow-2xl">
          {selectedDay && (
            <div className="flex flex-col h-[90vh] md:h-auto max-h-[92vh]">
              {/* Modal Header */}
              <div className="p-8 border-b border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent flex items-center justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse" />
                    <p className="text-[0.75rem] font-black uppercase tracking-[0.2em] text-[var(--primary)] opacity-80">
                      Programação Diária
                    </p>
                  </div>
                  <h3 className="text-5xl font-black tracking-tight">
                    {format(selectedDay, "dd 'de' MMMM", { locale: ptBR })}
                  </h3>
                  <p className="text-base opacity-40 font-medium">
                    Você tem {getDayActivities(selectedDay).length} tarefas
                    planejadas para este dia.
                  </p>
                </div>
                <div className="hidden sm:flex w-20 h-20 rounded-[2.5rem] bg-[var(--primary-bg-subtle)] border border-[var(--primary-border)] items-center justify-center text-[var(--primary)] shadow-2xl shadow-[var(--primary-shadow)]/30 transform hover:rotate-6 transition-transform duration-500">
                  <CalendarDays size={36} strokeWidth={1.5} />
                </div>
              </div>

              {/* Activity List Container */}
              <div className="p-10 overflow-y-auto custom-scrollbar flex-1">
                {getDayActivities(selectedDay).length > 0 ? (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {getDayActivities(selectedDay).map((activity) => {
                      const isTest = activity.type === "test";
                      const isRevision = activity.type === "revision";

                      return (
                        <div
                          key={activity.id}
                          className={`group relative rounded-[3rem] border transition-all duration-700 overflow-hidden flex flex-col
                            ${
                              activity.completed
                                ? "bg-white/[0.01] border-white/5 opacity-40"
                                : isTest
                                  ? "bg-white/[0.02] border-white/5 hover:bg-white/[0.04]"
                                  : "bg-white/[0.03] border-white/10 backdrop-blur-3xl hover:bg-white/[0.06] hover:border-white/20 hover:shadow-[0_40px_80px_rgba(0,0,0,0.5)] hover:-translate-y-1.5"
                            }`}
                        >
                          {/* Card Header — Minimal & Precise */}
                          <div className="px-8 py-5 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-1.5 h-1.5 rounded-full ${isTest ? "bg-white/20" : "bg-[var(--primary)] shadow-[0_0_12px_var(--primary)] animate-pulse"}`}
                              />
                              <span className="text-[0.6rem] font-bold uppercase tracking-[0.3em] text-white/30">
                                {isTest
                                  ? "Simulado"
                                  : isRevision
                                    ? "Revisão"
                                    : "Estudo"}
                              </span>
                            </div>
                            <button
                              onClick={() =>
                                toggleCompleted(activity.id, activity.completed)
                              }
                              className={`px-5 py-2 rounded-full border text-[0.6rem] font-bold uppercase tracking-[0.2em] transition-all duration-500
                                ${
                                  activity.completed
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                                    : "bg-white/5 border-white/10 text-white/30 hover:text-white hover:border-white/40"
                                }`}
                            >
                              {activity.completed
                                ? "Concluído"
                                : "Marcar como feito"}
                            </button>
                          </div>

                          <div className="px-8 pb-8 flex-1 flex flex-col justify-between space-y-8">
                            {/* Information Block */}
                            <div className="space-y-4">
                              <div className="flex">
                                <span
                                  className="px-3 py-1 rounded-full text-[0.6rem] font-bold uppercase tracking-[0.2em] border border-white/5 bg-white/[0.02]"
                                  style={{ color: activity.disciplineColor }}
                                >
                                  {activity.disciplineName}
                                </span>
                              </div>
                              <h4
                                className={`text-2xl font-semibold leading-[1.2] tracking-tight ${activity.completed ? "line-through opacity-20" : "text-white/90"}`}
                              >
                                {activity.topicName}
                              </h4>
                            </div>

                            {/* Floating Action Bar */}
                            <div className="flex items-center gap-4">
                              <div className="flex-1 flex p-1.5 bg-white/[0.03] border border-white/5 rounded-[2rem] shadow-inner">
                                <button
                                  onClick={() =>
                                    handleStudyNow(
                                      activity.topicId,
                                      activity.topicName,
                                      activity.disciplineId,
                                    )
                                  }
                                  className={`flex-1 flex items-center justify-center gap-3 h-14 rounded-[1.5rem] text-[0.7rem] font-bold uppercase tracking-[0.2em] transition-all duration-500
                                      ${
                                        isTest
                                          ? "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                                          : "bg-white text-black shadow-2xl hover:scale-[1.02] active:scale-95"
                                      }`}
                                >
                                  <PlayCircle size={20} strokeWidth={1.5} />{" "}
                                  Treinar
                                </button>

                                {!isTest && (
                                  <button
                                    onClick={() =>
                                      handleOpenSubjective(activity)
                                    }
                                    className="w-14 h-14 flex items-center justify-center text-white/20 hover:text-white transition-colors"
                                  >
                                    <Camera size={22} strokeWidth={1.5} />
                                  </button>
                                )}
                              </div>

                              <div className="flex gap-3">
                                {activity.link && (
                                  <a
                                    href={activity.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-14 h-14 flex items-center justify-center rounded-full bg-white/[0.03] border border-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"
                                  >
                                    <LinkIcon size={20} strokeWidth={1.5} />
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
                                  className={`w-14 h-14 flex items-center justify-center rounded-full border transition-all duration-500
                                      ${expandedLinkId === activity.id ? "bg-[var(--primary)] border-[var(--primary)] text-white" : "bg-white/[0.03] border-white/5 text-white/20 hover:text-white"}`}
                                >
                                  <Settings2 size={20} strokeWidth={1.5} />
                                </button>
                              </div>
                            </div>

                            {/* Refined Link Editor */}
                            {expandedLinkId === activity.id && (
                              <div className="p-6 rounded-[2rem] bg-black/40 border border-white/10 animate-in fade-in zoom-in-95 duration-500">
                                <div className="flex items-center gap-3 mb-4 px-1">
                                  <div className="h-[1px] flex-1 bg-white/10" />
                                  <span className="text-[0.55rem] font-bold uppercase tracking-[0.4em] text-white/20">
                                    Configuração TEC
                                  </span>
                                  <div className="h-[1px] flex-1 bg-white/10" />
                                </div>
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
                                    className="flex-1 bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-[0.75rem] outline-none focus:border-white/20 transition-all placeholder:text-white/10"
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
                                    className="w-14 h-14 shrink-0 bg-white text-black flex items-center justify-center rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl"
                                  >
                                    <Check size={22} strokeWidth={2.5} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-32 text-center space-y-6">
                    <div className="w-24 h-24 rounded-[2rem] bg-white/5 flex items-center justify-center mx-auto border border-white/5 transform rotate-12">
                      <EyeOff size={40} className="opacity-20" />
                    </div>
                    <div>
                      <p className="text-lg font-black tracking-tight opacity-40">
                        Tudo limpo por aqui!
                      </p>
                      <p className="text-sm opacity-20 font-medium">
                        Nenhuma tarefa programada para este dia.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-8 bg-white/[0.02] border-t border-white/5 flex justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setIsDayDetailOpen(false)}
                  className="h-14 px-10 rounded-[1.5rem] font-black uppercase text-[0.75rem] tracking-[0.2em] opacity-40 hover:opacity-100 hover:bg-white/5 transition-all"
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
