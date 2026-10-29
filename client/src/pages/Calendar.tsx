import { Capacitor } from "@capacitor/core";
import { useState, useMemo, useEffect } from "react";
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
import { formatDateForDb } from "@shared/scheduling";

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
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [icalDialogOpen, setIcalDialogOpen] = useState(false);
  const [expandedLinkId, setExpandedLinkId] = useState<number | null>(null);
  const [savedLinks, setSavedLinks] =
    useState<Record<number, string>>(getLinks());
  const [linkDraft, setLinkDraft] = useState<Record<number, string>>({});
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false);
  const [dayFilter, setDayFilter] = useState<
    "all" | "pending" | "completed" | "revision" | "test"
  >("all");
  const [modalVisibleCount, setModalVisibleCount] = useState(60);
  const [pendingToggles, setPendingToggles] = useState<Set<number>>(new Set());

  useEffect(() => {
    setModalVisibleCount(60);
  }, [selectedDay, dayFilter, isDayDetailOpen]);

  // Subjective Modal State
  const [subjectiveOpen, setSubjectiveOpen] = useState(false);
  const [activeSubjective, setActiveSubjective] = useState<any>(null);

  const utils = trpc.useUtils();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const isFocus =
    ((stats?.settings as any)?.uiMode ?? "focused") !== "complete";
  const schedule = useScheduleSettings(() =>
    utils.dashboard.getStats.invalidate(),
  );

  const saveLinkMut = trpc.calendar.saveLink.useMutation({
    onSuccess: () => {
      toast.success("Link salvo!");
      utils.calendar.getActivities.invalidate();
    },
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const queryParams = useMemo(
    () => ({
      startDate: formatDateForDb(calendarStart),
      endDate: formatDateForDb(calendarEnd),
    }),
    [calendarStart, calendarEnd],
  );

  const isAndroid = Capacitor.isNativePlatform();

  // Fetch all activities for the month without limit
  const { data: activitiesData, isLoading: activitiesLoading } =
    trpc.calendar.getActivities.useQuery(
      { ...queryParams, limit: 10000, offset: 0 }, // High limit to get all activities
      {
        staleTime: 30000, // Cache for 30 seconds
      },
    );

  const activities = Array.isArray(activitiesData)
    ? activitiesData
    : activitiesData?.activities || [];
  const totalActivities = Array.isArray(activitiesData)
    ? activitiesData.length
    : activitiesData?.total || 0;
  const loading = activitiesLoading;

  const markCompletedMut = trpc.calendar.markCompleted.useMutation({
    onMutate: async ({ revisionId, completed }) => {
      setPendingToggles((prev) => new Set(prev).add(revisionId));
      await utils.calendar.getActivities.cancel({
        ...queryParams,
        limit: 50,
        offset: 0,
      });
      const previousActivities = utils.calendar.getActivities.getData({
        ...queryParams,
        limit: 50,
        offset: 0,
      });

      if (previousActivities) {
        const oldArray = Array.isArray(previousActivities)
          ? previousActivities
          : previousActivities.activities;
        if (oldArray) {
          utils.calendar.getActivities.setData(
            { ...queryParams, limit: 50, offset: 0 },
            (old) => {
              const currentArray = Array.isArray(old) ? old : old?.activities;
              return currentArray
                ? currentArray.map((a) =>
                    a.id === revisionId ? { ...a, completed } : a,
                  )
                : [];
            },
          );
        }
      }
      return { previousActivities, revisionId };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.previousActivities) {
        utils.calendar.getActivities.setData(
          { ...queryParams, limit: 50, offset: 0 },
          ctx.previousActivities,
        );
      }
      toast.error("Falha ao atualizar tarefa. Tente novamente.");
    },
    onSuccess: (_, vars) => {
      toast.success(
        vars?.completed ? "Marcado como feito!" : "Marcado como pendente!",
      );
    },
    onSettled: (_, __, ___, ctx) => {
      if (ctx?.revisionId) {
        setPendingToggles((prev) => {
          const next = new Set(prev);
          next.delete(ctx.revisionId);
          return next;
        });
      }
      utils.calendar.getActivities.invalidate({
        ...queryParams,
        limit: 50,
        offset: 0,
      });
      utils.dashboard.getStats.invalidate();
    },
  });

  const getDayActivities = (day: Date) =>
    activities.filter((a) => isSameDay(parseISO(a.date), day));

  const getVisibleDayActivities = (day: Date) =>
    getDayActivities(day).filter((activity) => {
      if (dayFilter === "pending") return !activity.completed;
      if (dayFilter === "completed") return activity.completed;
      if (dayFilter === "revision") return activity.type === "revision";
      if (dayFilter === "test") return activity.type === "test";
      return true;
    });

  const renderDayFilters = () => {
    if (!selectedDay) return null;
    const all = getDayActivities(selectedDay);
    const filters = [
      { id: "all" as const, label: "Todas", count: all.length },
      {
        id: "pending" as const,
        label: "Pendentes",
        count: all.filter((a) => !a.completed).length,
      },
      {
        id: "completed" as const,
        label: "Feitas",
        count: all.filter((a) => a.completed).length,
      },
    ];
    return (
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/50">
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setDayFilter(filter.id)}
            className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
              dayFilter === filter.id
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {filter.label}
            <span className="ml-1 opacity-50">{filter.count}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderDayList = (compact = false) => {
    if (!selectedDay) {
      return (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          Selecione um dia no calendário.
        </div>
      );
    }
    const visible = getVisibleDayActivities(selectedDay);
    const groups = [
      { label: "Manhã", items: [] as any[] },
      { label: "Tarde", items: [] as any[] },
      { label: "Noite", items: [] as any[] },
    ];
    for (const activity of visible) {
      const hour = Number(format(parseISO(activity.date), "H"));
      const group = hour < 12 ? groups[0] : hour < 18 ? groups[1] : groups[2];
      group.items.push(activity);
    }
    const nonEmpty = groups.filter((group) => group.items.length > 0);
    if (nonEmpty.length === 0) {
      return (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          Nenhuma tarefa para este filtro.
        </div>
      );
    }
    return (
      <div className="divide-y divide-border/50">
        {nonEmpty.map((group) => (
          <div key={group.label} className="py-1">
            <p className="px-4 pt-3 pb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((activity) => {
              const completed = activity.completed;
              const pending = pendingToggles.has(activity.id);
              const time = format(parseISO(activity.date), "HH:mm");
              return (
                <div
                  key={activity.id}
                  className={`flex items-start gap-2.5 px-4 ${compact ? "py-2.5" : "py-3"} ${
                    completed ? "opacity-50" : ""
                  }`}
                >
                  <span className="w-[38px] pt-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {time}
                  </span>
                  <button
                    type="button"
                    aria-label={
                      completed ? "Marcar como pendente" : "Marcar como feita"
                    }
                    onClick={() => toggleCompleted(activity.id, completed)}
                    disabled={pending}
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                      completed
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary"
                    } ${pending ? "animate-pulse" : ""}`}
                  >
                    {completed && <Check size={11} strokeWidth={3} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDayDetailOpen(true)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span
                      className={`block truncate text-[12px] font-semibold leading-4 ${
                        completed ? "line-through" : ""
                      }`}
                    >
                      {activity.topicName}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                      {activity.disciplineName} ·{" "}
                      {activity.type === "test" ? "Simulado" : "Revisão"}
                    </span>
                  </button>
                  <span
                    className="mt-0.5 rounded px-1.5 py-0.5 text-[8px] font-semibold"
                    style={{
                      color: activity.disciplineColor,
                      backgroundColor: `${activity.disciplineColor}12`,
                    }}
                  >
                    {activity.type === "test" ? "Simulado" : "Revisão"}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

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
              {isFocus ? "Calendário" : "Agenda"}
            </h1>
            <p className="text-sm opacity-60">
              {isFocus
                ? format(currentMonth, "MMMM 'de' yyyy", {
                    locale: ptBR,
                  }).replace(/^./, (c) => c.toUpperCase())
                : "Sua jornada organizada."}
            </p>
          </div>
        </div>
        <div className={isFocus ? "hidden gap-2 md:flex" : "flex gap-2"}>
          <Button
            variant="outline"
            className="flex-1 sm:flex-none h-11 rounded-2xl bg-secondary/40 border-border/60 text-[0.7rem] font-black uppercase tracking-widest"
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
            className="flex-1 sm:flex-none h-11 rounded-2xl bg-secondary/40 border-border/60 text-[0.7rem] font-black uppercase tracking-widest"
            onClick={() => setIcalDialogOpen(true)}
          >
            <CalendarIcon className="h-4 w-4 mr-2 opacity-40" /> Exportar
          </Button>
        </div>
      </div>

      <div
        className={
          isFocus
            ? "grid grid-cols-1 gap-5 items-start lg:grid-cols-[minmax(0,1fr)_390px]"
            : "grid grid-cols-1 gap-6 items-start"
        }
      >
        {/* Main Calendar View */}
        <div className="space-y-4">
          <div className="soe-card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border/60 bg-secondary/20">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black uppercase tracking-widest opacity-80">
                  {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
                </h2>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={prevMonth}
                  className="p-2 hover:bg-secondary/40 rounded-xl transition-all"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date())}
                  className="px-3 py-1 text-[0.7rem] font-black uppercase tracking-widest hover:bg-secondary/40 rounded-lg"
                >
                  Hoje
                </button>
                <button
                  onClick={nextMonth}
                  className="p-2 hover:bg-secondary/40 rounded-xl transition-all"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-border/60 bg-secondary/20">
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
                      if (!isFocus) setIsDayDetailOpen(true);
                    }}
                    className={`${isFocus ? "h-[58px] md:h-[64px] lg:h-[72px]" : "min-h-[100px] md:min-h-[140px]"} p-2 border-r border-b border-border/60 transition-all cursor-pointer relative group
                        ${!isCurrentMonth ? "opacity-[0.15] bg-secondary/30" : "hover:bg-secondary/25"}
                        ${isSelected ? "bg-[var(--primary-bg-subtle)] !opacity-100" : ""}
                        ${isToday ? "ring-2 ring-inset ring-[var(--primary)]/50 bg-[var(--primary-bg-subtle)]/30 shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]" : ""}
                      `}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span
                        className={`text-[0.75rem] font-black px-1.5 py-0.5 rounded-md ${isToday ? "bg-[var(--primary)] text-primary-foreground shadow-lg" : isSelected ? "text-[var(--primary)]" : "opacity-40"}`}
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
                        {dayActivities.slice(0, isFocus ? 2 : 3).map((a) => (
                          <div
                            key={a.id}
                            className={`text-[0.6rem] font-black uppercase tracking-tight px-1.5 py-0.5 rounded-md truncate border flex items-center gap-1 
                            ${a.completed ? "opacity-30 line-through border-border/60" : a.type === "test" ? "opacity-50 border-dashed border-border" : "border-border/60"}`}
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
                        {dayActivities.length > (isFocus ? 2 : 3) && (
                          <div className="text-[0.6rem] font-black opacity-20 px-1">
                            + {dayActivities.length - (isFocus ? 2 : 3)} itens
                          </div>
                        )}
                      </div>
                      {/* Mobile dots */}
                      <div className="md:hidden flex items-center gap-1">
                        {dayActivities.slice(0, 1).map((a) => (
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

          {isFocus && (
            <div className="lg:hidden">
              <div className="soe-card overflow-hidden">
                <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-4">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {selectedDay
                        ? format(selectedDay, "EEEE, d 'de' MMMM", {
                            locale: ptBR,
                          })
                        : "Selecione um dia"}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight">
                      {selectedDay
                        ? `${getDayActivities(selectedDay).filter((a) => !a.completed).length} tarefas pendentes`
                        : "Agenda do dia"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDayDetailOpen(true)}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground"
                  >
                    Abrir dia
                  </button>
                </div>
                {renderDayFilters()}
                <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
                  {renderDayList(true)}
                </div>
              </div>
            </div>
          )}
        </div>

        {isFocus && (
          <aside className="sticky top-4 hidden lg:block">
            <div className="soe-card overflow-hidden">
              <div className="border-b border-border/50 p-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {selectedDay
                    ? format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })
                    : "Selecione um dia"}
                </p>
                <h2 className="mt-1 text-[22px] font-semibold leading-7 tracking-[-0.4px]">
                  Seu dia, em ordem.
                </h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {selectedDay
                    ? `${getDayActivities(selectedDay).filter((a) => a.completed).length} de ${getDayActivities(selectedDay).length} concluídas`
                    : "Nenhum dia selecionado"}
                </p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: selectedDay
                        ? `${Math.round(
                            (getDayActivities(selectedDay).filter(
                              (a) => a.completed,
                            ).length /
                              Math.max(
                                getDayActivities(selectedDay).length,
                                1,
                              )) *
                              100,
                          )}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
              {renderDayFilters()}
              <div className="max-h-[calc(100vh-360px)] overflow-y-auto custom-scrollbar">
                {renderDayList()}
              </div>
              <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
                <span className="text-[10px] text-muted-foreground">
                  {selectedDay
                    ? `${getDayActivities(selectedDay).length} tarefas · todas visíveis`
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setIsDayDetailOpen(true)}
                  className="text-[10px] font-semibold text-primary hover:opacity-70"
                >
                  Abrir dia ›
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Day Detail Modal — Command Center Redesign */}
      <Dialog open={isDayDetailOpen} onOpenChange={setIsDayDetailOpen}>
        <DialogContent className="!bg-card !border-border !w-[95vw] !max-w-6xl rounded-[2.5rem] p-0 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9)] border-[0.5px] [&>button]:hidden">
          {selectedDay && (
            <div className="flex flex-col h-[85vh] md:h-auto max-h-[90vh]">
              {/* Ultra-Compact Header */}
              <div className="px-10 py-8 border-b border-border/60 bg-gradient-to-b from-secondary/20 to-transparent flex items-end justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                    <DialogTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60">
                      Programação Diária
                    </DialogTitle>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/40">
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
                <div className="px-5 py-2 rounded-2xl bg-secondary/40 border border-border/60">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40">
                    {format(selectedDay, "EEEE", { locale: ptBR })}
                  </span>
                </div>
              </div>

              {/* Activity Timeline List */}
              <div
                className="p-10 overflow-y-auto custom-scrollbar flex-1 bg-[#0a0a0a] flex flex-col gap-6"
                onScroll={(e) => {
                  const { scrollTop, scrollHeight, clientHeight } =
                    e.currentTarget;
                  if (scrollHeight - scrollTop - clientHeight < 250) {
                    setModalVisibleCount((prev) => prev + 15);
                  }
                }}
              >
                {/* Filtros Rápidos */}
                {getDayActivities(selectedDay).length > 0 && (
                  <div className="flex flex-wrap gap-2 pb-4 border-b border-border/60">
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
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-secondary/40 border-border/60 text-muted-foreground hover:text-primary-foreground hover:bg-secondary/60"
                          }
                        `}
                      >
                        {f.label}
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold
                          ${dayFilter === f.id ? "bg-black/10 text-black/60" : "bg-secondary/40 text-muted-foreground"}
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
                    if (dayFilter === "completed") return activity.completed;
                    if (dayFilter === "revision")
                      return activity.type === "revision";
                    if (dayFilter === "test") return activity.type === "test";
                    return true;
                  });

                  const visibleActivities = filteredActivities.slice(
                    0,
                    modalVisibleCount,
                  );
                  const hasMore = filteredActivities.length > modalVisibleCount;

                  if (filteredActivities.length > 0) {
                    return (
                      <div className="space-y-3 relative">
                        {/* Vertical Timeline Line — centro exato do checkbox (p-5 + 56px/2) */}
                        <div className="pointer-events-none absolute left-[48px] top-8 bottom-8 hidden w-px bg-border/70 md:block" />

                        {visibleActivities.map((activity) => {
                          const isTest = activity.type === "test";
                          const isCompleted = activity.completed;

                          return (
                            <div
                              key={activity.id}
                              className={`group relative flex items-start gap-6 p-5 rounded-[2rem] border transition-all duration-300
                                ${
                                  isCompleted
                                    ? "bg-secondary/20 border-border/60 opacity-40"
                                    : "bg-secondary/35 border-border/60 hover:border-border hover:bg-secondary/50 hover:shadow-2xl"
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
                                  className={`w-14 h-14 rounded-2xl border flex items-center justify-center transition-all duration-300 shadow-2xl relative
                                      ${isCompleted ? "bg-emerald-500 border-emerald-500 text-black shadow-emerald-500/20" : "bg-black border-border text-muted-foreground/50 group-hover/node:border-[var(--primary)] group-hover/node:text-[var(--primary)] group-hover/node:scale-110 active:scale-95"}
                                      ${pendingToggles.has(activity.id) ? "opacity-75 ring-2 ring-emerald-400 animate-pulse" : ""}`}
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
                                      className="px-2.5 py-0.5 rounded-lg text-[0.6rem] font-black uppercase tracking-widest border border-border/60"
                                      style={{
                                        color: activity.disciplineColor,
                                        backgroundColor: `${activity.disciplineColor}10`,
                                      }}
                                    >
                                      {activity.disciplineName}
                                    </span>
                                    <span className="text-[0.6rem] font-bold text-muted-foreground/50 uppercase tracking-widest">
                                      {isTest ? "Simulado" : "Revisão"}
                                    </span>
                                  </div>
                                  <h4
                                    className={`text-lg font-bold tracking-tight leading-tight ${isCompleted ? "line-through" : "text-foreground"}`}
                                  >
                                    {activity.topicName}
                                    {(activity as any).questionsResolved > 0 &&
                                      typeof (activity as any).accuracy ===
                                        "number" && (
                                        <span className="text-muted-foreground/50 font-medium ml-2 select-none">
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
                                        ${isCompleted ? "bg-secondary/40 text-muted-foreground/50" : "bg-primary text-primary-foreground hover:scale-[1.05] shadow-lg"}`}
                                  >
                                    <PlayCircle size={14} /> Treinar
                                  </button>

                                  <div className="h-11 w-[1px] bg-secondary/40 mx-1" />

                                  <div className="flex gap-1.5">
                                    {!isTest && (
                                      <button
                                        onClick={() =>
                                          handleOpenSubjective(activity)
                                        }
                                        className="w-11 h-11 rounded-xl bg-secondary/40 border border-border/60 flex items-center justify-center text-muted-foreground/50 hover:text-primary-foreground transition-all"
                                      >
                                        <Camera size={16} />
                                      </button>
                                    )}

                                    {activity.link && (
                                      <a
                                        href={activity.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-11 h-11 rounded-xl bg-secondary/40 border border-border/60 flex items-center justify-center text-muted-foreground hover:text-primary-foreground hover:bg-secondary/60 transition-all"
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
                                          ${expandedLinkId === activity.id ? "bg-[var(--primary)] border-[var(--primary)] text-primary-foreground" : "bg-secondary/40 border-border/60 text-muted-foreground/50 hover:text-primary-foreground"}`}
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
                                          ${isCompleted ? "bg-emerald-500 border-emerald-500 text-black" : "bg-secondary/40 border-border/60 text-muted-foreground/50"}`}
                                    >
                                      <Check size={16} />
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Link Editor — Integrated Overlay */}
                              {expandedLinkId === activity.id && (
                                <div className="absolute left-0 right-0 top-full mt-2 z-20 p-5 rounded-2xl bg-black border border-border shadow-2xl animate-in fade-in zoom-in-95">
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
                                      className="flex-1 bg-secondary/40 border border-border/60 rounded-xl px-4 py-2 text-xs outline-none focus:border-border"
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
                                      className="px-4 bg-primary text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-widest"
                                    >
                                      Salvar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {hasMore && (
                          <div className="pt-4 text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-secondary/40 border-border hover:bg-secondary/60 text-xs rounded-xl"
                              onClick={() =>
                                setModalVisibleCount((prev) =>
                                  Math.min(
                                    prev + 15,
                                    filteredActivities.length,
                                  ),
                                )
                              }
                            >
                              Carregar mais (
                              {filteredActivities.length - modalVisibleCount}{" "}
                              tarefas restantes)
                            </Button>
                          </div>
                        )}
                        {!hasMore && filteredActivities.length > 15 && (
                          <div className="pt-3 text-center text-[10px] text-muted-foreground/60 uppercase tracking-widest">
                            Todas as {filteredActivities.length} tarefas
                            carregadas
                          </div>
                        )}
                      </div>
                    );
                  } else {
                    return (
                      <div className="py-20 text-center space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-secondary/40 flex items-center justify-center mx-auto opacity-20">
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

              <div className="px-10 py-6 border-t border-border/60 flex justify-end bg-secondary/20">
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
        <DialogContent className="soe-card !bg-[var(--app-bg)] !border-border max-w-sm rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">
              Exportar Calendário
            </DialogTitle>
            <DialogDescription className="text-xs opacity-60">
              Sincronize sua agenda com Google Calendar ou Outlook.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-4 rounded-2xl bg-secondary/40 border border-border/60">
              <p className="text-[0.7rem] font-black uppercase tracking-widest opacity-40 mb-2">
                Seu Link iCal
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value="http://localhost:3000/api/calendar/feed"
                  className="flex-1 bg-black/40 border border-border/60 rounded-xl px-3 py-2 text-[0.7rem] font-mono"
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
              className="w-full py-6 rounded-2xl bg-secondary/40 border-border/60 font-black uppercase text-[0.7rem] tracking-widest"
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
