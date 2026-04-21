import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from "recharts";

interface SessionLog {
  hourStart: number;
  accuracy: number;
}

export function PeakHoursChart({ logs }: { logs: SessionLog[] }) {
  const chartData = useMemo(() => {
    const hourMap: Record<number, { total: number; count: number }> = {};
    // Initialize all hours
    for (let i = 0; i < 24; i++) hourMap[i] = { total: 0, count: 0 };
    
    logs.forEach(l => {
      if (l.accuracy > 0) {
        hourMap[l.hourStart].total += l.accuracy;
        hourMap[l.hourStart].count++;
      }
    });

    return Object.entries(hourMap).map(([hour, data]) => ({
      hour: `${hour}h`,
      accuracy: data.count > 0 ? Math.round(data.total / data.count) : 0,
      sessions: data.count,
    }));
  }, [logs]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.sessions === 0) return null;
      return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] p-2 rounded-lg shadow-xl text-[10px]">
          <p className="font-bold text-[var(--app-fg)] mb-1">{label}</p>
          <p style={{ color: "var(--primary)" }}>Aproveitamento: {data.accuracy}%</p>
          <p style={{ color: "var(--muted-text)" }}>{data.sessions} sessões registradas</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-40 w-full mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--card-border)" opacity={0.5} />
          <XAxis 
            dataKey="hour" 
            tick={{ fontSize: 9, fill: "var(--muted-text)" }} 
            axisLine={false} 
            tickLine={false}
            interval={3}
          />
          <YAxis 
            domain={[0, 100]} 
            tick={{ fontSize: 9, fill: "var(--muted-text)" }} 
            axisLine={false} 
            tickLine={false}
            unit="%"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--stat-bg)", opacity: 0.4 }} />
          <Bar dataKey="accuracy" radius={[2, 2, 0, 0]}>
            {chartData.map((entry, index) => {
              const opacity = entry.sessions === 0 ? 0.1 : 0.4 + (entry.sessions / 20);
              return <Cell key={`cell-${index}`} fill="var(--primary)" fillOpacity={Math.min(opacity, 1)} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
