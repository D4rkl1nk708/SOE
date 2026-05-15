import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Target,
  BookOpen,
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SortKey = "name" | "accuracy" | "questions" | "studyTime";
type SortDir = "asc" | "desc";

function AccuracyBadge({ pct }: { pct: number | null }) {
  if (pct === null)
    return (
      <span className="text-[10px] italic text-muted-foreground opacity-40">
        —
      </span>
    );
  const color =
    pct >= 75
      ? "var(--accent-green)"
      : pct >= 50
        ? "var(--accent-amber)"
        : "var(--accent-red)";
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-border bg-card shadow-sm tabular-nums"
      style={{ color }}
    >
      {pct}%
    </span>
  );
}

export default function TopicStats() {
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const [search, setSearch] = useState("");
  const [filterDisc, setFilterDisc] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("accuracy");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterPerf, setFilterPerf] = useState<
    "all" | "strong" | "weak" | "no_data"
  >("all");

  const disciplines = (stats?.disciplineStats ?? []) as any[];

  const allTopics = useMemo(
    () =>
      disciplines.flatMap((d: any) =>
        (d.topics ?? []).map((t: any) => {
          const p = t.performance;
          const total = p ? p.correctCount + p.errorCount : 0;
          const acc =
            total > 0 ? Math.round((p.correctCount / total) * 100) : null;
          return {
            ...t,
            disciplineId: d.disciplineId,
            disciplineName: d.name,
            disciplineColor: d.color,
            accuracy: acc,
            questions: total,
          };
        }),
      ),
    [disciplines],
  );

  const withData = allTopics.filter((t) => t.accuracy !== null);
  const totalCorrectAll = withData.reduce(
    (s, t) => s + (t.performance?.correctCount ?? 0),
    0,
  );
  const totalQuestionsAll = withData.reduce((s, t) => s + t.questions, 0);
  const avgAccuracy =
    totalQuestionsAll > 0
      ? Math.round((totalCorrectAll / totalQuestionsAll) * 100)
      : 0;
  const strongTopics = withData.filter((t) => t.accuracy! >= 75).length;
  const weakTopics = withData.filter((t) => t.accuracy! < 50).length;

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h${m > 0 ? m + "m" : ""}` : `${m}m`;
  };

  const filtered = useMemo(() => {
    let list = allTopics;
    if (filterDisc) list = list.filter((t) => t.disciplineId === filterDisc);
    if (search)
      list = list.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase()),
      );
    if (filterPerf === "strong")
      list = list.filter((t) => t.accuracy !== null && t.accuracy >= 75);
    if (filterPerf === "weak")
      list = list.filter((t) => t.accuracy !== null && t.accuracy < 50);
    if (filterPerf === "no_data")
      list = list.filter((t) => t.accuracy === null);

    return [...list].sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === "name") {
        va = a.name;
        vb = b.name;
      } else if (sortKey === "accuracy") {
        va = a.accuracy ?? -1;
        vb = b.accuracy ?? -1;
      } else if (sortKey === "questions") {
        va = a.questions;
        vb = b.questions;
      } else {
        va = a.studyTimeSeconds || 0;
        vb = b.studyTimeSeconds || 0;
      }
      if (typeof va === "string")
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [allTopics, filterDisc, search, sortKey, sortDir, filterPerf]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortDir === "desc" ? (
        <ChevronDown className="h-3 w-3 inline ml-1" />
      ) : (
        <ChevronUp className="h-3 w-3 inline ml-1" />
      )
    ) : (
      <ArrowUpDown className="h-3 w-3 inline ml-1 opacity-20" />
    );

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Relatório Detalhado
        </h1>
        <p className="text-[11px] font-bold text-muted-foreground opacity-60 uppercase tracking-widest">
          Performance Granular por Tópico e Tema
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          {
            label: "Temas Mapeados",
            value: allTopics.length,
            color: "var(--primary)",
            icon: BookOpen,
          },
          {
            label: "Média de Acerto",
            value: `${avgAccuracy}%`,
            color:
              avgAccuracy >= 75
                ? "var(--accent-green)"
                : avgAccuracy >= 50
                  ? "var(--accent-amber)"
                  : "var(--accent-red)",
            icon: Target,
          },
          {
            label: "Domínio Alto",
            value: strongTopics,
            color: "var(--accent-green)",
            icon: TrendingUp,
          },
          {
            label: "Foco Necessário",
            value: weakTopics,
            color: "var(--accent-red)",
            icon: TrendingDown,
          },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="soe-card p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Icon size={14} style={{ color }} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
                {label}
              </span>
            </div>
            <p className="text-2xl font-bold tabular-nums" style={{ color }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="soe-card overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-center gap-6 bg-secondary/20 border-b border-border/50">
          <div className="relative group flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground opacity-40 group-focus-within:opacity-100 transition-opacity" />
            <input
              placeholder="Pesquisar tema..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md bg-card border border-border text-xs font-bold outline-none focus:border-primary/50 transition-all"
            />
          </div>

          <select
            value={filterDisc ?? ""}
            onChange={(e) =>
              setFilterDisc(e.target.value ? Number(e.target.value) : null)
            }
            className="h-9 px-3 rounded-md bg-card border border-border text-[10px] font-bold uppercase tracking-wider outline-none focus:border-primary/50"
          >
            <option value="">Todas as Disciplinas</option>
            {disciplines.map((d: any) => (
              <option key={d.disciplineId} value={d.disciplineId}>
                {d.name}
              </option>
            ))}
          </select>

          <div className="flex bg-card rounded-md border border-border overflow-hidden">
            {(
              [
                ["all", "Tudo"],
                ["strong", "Forte"],
                ["weak", "Crítico"],
                ["no_data", "Sem Dados"],
              ] as [string, string][]
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterPerf(val as any)}
                className={cn(
                  "px-4 h-9 text-[9px] font-black uppercase tracking-[0.2em] transition-all border-r last:border-r-0 border-border",
                  filterPerf === val
                    ? "bg-primary text-white"
                    : "text-muted-foreground/60 hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-30 ml-auto">
            {filtered.length} Itens
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary/10 border-b border-border/20 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <tr>
                <th className="px-6 py-3">
                  <button
                    onClick={() => handleSort("name")}
                    className="hover:text-primary transition-colors flex items-center"
                  >
                    Tema <SortIcon k="name" />
                  </button>
                </th>
                <th className="px-6 py-3 text-center">
                  <button
                    onClick={() => handleSort("accuracy")}
                    className="hover:text-primary transition-colors mx-auto flex items-center justify-center"
                  >
                    Acerto <SortIcon k="accuracy" />
                  </button>
                </th>
                <th className="px-6 py-3 text-center">
                  <button
                    onClick={() => handleSort("questions")}
                    className="hover:text-primary transition-colors mx-auto flex items-center justify-center"
                  >
                    Questões <SortIcon k="questions" />
                  </button>
                </th>
                <th className="px-6 py-3 text-center hidden md:table-cell">
                  <button
                    onClick={() => handleSort("studyTime")}
                    className="hover:text-primary transition-colors mx-auto flex items-center justify-center"
                  >
                    Tempo <SortIcon k="studyTime" />
                  </button>
                </th>
                <th className="px-6 py-3 text-right">Disciplina</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className="hover:bg-secondary/10 transition-colors group"
                >
                  <td className="px-6 py-4">
                    <p className="text-xs font-bold text-foreground/80 group-hover:text-foreground transition-colors">
                      {t.name}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <AccuracyBadge pct={t.accuracy} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-[11px] font-bold tabular-nums text-foreground/60">
                      {t.questions > 0 ? t.questions : "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center hidden md:table-cell text-[10px] font-bold text-muted-foreground opacity-60">
                    {t.studyTimeSeconds > 0
                      ? formatTime(t.studyTimeSeconds)
                      : "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span
                      className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border border-border/50"
                      style={{
                        background: `${t.disciplineColor}08`,
                        color: t.disciplineColor,
                      }}
                    >
                      {t.disciplineName}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-30">
                      Nenhum tema encontrado para os filtros ativos
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
