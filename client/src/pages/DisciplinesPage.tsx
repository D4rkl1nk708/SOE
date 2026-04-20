import { useState } from "react";
import { BarChart3, BookOpen } from "lucide-react";
import DisciplinesContent from "./Disciplines";
import TopicsContent from "./Topics";

type Tab = "disciplines" | "topics";

export default function DisciplinesPage() {
  const hash = window.location.hash.replace("#", "") as Tab;
  const [tab, setTab] = useState<Tab>(hash === "topics" ? "topics" : "disciplines");

  const TABS = [
    { id: "disciplines" as Tab, label: "Disciplinas", icon: BarChart3 },
    { id: "topics"      as Tab, label: "Temas",       icon: BookOpen  },
  ];

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", width: "fit-content" }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: active ? "var(--primary)" : "transparent",
                color: active ? "white" : "var(--muted-text)",
              }}>
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "disciplines" && <DisciplinesContent />}
      {tab === "topics"      && <TopicsContent />}
    </div>
  );
}
