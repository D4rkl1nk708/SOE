import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Brain, ChevronLeft, CheckCircle2, XCircle, Zap, AlertTriangle,
  BarChart2, Lock, RefreshCw, ChevronRight, Target, BookOpen,
  TrendingDown, Play, Trophy, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeakProfileChart } from "@/components/WeakProfileChart";

// ─── types ────────────────────────────────────────────────────────────────────

type Phase =
  | "config"      // API key + select discipline/topic
  | "profile"     // view weak profile, pick focus
  | "question"    // answering current question
  | "fixation"    // post-error fixation questions
  | "summary";    // end of session

interface SessionQuestion {
  questionId: string;
  source: "bank" | "ai";
  statement: string;
  alternatives: { letter: string; text: string }[];
  correctAnswer: string;
  banca: string;
  year?: number;
  topicName: string;
  disciplineName: string;
  hint: string | null;
}

interface SessionEntry {
  questionId: string;
  correct: boolean;
  errorOrigin?: string;
  userAnswer: string;
}

interface Diagnosis {
  diagnosis: string;
  concept: string;
  rule: string;
  fixationQuestions: Array<{
    statement: string;
    alternatives: { letter: string; text: string }[];
    correctAnswer: string;
    explanation: string;
  }>;
}

// ─── constants ────────────────────────────────────────────────────────────────

const API_KEY_KEY = "soe_mentor_api_key";
const API_PROVIDER_KEY = "soe_mentor_provider";
const SESSION_SIZE = 10;

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Fácil",
  medium: "Médio",
  hard: "Difícil",
};

