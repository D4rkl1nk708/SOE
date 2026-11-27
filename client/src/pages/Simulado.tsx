import { trpc } from "@/lib/trpc";
import { PaceCard } from "@/components/apple/PaceCard";
import { summarizePace } from "@shared/examPace";
import { formatDateForDb } from "@shared/scheduling";
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
  Sparkles,
} from "lucide-react";

type SimuladoPhase = "config" | "running" | "result";

/** v6.9.11 (B5/4.8): régua da banca — forma do teste importa. */
type ExamBanca = "cebraspe" | "fgv" | "cesgranrio" | "outra";

interface SimuladoConfig {
  disciplineIds: number[];
  totalQuestions: number;
  timeLimitMinutes: number;
  banca: ExamBanca;
  negativeMarking: boolean;
  predictedAccuracy: number;
}

const BANCA_RULES: Record<
  ExamBanca,
  { label: string; negativeMarking: boolean; timePerQuestionSec: number }
> = {
  cebraspe: {
    label: "CEBRASPE",
    negativeMarking: true,
    timePerQuestionSec: 90,
  },
  fgv: { label: "FGV", negativeMarking: false, timePerQuestionSec: 180 },
  cesgranrio: {
    label: "Cesgranrio",
    negativeMarking: false,
    timePerQuestionSec: 180,
  },
  outra: { label: "Outra", negativeMarking: false, timePerQuestionSec: 90 },
};

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
  examRules,
  onStart,
}: {
  disciplines: any[];
  examRules?: {
    banca: ExamBanca;
    negativeMarking: boolean;
    timePerQuestionSec: number;
    totalItems: number;
  } | null;
  onStart: (config: SimuladoConfig) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [totalQ, setTotalQ] = useState(examRules?.totalItems || 30);
  const [timeLimit, setTimeLimit] = useState(
    examRules
      ? Math.ceil((examRules.totalItems * examRules.timePerQuestionSec) / 60)
      : 60,
  );
  const [banca, setBanca] = useState<ExamBanca>(examRules?.banca || "outra");
  const [negativeMarking, setNegativeMarking] = useState(
    examRules?.negativeMarking ?? false,
  );
  const [predicted, setPredicted] = useState(60);

  const applyBanca = (next: ExamBanca) => {
    setBanca(next);
    const rule = BANCA_RULES[next];
    setNegativeMarking(rule.negativeMarking);
  };

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
        <a
          href="/simulado-inteligente"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <Sparkles className="h-3.5 w-3.5" /> Usar simulado inteligente com
          questões reais
        </a>
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

        {/* v6.9.11 (B5/4.8): régua da banca */}
        <div>
          <p className="text-xs mb-2" style={{ color: "var(--muted-text)" }}>
            Régua da banca:
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BANCA_RULES) as ExamBanca[]).map((key) => (
              <button
                key={key}
                onClick={() => applyBanca(key)}
                className="text-xs px-3 py-1.5 rounded-full font-semibold"
                style={{
                  background:
                    banca === key
                      ? "color-mix(in srgb, var(--primary) 14%, transparent)"
                      : "var(--stat-bg)",
                  border: `1px solid ${
                    banca === key ? "var(--primary)" : "var(--card-border)"
                  }`,
                  color: banca === key ? "var(--primary)" : "var(--muted-text)",
                }}
              >
                {BANCA_RULES[key].label}
              </button>
            ))}
          </div>
          <p
            className="mt-2 text-[11px]"
            style={{ color: "var(--muted-text)" }}
          >
            {banca === "cebraspe"
              ? "Cebraspe: 1 erro anula 1 acerto (nota = acertos − erros)."
              : `${BANCA_RULES[banca].label}: ${BANCA_RULES[banca].timePerQuestionSec}s por questão, sem penalidade.`}
          </p>
        </div>

        {/* Previsão antes do bloco (B4/4.7) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              className="text-xs font-medium"
              style={{ color: "var(--muted-text)" }}
            >
              Quantas dessas você acha que acerta?
            </label>
            <span
              className="text-sm font-bold"
              style={{ color: "var(--app-fg)" }}
            >
              {predicted}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={predicted}
            onChange={(e) => setPredicted(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
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
            banca,
            negativeMarking,
            predictedAccuracy: predicted,
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
  // v6.9.7 (item 4): alvo por questão derivado do tempo limite configurado.
  const paceSeconds = Math.max(
    10,
    Math.round(
      (config.timeLimitMinutes * 60) / Math.max(1, config.totalQuestions),
    ),
  );
  const paceState =
    elapsedSinceQ > paceSeconds * 2
      ? "critical"
      : elapsedSinceQ > paceSeconds
        ? "late"
        : elapsedSinceQ < paceSeconds * 0.6
          ? "ahead"
          : "on";
  const paceLabel =
    paceState === "critical"
      ? `2× o alvo · ${elapsedSinceQ}s`
      : paceState === "late"
        ? `atrasado ${elapsedSinceQ - paceSeconds}s`
        : paceState === "ahead"
          ? `adiantado ${paceSeconds - elapsedSinceQ}s`
          : `no ritmo · ${elapsedSinceQ}s`;
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
          {/* v6.9.7 (item 4): ritmo da questão atual, discreto e sem bloquear. */}
          <p
            className="mt-1 text-[10px] font-semibold whitespace-nowrap"
            style={{
              color:
                paceState === "critical"
                  ? "var(--accent-red, #dc2626)"
                  : paceState === "late"
                    ? "var(--accent-amber)"
                    : paceState === "ahead"
                      ? "var(--accent-green)"
                      : "var(--muted-text)",
            }}
            title={`Alvo: ${paceSeconds}s por questão`}
          >
            {paceLabel}
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
  onSave,
  saved,
}: {
  results: QuestionResult[];
  totalTime: number;
  config: SimuladoConfig;
  onRetry: () => void;
  onBack: () => void;
  onSave: (wrapper: Record<string, unknown>) => Promise<void> | void;
  saved: boolean;
}) {
  const correct = results.filter((r) => r.correct).length;
  const wrong = results.filter((r) => !r.correct).length;
  const answered = results.length;
  const pct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  const finalScore = config.negativeMarking ? correct - wrong : correct;
  // v6.9.11 (B5/4.8): exam wrapper — 6 perguntas obrigatórias para fechar.
  const [errorType, setErrorType] = useState<
    "conceito" | "literalidade" | "leitura" | "desatencao" | "banca" | "tempo"
  >("conceito");
  const [paceIssue, setPaceIssue] = useState<"sim" | "nao">("nao");
  const [whatChanges, setWhatChanges] = useState("");
  const [nextFocus, setNextFocus] = useState("");
  const [confidenceChange, setConfidenceChange] = useState<
    "mais" | "menos" | "igual"
  >("igual");
  const [saving, setSaving] = useState(false);
  const wrapperComplete =
    whatChanges.trim().length >= 10 && nextFocus.trim().length >= 3;

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
  // v6.9.7 (item 4): ritmo real da prova (tempo por questão já é medido aqui).
  const paceSeconds = Math.max(
    10,
    Math.round(
      (config.timeLimitMinutes * 60) / Math.max(1, config.totalQuestions),
    ),
  );
  const paceSummary = summarizePace(
    results.map((item) => ({ answered: true, seconds: item.timeSeconds })),
    paceSeconds,
    config.totalQuestions,
  );
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

      {/* v6.9.7 (item 4): bloco de ritmo */}
      <PaceCard summary={paceSummary} />

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

      {/* v6.9.11 (B5/4.8): exam wrapper — reflexão estruturada pós-prova. */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{
          background: "var(--card-bg, var(--app-bg))",
          border: "1px solid var(--card-border)",
        }}
      >
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: "var(--muted-text)" }}
          >
            Pós-prova (exam wrapper)
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted-text)" }}>
            Seis perguntas que fecham o relatório: previsão × resultado, tipo de
            erro dominante e o que muda no plano na próxima semana.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div
            className="rounded-xl p-3"
            style={{ background: "var(--stat-bg)" }}
          >
            <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>
              1. Previsão × resultado
            </p>
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--app-fg)" }}
            >
              Previu {config.predictedAccuracy}% · obteve {pct}% (
              {pct - config.predictedAccuracy > 0 ? "+" : ""}
              {pct - config.predictedAccuracy} p.p.)
            </p>
          </div>
          <div
            className="rounded-xl p-3"
            style={{ background: "var(--stat-bg)" }}
          >
            <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>
              Nota com régua da banca
            </p>
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--app-fg)" }}
            >
              {config.negativeMarking
                ? `${finalScore} ponto(s) — 1 erro anula 1 acerto`
                : `${correct}/${answered} acertos`}
            </p>
          </div>
        </div>

        <div>
          <p
            className="text-[11px] font-medium mb-1.5"
            style={{ color: "var(--muted-text)" }}
          >
            2. Tipo de erro dominante
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["conceito", "Conceito"],
                ["literalidade", "Literalidade"],
                ["leitura", "Leitura"],
                ["desatencao", "Desatenção"],
                ["banca", "Banca"],
                ["tempo", "Tempo"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setErrorType(value)}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  background:
                    errorType === value
                      ? "color-mix(in srgb, var(--primary) 14%, transparent)"
                      : "var(--stat-bg)",
                  border: `1px solid ${
                    errorType === value
                      ? "var(--primary)"
                      : "var(--card-border)"
                  }`,
                  color:
                    errorType === value
                      ? "var(--primary)"
                      : "var(--muted-text)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p
            className="text-[11px] font-medium mb-1.5"
            style={{ color: "var(--muted-text)" }}
          >
            3. O tempo foi problema?
          </p>
          <div className="flex gap-2">
            {(["sim", "nao"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setPaceIssue(value)}
                className="rounded-full px-3 py-1 text-[11px] font-semibold"
                style={{
                  background:
                    paceIssue === value ? "var(--stat-bg)" : "transparent",
                  border: `1px solid ${
                    paceIssue === value
                      ? "var(--primary)"
                      : "var(--card-border)"
                  }`,
                  color: "var(--app-fg)",
                }}
              >
                {value === "sim" ? "Sim" : "Não"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p
            className="text-[11px] font-medium mb-1.5"
            style={{ color: "var(--muted-text)" }}
          >
            4. O que muda no plano na próxima semana
          </p>
          <textarea
            rows={2}
            value={whatChanges}
            onChange={(e) => setWhatChanges(e.target.value)}
            placeholder="Ex.: 20 min de lei seca por dia antes das questões."
            className="w-full resize-none rounded-xl px-3 py-2 text-sm"
            style={{
              background: "var(--input-bg)",
              border: "1px solid var(--card-border)",
              color: "var(--app-fg)",
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p
              className="text-[11px] font-medium mb-1.5"
              style={{ color: "var(--muted-text)" }}
            >
              5. Próximo foco
            </p>
            <input
              value={nextFocus}
              onChange={(e) => setNextFocus(e.target.value)}
              placeholder="Ex.: competência × atribuição"
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--card-border)",
                color: "var(--app-fg)",
              }}
            />
          </div>
          <div>
            <p
              className="text-[11px] font-medium mb-1.5"
              style={{ color: "var(--muted-text)" }}
            >
              6. Sua confiança mudou?
            </p>
            <div className="flex gap-2">
              {(
                [
                  ["mais", "Mais"],
                  ["igual", "Igual"],
                  ["menos", "Menos"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setConfidenceChange(value)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    background:
                      confidenceChange === value
                        ? "var(--stat-bg)"
                        : "transparent",
                    border: `1px solid ${
                      confidenceChange === value
                        ? "var(--primary)"
                        : "var(--card-border)"
                    }`,
                    color: "var(--app-fg)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          disabled={!wrapperComplete || saving || saved}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({
                predictedPct: config.predictedAccuracy,
                errorType,
                paceIssue: paceIssue === "sim",
                whatChanges: whatChanges.trim(),
                nextFocus: nextFocus.trim(),
                confidenceChange,
                completedAt: new Date().toISOString(),
              });
            } finally {
              setSaving(false);
            }
          }}
          className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-40"
          style={{ background: "var(--primary)" }}
        >
          {saved
            ? "Simulado salvo"
            : saving
              ? "Salvando…"
              : "Salvar simulado e fechar relatório"}
        </button>
        {!wrapperComplete && !saved && (
          <p className="text-[11px]" style={{ color: "var(--muted-text)" }}>
            Preencha o que muda no plano e o próximo foco para fechar o
            relatório.
          </p>
        )}
      </div>

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
  const utils = trpc.useUtils();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: disciplines = [] } = trpc.discipline.list.useQuery();
  const settings = ((stats as any)?.settings ?? {}) as Record<string, any>;
  const examRules = settings.examRules || null;

  const [phase, setPhase] = useState<SimuladoPhase>("config");
  const [config, setConfig] = useState<SimuladoConfig | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [totalTime, setTotalTime] = useState(0);
  const [predictionId, setPredictionId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const savePrediction = trpc.study.savePrediction.useMutation();
  const saveRules = trpc.auth.updateSettings.useMutation();
  const createExam = trpc.mockExam.create.useMutation();

  if (phase === "config" || !config) {
    return (
      <ConfigScreen
        disciplines={disciplines}
        examRules={examRules}
        onStart={(cfg) => {
          setConfig(cfg);
          setSaved(false);
          setPhase("running");
          // v6.9.11 (B4): previsão registrada ANTES da prova.
          savePrediction.mutate(
            {
              predictedPct: cfg.predictedAccuracy,
              questions: cfg.totalQuestions,
              disciplineId: cfg.disciplineIds[0] ?? null,
              source: "simulado",
            },
            { onSuccess: (data: any) => setPredictionId(data?.id ?? null) },
          );
          // Régua da banca fica salva como preferência (reversível).
          saveRules.mutate(
            {
              examRules: {
                banca: cfg.banca,
                negativeMarking: cfg.negativeMarking,
                timePerQuestionSec: BANCA_RULES[cfg.banca].timePerQuestionSec,
                totalItems: cfg.totalQuestions,
              },
            },
            {
              onSuccess: () => utils.dashboard.getStats.invalidate(),
            },
          );
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

  const closeOrReset = () => {
    setConfig(null);
    setPhase("config");
  };

  return (
    <ResultsScreen
      results={results}
      totalTime={totalTime}
      config={config}
      saved={saved}
      onSave={(wrapper) => {
        const correct = results.filter((item) => item.correct).length;
        const wrong = results.filter((item) => !item.correct).length;
        const blank = Math.max(0, config.totalQuestions - results.length);
        createExam.mutate(
          {
            name: `Simulado ${BANCA_RULES[config.banca].label}`,
            date: formatDateForDb(new Date()),
            correct,
            wrong,
            blank,
            totalQuestions: config.totalQuestions,
            mode: config.banca === "cebraspe" ? "cebraspe" : "multiple",
            durationMinutes: config.timeLimitMinutes,
            status: "completed",
            completedAt: new Date().toISOString(),
            wrapper,
          } as any,
          {
            onSuccess: () => {
              setSaved(true);
              if (predictionId) {
                const pct =
                  config.totalQuestions > 0
                    ? Math.round((correct / config.totalQuestions) * 100)
                    : 0;
                savePrediction.mutate({
                  id: predictionId,
                  predictedPct: config.predictedAccuracy,
                  actualPct: pct,
                  questions: config.totalQuestions,
                  source: "simulado",
                });
              }
              void utils.mockExam.list.invalidate();
              void utils.study.calibration.invalidate();
              toast.success("Simulado salvo com o pós-prova.");
            },
            onError: (error) => toast.error(error.message),
          },
        );
      }}
      onRetry={closeOrReset}
      onBack={closeOrReset}
    />
  );
}
