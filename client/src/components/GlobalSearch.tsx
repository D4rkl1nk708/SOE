// @ts-nocheck
import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  Search,
  X,
  BookOpen,
  RefreshCw,
  ListChecks,
  ChevronRight,
} from "lucide-react";

interface SearchResult {
  type: "topic" | "discipline" | "revision";
  id: number | string;
  title: string;
  subtitle: string;
  href: string;
  color?: string;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: stats } = trpc.dashboard.getStats.useQuery(undefined, {
    enabled: open,
  });
  const { data: revisionsData } = trpc.revision.list.useQuery(
    { completed: false },
    { enabled: open },
  );

  // Ctrl+F / Cmd+F listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim() || !stats) return [];
    const q = query
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const match = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .includes(q);

    const out: SearchResult[] = [];

    // Disciplines
    for (const d of stats.disciplineStats ?? []) {
      if (match(d.name)) {
        out.push({
          type: "discipline",
          id: d.disciplineId,
          title: d.name,
          subtitle: `${d.topicCount ?? 0} temas`,
          href: "/disciplines",
          color: d.color,
        });
      }
    }

    // Topics
    for (const d of stats.disciplineStats ?? []) {
      for (const t of d.topics ?? []) {
        if (match(t.name) || match(d.name)) {
          const acc =
            t.performance &&
            t.performance.correctCount + t.performance.errorCount > 0
              ? Math.round(
                  (t.performance.correctCount /
                    (t.performance.correctCount + t.performance.errorCount)) *
                    100,
                )
              : null;
          out.push({
            type: "topic",
            id: t.id,
            title: t.name,
            subtitle: `${d.name}${acc !== null ? ` · ${acc}% acerto` : ""}`,
            href: "/",
            color: d.color,
          });
        }
      }
    }

    // Pending revisions/tests
    for (const rev of revisionsData ?? []) {
      const topicName =
        (stats.disciplineStats ?? [])
          .flatMap((d) => d.topics ?? [])
          .find((t: any) => t.id === rev.topicId)?.name ?? "Tema";
      const label =
        rev.type === "test" ? "Teste" : `Revisão ${rev.revisionNumber}`;
      if (match(topicName) || match(label)) {
        out.push({
          type: "revision",
          id: rev.id,
          title: topicName,
          subtitle: `${label} · ${rev.scheduledDate}`,
          href: "/calendar",
        });
      }
    }

    return out.slice(0, 12);
  }, [query, stats, revisionsData]);

  const iconFor = (type: SearchResult["type"]) => {
    if (type === "discipline") return <BookOpen className="w-3.5 h-3.5" />;
    if (type === "topic") return <ListChecks className="w-3.5 h-3.5" />;
    return <RefreshCw className="w-3.5 h-3.5" />;
  };

  const labelFor = (type: SearchResult["type"]) => {
    if (type === "discipline") return "Disciplina";
    if (type === "topic") return "Tema";
    return "Pendente";
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-start justify-center pt-[10vh]"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        className="w-full max-w-xl mx-4 rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
        }}
      >
        {/* Input */}
        <div
          className="flex items-center gap-3 px-4 py-3.5"
          style={{ borderBottom: "1px solid var(--card-border)" }}
        >
          <Search
            className="w-4 h-4 flex-shrink-0"
            style={{ color: "var(--muted-text)" }}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar temas, disciplinas, revisões..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--app-fg)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                navigate(results[0].href);
                setOpen(false);
              }
            }}
          />
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-lg hover:opacity-60"
            style={{ color: "var(--muted-text)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <ul className="py-1.5 max-h-80 overflow-y-auto">
            {results.map((r: any, i: any) => (
              <li key={`${r.type}-${r.id}-${i}`}>
                <button
                  onClick={() => {
                    navigate(r.href);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:opacity-80 transition-opacity"
                  style={{ color: "var(--app-fg)" }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: r.color ? `${r.color}22` : "var(--stat-bg)",
                      color: r.color || "var(--muted-text)",
                    }}
                  >
                    {iconFor(r.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <p
                      className="text-xs truncate"
                      style={{ color: "var(--muted-text)" }}
                    >
                      {r.subtitle}
                    </p>
                  </div>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0"
                    style={{
                      background: "var(--stat-bg)",
                      color: "var(--muted-text)",
                    }}
                  >
                    {labelFor(r.type)}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 opacity-30" />
                </button>
              </li>
            ))}
          </ul>
        ) : query.trim() ? (
          <div
            className="px-4 py-8 text-center text-sm"
            style={{ color: "var(--muted-text)" }}
          >
            Nenhum resultado para "<strong>{query}</strong>"
          </div>
        ) : (
          <div
            className="px-4 py-5 text-center text-xs"
            style={{ color: "var(--muted-text)" }}
          >
            Digite para buscar ·{" "}
            <kbd
              className="px-1.5 py-0.5 rounded text-[10px]"
              style={{
                background: "var(--stat-bg)",
                border: "1px solid var(--card-border)",
              }}
            >
              Esc
            </kbd>{" "}
            para fechar
          </div>
        )}
      </div>
    </div>
  );
}

// Botão discreto para abrir a busca (usado no header)
export function SearchButton() {
  const handleClick = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }),
    );
  };
  return (
    <button
      onClick={handleClick}
      title="Busca rápida (Ctrl+F)"
      className="p-2 rounded-xl hover:opacity-70 transition-opacity flex items-center gap-1.5"
      style={{ color: "var(--muted-text)" }}
    >
      <Search className="w-4 h-4" />
      <kbd
        className="hidden lg:inline text-[10px] px-1.5 py-0.5 rounded"
        style={{
          background: "var(--stat-bg)",
          border: "1px solid var(--card-border)",
          color: "var(--muted-text)",
        }}
      >
        Ctrl+F
      </kbd>
    </button>
  );
}
