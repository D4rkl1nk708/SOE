import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Brain, ChevronLeft, CheckCircle2, XCircle, Zap, AlertTriangle,
  BarChart2, Lock, RefreshCw, ChevronRight, Target, BookOpen,
  TrendingDown, Play, Trophy, Clock, Sparkles, GraduationCap,
  ShieldCheck, ArrowRight, Activity, Lightbulb
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeakProfileChart } from "@/components/WeakProfileChart";
import { motion, AnimatePresence } from "framer-motion";

type Phase = "config" | "profile" | "question" | "fixation" | "summary";

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

const API_KEY_KEY = "soe_mentor_api_key";
const API_PROVIDER_KEY = "soe_mentor_provider";
const SESSION_SIZE = 10;

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Nível Fundamental",
  medium: "Nível Intermediário",
  hard: "Nível Avançado",
};

export default function MentorSession() {
  const [, navigate] = useLocation();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const globalApiKey = (stats?.settings as any)?.aiApiKey ?? "";
  const globalProvider = (stats?.settings as any)?.aiProvider ?? "gemini";

  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_KEY) ?? "");
  const [provider, setProvider] = useState<"claude" | "gemini" | "openai">(
    () => (localStorage.getItem(API_PROVIDER_KEY) as any) ?? "gemini"
  );

  useEffect(() => {
    if (!apiKey && globalApiKey) setApiKey(globalApiKey);
    if (globalProvider) setProvider(globalProvider as any);
  }, [globalApiKey, globalProvider]);

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

  const recentHits = history.slice(-4).filter((h) => h.correct).length;
  const adaptedDifficulty =
    history.length >= 4 && recentHits >= 4
      ? "hard"
      : history.length >= 4 && recentHits <= 1
      ? "easy"
      : difficulty;

  const fetchNextQuestion = useCallback(() => {
    if (!selectedDiscId) return;
    setSelectedAnswer(null);
    setConfirmed(false);
    setShowHint(false);
    generateQ.mutate(
      { apiKey, provider, disciplineId: selectedDiscId, topicId: selectedTopicId ?? undefined, difficulty: adaptedDifficulty, sessionHistory: history },
      {
        onSuccess: (q) => setCurrentQuestion(q as SessionQuestion),
        onError: (err) => toast.error(err.message),
      }
    );
  }, [selectedDiscId, selectedTopicId, adaptedDifficulty, history, apiKey, provider]);

  const confirmAnswer = async () => {
    if (!selectedAnswer || !currentQuestion) return;
    setConfirmed(true);
    const correct = selectedAnswer === currentQuestion.correctAnswer;
    const entry: SessionEntry = { questionId: currentQuestion.questionId, correct, userAnswer: selectedAnswer };
    setHistory((prev) => [...prev, entry]);

    if (!correct) {
      diagnoseErr.mutate(
        { apiKey, provider, statement: currentQuestion.statement, alternatives: currentQuestion.alternatives, userAnswer: selectedAnswer, correctAnswer: currentQuestion.correctAnswer, disciplineName: currentQuestion.disciplineName, topicName: currentQuestion.topicName },
        {
          onSuccess: (d) => {
            setDiagnosis(d as Diagnosis);
            setFixationIndex(0); setFixationAnswer(null); setFixationConfirmed(false);
            setPhase("fixation");
          },
          onError: (err) => { toast.error("Diagnóstico falhou."); checkEndOfSession([...history, entry]); }
        }
      );
    } else {
      checkEndOfSession([...history, entry]);
    }
  };

  const checkEndOfSession = (h: SessionEntry[]) => {
    if (h.length >= SESSION_SIZE) endSession(h);
    else { setPhase("question"); fetchNextQuestion(); }
  };

  const endSession = (h: SessionEntry[]) => {
    const correct = h.filter((e) => e.correct).length;
    const wrong = h.filter((e) => !e.correct).length;
    const elapsed = Math.round((Date.now() - sessionStart) / 1000);
    if (selectedDiscId) saveResult.mutate({ disciplineId: selectedDiscId, topicId: selectedTopicId ?? undefined, correct, wrong, durationSeconds: elapsed });
    utils.mentor.getWeakProfile.invalidate();
    setPhase("summary");
  };

  const nextAfterFixation = () => {
    if (!diagnosis) return;
    if (fixationIndex < diagnosis.fixationQuestions.length - 1) {
      setFixationIndex((i) => i + 1); setFixationAnswer(null); setFixationConfirmed(false);
    } else {
      setDiagnosis(null); checkEndOfSession(history);
    }
  };

  const saveConfig = () => {
    if (!apiKey.trim()) { toast.error("Informe a API Key"); return; }
    localStorage.setItem(API_KEY_KEY, apiKey);
    localStorage.setItem(API_PROVIDER_KEY, provider);
    setPhase("profile");
  };

  const accuracy = history.length > 0 ? Math.round((history.filter((h) => h.correct).length / history.length) * 100) : 0;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 pb-12">
      {/* Immersive Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all">
            <ChevronLeft size={20} className="opacity-60" />
          </button>
          <div className="p-3 bg-[var(--primary-bg-subtle)] rounded-2xl border border-[var(--primary-border)] shadow-xl shadow-[var(--primary-shadow)]">
            <Brain className="w-6 h-6 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--app-fg)" }}>Mentor IA</h1>
            <p className="text-sm opacity-60">Sessão adaptativa baseada em pontos fracos.</p>
          </div>
        </div>
        
        {history.length > 0 && (
          <div className="flex items-center gap-4 px-5 py-2.5 rounded-2xl bg-white/5 border border-white/5">
             <div className="flex items-center gap-2">
                <Activity size={14} className="text-[var(--primary)]" />
                <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Eficiência</span>
                <span className="text-xs font-black" style={{ color: accuracy >= 70 ? "var(--accent-green)" : "var(--accent-amber)" }}>{accuracy}%</span>
             </div>
             <div className="w-px h-4 bg-white/10" />
             <div className="text-[10px] font-black uppercase tracking-widest opacity-40">
                Questão {history.length} / {SESSION_SIZE}
             </div>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* ── PHASE: config ── */}
        {phase === "config" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-xl mx-auto">
            <div className="soe-card p-8 space-y-8">
                <div className="flex items-center gap-3">
                    <Lock size={18} className="text-[var(--primary)]" />
                    <h2 className="text-xl font-black" style={{ color: "var(--app-fg)" }}>Configuração de IA</h2>
                </div>
                
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Provedor</label>
                        <select value={provider} onChange={(e) => setProvider(e.target.value as any)}
                                className="w-full px-4 py-3.5 rounded-2xl bg-white/5 border border-white/5 text-sm outline-none appearance-none">
                            <option value="gemini">Google Gemini (Flash 1.5)</option>
                            <option value="claude">Anthropic Claude 3</option>
                            <option value="openai">OpenAI GPT-4o</option>
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between ml-1">
                            <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Chaves de API</label>
                            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--primary)]">Auto-Rotação Ativa</span>
                        </div>
                        <textarea value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                                  placeholder="Uma ou mais chaves (uma por linha)..."
                                  className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/5 text-xs outline-none min-h-[120px] resize-none focus:border-[var(--primary-border)] transition-all" />
                    </div>
                </div>

                <Button onClick={saveConfig} className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)]">
                    Próximo Passo <ChevronRight size={14} className="ml-1" />
                </Button>
            </div>
          </motion.div>
        )}

        {/* ── PHASE: profile ── */}
        {phase === "profile" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-7 soe-card p-8">
                    <div className="flex items-center gap-3 mb-8">
                        <BarChart2 size={18} className="text-[var(--primary)]" />
                        <h2 className="text-xl font-black" style={{ color: "var(--app-fg)" }}>Perfil de Fraquezas</h2>
                    </div>
                    <div className="h-[300px]">
                        <WeakProfileChart onSelectTopic={(discId, topicId, topicName, discName) => {
                            setSelectedDiscId(discId); setSelectedTopicId(topicId);
                            setSelectedTopicName(topicName); setSelectedDiscName(discName);
                        }} />
                    </div>
                </div>

                <div className="lg:col-span-5 soe-card p-8 space-y-8">
                    <div className="flex items-center gap-3">
                        <Target size={18} className="text-[var(--primary)]" />
                        <h2 className="text-xl font-black" style={{ color: "var(--app-fg)" }}>Ajuste de Foco</h2>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Disciplina Principal</label>
                            <select value={selectedDiscId ?? ""} onChange={(e) => {
                                const id = Number(e.target.value);
                                const name = disciplines?.find(d => d.id === id)?.name ?? "";
                                setSelectedDiscId(id); setSelectedDiscName(name);
                                setSelectedTopicId(null); setSelectedTopicName("");
                            }} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/5 text-sm outline-none">
                                <option value="">Selecionar...</option>
                                {disciplines?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Nível de Pressão</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(["easy", "medium", "hard"] as const).map((d) => (
                                    <button key={d} onClick={() => setDifficulty(d)}
                                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${difficulty === d ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] shadow-lg shadow-[var(--primary-shadow)]' : 'bg-white/5 text-white/30 border-white/5 hover:bg-white/10'}`}>
                                        {DIFFICULTY_LABELS[d].split(" ")[1]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {selectedDiscId && (
                            <div className="p-4 rounded-2xl bg-[var(--primary-bg-subtle)] border border-[var(--primary-border)] space-y-1">
                                <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Alvo da Sessão</p>
                                <p className="text-xs font-bold" style={{ color: "var(--app-fg)" }}>
                                    {selectedDiscName} {selectedTopicName && <span className="opacity-40">› {selectedTopicName}</span>}
                                </p>
                            </div>
                        )}
                    </div>

                    <Button onClick={startSession} disabled={!selectedDiscId} className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)]">
                        Iniciar Treinamento <Play size={12} className="ml-2 fill-current" />
                    </Button>
                </div>
            </div>
          </motion.div>
        )}

        {/* ── PHASE: question ── */}
        {phase === "question" && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="max-w-3xl mx-auto space-y-6">
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent-amber)] shadow-[0_0_15px_var(--primary-shadow)]"
                            initial={{ width: 0 }} animate={{ width: `${(history.length / SESSION_SIZE) * 100}%` }} transition={{ duration: 0.5 }} />
            </div>

            {generateQ.isPending ? (
              <div className="soe-card p-24 text-center space-y-6">
                  <div className="relative inline-block">
                      <RefreshCw size={48} className="animate-spin text-[var(--primary)] opacity-20" />
                      <Brain size={24} className="absolute inset-0 m-auto text-[var(--primary)] animate-pulse" />
                  </div>
                  <div className="space-y-2">
                      <p className="text-lg font-black uppercase tracking-widest opacity-40">Consultando Mentor...</p>
                      <p className="text-xs opacity-20">Analisando histórico para calibração de dificuldade.</p>
                  </div>
              </div>
            ) : currentQuestion && (
              <div className="soe-card p-10 space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none">
                    <GraduationCap size={120} />
                </div>

                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                    <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest px-2 md:px-3 py-1 rounded-full bg-white/5 border border-white/10 opacity-60">
                        {currentQuestion.banca || "Simulado IA"}
                    </span>
                    <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest px-2 md:px-3 py-1 rounded-full bg-[var(--primary-bg-subtle)] text-[var(--primary)] border border-[var(--primary-border)]">
                        {DIFFICULTY_LABELS[adaptedDifficulty]}
                    </span>
                </div>

                <div className="text-lg md:text-xl font-bold leading-relaxed" style={{ color: "var(--app-fg)" }}>
                    {currentQuestion.statement}
                </div>

                <div className="grid gap-3">
                    {currentQuestion.alternatives.map((alt) => {
                      const isSelected = selectedAnswer === alt.letter;
                      const isCorrect = alt.letter === currentQuestion.correctAnswer;
                      let statusStyle = "bg-white/5 border-white/5 hover:bg-white/10";
                      if (confirmed) {
                        if (isCorrect) statusStyle = "bg-[var(--accent-green)]/10 border-[var(--accent-green)] text-[var(--accent-green)]";
                        else if (isSelected) statusStyle = "bg-rose-500/10 border-rose-500 text-rose-500";
                        else statusStyle = "opacity-30 border-white/5";
                      } else if (isSelected) {
                        statusStyle = "bg-[var(--primary-bg-subtle)] border-[var(--primary)] shadow-lg shadow-[var(--primary-shadow)]";
                      }

                      return (
                        <button key={alt.letter} disabled={confirmed} onClick={() => setSelectedAnswer(alt.letter)}
                                className={`flex items-start gap-3 md:gap-5 p-4 md:p-5 rounded-xl md:rounded-2xl border-2 transition-all text-left ${statusStyle}`}>
                          <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/5 flex items-center justify-center font-black text-xs shrink-0">{alt.letter}</span>
                          <span className="text-xs md:text-sm font-medium leading-relaxed flex-1">{alt.text}</span>
                          {confirmed && isCorrect && <CheckCircle2 size={18} className="shrink-0" />}
                          {confirmed && isSelected && !isCorrect && <XCircle size={18} className="shrink-0" />}
                        </button>
                      );
                    })}
                </div>

                {currentQuestion.hint && !confirmed && (
                  <div className="pt-4">
                    {showHint ? (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                  className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex gap-4">
                        <Lightbulb size={20} className="text-amber-500 shrink-0" />
                        <p className="text-sm italic opacity-80">{currentQuestion.hint}</p>
                      </motion.div>
                    ) : (
                      <button onClick={() => setShowHint(true)} className="text-[10px] font-black uppercase tracking-widest text-amber-500/60 hover:text-amber-500 transition-colors flex items-center gap-1.5 ml-1">
                        <Sparkles size={12} /> Solicitar dica do mentor
                      </button>
                    )}
                  </div>
                )}

                <div className="pt-6">
                    {!confirmed ? (
                        <Button onClick={confirmAnswer} disabled={!selectedAnswer} className="w-full py-6 md:py-5 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)]">
                            Confirmar Resposta <ArrowRight size={14} className="ml-2" />
                        </Button>
                    ) : (
                        <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
                             <div className={`flex-1 p-4 md:p-5 rounded-xl md:rounded-2xl border flex items-center gap-3 md:gap-4 ${selectedAnswer === currentQuestion.correctAnswer ? 'bg-[var(--accent-green)]/10 border-[var(--accent-green)]/20 text-[var(--accent-green)]' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
                                {selectedAnswer === currentQuestion.correctAnswer ? <Trophy size={20} className="shrink-0" /> : <AlertTriangle size={20} className="shrink-0" />}
                                <span className="font-black text-xs md:text-sm uppercase tracking-widest">
                                    {selectedAnswer === currentQuestion.correctAnswer ? "Objetivo Alcançado!" : "Erro Analisado"}
                                </span>
                             </div>
                             <Button onClick={() => checkEndOfSession(history)} className="w-full sm:w-auto px-10 py-5 md:py-0 rounded-xl md:rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] md:text-xs font-black uppercase tracking-widest transition-all">
                                Próxima <ChevronRight size={14} className="ml-1" />
                             </Button>
                        </div>
                    )}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── PHASE: fixation ── */}
        {phase === "fixation" && diagnosis && (
          <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="max-w-3xl mx-auto space-y-6 md:space-y-8">
            <div className="soe-card p-6 md:p-10 border-l-4 border-rose-500 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none">
                    <ShieldCheck size={120} />
                </div>
                <div className="flex items-center gap-3 mb-4 md:mb-6">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                        <Activity size={20} />
                    </div>
                    <h2 className="text-lg md:text-xl font-black" style={{ color: "var(--app-fg)" }}>Diagnóstico de Erro</h2>
                </div>
                
                <p className="text-base md:text-lg font-medium leading-relaxed mb-6 md:mb-8 opacity-80" style={{ color: "var(--app-fg)" }}>{diagnosis.diagnosis}</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    <div className="p-4 md:p-5 rounded-xl md:rounded-2xl bg-white/5 border border-white/5 space-y-1 md:space-y-2">
                        <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest opacity-40">Conceito Crítico</p>
                        <p className="text-xs md:text-sm font-bold" style={{ color: "var(--app-fg)" }}>{diagnosis.concept}</p>
                    </div>
                    <div className="p-4 md:p-5 rounded-xl md:rounded-2xl bg-[var(--primary-bg-subtle)] border border-[var(--primary-border)] space-y-1 md:space-y-2">
                        <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-[var(--primary)] opacity-60">Regra de Ouro</p>
                        <p className="text-xs md:text-sm font-black text-[var(--primary)]">{diagnosis.rule}</p>
                    </div>
                </div>
            </div>

            <div className="soe-card p-10 space-y-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Zap size={18} className="text-amber-500" />
                        <h3 className="font-black text-sm uppercase tracking-widest" style={{ color: "var(--app-fg)" }}>Teste de Fixação</h3>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{fixationIndex + 1} / {diagnosis.fixationQuestions.length}</span>
                </div>

                <div className="text-lg font-bold leading-relaxed" style={{ color: "var(--app-fg)" }}>
                    {diagnosis.fixationQuestions[fixationIndex].statement}
                </div>

                <div className="grid gap-3">
                    {diagnosis.fixationQuestions[fixationIndex].alternatives.map((alt) => {
                      const isSelected = fixationAnswer === alt.letter;
                      const isCorrect = alt.letter === diagnosis.fixationQuestions[fixationIndex].correctAnswer;
                      let statusStyle = "bg-white/5 border-white/5 hover:bg-white/10";
                      if (fixationConfirmed) {
                        if (isCorrect) statusStyle = "bg-[var(--accent-green)]/10 border-[var(--accent-green)] text-[var(--accent-green)]";
                        else if (isSelected) statusStyle = "bg-rose-500/10 border-rose-500 text-rose-500";
                        else statusStyle = "opacity-30 border-white/5";
                      } else if (isSelected) statusStyle = "bg-white/10 border-[var(--primary-border)]";

                      return (
                        <button key={alt.letter} disabled={fixationConfirmed} onClick={() => setFixationAnswer(alt.letter)}
                                className={`flex items-start gap-4 p-4 rounded-xl border transition-all text-left ${statusStyle}`}>
                          <span className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center font-black text-[10px] shrink-0">{alt.letter}</span>
                          <span className="text-xs font-medium leading-relaxed">{alt.text}</span>
                        </button>
                      );
                    })}
                </div>

                {fixationConfirmed && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                              className="p-5 rounded-2xl bg-white/5 border border-white/10 text-xs leading-relaxed italic opacity-60">
                    {diagnosis.fixationQuestions[fixationIndex].explanation}
                  </motion.div>
                )}

                <div className="pt-4">
                    {!fixationConfirmed ? (
                        <Button onClick={() => setFixationConfirmed(true)} disabled={!fixationAnswer} className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest">
                            Validar Fixação
                        </Button>
                    ) : (
                        <Button onClick={nextAfterFixation} className="w-full py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)]">
                            {fixationIndex < diagnosis.fixationQuestions.length - 1 ? "Próxima Questão" : "Retomar Sessão Principal"}
                        </Button>
                    )}
                </div>
            </div>
          </motion.div>
        )}

        {/* ── PHASE: summary ── */}
        {phase === "summary" && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-3xl mx-auto space-y-8">
            <div className="soe-card p-12 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-[var(--primary-bg-subtle)] to-transparent opacity-30" />
                <div className="relative z-10 space-y-6">
                    <div className="inline-block p-8 rounded-[3rem] bg-white/[0.02] border border-white/5 shadow-2xl relative">
                        <Trophy size={64} className="text-amber-500 animate-bounce" />
                        <Sparkles size={24} className="absolute top-4 right-4 text-[var(--primary)] animate-pulse" />
                    </div>
                    
                    <div className="space-y-2">
                        <h2 className="text-3xl font-black" style={{ color: "var(--app-fg)" }}>Ciclo Adaptativo Completo</h2>
                        <p className="text-sm opacity-40 font-medium">{selectedDiscName} {selectedTopicName && ` › ${selectedTopicName}`}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-6 max-w-md mx-auto">
                        <div className="space-y-1">
                            <p className="text-3xl font-black text-[var(--accent-green)]">{history.filter(h => h.correct).length}</p>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Acertos</p>
                        </div>
                        <div className="space-y-1 border-x border-white/5">
                            <p className="text-3xl font-black text-rose-500">{history.filter(h => !h.correct).length}</p>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Falhas</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-3xl font-black" style={{ color: "var(--app-fg)" }}>{accuracy}%</p>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Precisão</p>
                        </div>
                    </div>

                    <div className="pt-8 flex gap-4">
                        <Button variant="outline" onClick={() => { setHistory([]); setPhase("profile"); }} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest">
                            Nova Sessão
                        </Button>
                        <Button onClick={() => navigate("/")} className="flex-1 py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)]">
                            Concluir Relatório
                        </Button>
                    </div>
                </div>
            </div>

            <div className="soe-card p-10">
                <div className="flex items-center gap-3 mb-8">
                    <TrendingDown size={18} className="text-rose-500" />
                    <h3 className="font-black text-sm uppercase tracking-widest" style={{ color: "var(--app-fg)" }}>Seus Novos Pontos de Atenção</h3>
                </div>
                <div className="h-[250px]">
                    <WeakProfileChart />
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  function startSession() {
    if (!selectedDiscId) { toast.error("Selecione uma disciplina"); return; }
    setHistory([]); setCurrentQuestion(null); setPhase("question"); fetchNextQuestion();
  }
}
