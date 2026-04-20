import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import {
  BarChart3, TrendingUp, TrendingDown, Target, BookOpen,
  Search, ArrowUpDown, ChevronDown, ChevronUp, Clock, CheckCircle2,
} from "lucide-react";

type SortKey = "name" | "accuracy" | "questions" | "studyTime";
type SortDir = "asc" | "desc";

function AccuracyBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs italic" style={{ color: "var(--muted-text)" }}>—</span>;
  const color = pct >= 70 ? "var(--accent-green)" : pct >= 50 ? "var(--accent-amber)" : "var(--accent-red, #dc2626)";
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
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
  const [filterPerf, setFilterPerf] = useState<"all" | "strong" | "weak" | "no_data">("all");

  const disciplines = (stats?.disciplineStats ?? []) as any[];

  const allTopics = useMemo(() => disciplines.flatMap((d: any) =>
    (d.topics ?? []).map((t: any) => {
      const p = t.performance;
      const total = p ? (p.correctCount + p.errorCount) : 0;
      const acc = total > 0 ? Math.round(p.correctCount / total * 100) : null;
      return { ...t, disciplineId: d.disciplineId, disciplineName: d.name, disciplineColor: d.color, accuracy: acc, questions: total };
    })
  ), [disciplines]);

  const withData = allTopics.filter(t => t.accuracy !== null);
  const totalCorrectAll = withData.reduce((s, t) => s + (t.performance?.correctCount ?? 0), 0);
  const totalQuestionsAll = withData.reduce((s, t) => s + t.questions, 0);
  const avgAccuracy = totalQuestionsAll > 0 ? Math.round(totalCorrectAll / totalQuestionsAll * 100) : 0;
  const strongTopics = withData.filter(t => t.accuracy! >= 70).length;
  const weakTopics = withData.filter(t => t.accuracy! < 50).length;

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const filtered = useMemo(() => {
    let list = allTopics;
    if (filterDisc) list = list.filter(t => t.disciplineId === filterDisc);
    if (search) list = list.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
    if (filterPerf === "strong") list = list.filter(t => t.accuracy !== null && t.accuracy >= 70);
    if (filterPerf === "weak") list = list.filter(t => t.accuracy !== null && t.accuracy < 50);
    if (filterPerf === "no_data") list = list.filter(t => t.accuracy === null);

    return [...list].sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === "name") { va = a.name; vb = b.name; }
      else if (sortKey === "accuracy") { va = a.accuracy ?? -1; vb = b.accuracy ?? -1; }
      else if (sortKey === "questions") { va = a.questions; vb = b.questions; }
      else { va = a.studyTimeSeconds || 0; vb = b.studyTimeSeconds || 0; }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [allTopics, filterDisc, search, sortKey, sortDir, filterPerf]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortDir === "desc" ? <ChevronDown className="h-3 w-3 inline ml-0.5" /> : <ChevronUp className="h-3 w-3 inline ml-0.5" />
      : <ArrowUpDown className="h-3 w-3 inline ml-0.5 opacity-30" />;

  const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black" style={{ color: "var(--app-fg)" }}>Por Tema</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-text)" }}>Desempenho detalhado em cada tema estudado</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total de temas", value: allTopics.length, color: "var(--primary)", icon: BookOpen },
          { label: "Média de acerto", value: `${avgAccuracy}%`, color: avgAccuracy >= 70 ? "var(--accent-green)" : avgAccuracy >= 50 ? "var(--accent-amber)" : "var(--accent-red, #dc2626)", icon: Target },
          { label: "Pontos fortes (≥70%)", value: strongTopics, color: "var(--accent-green)", icon: TrendingUp },
          { label: "Para reforçar (<50%)", value: weakTopics, color: "var(--accent-red, #dc2626)", icon: TrendingDown },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="rounded-2xl p-4" style={{ background: "var(--card-bg, var(--app-bg))", border: "1px solid var(--card-border)" }}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className="h-4 w-4" style={{ color }} />
              <span className="text-xs" style={{ color: "var(--muted-text)" }}>{label}</span>
            </div>
            <p className="text-2xl font-black" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
        {/* Filtros */}
        <div className="px-5 py-4 space-y-3" style={{ background: "var(--stat-bg)", borderBottom: "1px solid var(--card-border)" }}>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--muted-text)" }} />
              <input placeholder="Buscar tema..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl text-xs outline-none w-44" style={inputStyle} />
            </div>

            <select value={filterDisc ?? ""} onChange={e => setFilterDisc(e.target.value ? Number(e.target.value) : null)}
              className="px-3 py-1.5 rounded-xl text-xs outline-none" style={inputStyle}>
              <option value="">Todas as disciplinas</option>
              {disciplines.map((d: any) => (
                <option key={d.disciplineId} value={d.disciplineId}>{d.name}</option>
              ))}
            </select>

            <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
              {([ ["all", "Todos"], ["strong", "Forte ≥70%"], ["weak", "Fraco <50%"], ["no_data", "Sem dados"] ] as [string, string][]).map(([val, label]) => (
                <button key={val} onClick={() => setFilterPerf(val as any)}
                  className="px-3 py-1.5 text-xs font-medium transition-all"
                  style={{ background: filterPerf === val ? "var(--primary)" : "transparent", color: filterPerf === val ? "white" : "var(--muted-text)" }}>
                  {label}
                </button>
              ))}
            </div>

            <span className="text-xs self-center" style={{ color: "var(--muted-text)" }}>{filtered.length} tema{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ background: "var(--card-bg, var(--app-bg))" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)", background: "var(--stat-bg)" }}>
                <th className="text-left px-5 py-2.5">
                  <button onClick={() => handleSort("name")} className="font-semibold hover:opacity-70 flex items-center gap-0.5" style={{ color: "var(--muted-text)" }}>
                    Tema <SortIcon k="name" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-center">
                  <button onClick={() => handleSort("accuracy")} className="font-semibold hover:opacity-70" style={{ color: "var(--muted-text)" }}>
                    Acerto <SortIcon k="accuracy" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-center">
                  <button onClick={() => handleSort("questions")} className="font-semibold hover:opacity-70" style={{ color: "var(--muted-text)" }}>
                    Questões <SortIcon k="questions" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-center hidden md:table-cell">
                  <button onClick={() => handleSort("studyTime")} className="font-semibold hover:opacity-70" style={{ color: "var(--muted-text)" }}>
                    Tempo <SortIcon k="studyTime" />
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left" style={{ color: "var(--muted-text)" }}>Disciplina</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr key={t.id}
                  style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--card-border)" : "none" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--stat-bg)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <td className="px-5 py-3 max-w-xs">
                    <p className="font-medium truncate" style={{ color: "var(--app-fg)" }}>{t.name}</p>
                  </td>
                  <td className="px-3 py-3 text-center"><AccuracyBadge pct={t.accuracy} /></td>
                  <td className="px-3 py-3 text-center">
                    {t.questions > 0
                      ? <span className="font-semibold tabular-nums" style={{ color: "var(--app-fg)" }}>{t.questions}</span>
                      : <span style={{ color: "var(--muted-text)" }}>—</span>}
                  </td>
                  <td className="px-3 py-3 text-center hidden md:table-cell" style={{ color: "var(--muted-text)" }}>
                    {t.studyTimeSeconds > 0 ? formatTime(t.studyTimeSeconds) : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: `${t.disciplineColor}18`, color: t.disciplineColor }}>
                      {t.disciplineName}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs" style={{ color: "var(--muted-text)" }}>
                    Nenhum tema encontrado com esses filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {allTopics.length === 0 && (
        <div className="soe-card p-12 text-center">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm" style={{ color: "var(--muted-text)" }}>Nenhum dado disponível ainda.</p>
        </div>
      )}
    </div>
  );
}
