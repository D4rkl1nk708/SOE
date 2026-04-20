import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, CalendarDays, EyeOff,
  ExternalLink, Link as LinkIcon, PlayCircle, Check, X as XIcon, Calendar as CalendarIcon,
  Camera,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth,
  isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isPast, parseISO, addDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";
import SubjectiveEssayModal from "@/components/SubjectiveEssayModal";

const LS_LINKS = "soe_tec_links";
function getLinks(): Record<number, string> {
  try { return JSON.parse(localStorage.getItem(LS_LINKS) || "{}"); } catch { return {}; }
}
function saveLink(id: number, url: string) {
  const links = getLinks();
  if (url.trim()) links[id] = url.trim(); else delete links[id];
  localStorage.setItem(LS_LINKS, JSON.stringify(links));
}

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [filterDiscipline, setFilterDiscipline] = useState<number | undefined>(undefined);
  const [filterType, setFilterType] = useState<"all" | "revision" | "test">("all");
  const [expandedLinkId, setExpandedLinkId] = useState<number | null>(null);
  const [linkDraft, setLinkDraft] = useState<Record<number, string>>({});
  const [savedLinks, setSavedLinks] = useState(getLinks);
  const [icalDialogOpen, setIcalDialogOpen] = useState(false);
  const [essayActivity, setEssayActivity] = useState<typeof activities[0] | null>(null);
  const [, navigate] = useLocation();

  const utils = trpc.useUtils();
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const { data: icalData } = trpc.auth.getICalUrl.useQuery(undefined, { enabled: icalDialogOpen });

  const { data: calendarData } = trpc.calendar.getData.useQuery({
    startDate: format(calStart, "yyyy-MM-dd"),
    endDate: format(calEnd, "yyyy-MM-dd"),
  });
  const { data: disciplines } = trpc.discipline.list.useQuery();

  const markCompleted = trpc.revision.markCompleted.useMutation({
    onSuccess: () => { utils.calendar.getData.invalidate(); utils.dashboard.getStats.invalidate(); toast.success("Atividade atualizada!"); },
  });
  const reschedule = trpc.revision.reschedule.useMutation({
    onSuccess: () => { utils.calendar.getData.invalidate(); },
  });
  const markIgnored = trpc.revision.markIgnored.useMutation({
    onSuccess: () => { utils.calendar.getData.invalidate(); toast.success("Revisão ignorada!"); },
  });

  const activities = useMemo(() => {
    if (!calendarData) return [];
    return calendarData.revisions.map(rev => {
      const topic = calendarData.topics.find(t => t.id === rev.topicId);
      const discipline = calendarData.disciplines?.find(d => d.id === topic?.disciplineId);
      return { ...rev, topicName: topic?.name || "Tema desconhecido", disciplineName: discipline?.name || "Disciplina desconhecida", disciplineColor: discipline?.color || "#888888" };
    });
  }, [calendarData]);

  const filtered = useMemo(() => activities.filter(a => {
    if (a.ignored) return false;
    if (filterDiscipline) { const t = calendarData?.topics.find(t => t.id === a.topicId); if (t?.disciplineId !== filterDiscipline) return false; }
    if (filterType !== "all" && a.type !== filterType) return false;
    return true;
  }), [activities, filterDiscipline, filterType, calendarData]);

  const forDay = (d: Date) => {
    const s = format(d, "yyyy-MM-dd");
    const acts = filtered.filter(a => a.scheduledDate === s);
    // Revisões primeiro, testes depois
    return acts.sort((a, b) => {
      if (a.type === b.type) return 0;
      return a.type === "revision" ? -1 : 1;
    });
  };
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });
  const today = new Date();
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const selectedDayActs = selectedDay ? forDay(selectedDay) : [];

  // ── Weekly summary ─────────────────────────────────────────────────────────
  const weekSummary = useMemo(() => {
    const todayStr = format(today, "yyyy-MM-dd");
    const weekEnd = format(addDays(today, 6), "yyyy-MM-dd");
    const weekActs = filtered.filter(a => a.scheduledDate >= todayStr && a.scheduledDate <= weekEnd);
    const overdueActs = filtered.filter(a => {
      const d = parseISO(a.scheduledDate);
      return !a.completed && isPast(d) && a.scheduledDate < todayStr && a.type === "revision";
    });
    return {
      total: weekActs.filter(a => a.type === "revision").length,
      done: weekActs.filter(a => a.completed && a.type === "revision").length,
      pending: weekActs.filter(a => !a.completed && a.type === "revision").length,
      tests: weekActs.filter(a => a.type === "test").length,
      revisions: weekActs.filter(a => a.type === "revision" && !a.completed).length,
      overdue: overdueActs.length,
      overdueList: overdueActs,
    };
  }, [filtered]);

  const handleStartSession = (topicId: number, topicName: string, disciplineId?: number) => {
    sessionStorage.setItem("qs_prefill", JSON.stringify({ topicId, topicName, disciplineId, autoStart: true }));
    navigate("/question-session");
    setSelectedDay(null);
  };

  const commitLink = (id: number) => {
    const url = linkDraft[id] ?? savedLinks[id] ?? "";
    saveLink(id, url);
    setSavedLinks(getLinks());
    setExpandedLinkId(null);
  };

  return (
    <div className="space-y-5" style={{ maxWidth: "100%" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: "var(--app-fg)" }}>
            <CalendarDays className="h-6 w-6" style={{ color: "var(--gold)" }} />
            Calendário de Revisões
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-text)" }}>
            Clique em um dia para ver e gerenciar as atividades
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIcalDialogOpen(true)}
            className="px-3 py-2 rounded-xl text-sm font-semibold hover:opacity-70 transition-opacity flex items-center gap-1.5"
            style={{ border: "1px solid var(--card-border)", color: "var(--muted-text)", background: "var(--card-bg)" }}
            title="Exportar para Google Calendar / Apple Calendar">
            <CalendarIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <button onClick={() => setCurrentDate(new Date())}
            className="px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-70 transition-opacity"
            style={{ border: "1px solid var(--card-border)", color: "var(--muted-text)", background: "var(--card-bg)" }}>
            Hoje
          </button>
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="p-2 rounded-xl hover:opacity-70 transition-opacity"
            style={{ border: "1px solid var(--card-border)", color: "var(--muted-text)", background: "var(--card-bg)" }}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-bold text-base min-w-[160px] text-center capitalize" style={{ color: "var(--app-fg)" }}>
            {format(currentDate, "MMMM yyyy", { locale: ptBR })}
          </span>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="p-2 rounded-xl hover:opacity-70 transition-opacity"
            style={{ border: "1px solid var(--card-border)", color: "var(--muted-text)", background: "var(--card-bg)" }}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterDiscipline ? String(filterDiscipline) : "all"} onValueChange={v => setFilterDiscipline(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="h-10 text-sm w-52" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--app-fg)" }}>
            <SelectValue placeholder="Disciplina" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as disciplinas</SelectItem>
            {disciplines?.map(d => (
              <SelectItem key={d.id} value={String(d.id)}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={v => setFilterType(v as any)}>
          <SelectTrigger className="h-10 text-sm w-44" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--app-fg)" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="revision">Revisões</SelectItem>
            <SelectItem value="test">Testes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overdue alert — subtle */}
      {weekSummary.overdue > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
          <p className="text-xs" style={{ color: "var(--muted-text)" }}>
            <span className="font-semibold" style={{ color: "var(--app-fg)" }}>{weekSummary.overdue}</span> atividade{weekSummary.overdue > 1 ? "s" : ""} de dias anteriores pendente{weekSummary.overdue > 1 ? "s" : ""}
          </p>
          <button
            onClick={() => {
              const todayStr = format(today, "yyyy-MM-dd");
              weekSummary.overdueList.forEach(a => reschedule.mutate({ id: a.id, newDate: todayStr }));
              toast.success("Atividades reagendadas para hoje!");
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:opacity-70"
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--muted-text)" }}>
            Reagendar para hoje
          </button>
        </div>
      )}

      {/* Weekly summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Esta semana", value: weekSummary.total, sub: "revisões agendadas", color: "var(--primary)" },
          { label: "Pendentes", value: weekSummary.pending, sub: `${weekSummary.tests} testes opcionais`, color: weekSummary.pending > 0 ? "#f59e0b" : "var(--accent-green)" },
          { label: "Concluídas", value: weekSummary.done, sub: "na semana", color: "var(--accent-green, #16a34a)" },
          { label: "Atrasadas", value: weekSummary.overdue, sub: "de meses anteriores", color: weekSummary.overdue > 0 ? "#dc2626" : "var(--muted-text)" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "var(--muted-text)" }}>{s.label}</p>
            <p className="text-2xl font-black leading-none" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[11px] mt-1" style={{ color: "var(--muted-text)" }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
        {/* Week headers */}
        <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--card-border)", background: "var(--stat-bg)" }}>
          {weekDays.map(d => (
            <div key={d} className="py-3 text-center text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>{d}</div>
          ))}
        </div>
        {/* Days */}
        <div className="grid grid-cols-7">
          {calDays.map((day, idx) => {
            const dayActs = forDay(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isToday = isSameDay(day, today);
            const pending = dayActs.filter(a => !a.completed).length;
            const done = dayActs.filter(a => a.completed).length;
            const isLastRow = idx >= calDays.length - 7;
            return (
              <div key={day.toISOString()} onClick={() => setSelectedDay(day)}
                className="cursor-pointer transition-colors"
                style={{
                  minHeight: "120px",
                  padding: "10px 8px",
                  background: isToday ? "color-mix(in srgb, var(--gold) 8%, var(--card-bg))" : "var(--card-bg)",
                  borderRight: (idx + 1) % 7 !== 0 ? "1px solid var(--card-border)" : undefined,
                  borderBottom: !isLastRow ? "1px solid var(--card-border)" : undefined,
                  opacity: isCurrentMonth ? 1 : 0.25,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = isToday ? "color-mix(in srgb, var(--gold) 14%, var(--card-bg))" : "var(--stat-bg)")}
                onMouseLeave={e => (e.currentTarget.style.background = isToday ? "color-mix(in srgb, var(--gold) 8%, var(--card-bg))" : "var(--card-bg)")}
              >
                {/* Day number row */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-sm font-bold leading-none flex items-center justify-center"
                    style={{
                      width: isToday ? "26px" : undefined,
                      height: isToday ? "26px" : undefined,
                      borderRadius: isToday ? "50%" : undefined,
                      background: isToday ? "var(--gold)" : undefined,
                      color: isToday ? "#fff" : "var(--app-fg)",
                    }}>
                    {format(day, "d")}
                  </span>
                  {/* Badge conta só revisões pendentes */}
                  {dayActs.filter(a => !a.completed && a.type === "revision").length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "color-mix(in srgb, #dc2626 18%, transparent)", color: "#dc2626" }}>
                      {dayActs.filter(a => !a.completed && a.type === "revision").length}
                    </span>
                  )}
                </div>

                {/* Activity pills */}
                <div className="space-y-1">
                  {dayActs.slice(0, 3).map(a => {
                    const isTest = a.type === "test";
                    return (
                      <div key={a.id}
                        className="group flex items-center gap-1 text-[11px] font-semibold rounded-lg overflow-hidden transition-all"
                        style={{
                          background: a.completed
                            ? "color-mix(in srgb, #16a34a 12%, transparent)"
                            : isTest
                            ? "transparent"
                            : "color-mix(in srgb, var(--primary) 13%, transparent)",
                          border: isTest && !a.completed ? "1px dashed color-mix(in srgb, var(--muted-text) 30%, transparent)" : "1px solid transparent",
                          opacity: isTest && !a.completed ? 0.5 : 1,
                        }}
                        onMouseEnter={e => { if (isTest && !a.completed) { (e.currentTarget as HTMLElement).style.opacity = "1"; (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--gold) 12%, transparent)"; (e.currentTarget as HTMLElement).style.borderColor = "color-mix(in srgb, var(--gold) 30%, transparent)"; } }}
                        onMouseLeave={e => { if (isTest && !a.completed) { (e.currentTarget as HTMLElement).style.opacity = "0.5"; (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "color-mix(in srgb, var(--muted-text) 30%, transparent)"; } }}
                      >
                        <span
                          className="flex-1 truncate px-1.5 py-1"
                          style={{
                            color: a.completed ? "#16a34a" : isTest ? "var(--muted-text)" : "var(--primary)",
                            textDecoration: a.completed ? "line-through" : undefined,
                          }}>
                          <span className="font-black mr-1">{isTest ? "T" : "R"}</span>{a.topicName}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); markCompleted.mutate({ id: a.id, completed: !a.completed }); }}
                          className="flex-shrink-0 px-1 py-1 hover:opacity-70 transition-opacity"
                          style={{ color: a.completed ? "#16a34a" : "var(--muted-text)" }}
                          title={a.completed ? "Desmarcar" : "Marcar como feito"}>
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                  {dayActs.length > 3 && (
                    <div className="text-[11px] font-semibold pl-1" style={{ color: "var(--muted-text)" }}>
                      +{dayActs.length - 3} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail dialog */}
      <Dialog open={!!selectedDay} onOpenChange={open => !open && setSelectedDay(null)}>
        <DialogContent className="w-[95vw] max-w-lg" style={{ maxHeight: "85vh", overflowY: "auto", background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold" style={{ color: "var(--app-fg)" }}>
              {selectedDay && format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </DialogTitle>
            <DialogDescription className="text-xs" style={{ color: "var(--muted-text)" }}>
              {selectedDayActs.length} atividade(s) · Revisões: marque manualmente · Testes: inicie a sessão direto aqui
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 mt-1">
            {selectedDayActs.length === 0 && (
              <p className="text-sm text-center py-8" style={{ color: "var(--muted-text)" }}>Nenhuma atividade neste dia.</p>
            )}
            {selectedDayActs.map(activity => {
              const isTest = activity.type === "test";
              const accentColor = isTest ? "var(--gold)" : "var(--accent-blue, #2563eb)";
              const tecLink = savedLinks[activity.id];
              const isLinkOpen = expandedLinkId === activity.id;

              return (
                <div key={activity.id} className="rounded-xl p-3 space-y-2" style={{
                  border: `1px solid ${
                    activity.completed
                      ? "color-mix(in srgb, #16a34a 25%, transparent)"
                      : isTest
                      ? "color-mix(in srgb, var(--card-border) 60%, transparent)"
                      : "var(--card-border)"
                  }`,
                  background: activity.completed
                    ? "color-mix(in srgb, #16a34a 5%, var(--stat-bg))"
                    : isTest
                    ? "transparent"
                    : "var(--stat-bg)",
                  opacity: isTest && !activity.completed ? 0.6 : activity.completed ? 0.72 : 1,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={e => { if (isTest && !activity.completed) (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                onMouseLeave={e => { if (isTest && !activity.completed) (e.currentTarget as HTMLElement).style.opacity = "0.6"; }}
                >
                  {/* Main row */}
                  <div className="flex items-start gap-2.5">
                    <button
                      onClick={() => markCompleted.mutate({ id: activity.id, completed: !activity.completed })}
                      className="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ border: `2px solid ${activity.completed ? "#16a34a" : "var(--card-border)"}`, background: activity.completed ? "#16a34a" : "transparent" }}>
                      {activity.completed && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                          style={{ background: `color-mix(in srgb, ${accentColor} 15%, transparent)`, color: accentColor }}>
                          {isTest ? "Teste" : `Revisão ${activity.revisionNumber}`}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--muted-text)" }}>{activity.disciplineName}</span>
                        {isTest && (
                          <span className="text-[10px] italic" style={{ color: "var(--muted-text)" }}>· opcional</span>
                        )}
                      </div>
                      <p className="text-sm font-bold" style={{ color: "var(--app-fg)", textDecoration: activity.completed ? "line-through" : "none" }}>
                        {activity.topicName}
                      </p>
                    </div>
                    {/* Action icons */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => { if (isLinkOpen) { setExpandedLinkId(null); return; } setLinkDraft(d => ({ ...d, [activity.id]: savedLinks[activity.id] ?? "" })); setExpandedLinkId(activity.id); }}
                        title={tecLink ? "Link TEC salvo — clique para editar" : "Adicionar link do caderno TEC"}
                        className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
                        style={{ color: tecLink ? "var(--gold)" : "var(--muted-text)" }}>
                        <LinkIcon className="w-3.5 h-3.5" />
                      </button>
                      {!isTest && (
                        <button
                          onClick={() => setEssayActivity(activity)}
                          title="Enviar foto de resposta subjetiva para correção IA"
                          className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
                          style={{ color: "var(--muted-text)" }}>
                          <Camera className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => markIgnored.mutate({ id: activity.id, ignored: true })}
                        title="Ignorar esta atividade"
                        className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
                        style={{ color: "var(--muted-text)" }}>
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Link input expandable */}
                  {isLinkOpen && (
                    <div className="flex items-center gap-1.5 pl-7">
                      <input autoFocus
                        value={linkDraft[activity.id] ?? ""}
                        onChange={e => setLinkDraft(d => ({ ...d, [activity.id]: e.target.value }))}
                        placeholder="Cole o link do caderno TEC aqui..."
                        className="flex-1 text-xs rounded-lg px-2.5 py-1.5 outline-none"
                        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}
                        onKeyDown={e => { if (e.key === "Enter") commitLink(activity.id); if (e.key === "Escape") setExpandedLinkId(null); }}
                      />
                      <button onClick={() => commitLink(activity.id)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: "var(--gold)" }}><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setExpandedLinkId(null)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: "var(--muted-text)" }}><XIcon className="w-3.5 h-3.5" /></button>
                    </div>
                  )}

                  {/* CTA row */}
                  {(tecLink || isTest) && !activity.completed && (
                    <div className="flex items-center gap-3 pl-7">
                      {tecLink && (
                        <a href={tecLink} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] font-medium hover:opacity-70 transition-opacity"
                          style={{ color: "var(--gold)" }}>
                          <ExternalLink className="w-3 h-3" />
                          Abrir caderno TEC
                        </a>
                      )}
                      {tecLink && isTest && <span style={{ color: "var(--card-border)" }}>·</span>}
                      {isTest && (
                        <button
                          onClick={() => handleStartSession(activity.topicId, activity.topicName, calendarData?.disciplines?.find(d => d.id === calendarData?.topics?.find(t => t.id === activity.topicId)?.disciplineId)?.id)}
                          className="flex items-center gap-1 text-[11px] font-medium hover:opacity-70 transition-opacity"
                          style={{ color: "var(--primary)" }}>
                          <PlayCircle className="w-3 h-3" />
                          Iniciar sessão de questões
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Subjective Essay Modal */}
      {essayActivity && (
        <SubjectiveEssayModal
          open={!!essayActivity}
          onClose={() => setEssayActivity(null)}
          revisionId={essayActivity.id}
          topicId={essayActivity.topicId}
          topicName={essayActivity.topicName}
          disciplineName={essayActivity.disciplineName}
          revisionLabel={`Revisão ${essayActivity.revisionNumber}`}
          onMarkCompleted={() => {
            markCompleted.mutate({ id: essayActivity.id, completed: true });
            setEssayActivity(null);
          }}
        />
      )}

      {/* iCal Export Dialog */}
      <Dialog open={icalDialogOpen} onOpenChange={setIcalDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              Exportar para Google / Apple Calendar
            </DialogTitle>
            <DialogDescription>
              Sincronize suas revisões pendentes com seu app de calendário favorito.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Download direto */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--app-fg)" }}>📥 Download do arquivo .ics</p>
              <p className="text-xs" style={{ color: "var(--muted-text)" }}>
                Baixe o arquivo e importe manualmente no seu calendário.
              </p>
              {icalData?.path && (
                <a
                  href={icalData.path}
                  download="soe-revisoes.ics"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{ background: "var(--primary)", color: "#fff" }}>
                  <CalendarIcon className="h-4 w-4" />
                  Baixar soe-revisoes.ics
                </a>
              )}
            </div>

            {/* URL para assinatura */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--app-fg)" }}>🔗 URL de assinatura (sincronização automática)</p>
              <p className="text-xs" style={{ color: "var(--muted-text)" }}>
                Cole essa URL no Google Calendar → "Outros calendários" → "Via URL". O calendário se atualiza automaticamente.
              </p>
              {icalData?.path ? (
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={`${window.location.origin}${icalData.path}`}
                    className="flex-1 text-xs rounded-lg px-3 py-2 font-mono select-all"
                    style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}${icalData.path}`);
                      toast.success("URL copiada!");
                    }}
                    className="px-3 py-2 rounded-lg text-sm font-semibold hover:opacity-80 transition-opacity flex-shrink-0"
                    style={{ background: "var(--primary)", color: "#fff" }}>
                    Copiar
                  </button>
                </div>
              ) : (
                <p className="text-xs" style={{ color: "var(--muted-text)" }}>Carregando URL…</p>
              )}
            </div>

            <p className="text-xs" style={{ color: "var(--muted-text)" }}>
              ⚠️ Mantenha a URL em segredo — ela dá acesso de leitura ao seu cronograma.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
