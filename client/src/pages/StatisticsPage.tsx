import { useState } from "react";
import { BarChart3, PieChart, FlaskConical } from "lucide-react";
import StatisticsContent from "./Statistics";
import TopicStatsContent from "./TopicStats";
import SOEAnalytics from "./SOEAnalytics";

type Tab = "overview" | "topics" | "analytics";

export default function StatisticsPage() {
  const hash = window.location.hash.replace("#", "") as Tab;
  const [tab, setTab] = useState<Tab>(
    hash === "topics" ? "topics"
    : hash === "analytics" ? "analytics"
    : "overview"
  );

  const TABS = [
    { id: "overview"  as Tab, label: "Visão Geral", icon: BarChart3    },
    { id: "topics"    as Tab, label: "Por Tema",    icon: PieChart     },
    { id: "analytics" as Tab, label: "Análise",     icon: FlaskConical },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-1 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto no-scrollbar" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap"
              style={{
                background: active ? "var(--primary)" : "transparent",
                color: active ? "white" : "var(--muted-text)",
              }}>
              <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview"  && <StatisticsContent />}
      {tab === "topics"    && <TopicStatsContent />}
      {tab === "analytics" && <SOEAnalytics />}
    </div>
  );
}
