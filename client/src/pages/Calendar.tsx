import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, CalendarDays, EyeOff,
  ExternalLink, Link as LinkIcon, PlayCircle, Check, X as XIcon, Calendar as CalendarIcon,
  Camera, Settings2
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth,
  isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isPast, parseISO, addDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";
import SubjectiveEssayModal from "@/components/SubjectiveEssayModal";
import { useScheduleSettings } from "@/hooks/useDashboard";
import { ScheduleDialog } from "@/components/ScheduleDialog";

const LS_LINKS = "soe_tec_links";
function getLinks(): Record<number, string> {
  try { return JSON.parse(localStorage.getItem(LS_LINKS) || "{}"); } catch { return {}; }
}

export default function Calendar() {
  const [location, navigate] = useLocation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [icalDialogOpen, setIcalDialogOpen] = useState(false);
  const [expandedLinkId, setExpandedLinkId] = useState<number | null>(null);
  const [savedLinks, setSavedLinks] = useState<Record<number, string>>(getLinks());
  const [linkDraft, setLinkDraft] = useState<Record<number, string>>({});

  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const schedule = useScheduleSettings(() => trpc.useUtils().dashboard.getStats.invalidate());
  const saveLinkMut = trpc.calendar.saveLink.useMutation({ onSuccess: () => toast.success("Link salvo!") });

  const saveLink = (revisionId: number, link: string) => {
    saveLinkMut.mutate({ revisionId, link });
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const { data: activities = [] } = trpc.calendar.getActivities.useQuery({
    startDate: calendarStart.toISOString().split('T')[0],
    endDate: calendarEnd.toISOString().split('T')[0],
  });

  const getDayActivities = (day: Date) => activities.filter((a) => isSameDay(parseISO(a.date), day));

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const handleStudyNow = (topicId: number, topicName: string, disciplineId: number) => {
    sessionStorage.setItem("qs_prefill", JSON.stringify({ topicId, topicName, disciplineId, autoStart: true }));
    navigate("/question-session");
    setSelectedDay(null);
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
            <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--app-fg)" }}>Agenda</h1>
            <p className="text-sm opacity-60">Sua jornada organizada.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 sm:flex-none h-11 rounded-2xl bg-white/5 border-white/5 text-[10px] font-black uppercase tracking-widest"
            onClick={() => {
              const settings = stats?.settings as any;
              schedule.setTestIntervalInput(String(settings?.testIntervalDays ?? 3));
              schedule.setRevisionIntervalInput(String(settings?.revisionIntervalDays ?? 25));
              schedule.setRevisionSecondPhaseInput(String(settings?.revisionSecondPhaseDays ?? 50));
              schedule.setScheduleDialogOpen(true);
            }}>
            <Settings2 className="h-4 w-4 mr-2 opacity-40" /> Config
          </Button>
          <Button variant="outline" className="flex-1 sm:flex-none h-11 rounded-2xl bg-white/5 border-white/5 text-[10px] font-black uppercase tracking-widest" onClick={() => setIcalDialogOpen(true)}>
            <CalendarIcon className="h-4 w-4 mr-2 opacity-40" /> Exportar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Calendar View */}
        <div className="lg:col-span-8 space-y-4">
          <div className="soe-card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.01]">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black uppercase tracking-widest opacity-80">
                  {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
                </h2>
              </div>
              <div className="flex gap-1">
                <button onClick={prevMonth} className="p-2 hover:bg-white/5 rounded-xl transition-all"><ChevronLeft size={16} /></button>
                <button onClick={() => setCurrentMonth(new Date())} className="px-3 py-1 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 rounded-lg">Hoje</button>
                <button onClick={nextMonth} className="p-2 hover:bg-white/5 rounded-xl transition-all"><ChevronRight size={16} /></button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-white/5 bg-white/[0.01]">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((d) => (
                <div key={d} className="py-3 text-center text-[9px] font-black uppercase tracking-widest opacity-20">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 auto-rows-fr">
              {days.map((day, idx) => {
                const dayActivities = getDayActivities(day);
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, monthStart);

                return (
                  <div key={day.toString()} onClick={() => setSelectedDay(day)}
                    className={`min-h-[70px] md:min-h-[110px] p-2 border-r border-b border-white/5 transition-all cursor-pointer relative group
                      ${!isCurrentMonth ? 'opacity-[0.15] bg-black/20' : 'hover:bg-white/[0.02]'}
                      ${isSelected ? 'bg-[var(--primary-bg-subtle)] !opacity-100' : ''}
                    `}>
                    <span className={`text-[11px] font-black ${isToday ? 'text-[var(--primary)]' : isSelected ? 'text-[var(--primary)]' : 'opacity-40'}`}>
                      {format(day, "d")}
                    </span>
                    
                    <div className="mt-1 space-y-1">
                      {/* Desktop list */}
                      <div className="hidden md:block space-y-1">
                        {dayActivities.slice(0, 3).map((a) => (
                          <div key={a.id} className="text-[8px] font-black uppercase tracking-tight px-1.5 py-0.5 rounded-md truncate border border-white/5 flex items-center gap-1"
                            style={{ backgroundColor: `${a.disciplineColor}15`, color: a.disciplineColor }}>
                            <div className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: a.disciplineColor }} />
                            {a.topicName}
                          </div>
                        ))}
                        {dayActivities.length > 3 && (
                          <div className="text-[8px] font-black opacity-20 px-1">+ {dayActivities.length - 3} itens</div>
                        )}
                      </div>
                      {/* Mobile dots */}
                      <div className="md:hidden flex flex-wrap gap-0.5">
                        {dayActivities.map(a => (
                          <div key={a.id} className="w-1.5 h-1.5 rounded-full" style={{ background: a.disciplineColor }} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Day Detail / Schedule Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <div className="soe-card p-6 min-h-[400px]">
            {selectedDay ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-white/5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Programação para</p>
                    <h3 className="text-lg font-black">{format(selectedDay, "dd 'de' MMMM", { locale: ptBR })}</h3>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-[var(--primary)]">
                    <CalendarDays size={20} />
                  </div>
                </div>

                <div className="space-y-3">
                  {getDayActivities(selectedDay).length > 0 ? (
                    getDayActivities(selectedDay).map((activity) => (
                      <div key={activity.id} className="p-4 rounded-2xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all group">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-40 block mb-1" style={{ color: activity.disciplineColor }}>
                              {activity.disciplineName}
                            </span>
                            <h4 className="text-xs font-black leading-relaxed">{activity.topicName}</h4>
                          </div>
                          <div className="p-2 rounded-lg bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <PlayCircle size={14} className="text-[var(--primary)]" />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-4">
                          <button onClick={() => handleStudyNow(activity.topicId, activity.topicName, activity.disciplineId)}
                            className="flex-1 py-2 rounded-xl bg-[var(--primary-bg-subtle)] text-[var(--primary)] text-[9px] font-black uppercase tracking-widest border border-[var(--primary-border)] hover:bg-[var(--primary)] hover:text-white transition-all">
                            Treinar Agora
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center space-y-4">
                      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto opacity-20">
                        <EyeOff size={24} />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-20">Nenhuma meta para este dia</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center opacity-20 py-20">
                <CalendarDays size={48} className="mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Selecione um dia<br />para ver os detalhes</p>
              </div>
            )}
          </div>
        </div>
      </div>

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
      
      <Dialog open={icalDialogOpen} onOpenChange={setIcalDialogOpen}>
        <DialogContent className="soe-card !bg-[var(--app-bg)] !border-white/10 max-w-sm rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Exportar Calendário</DialogTitle>
            <DialogDescription className="text-xs opacity-60">Sincronize sua agenda com Google Calendar ou Outlook.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Seu Link iCal</p>
                <div className="flex gap-2">
                    <input readOnly value="http://localhost:3000/api/calendar/feed" 
                        className="flex-1 bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-[10px] font-mono" />
                    <button onClick={() => { navigator.clipboard.writeText("http://localhost:3000/api/calendar/feed"); toast.success("Copiado!"); }}
                        className="p-2 bg-[var(--primary)] rounded-xl"><Check size={16} /></button>
                </div>
            </div>
            <Button onClick={() => setIcalDialogOpen(false)} className="w-full py-6 rounded-2xl bg-white/5 border-white/5 font-black uppercase text-[10px] tracking-widest">Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
