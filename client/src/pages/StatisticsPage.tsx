import { useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, PieChart, FlaskConical } from "lucide-react";
import StatisticsContent from "./Statistics";
import TopicStatsContent from "./TopicStats";
import SOEAnalytics from "./SOEAnalytics";

type Tab = "overview" | "topics" | "analytics";

export default function StatisticsPage() {
  const hash = window.location.hash.replace("#", "") as Tab;
  const [tab, setTab] = useState<Tab>(
    hash === "topics"
      ? "topics"
      : hash === "analytics"
        ? "analytics"
        : "overview",
  );

  const TABS = [
    { id: "overview" as Tab, label: "Visão Geral", icon: BarChart3 },
    { id: "topics" as Tab, label: "Por Tema", icon: PieChart },
    { id: "analytics" as Tab, label: "Análise", icon: FlaskConical },
  ];

  return (
    <div className="space-y-8">
      <div className="flex border-b border-border w-full overflow-x-auto no-scrollbar gap-8">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pb-4 flex items-center gap-2 transition-all relative outline-none ${
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                {t.label}
              </span>
              {active && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                />
              )}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <StatisticsContent />}
      {tab === "topics" && <TopicStatsContent />}
      {tab === "analytics" && <SOEAnalytics />}
    </div>
  );
}
