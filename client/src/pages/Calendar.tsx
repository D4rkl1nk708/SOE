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

  // Chave real da lista do mês — usada no cache otimista.
  const activitiesQueryKey = { ...queryParams, limit: 10000, offset: 0 };

  const markCompletedMut = trpc.calendar.markCompleted.useMutation({
    onMutate: async (vars: { revisionId?: number; completed?: boolean }) => {
      const revisionId = Number(vars?.revisionId ?? 0);
      const completed = Boolean(vars?.completed);
      setPendingToggles((prev) => new Set(prev).add(revisionId));
      await utils.calendar.getActivities.cancel(activitiesQueryKey);
      const previousActivities =
        utils.calendar.getActivities.getData(activitiesQueryKey);

      utils.calendar.getActivities.setData(activitiesQueryKey, (old: any) => {
        const list = Array.isArray(old) ? old : old?.activities;
        if (!list) return old;
        const next = list.map((activity: any) =>
          activity.id === revisionId ? { ...activity, completed } : activity,
        );
        return Array.isArray(old) ? next : { ...old, activities: next };
      });

      return { previousActivities, revisionId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousActivities) {
        utils.calendar.getActivities.setData(
          activitiesQueryKey,
          ctx.previousActivities,
        );
      }
      toast.error("Falha ao atualizar a tarefa. Tente novamente.");
    },
    onSuccess: (_data, vars?: { completed?: boolean }) => {
      toast.success(
        vars?.completed ? "Revisão marcada como feita." : "Revisão reaberta.",
      );
    },
    onSettled: (_data, _err, _vars, ctx) => {
      const id = ctx?.revisionId;
      if (typeof id === "number") {
        setPendingToggles((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
      utils.calendar.getActivities.invalidate(activitiesQueryKey);
      utils.dashboard.getStats.invalidate();
      utils.study.overview.invalidate();
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
      <div className="border-b border-border px-4 py-2.5">
        <div className="inline-flex items-center gap-0.5 rounded-[10px] border border-border bg-secondary/70 p-0.5">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setDayFilter(filter.id)}
              className={`rounded-[8px] px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                dayFilter === filter.id
                  ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {filter.label}
              <span className="ml-1 tabular-nums opacity-60">
                {filter.count}
              </span>
            </button>
          ))}
        </div>
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
      { label: "Dia inteiro", items: [] as any[] },
      { label: "Manhã", items: [] as any[] },
      { label: "Tarde", items: [] as any[] },
      { label: "Noite", items: [] as any[] },
    ];
    for (const activity of visible) {
      const time = format(parseISO(activity.date), "HH:mm");
      if (time === "00:00") {
        groups[0].items.push(activity);
        continue;
      }
      const hour = Number(format(parseISO(activity.date), "H"));
      const group = hour < 12 ? groups[1] : hour < 18 ? groups[2] : groups[3];
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
                  className={`flex items-start gap-2.5 px-4 ${compact ? "py-2" : "py-2.5"} ${
                    completed ? "opacity-50" : ""
                  }`}
                >
                  <span className="w-[34px] shrink-0 pt-0.5 text-[10.5px] font-medium tabular-nums text-muted-foreground">
                    {time === "00:00" ? "" : time}
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
                    <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
                      {activity.disciplineName}
                      {activity.type === "test"
                        ? " · Simulado"
                        : activity.revisionNumber
                          ? ` · Revisão ${activity.revisionNumber}`
                          : " · Revisão"}
                    </span>
                  </button>
                  {activity.type === "test" && (
                    <span
                      className="mt-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium"
                      style={{
                        color: activity.disciplineColor,
                        backgroundColor: `${activity.disciplineColor}12`,
                      }}
                    >
                      Simulado
                    </span>
                  )}
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
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="apple-title text-foreground">
            {isFocus ? "Calendário" : "Agenda"}
          </h1>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground first-letter:uppercase">
            {isFocus
              ? format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })
              : "Sua jornada organizada."}
          </p>
        </div>
        <div className={isFocus ? "hidden gap-2 md:flex" : "flex gap-2"}>
          <button
            type="button"
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
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-4 text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary/60"
          >
            <Settings2 className="h-3.5 w-3.5 opacity-60" /> Configurar
          </button>
          <button
            type="button"
            onClick={() => setIcalDialogOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-4 text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary/60"
          >
            <CalendarIcon className="h-3.5 w-3.5 opacity-60" /> Exportar
          </button>
        </div>
      </header>

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
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h2 className="text-[13px] font-semibold text-foreground first-letter:uppercase">
                {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
              </h2>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={prevMonth}
                  aria-label="Mês anterior"
                  className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentMonth(new Date())}
                  className="h-7 rounded-md px-2.5 text-[11.5px] font-medium text-foreground transition-colors hover:bg-secondary/60"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  aria-label="Próximo mês"
                  className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-border bg-secondary/40">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <div
                  key={d}
                  className="py-2 text-center text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day) => {
                const dayActivities = getDayActivities(day);
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, monthStart);
                const pending = dayActivities.filter((a) => !a.completed);

                return (
                  <div
                    key={day.toString()}
                    onClick={() => {
                      setSelectedDay(day);
                      setDayFilter("all");
                      if (!isFocus) setIsDayDetailOpen(true);
                    }}
                    className={`flex min-h-[58px] cursor-pointer flex-col gap-1 overflow-hidden border-b border-r border-border p-1 transition-colors last:border-r-0 md:min-h-[92px] md:p-1.5
                      ${!isCurrentMonth ? "bg-secondary/20 text-muted-foreground/40" : "hover:bg-secondary/30"}
                      ${isSelected && isCurrentMonth ? "bg-[var(--primary-bg-subtle)]" : ""}
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`grid h-[20px] min-w-[20px] place-items-center rounded-full px-1 text-[11px] font-semibold tabular-nums ${
                          isToday
                            ? "bg-primary text-primary-foreground"
                            : isSelected
                              ? "text-primary"
                              : "text-muted-foreground"
                        }`}
                      >
                        {format(day, "d")}
                      </span>
                      {dayActivities.length > 0 && (
                        <span className="text-[9.5px] tabular-nums text-muted-foreground/70">
                          {dayActivities.length - pending.length}/
                          {dayActivities.length}
                        </span>
                      )}
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-hidden">
                      {/* Mobile: pontos compactos */}
                      <div className="flex items-center gap-1 md:hidden">
                        {dayActivities.slice(0, 3).map((a) => (
                          <span
                            key={`dot-${a.id}`}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{
                              backgroundColor: a.disciplineColor,
                              opacity: a.completed ? 0.35 : 1,
                            }}
                          />
                        ))}
                        {dayActivities.length > 3 && (
                          <span className="text-[9px] font-medium text-muted-foreground">
                            +{dayActivities.length - 3}
                          </span>
                        )}
                      </div>
                      {/* Desktop: chips */}
                      <div className="hidden md:flex md:min-h-0 md:flex-col md:gap-[3px] md:overflow-hidden">
                        {dayActivities.slice(0, 2).map((a) => (
                          <div
                            key={a.id}
                            className={`flex items-center gap-1 truncate rounded-[5px] px-1 py-[2px] text-[10.5px] leading-4 ${
                              a.completed ? "opacity-45" : ""
                            }`}
                            style={{
                              backgroundColor: `color-mix(in srgb, ${a.disciplineColor} 12%, transparent)`,
                              color: a.disciplineColor,
                            }}
                          >
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: a.disciplineColor }}
                            />
                            <span
                              className={`truncate ${a.completed ? "line-through" : ""}`}
                            >
                              {a.topicName}
                            </span>
                          </div>
                        ))}
                        {dayActivities.length > 2 && (
                          <span className="px-1 text-[9.5px] text-muted-foreground/70">
                            +{dayActivities.length - 2}
                          </span>
                        )}
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