function RenderText({ text }: { text: string }) {
  return (
    <div style={{ lineHeight: 1.75, fontSize: 13 }}>
      {text.split("\n").map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} style={{ marginBottom: line.trim() === "" ? "0.4rem" : 0 }}>
            {parts.map((p, j) =>
              p.startsWith("**") && p.endsWith("**") ? (
                <strong key={j}>{p.slice(2, -2)}</strong>
              ) : (
                <span key={j}>{p}</span>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function MentorSession() {
  const [, navigate] = useLocation();

  // Config
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_KEY) ?? "");
  const [provider, setProvider] = useState<"claude" | "gemini" | "openai">(
    () => (localStorage.getItem(API_PROVIDER_KEY) as any) ?? "claude"
  );

  // Session state
  const [phase, setPhase] = useState<Phase>("config");
  const [selectedDiscId, setSelectedDiscId] = useState<number | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [selectedDiscName, setSelectedDiscName] = useState("");
  const [selectedTopicName, setSelectedTopicName] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  const [currentQuestion, setCurrentQuestion] = useState<SessionQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [fixationIndex, setFixationIndex] = useState(0);
  const [fixationAnswer, setFixationAnswer] = useState<string | null>(null);
  const [fixationConfirmed, setFixationConfirmed] = useState(false);

  const [history, setHistory] = useState<SessionEntry[]>([]);
  const [sessionStart] = useState(Date.now());

  const utils = trpc.useUtils();
  const { data: disciplines } = trpc.discipline.list.useQuery();

  const generateQ = trpc.mentor.generateAdaptiveQuestion.useMutation();
  const diagnoseErr = trpc.mentor.diagnoseError.useMutation();
  const saveResult = trpc.mentor.saveSessionResult.useMutation();

  // ── auto-adjust difficulty based on recent performance ──────────────────
  const recentHits = history.slice(-4).filter((h) => h.correct).length;
  const adaptedDifficulty =
    history.length >= 4 && recentHits >= 4
      ? "hard"
      : history.length >= 4 && recentHits <= 1
      ? "easy"
      : difficulty;

  // ── fetch next question ──────────────────────────────────────────────────
  const fetchNextQuestion = () => {
    if (!selectedDiscId) return;
    setSelectedAnswer(null);
    setConfirmed(false);
    setShowHint(false);
    generateQ.mutate(
      {
        apiKey,
        provider,
        disciplineId: selectedDiscId,
        topicId: selectedTopicId ?? undefined,
        difficulty: adaptedDifficulty,
        sessionHistory: history,
      },
      {
        onSuccess: (q) => setCurrentQuestion(q as SessionQuestion),
        onError: (err) => toast.error(err.message),
      }
    );
  };

  // ── confirm answer ──────────────────────────────────────────────────────
  const confirmAnswer = async () => {
    if (!selectedAnswer || !currentQuestion) return;
    setConfirmed(true);
    const correct = selectedAnswer === currentQuestion.correctAnswer;
    const entry: SessionEntry = {
      questionId: currentQuestion.questionId,
      correct,
      userAnswer: selectedAnswer,
    };
    setHistory((prev) => [...prev, entry]);

    if (!correct) {
      // Fetch diagnosis
      diagnoseErr.mutate(
        {
          apiKey,
          provider,
          statement: currentQuestion.statement,
          alternatives: currentQuestion.alternatives,
          userAnswer: selectedAnswer,
          correctAnswer: currentQuestion.correctAnswer,
          disciplineName: currentQuestion.disciplineName,
          topicName: currentQuestion.topicName,
        },
        {
          onSuccess: (d) => {
            setDiagnosis(d as Diagnosis);
            setFixationIndex(0);
            setFixationAnswer(null);
            setFixationConfirmed(false);
            setPhase("fixation");
          },
          onError: (err) => {
            toast.error("Diagnóstico falhou: " + err.message);
            // Continue anyway
            checkEndOfSession([...history, entry]);
          },
        }
      );
    } else {
      checkEndOfSession([...history, entry]);
    }
  };

  const checkEndOfSession = (h: SessionEntry[]) => {
    if (h.length >= SESSION_SIZE) {
      endSession(h);
    } else {
      setPhase("question");
      fetchNextQuestion();
    }
  };

  const endSession = (h: SessionEntry[]) => {
    const correct = h.filter((e) => e.correct).length;
    const wrong = h.filter((e) => !e.correct).length;
    const elapsed = Math.round((Date.now() - sessionStart) / 1000);
    if (selectedDiscId) {
      saveResult.mutate({
        disciplineId: selectedDiscId,
        topicId: selectedTopicId ?? undefined,
        correct,
        wrong,
        durationSeconds: elapsed,
      });
    }
    utils.mentor.getWeakProfile.invalidate();
    setPhase("summary");
  };

  // ── after fixation question ─────────────────────────────────────────────
  const confirmFixation = () => {
    setFixationConfirmed(true);
  };

  const nextAfterFixation = () => {
    if (!diagnosis) return;
    if (fixationIndex < diagnosis.fixationQuestions.length - 1) {
      setFixationIndex((i) => i + 1);
      setFixationAnswer(null);
      setFixationConfirmed(false);
    } else {
      // Fixation done — continue session
      setDiagnosis(null);
      checkEndOfSession(history);
    }
  };

  // ── save config ─────────────────────────────────────────────────────────
  const saveConfig = () => {
    if (!apiKey.trim()) { toast.error("Informe a API Key"); return; }
    localStorage.setItem(API_KEY_KEY, apiKey);
    localStorage.setItem(API_PROVIDER_KEY, provider);
    setPhase("profile");
  };

  // ── start session ───────────────────────────────────────────────────────
  const startSession = () => {
    if (!selectedDiscId) { toast.error("Selecione uma disciplina"); return; }
    setHistory([]);
    setCurrentQuestion(null);
    setPhase("question");
    fetchNextQuestion();
  };

  const accuracy =
    history.length > 0
      ? Math.round((history.filter((h) => h.correct).length / history.length) * 100)
      : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.25rem" }}>
        <button
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.6, padding: 4 }}
        >
          <ChevronLeft size={20} />
        </button>
        <div
          style={{
            width: 32, height: 32, borderRadius: 9,
            background: "linear-gradient(135deg, #d4af37 0%, #f0d060 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Brain size={16} color="#1a1a1a" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>IA</div>
          <div style={{ fontSize: 11, opacity: 0.55 }}>Aprendizado adaptativo personalizado</div>
        </div>
        {history.length > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 12, opacity: 0.7 }}>
            <span>{history.length}/{SESSION_SIZE}</span>
            <span style={{ color: accuracy >= 60 ? "var(--success-fg, green)" : "var(--danger-fg, red)" }}>
              {accuracy}%
            </span>
          </div>
        )}
      </div>

      {/* ── PHASE: config ── */}
      {phase === "config" && (
        <div className="soe-card" style={{ padding: "1.5rem" }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: "1rem", display: "flex", alignItems: "center", gap: 8 }}>
            <Lock size={15} /> Configurar IA do Mentor
          </div>
          <label style={{ fontSize: 12, opacity: 0.65, display: "block", marginBottom: 4 }}>Provedor de IA</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as any)}
            style={{ width: "100%", marginBottom: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--card-border)", fontSize: 13, background: "var(--card-bg)", color: "var(--app-fg)" }}
          >
            <option value="claude">Claude (Anthropic) — recomendado</option>
            <option value="gemini">Gemini (Google)</option>
            <option value="openai">GPT-4o mini (OpenAI)</option>
          </select>
          <label style={{ fontSize: 12, opacity: 0.65, display: "block", marginBottom: 4 }}>API Key</label>
          <input
            type="password"
            placeholder="sk-ant-... / AIza... / sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ width: "100%", marginBottom: 16, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--card-border)", fontSize: 13, background: "var(--card-bg)", color: "var(--app-fg)" }}
          />
          <Button onClick={saveConfig} style={{ width: "100%" }}>
            Continuar <ChevronRight size={14} />
          </Button>
          <div style={{ fontSize: 11, opacity: 0.45, marginTop: 10, textAlign: "center" }}>
            Sua API Key é salva apenas localmente no browser.
          </div>
        </div>
      )}

      {/* ── PHASE: profile ── */}
      {phase === "profile" && (
        <div>
          <div className="soe-card" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: "1rem", display: "flex", alignItems: "center", gap: 6 }}>
              <BarChart2 size={15} /> Seus pontos fracos
            </div>
            <WeakProfileChart
              onSelectTopic={(discId, topicId, topicName, discName) => {
                setSelectedDiscId(discId);
                setSelectedTopicId(topicId);
                setSelectedTopicName(topicName);
                setSelectedDiscName(discName);
              }}
            />
          </div>

          <div className="soe-card" style={{ padding: "1.25rem" }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: "1rem", display: "flex", alignItems: "center", gap: 6 }}>
              <Target size={15} /> Configurar sessão
            </div>

            <label style={{ fontSize: 12, opacity: 0.65, display: "block", marginBottom: 4 }}>Disciplina *</label>
            <select
              value={selectedDiscId ?? ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                const name = disciplines?.find(d => d.id === id)?.name ?? "";
                setSelectedDiscId(id);
                setSelectedDiscName(name);
                setSelectedTopicId(null);
                setSelectedTopicName("");
              }}
              style={{ width: "100%", marginBottom: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--card-border)", fontSize: 13, background: "var(--card-bg)", color: "var(--app-fg)" }}
            >
              <option value="">Selecione...</option>
              {disciplines?.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            <label style={{ fontSize: 12, opacity: 0.65, display: "block", marginBottom: 4 }}>Nível de dificuldade inicial</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(["easy", "medium", "hard"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  style={{
                    flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 500,
                    border: `1px solid ${difficulty === d ? "#d4af37" : "var(--card-border)"}`,
                    background: difficulty === d ? "rgba(212,175,55,0.12)" : "none",
                    cursor: "pointer", color: "var(--app-fg)",
                  }}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>

            {selectedDiscId && (
              <div
                style={{
                  padding: "8px 12px", borderRadius: 8, marginBottom: 12,
                  background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.3)",
                  fontSize: 12,
                }}
              >
                <strong>Foco:</strong> {selectedDiscName || disciplines?.find(d => d.id === selectedDiscId)?.name}
                {selectedTopicName && ` › ${selectedTopicName}`}
                {selectedTopicName && (
                  <button
                    onClick={() => { setSelectedTopicId(null); setSelectedTopicName(""); }}
                    style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", opacity: 0.5, fontSize: 11 }}
                  >
                    remover tópico
                  </button>
                )}
              </div>
            )}

            <Button onClick={startSession} disabled={!selectedDiscId} style={{ width: "100%" }}>
              <Play size={14} /> Iniciar sessão ({SESSION_SIZE} questões)
            </Button>
          </div>
        </div>
      )}

      {/* ── PHASE: question ── */}
      {phase === "question" && (
        <div>
          {/* Progress */}
          <div style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
              <span>Questão {history.length + 1} de {SESSION_SIZE}</span>
              <span>
                {DIFFICULTY_LABELS[adaptedDifficulty]}
                {adaptedDifficulty !== difficulty && " (ajustado)"}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "var(--card-border)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%", borderRadius: 2,
                  width: `${(history.length / SESSION_SIZE) * 100}%`,
                  background: "linear-gradient(90deg, #d4af37, #f0d060)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {generateQ.isPending && (
            <div className="soe-card" style={{ padding: "3rem", textAlign: "center" }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: "0 auto 0.75rem", display: "block", opacity: 0.4 }} />
              <div style={{ fontSize: 13, opacity: 0.5 }}>
                {history.filter(h => !h.correct).length > 0
                  ? "Mentor selecionando questão no seu ponto fraco..."
                  : "Gerando questão..."}
              </div>
            </div>
          )}

          {generateQ.isError && (
            <div className="soe-card" style={{ padding: "1.5rem", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--danger-fg, red)", marginBottom: 12 }}>
                {generateQ.error.message}
              </div>
              <Button onClick={fetchNextQuestion} size="sm">Tentar novamente</Button>
            </div>
          )}

          {currentQuestion && !generateQ.isPending && (
            <div className="soe-card" style={{ padding: "1.25rem" }}>
              {/* Meta */}
              <div style={{ display: "flex", gap: 8, marginBottom: "0.75rem", flexWrap: "wrap" }}>
                {currentQuestion.banca && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, border: "1px solid var(--card-border)", opacity: 0.6 }}>
                    {currentQuestion.banca}
                  </span>
                )}
                {currentQuestion.year && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, border: "1px solid var(--card-border)", opacity: 0.6 }}>
                    {currentQuestion.year}
                  </span>
                )}
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, border: "1px solid var(--card-border)", opacity: 0.6 }}>
                  {currentQuestion.source === "ai" ? "IA" : "Banco"}
                </span>
              </div>

              {/* Statement */}
              <div style={{ fontSize: 14, lineHeight: 1.7, marginBottom: "1rem" }}>
                {currentQuestion.statement}
              </div>

              {/* Alternatives */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1rem" }}>
                {currentQuestion.alternatives.map((alt) => {
                  const isSelected = selectedAnswer === alt.letter;
                  const isCorrect = alt.letter === currentQuestion.correctAnswer;
                  let bg = "transparent";
                  let borderColor = "var(--card-border)";
                  if (confirmed) {
                    if (isCorrect) { bg = "rgba(26,127,55,0.1)"; borderColor = "var(--success-fg, #1a7f37)"; }
                    else if (isSelected && !isCorrect) { bg = "rgba(192,57,43,0.1)"; borderColor = "var(--danger-fg, #c0392b)"; }
                  } else if (isSelected) {
                    bg = "rgba(212,175,55,0.12)";
                    borderColor = "#d4af37";
                  }
                  return (
                    <button
                      key={alt.letter}
                      disabled={confirmed}
                      onClick={() => setSelectedAnswer(alt.letter)}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
                        borderRadius: 8, border: `1px solid ${borderColor}`,
                        background: bg, cursor: confirmed ? "default" : "pointer",
                        textAlign: "left", transition: "all 0.15s", color: "var(--app-fg)",
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 13, flexShrink: 0, opacity: 0.7 }}>
                        {alt.letter})
                      </span>
                      <span style={{ fontSize: 13, lineHeight: 1.6 }}>{alt.text}</span>
                      {confirmed && isCorrect && <CheckCircle2 size={14} color="var(--success-fg, green)" style={{ marginLeft: "auto", flexShrink: 0 }} />}
                      {confirmed && isSelected && !isCorrect && <XCircle size={14} color="var(--danger-fg, red)" style={{ marginLeft: "auto", flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>

              {/* Hint */}
              {currentQuestion.hint && !confirmed && (
                <div style={{ marginBottom: "0.75rem" }}>
                  {!showHint ? (
                    <button
                      onClick={() => setShowHint(true)}
                      style={{ fontSize: 12, opacity: 0.5, background: "none", border: "none", cursor: "pointer" }}
                    >
                      Ver dica do mentor
                    </button>
                  ) : (
                    <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.3)" }}>
                      💡 {currentQuestion.hint}
                    </div>
                  )}
                </div>
              )}

              {!confirmed ? (
                <Button
                  onClick={confirmAnswer}
                  disabled={!selectedAnswer}
                  style={{ width: "100%" }}
                >
                  Confirmar resposta
                </Button>
              ) : (
                <div>
                  {selectedAnswer === currentQuestion.correctAnswer ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "rgba(26,127,55,0.08)", marginBottom: 10 }}>
                      <CheckCircle2 size={16} color="var(--success-fg, green)" />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--success-fg, green)" }}>Correto! Bom trabalho.</span>
                    </div>
                  ) : (
                    <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(192,57,43,0.06)", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <XCircle size={16} color="var(--danger-fg, red)" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--danger-fg, red)" }}>Errou.</span>
                        {diagnoseErr.isPending && <span style={{ fontSize: 12, opacity: 0.5 }}>Mentor analisando...</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── PHASE: fixation ── */}
      {phase === "fixation" && diagnosis && (
        <div>
          {/* Diagnosis card */}
          <div className="soe-card" style={{ padding: "1.25rem", marginBottom: "1rem", borderLeft: "3px solid var(--danger-fg, #c0392b)" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={14} color="var(--danger-fg, #c0392b)" /> Diagnóstico do mentor
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: "0.75rem" }}>{diagnosis.diagnosis}</div>
            <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(212,175,55,0.08)", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 2 }}>Conceito cobrado</div>
              <div style={{ fontSize: 13 }}>{diagnosis.concept}</div>
            </div>
            <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(26,127,55,0.06)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 2 }}>Regra para não errar</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{diagnosis.rule}</div>
            </div>
          </div>

          {/* Fixation question */}
          {diagnosis.fixationQuestions[fixationIndex] && (
            <div className="soe-card" style={{ padding: "1.25rem" }}>
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.5, marginBottom: "0.5rem" }}>
                FIXAÇÃO {fixationIndex + 1}/{diagnosis.fixationQuestions.length}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7, marginBottom: "1rem" }}>
                {diagnosis.fixationQuestions[fixationIndex].statement}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1rem" }}>
                {diagnosis.fixationQuestions[fixationIndex].alternatives.map((alt) => {
                  const isSelected = fixationAnswer === alt.letter;
                  const isCorrect = alt.letter === diagnosis.fixationQuestions[fixationIndex].correctAnswer;
                  let bg = "transparent";
                  let borderColor = "var(--card-border)";
                  if (fixationConfirmed) {
                    if (isCorrect) { bg = "rgba(26,127,55,0.1)"; borderColor = "var(--success-fg, green)"; }
                    else if (isSelected) { bg = "rgba(192,57,43,0.1)"; borderColor = "var(--danger-fg, red)"; }
                  } else if (isSelected) {
                    bg = "rgba(212,175,55,0.12)"; borderColor = "#d4af37";
                  }
                  return (
                    <button
                      key={alt.letter}
                      disabled={fixationConfirmed}
                      onClick={() => setFixationAnswer(alt.letter)}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
                        borderRadius: 8, border: `1px solid ${borderColor}`,
                        background: bg, cursor: fixationConfirmed ? "default" : "pointer",
                        textAlign: "left", color: "var(--app-fg)",
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 13, flexShrink: 0, opacity: 0.7 }}>{alt.letter})</span>
                      <span style={{ fontSize: 13, lineHeight: 1.6 }}>{alt.text}</span>
                      {fixationConfirmed && isCorrect && <CheckCircle2 size={14} color="var(--success-fg, green)" style={{ marginLeft: "auto", flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
              {fixationConfirmed && (
                <div style={{ fontSize: 13, padding: "8px 12px", borderRadius: 8, background: "rgba(26,127,55,0.06)", marginBottom: 12 }}>
                  {diagnosis.fixationQuestions[fixationIndex].explanation}
                </div>
              )}
              {!fixationConfirmed ? (
                <Button onClick={confirmFixation} disabled={!fixationAnswer} style={{ width: "100%" }}>
                  Confirmar
                </Button>
              ) : (
                <Button onClick={nextAfterFixation} style={{ width: "100%" }}>
                  {fixationIndex < diagnosis.fixationQuestions.length - 1
                    ? "Próxima questão de fixação"
                    : "Continuar sessão"}
                  <ChevronRight size={14} />
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── PHASE: summary ── */}
      {phase === "summary" && (
        <div>
          <div className="soe-card" style={{ padding: "1.5rem", textAlign: "center", marginBottom: "1rem" }}>
            <div style={{ fontSize: 48, marginBottom: "0.5rem" }}>
              {accuracy >= 80 ? "🏆" : accuracy >= 60 ? "💪" : "📚"}
            </div>
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Sessão concluída</div>
            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: "1.5rem" }}>
              {selectedDiscName}{selectedTopicName ? ` › ${selectedTopicName}` : ""}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: "1.5rem" }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--success-fg, green)" }}>
                  {history.filter((h) => h.correct).length}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>Corretas</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--danger-fg, red)" }}>
                  {history.filter((h) => !h.correct).length}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>Erradas</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{accuracy}%</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>Acerto</div>
              </div>
            </div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              {accuracy >= 80
                ? "Excelente! Você está dominando este conteúdo."
                : accuracy >= 60
                ? "Bom progresso. Continue praticando os pontos fracos."
                : "Este conteúdo precisa de mais atenção. O mentor anotou os pontos críticos."}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Button
              variant="outline"
              onClick={() => { setHistory([]); setPhase("profile"); }}
              style={{ flex: 1 }}
            >
              Nova sessão
            </Button>
            <Button
              onClick={() => navigate("/")}
              style={{ flex: 1 }}
            >
              Voltar ao início
            </Button>
          </div>

          {/* Updated weak profile */}
          <div className="soe-card" style={{ padding: "1.25rem", marginTop: "1rem" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: "1rem", display: "flex", alignItems: "center", gap: 6 }}>
              <TrendingDown size={14} /> Perfil atualizado
            </div>
            <WeakProfileChart />
          </div>
        </div>
      )}
    </div>
  );
}
