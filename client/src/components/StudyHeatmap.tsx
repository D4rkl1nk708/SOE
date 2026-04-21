import { useMemo } from "react";
import { format, subDays, startOfToday, eachDayOfInterval, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SessionLog {
  date: string;
  durationMin: number;
  accuracy: number;
}

interface StudyHeatmapProps {
  logs?: SessionLog[];
  compact?: boolean;
  showStreakCard?: boolean;
}

export function StudyHeatmap({ logs = [], compact, showStreakCard }: StudyHeatmapProps) {
  const days = useMemo(() => {
    const end = startOfToday();
    const start = subDays(end, 18 * 7 - 1); // 18 weeks
    const interval = eachDayOfInterval({ start, end });
    
    // Group logs by date
    const logMap: Record<string, number> = {};
    logs.forEach(l => {
      const mins = (l as any).minutes ?? l.durationMin ?? 0;
      logMap[l.date] = (logMap[l.date] || 0) + mins;
    });

    return interval.map(date => {
      const dateStr = format(date, "yyyy-MM-dd");
      const duration = logMap[dateStr] || 0;
      let level = 0;
      if (duration > 0 && duration < 60) level = 1;
      else if (duration >= 60 && duration < 180) level = 2;
      else if (duration >= 180 && duration < 300) level = 3;
      else if (duration >= 300) level = 4;

      return {
        date,
        dateStr,
        duration,
        level
      };
    });
  }, [logs]);

  const levelColors = [
    "var(--stat-bg)", // 0
    "color-mix(in srgb, var(--primary) 25%, var(--stat-bg))", // 1
    "color-mix(in srgb, var(--primary) 50%, var(--stat-bg))", // 2
    "color-mix(in srgb, var(--primary) 75%, var(--stat-bg))", // 3
    "var(--primary)", // 4
  ];

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Consistência (18 semanas)</span>
          <div className="flex items-center gap-1">
            <span className="text-[9px]" style={{ color: "var(--muted-text)" }}>Menos</span>
            {levelColors.map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{ background: c, border: "1px solid var(--card-border)" }} />
            ))}
            <span className="text-[9px]" style={{ color: "var(--muted-text)" }}>Mais</span>
          </div>
        </div>
        
        <div className="grid grid-flow-col grid-rows-7 gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
          {days.map((d, i) => (
            <Tooltip key={d.dateStr}>
              <TooltipTrigger asChild>
                <div 
                  className="w-3.5 h-3.5 rounded-[3px] transition-all hover:scale-125 cursor-help"
                  style={{ 
                    background: levelColors[d.level],
                    border: d.level === 0 ? "1px solid var(--card-border)" : "none"
                  }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[10px] py-1 px-2">
                <p className="font-bold">{format(d.date, "dd 'de' MMMM", { locale: ptBR })}</p>
                <p>{d.duration === 0 ? "Nenhum estudo" : `${d.duration} minutos de estudo`}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
