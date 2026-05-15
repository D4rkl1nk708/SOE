import { useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, BookOpen } from "lucide-react";
import DisciplinesContent from "./Disciplines";
import TopicsContent from "./Topics";

type Tab = "disciplines" | "topics";

export default function DisciplinesPage() {
  const hash = window.location.hash.replace("#", "") as Tab;
  const [tab, setTab] = useState<Tab>(
    hash === "topics" ? "topics" : "disciplines",
  );

  const TABS = [
    { id: "disciplines" as Tab, label: "Disciplinas", icon: BarChart3 },
    { id: "topics" as Tab, label: "Temas", icon: BookOpen },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-8 border-b border-border mb-8">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 pb-4 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {active && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {tab === "disciplines" && <DisciplinesContent />}
      {tab === "topics" && <TopicsContent />}
    </div>
  );
}
