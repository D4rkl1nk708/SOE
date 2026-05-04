import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  Trophy,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  BookOpen,
  Target,
  Timer,
  Swords,
  RotateCcw,
  Check,
  X,
} from "lucide-react";

type SimuladoPhase = "config" | "running" | "result";

interface QuestionResult {
  disciplineId: number;
  disciplineName: string;
  correct: boolean;
  timeSeconds: number;
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ── Config screen ──────────────────────────────────────────────────────────────
function ConfigScreen({
  disciplines,
  onStart,
}: {
  disciplines: any[];
  onStart: (config: {
    disciplineIds: number[];
    totalQuestions: number;
    timeLimitMinutes: number;
  }) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [totalQ, setTotalQ] = useState(30);
  const [timeLimit, setTimeLimit] = useState(60);

  const toggleDisc = (id: number) => {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const selectAll = () =>
    setSelected(new Set(disciplines.map((d: any) => d.id)));
  const clearAll = () => setSelected(new Set());

  const canStart = selected.size > 0 && totalQ > 0 && timeLimit > 0;

  const inputStyle = {
    background: "var(--input-bg)",
    border: "1px solid var(--card-border)",
    color: "var(--app-fg)",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black" style={{ color: "var(--app-fg)" }}>
          Simulado Cronometrado
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-text)" }}>
          Configure e simule condições reais de prova
        </p>
      </div>

      {/* Discipline selection */}
      <div
        className="rounded-2xl p-5 space-y-3"
        style={{
          background: "var(--card-bg, var(--app-bg))",
          border: "1px solid var(--card-border)",
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>
            Disciplinas
          </h3>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-xs px-2.5 py-1 rounded-lg"
              style={{
                color: "var(--primary)",
                background:
                  "color-mix(in srgb, var(--primary) 10%, transparent)",
              }}
            >
              Todas
            </button>
            <button
              onClick={clearAll}
              className="text-xs px-2.5 py-1 rounded-lg"
              style={{
                color: "var(--muted-text)",
                background: "var(--stat-bg)",
              }}
            >
              Limpar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {disciplines.map((d: any) => {
            const isSelected = selected.has(d.id);
            return (
              <button
                key={d.id}
                onClick={() => toggleDisc(d.id)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                style={{
                  background: isSelected ? `${d.color}18` : "var(--stat-bg)",
                  border: `1px solid ${isSelected ? d.color : "var(--card-border)"}`,
                }}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: d.color }}
                />
                <span
                  className="text-sm font-medium flex-1 truncate"
                  style={{ color: "var(--app-fg)" }}
                >
                  {d.name}
                </span>
                {isSelected && (
                  <Check
                    className="h-4 w-4 shrink-0"
                    style={{ color: d.color }}
                  />
                )}
              </button>
            );
          })}
        </div>
        {selected.size > 0 && (
          <p className="text-xs" style={{ color: "var(--muted-text)" }}>
            {selected.size} disciplina{selected.size !== 1 ? "s" : ""}{" "}
            selecionada{selected.size !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Config */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{
          background: "var(--card-bg, var(--app-bg))",
          border: "1px solid var(--card-border)",
        }}
      >
        <h3 className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>
          Configurações do Simulado
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              className="text-xs font-medium block mb-1.5"
              style={{ color: "var(--muted-text)" }}
            >
              Nº de questões
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={totalQ}
              onChange={(e) =>
                setTotalQ(Math.max(1, Math.min(200, Number(e.target.value))))
              }
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none text-center font-bold"
              style={inputStyle}
            />
          </div>
          <div>
            <label
              className="text-xs font-medium block mb-1.5"
              style={{ color: "var(--muted-text)" }}
            >
              Tempo limite (min)
            </label>
            <input
              type="number"
              min={1}
              max={480}
              value={timeLimit}
              onChange={(e) =>
                setTimeLimit(Math.max(1, Math.min(480, Number(e.target.value))))
              }
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none text-center font-bold"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Presets */}
        <div>
          <p className="text-xs mb-2" style={{ color: "var(--muted-text)" }}>
            Presets rápidos:
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Mini (10q / 20min)", q: 10, t: 20 },
              { label: "Médio (30q / 1h)", q: 30, t: 60 },
              { label: "Completo (100q / 3h)", q: 100, t: 180 },
              { label: "Polícia (120q / 4h)", q: 120, t: 240 },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  setTotalQ(p.q);
                  setTimeLimit(p.t);
                }}
                className="text-xs px-3 py-1.5 rounded-full transition-all"
                style={{
                  background: "var(--stat-bg)",
                  border: "1px solid var(--card-border)",
                  color: "var(--muted-text)",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="p-3 rounded-xl flex items-center gap-2"
          style={{
            background:
              "color-mix(in srgb, var(--accent-blue, #2563eb) 8%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--accent-blue, #2563eb) 20%, transparent)",
          }}
        >
          <Timer
            className="h-4 w-4 shrink-0"
            style={{ color: "var(--accent-blue, #2563eb)" }}
          />
          <p
            className="text-xs"
            style={{ color: "var(--accent-blue, #2563eb)" }}
          >
            Ritmo sugerido:{" "}
            <strong>
              {Math.floor((timeLimit / totalQ) * 60)}s por questão
            </strong>{" "}
            ({(timeLimit / totalQ).toFixed(1)} min/questão)
          </p>
        </div>
      </div>

      <button
        disabled={!canStart}
        onClick={() =>
          onStart({
            disciplineIds: Array.from(selected),
            totalQuestions: totalQ,
            timeLimitMinutes: timeLimit,
          })
        }
        className="w-full py-4 rounded-2xl font-bold text-lg text-white disabled:opacity-40 transition-all hover:opacity-90 active:scale-[0.99] flex items-center justify-center gap-3"
        style={{ background: "var(--primary)" }}
      >
        <Swords className="h-6 w-6" /> Iniciar Simulado
      </button>
    </div>
  );
}

// ── Running screen ─────────────────────────────────────────────────────────────
function RunningScreen({
  config,
  disciplines,
  onFinish,
}: {
  config: {
    disciplineIds: number[];
    totalQuestions: number;
    timeLimitMinutes: number;
  };
  disciplines: any[];
  onFinish: (results: QuestionResult[], totalTime: number) => void;
}) {
  const [currentQ, setCurrentQ] = useState(1);
  const [timeLeft, setTimeLeft] = useState(config.timeLimitMinutes * 60);
  const [elapsedSinceQ, setElapsedSinceQ] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [selectedDiscId, setSelectedDiscId] = useState<number>(
    config.disciplineIds[0],
  );
  const [paused, setPaused] = useState(false);
  const totalElapsed = useRef(0);
  const startTime = useRef(Date.now());

  const selectedDiscs = disciplines.filter((d: any) =>
    config.disciplineIds.includes(d.id),
  );

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 0) return 0;
        return t - 1;
      });
      totalElapsed.current++;
      setElapsedSinceQ((e) => e + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [paused]);

  useEffect(() => {
    if (timeLeft === 0 && !paused) {
      onFinish(results, totalElapsed.current);
    }
  }, [timeLeft, paused]);

  const handleAnswer = (correct: boolean) => {
    const disc = disciplines.find((d: any) => d.id === selectedDiscId);
    const newResults = [
      ...results,
      {
        disciplineId: selectedDiscId,
        disciplineName: disc?.name ?? "?",
        correct,
        timeSeconds: elapsedSinceQ,
      },
    ];
    setResults(newResults);
    setElapsedSinceQ(0);
    if (currentQ >= config.totalQuestions) {
      onFinish(newResults, totalElapsed.current);
    } else {
      setCurrentQ((q) => q + 1);
    }
  };

  const progress = ((currentQ - 1) / config.totalQuestions) * 100;
  const isUrgent = timeLeft < 300; // < 5 min
  const timeColor = isUrgent
    ? "var(--accent-red, #dc2626)"
    : timeLeft < 600
      ? "var(--accent-amber)"
      : "var(--accent-green)";

  return (
    <div className="max-w-2xl mx-auto space-y-4 py-4">
      {/* Header with timer */}
      <div
        className="rounded-2xl p-4 flex items-center justify-between gap-4"
        style={{
          background: "var(--card-bg, var(--app-bg))",
          border: `2px solid ${timeColor}`,
        }}
      >
        <div className="text-center">
          <p
            className="text-[10px] uppercase tracking-widest font-bold"
            style={{ color: "var(--muted-text)" }}
          >
            Questão
          </p>
          <p className="text-2xl font-black" style={{ color: "var(--app-fg)" }}>
            {currentQ}
            <span
              className="text-base font-normal"
              style={{ color: "var(--muted-text)" }}
            >
              /{config.totalQuestions}
            </span>
          </p>
        </div>
        <div className="flex-1">
          <div
            className="h-3 rounded-full overflow-hidden"
            style={{ background: "var(--stat-bg)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, background: "var(--primary)" }}
            />
          </div>
          <p
            className="text-xs mt-1 text-center"
            style={{ color: "var(--muted-text)" }}
          >
            {results.filter((r) => r.correct).length} corretas ·{" "}
            {results.filter((r) => !r.correct).length} erradas
          </p>
        </div>
        <div className="text-center">
          <p
            className="text-[10px] uppercase tracking-widest font-bold"
            style={{ color: "var(--muted-text)" }}
          >
            Tempo
          </p>
          <p
            className={`text-2xl font-black font-mono ${isUrgent ? "animate-pulse" : ""}`}
            style={{ color: timeColor }}
          >
            {formatTime(timeLeft)}
          </p>
        </div>
      </div>

      {/* Question card */}
      <div
        className="rounded-2xl p-6 space-y-5"
        style={{
          background: "var(--card-bg, var(--app-bg))",
          border: "1px solid var(--card-border)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>
              Selecione a disciplina desta questão:
            </p>
          </div>
          <div
            className="text-xs px-2 py-1 rounded-lg font-mono"
            style={{ background: "var(--stat-bg)", color: "var(--muted-text)" }}
          >
            ⏱ {formatTime(elapsedSinceQ)}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {selectedDiscs.map((d: any) => (
            <button
              key={d.id}
              onClick={() => setSelectedDiscId(d.id)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all text-sm font-medium"
              style={{
                background:
                  selectedDiscId === d.id ? `${d.color}20` : "var(--stat-bg)",
                border: `1.5px solid ${selectedDiscId === d.id ? d.color : "var(--card-border)"}`,
                color: "var(--app-fg)",
              }}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: d.color }}
              />
              <span className="truncate">{d.name}</span>
              {selectedDiscId === d.id && (
                <Check
                  className="h-4 w-4 ml-auto shrink-0"
                  style={{ color: d.color }}
                />
              )}
            </button>
          ))}
        </div>

        <div className="h-px" style={{ background: "var(--card-border)" }} />

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleAnswer(false)}
            className="flex flex-col items-center gap-2 py-5 rounded-2xl font-bold transition-all hover:scale-[1.02] active:scale-95"
            style={{
              background:
                "color-mix(in srgb, var(--accent-red, #dc2626) 12%, transparent)",
              border:
                "2px solid color-mix(in srgb, var(--accent-red, #dc2626) 35%, transparent)",
              color: "var(--accent-red, #dc2626)",
            }}
          >
            <X className="h-8 w-8" />
            <span>Errei</span>
          </button>
          <button
            onClick={() => handleAnswer(true)}
            className="flex flex-col items-center gap-2 py-5 rounded-2xl font-bold transition-all hover:scale-[1.02] active:scale-95"
            style={{
              background:
                "color-mix(in srgb, var(--accent-green) 12%, transparent)",
              border:
                "2px solid color-mix(in srgb, var(--accent-green) 35%, transparent)",
              color: "var(--accent-green)",
            }}
          >
            <Check className="h-8 w-8" />
            <span>Acertei</span>
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={() => setPaused((p) => !p)}
          className="text-xs px-3 py-2 rounded-lg"
          style={{
            background: "var(--stat-bg)",
            border: "1px solid var(--card-border)",
            color: "var(--muted-text)",
          }}
        >
          {paused ? "▶ Retomar" : "⏸ Pausar"}
        </button>
        <button
          onClick={() => {
            if (
              confirm(
                "Encerrar simulado agora? Os resultados parciais serão calculados.",
              )
            )
              onFinish(results, totalElapsed.current);
          }}
          className="text-xs px-3 py-2 rounded-lg"
          style={{
            background: "var(--stat-bg)",
            border: "1px solid var(--card-border)",
            color: "var(--accent-red, #dc2626)",
          }}
        >
          Encerrar
        </button>
      </div>
    </div>
  );
}

// ── Results screen ─────────────────────────────────────────────────────────────
function ResultsScreen({
  results,
  totalTime,
  config,
  onRetry,
  onBack,
}: {
  results: QuestionResult[];
  totalTime: number;
  config: { totalQuestions: number; timeLimitMinutes: number };
  onRetry: () => void;
  onBack: () => void;
}) {
  const correct = results.filter((r) => r.correct).length;
  const wrong = results.filter((r) => !r.correct).length;
  const answered = results.length;
  const pct = answered > 0 ? Math.round((correct / answered) * 100) : 0;

  const byDisc = useMemo(() => {
    const map: Record<
      string,
      { name: string; correct: number; total: number; color?: string }
    > = {};
    for (const r of results) {
      if (!map[r.disciplineId])
        map[r.disciplineId] = { name: r.disciplineName, correct: 0, total: 0 };
      map[r.disciplineId].total++;
      if (r.correct) map[r.disciplineId].correct++;
    }
    return Object.values(map).sort(
      (a, b) => b.correct / b.total - a.correct / a.total,
    );
  }, [results]);

  const avgTime = answered > 0 ? Math.round(totalTime / answered) : 0;
  const grade =
    pct >= 80
      ? "Excelente!"
      : pct >= 60
        ? "Bom resultado"
        : pct >= 40
          ? "Precisa melhorar"
          : "Continue praticando";
  const gradeColor =
    pct >= 80
      ? "var(--accent-green)"
      : pct >= 60
        ? "var(--primary)"
        : pct >= 40
          ? "var(--accent-amber)"
          : "var(--accent-red, #dc2626)";

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Score card */}
      <div
        className="rounded-2xl p-6 text-center space-y-3"
        style={{
          background: "var(--card-bg, var(--app-bg))",
          border: `2px solid ${gradeColor}`,
        }}
      >
        <Trophy className="h-12 w-12 mx-auto" style={{ color: gradeColor }} />
        <p className="text-2xl font-black" style={{ color: gradeColor }}>
          {grade}
        </p>
        <div className="text-6xl font-black" style={{ color: gradeColor }}>
          {pct}%
        </div>
        <p className="text-sm" style={{ color: "var(--muted-text)" }}>
          {correct} de {answered} questões corretas · {formatTime(totalTime)} de{" "}
          {config.timeLimitMinutes}min
        </p>
        {/* Progress bar */}
        <div
          className="h-4 rounded-full overflow-hidden"
          style={{ background: "var(--stat-bg)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: gradeColor }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Corretas", value: correct, color: "var(--accent-green)" },
          {
            label: "Erradas",
            value: wrong,
            color: "var(--accent-red, #dc2626)",
          },
          {
            label: "Tempo/questão",
            value: `${avgTime}s`,
            color: "var(--primary)",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl p-4 text-center"
            style={{
              background: "var(--stat-bg)",
              border: "1px solid var(--card-border)",
            }}
          >
            <p className="text-2xl font-black" style={{ color: s.color }}>
              {s.value}
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--muted-text)" }}
            >
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* By discipline */}
      {byDisc.length > 1 && (
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{
            background: "var(--card-bg, var(--app-bg))",
            border: "1px solid var(--card-border)",
          }}
        >
          <h3 className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>
            Por disciplina
          </h3>
          {byDisc.map((d) => {
            const dpct = Math.round((d.correct / d.total) * 100);
            return (
              <div key={d.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span
                    className="font-medium"
                    style={{ color: "var(--app-fg)" }}
                  >
                    {d.name}
                  </span>
                  <span
                    style={{
                      color:
                        dpct >= 60
                          ? "var(--accent-green)"
                          : "var(--accent-red, #dc2626)",
                    }}
                  >
                    {d.correct}/{d.total} ({dpct}%)
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: "var(--stat-bg)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${dpct}%`,
                      background:
                        dpct >= 60
                          ? "var(--accent-green)"
                          : "var(--accent-red, #dc2626)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white"
          style={{ background: "var(--primary)" }}
        >
          <RotateCcw className="h-4 w-4" /> Novo Simulado
        </button>
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-xl font-semibold"
          style={{
            background: "var(--stat-bg)",
            border: "1px solid var(--card-border)",
            color: "var(--app-fg)",
          }}
        >
          Voltar
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Simulado() {
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: disciplines = [] } = trpc.discipline.list.useQuery();

  const [phase, setPhase] = useState<SimuladoPhase>("config");
  const [config, setConfig] = useState<{
    disciplineIds: number[];
    totalQuestions: number;
    timeLimitMinutes: number;
  } | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [totalTime, setTotalTime] = useState(0);

  if (phase === "config" || !config) {
    return (
      <ConfigScreen
        disciplines={disciplines}
        onStart={(cfg) => {
          setConfig(cfg);
          setPhase("running");
        }}
      />
    );
  }

  if (phase === "running") {
    return (
      <RunningScreen
        config={config}
        disciplines={disciplines}
        onFinish={(res, time) => {
          setResults(res);
          setTotalTime(time);
          setPhase("result");
        }}
      />
    );
  }

  return (
    <ResultsScreen
      results={results}
      totalTime={totalTime}
      config={config}
      onRetry={() => {
        setConfig(null);
        setPhase("config");
      }}
      onBack={() => {
        setConfig(null);
        setPhase("config");
      }}
    />
  );
}
