import { trpc } from "@/lib/trpc";
import { useMemo } from "react";
import { format, parseISO, subMonths, eachDayOfInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Flame } from "lucide-react";

const MONTH_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const DAY_LABELS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function getColor(minutes: number, count: number, primary: string): string {
  if (count === 0) return "var(--stat-bg)";
  // Intensity: 1-3 topics or <30min = light, 4-7 or <90min = medium, 8+ or 90min+ = full
  const intensity =
    minutes >= 90 || count >= 8 ? 1.0 :
    minutes >= 30 || count >= 4 ? 0.55 :
    0.25;
  return `color-mix(in srgb, ${primary} ${Math.round(intensity * 100)}%, var(--stat-bg))`;
}

export function StudyHeatmap({ compact, showStreakCard }: { compact?: boolean; showStreakCard?: boolean }) {
  const { data: heatmapData = [], isLoading } = trpc.dashboard.getHeatmap.useQuery({ months: 12 });

  // Build lookup map date → {count, minutes}
  const dataMap = useMemo(() => {
    const m: Record<string, { count: number; minutes: number }> = {};
    for (const d of heatmapData as any[]) {
      m[d.date] = { count: d.count, minutes: d.minutes };
    }
    return m;
  }, [heatmapData]);

  // Build the grid: last 52 weeks (364 days) + partial current week
  const today = new Date();
  const startDate = startOfWeek(subMonths(today, 11), { weekStartsOn: 0 });
  const endDate = endOfWeek(today, { weekStartsOn: 0 });

  const allDays = eachDayOfInterval({ start: startDate, end: endDate });

  // Group by week columns
  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  // Month labels: find which week column each month starts
  const monthPositions: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, col) => {
    const firstDay = week[0];
    const m = firstDay.getMonth();
    if (m !== lastMonth) {
      monthPositions.push({ label: MONTH_LABELS[m], col });
      lastMonth = m;
    }
  });

  // Stats
  const totalTopics = useMemo(() => (heatmapData as any[]).reduce((s: number, d: any) => s + d.count, 0), [heatmapData]);
  const totalMinutes = useMemo(() => (heatmapData as any[]).reduce((s: number, d: any) => s + d.minutes, 0), [heatmapData]);
  const activeDays = useMemo(() => (heatmapData as any[]).filter((d: any) => d.count > 0).length, [heatmapData]);

  // Streak calculation
  const streak = useMemo(() => {
    let s = 0;
    const d = new Date(today);
    while (true) {
      const key = format(d, "yyyy-MM-dd");
      if (!dataMap[key]) break;
      s++;
      d.setDate(d.getDate() - 1);
    }
    return s;
  }, [dataMap]);

  const formatHours = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ""}` : `${m}min`;
  };

  if (isLoading) return (
    <div className="rounded-2xl p-5 animate-pulse" style={{ background: "var(--card-bg, var(--stat-bg))", border: "1px solid var(--card-border)", height: 160 }} />
  );

  return (
    <div className={`rounded-2xl ${compact ? "p-3" : "p-5"} space-y-4`} style={{ background: "var(--card-bg, var(--stat-bg))", border: "1px solid var(--card-border)" }}>
      {/* Streak highlight card */}
      {showStreakCard && streak > 0 && (
        <div className="flex items-center gap-4 px-4 py-3 rounded-xl"
          style={{
            background: streak >= 7
              ? "color-mix(in srgb, var(--accent-amber) 12%, transparent)"
              : "color-mix(in srgb, var(--primary) 10%, transparent)",
            border: `1px solid ${streak >= 7 ? "color-mix(in srgb, var(--accent-amber) 30%, transparent)" : "color-mix(in srgb, var(--primary) 20%, transparent)"}`,
          }}>
          <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl flex-shrink-0"
            style={{ background: streak >= 7 ? "var(--accent-amber)" : "var(--primary)" }}>
            <Flame className="w-6 h-6 text-white" />
            <span className="text-white text-xs font-black leading-none mt-0.5">{streak}d</span>
          </div>
          <div>
            <p className="font-black text-lg leading-none" style={{ color: streak >= 7 ? "var(--accent-amber)" : "var(--primary)" }}>
              {streak} dia{streak !== 1 ? "s" : ""} de sequência!
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted-text)" }}>
              {streak >= 30 ? "🏆 Sequência lendária! Incrível dedicação." :
               streak >= 14 ? "🔥 Duas semanas seguidas! Continue assim." :
               streak >= 7  ? "⭐ Uma semana completa de estudos!" :
               streak >= 3  ? "💪 Boa sequência! Não pare agora." :
               "Estudou hoje! Mantenha a sequência."}
            </p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4" style={{ color: "var(--accent-amber)" }} />
          <span className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Histórico de Estudos</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--stat-bg)", color: "var(--muted-text)" }}>
            12 meses
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs" style={{ color: "var(--muted-text)" }}>
          {streak > 0 && (
            <span className="flex items-center gap-1 font-semibold" style={{ color: "var(--accent-amber)" }}>
              {streak} dia{streak !== 1 ? "s" : ""} seguido{streak !== 1 ? "s" : ""}
            </span>
          )}
          <span>{activeDays} dias ativos</span>
          <span>{totalTopics} temas</span>
          {totalMinutes > 0 && <span>{formatHours(totalMinutes)} totais</span>}
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: weeks.length * 14 + 28 }}>
          {/* Month labels */}
          <div className="flex mb-1 ml-7">
            {weeks.map((_, col) => {
              const mp = monthPositions.find(m => m.col === col);
              return (
                <div key={col} className="shrink-0 text-[10px] leading-none" style={{ width: 14, color: "var(--muted-text)" }}>
                  {mp ? mp.label : ""}
                </div>
              );
            })}
          </div>

          <div className="flex">
            {/* Day labels */}
            <div className="flex flex-col mr-1 shrink-0">
              {[0,1,2,3,4,5,6].map(di => (
                <div key={di} className="text-[10px] leading-none flex items-center justify-end pr-1"
                  style={{ height: 12, marginBottom: 2, color: di % 2 === 1 ? "var(--muted-text)" : "transparent" }}>
                  {DAY_LABELS[di]}
                </div>
              ))}
            </div>

            {/* Cells */}
            <div className="flex gap-0.5">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-0.5">
                  {week.map((day, di) => {
                    const key = format(day, "yyyy-MM-dd");
                    const entry = dataMap[key];
                    const isToday = key === format(today, "yyyy-MM-dd");
                    const isFuture = day > today;
                    return (
                      <div
                        key={di}
                        title={
                          isFuture ? "" :
                          entry
                            ? `${format(day, "dd/MM/yyyy", { locale: ptBR })}: ${entry.count} tema${entry.count !== 1 ? "s" : ""}${entry.minutes > 0 ? `, ${formatHours(entry.minutes)}` : ""}`
                            : `${format(day, "dd/MM/yyyy", { locale: ptBR })}: nenhum estudo`
                        }
                        style={{
                          width: 12, height: 12, borderRadius: 3,
                          background: isFuture
                            ? "transparent"
                            : getColor(entry?.minutes ?? 0, entry?.count ?? 0, "var(--primary)"),
                          border: isToday ? "2px solid var(--primary)" : "none",
                          flexShrink: 0,
                          cursor: entry ? "pointer" : "default",
                          opacity: isFuture ? 0 : 1,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-1.5 mt-2 ml-7">
            <span className="text-[10px]" style={{ color: "var(--muted-text)" }}>Menos</span>
            {[0, 0.25, 0.55, 1.0].map((intensity, i) => (
              <div key={i} style={{
                width: 12, height: 12, borderRadius: 3,
                background: intensity === 0
                  ? "var(--stat-bg)"
                  : `color-mix(in srgb, var(--primary) ${Math.round(intensity * 100)}%, var(--stat-bg))`,
              }} />
            ))}
            <span className="text-[10px]" style={{ color: "var(--muted-text)" }}>Mais</span>
          </div>
        </div>
      </div>
    </div>
  );
}
