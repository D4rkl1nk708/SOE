import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Brain,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Zap,
  AlertTriangle,
  BarChart2,
  Lock,
  RefreshCw,
  ChevronRight,
  Target,
  BookOpen,
  TrendingDown,
  Play,
  Trophy,
  Clock,
  Sparkles,
  GraduationCap,
  ShieldCheck,
  ArrowRight,
  Activity,
  Lightbulb,
  Send,
  Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeakProfileChart } from "@/components/WeakProfileChart";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";

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

  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(API_KEY_KEY) ?? "",
  );
  const [provider, setProvider] = useState<"claude" | "gemini" | "openai">(
    () => (localStorage.getItem(API_PROVIDER_KEY) as any) ?? "gemini",
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
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    "medium",
  );

  const [currentQuestion, setCurrentQuestion] =
    useState<SessionQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [sessionResults, setSessionResults] = useState<any>(null);
  const [librarianOpen, setLibrarianOpen] = useState(false);
  const [librarianQuery, setLibrarianQuery] = useState("");
  const [librarianChat, setLibrarianChat] = useState<
    Array<{ q: string; a: string; sources?: number }>
  >([]);

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
  const generateCrossfire = trpc.mentor.generateCrossfireMock.useMutation();
  const askLibrarian = trpc.mentor.askLibrarian.useMutation();
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
      },
    );
  }, [
    selectedDiscId,
    selectedTopicId,
    adaptedDifficulty,
    history,
    apiKey,
    provider,
  ]);

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
            toast.error("Diagnóstico falhou.");
            checkEndOfSession([...history, entry]);
          },
        },
      );
    } else {
      checkEndOfSession([...history, entry]);
    }
  };

  const checkEndOfSession = (h: SessionEntry[]) => {
    if (h.length >= SESSION_SIZE) endSession(h);
    else {
      setPhase("question");
      fetchNextQuestion();
    }
  };

  const endSession = (h: SessionEntry[]) => {
    const correct = h.filter((e) => e.correct).length;
    const wrong = h.filter((e) => !e.correct).length;
    const elapsed = Math.round((Date.now() - sessionStart) / 1000);
    if (selectedDiscId)
      saveResult.mutate({
        disciplineId: selectedDiscId,
        topicId: selectedTopicId ?? undefined,
        correct,
        wrong,
        durationSeconds: elapsed,
      });
    utils.mentor.getWeakProfile.invalidate();
    setPhase("summary");
  };

  const nextAfterFixation = () => {
    if (!diagnosis) return;
    if (fixationIndex < diagnosis.fixationQuestions.length - 1) {
      setFixationIndex((i) => i + 1);
      setFixationAnswer(null);
      setFixationConfirmed(false);
    } else {
      setDiagnosis(null);
      checkEndOfSession(history);
    }
  };

  const saveConfig = () => {
    if (!apiKey.trim()) {
      toast.error("Informe a API Key");
      return;
    }
    localStorage.setItem(API_KEY_KEY, apiKey);
    localStorage.setItem(API_PROVIDER_KEY, provider);
    setPhase("profile");
  };

  const accuracy =
    history.length > 0
      ? Math.round(
          (history.filter((h) => h.correct).length / history.length) * 100,
        )
      : 0;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="p-2.5 bg-card border border-border hover:bg-secondary rounded-lg transition-all"
          >
            <ChevronLeft size={18} className="text-muted-foreground" />
          </button>
          <div className="p-2.5 bg-secondary rounded-lg border border-border">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Mentor IA
            </h1>
            <p className="text-sm text-muted-foreground">
              Sessão adaptativa baseada em pontos fracos.
            </p>
          </div>
        </div>

        {history.length > 0 && (
          <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-card border border-border shadow-sm">
            <div className="flex items-center gap-2">
              <Activity size={12} className="text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Eficiência
              </span>
              <span
                className="text-xs font-bold"
                style={{
                  color:
                    accuracy >= 70
                      ? "var(--accent-green)"
                      : "var(--accent-amber)",
                }}
              >
                {accuracy}%
              </span>
            </div>
            <div className="w-px h-3 bg-border" />
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Questão {history.length} / {SESSION_SIZE}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {phase === "config" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-xl mx-auto space-y-6"
          >
            <div className="soe-card p-8 space-y-8">
              <div className="flex items-center gap-3">
                <Lock size={18} className="text-primary" />
                <h2 className="text-lg font-bold">Configuração de IA</h2>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                    Provedor
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as any)}
                    className="w-full px-4 py-2.5 rounded-md bg-secondary border border-border text-sm outline-none appearance-none"
                  >
                    <option value="gemini">Google Gemini (Flash 1.5)</option>
                    <option value="claude">Anthropic Claude 3</option>
                    <option value="openai">OpenAI GPT-4o</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Chaves de API
                    </label>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-primary">
                      Auto-Rotação Ativa
                    </span>
                  </div>
                  <textarea
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Uma ou mais chaves (uma por linha)..."
                    className="w-full px-4 py-3 rounded-md bg-secondary border border-border text-xs outline-none min-h-[100px] resize-none focus:border-primary transition-all"
                  />
                </div>
              </div>

              <Button
                onClick={saveConfig}
                className="w-full py-3 rounded-md font-bold text-[10px] uppercase tracking-wider"
              >
                Próximo Passo <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>

            <div
              className="soe-card p-10 rounded-xl bg-card border border-border relative overflow-hidden group hover:border-primary/50 transition-all cursor-pointer"
              onClick={() => {
                toast.promise(
                  generateCrossfire.mutateAsync({
                    apiKey,
                    provider: provider as any,
                  }),
                  {
                    loading: "Organizando o Fogo Cruzado...",
                    success: (data: any) => {
                      setPhase("question");
                      setCurrentQuestion(data.questions[0]);
                      setHistory([]);
                      (window as any).isCrossfire = true;
                      (window as any).crossfireQuestions = data.questions;
                      (window as any).crossfireIdx = 0;
                      return "Simulado iniciado!";
                    },
                    error: "Falha ao gerar simulado.",
                  },
                );
              }}
            >
              <div className="absolute top-4 right-4 opacity-5 group-hover:opacity-10 transition-all">
                <Zap size={64} />
              </div>
              <div className="relative z-10 space-y-4">
                <Badge
                  variant="outline"
                  className="text-primary border-primary/20 text-[9px] font-bold px-3 py-1 rounded-md"
                >
                  NOVO MODO
                </Badge>
                <h2 className="text-2xl font-bold uppercase tracking-tight">
                  Simulado Fogo Cruzado
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
                  O teste definitivo: misturamos questões reais (TEC), questões
                  da sua biblioteca (Lab) e armadilhas inéditas da IA (Banca
                  Mirror) em um único desafio aleatório.
                </p>
                <div className="flex items-center gap-2 text-primary font-bold text-[10px] uppercase tracking-wider mt-4 group-hover:gap-3 transition-all">
                  Iniciar Desafio <ArrowRight size={14} />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {phase === "profile" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 soe-card p-8">
                <div className="flex items-center gap-3 mb-8">
                  <BarChart2 size={18} className="text-[var(--primary)]" />
                  <h2
                    className="text-xl font-black"
                    style={{ color: "var(--app-fg)" }}
                  >
                    Perfil de Fraquezas
                  </h2>
                </div>
                <div className="h-[300px]">
                  <WeakProfileChart
                    onSelectTopic={(discId, topicId, topicName, discName) => {
                      setSelectedDiscId(discId);
                      setSelectedTopicId(topicId);
                      setSelectedTopicName(topicName);
                      setSelectedDiscName(discName);
                    }}
                  />
                </div>
              </div>

              <div className="lg:col-span-5 soe-card p-8 space-y-8">
                <div className="flex items-center gap-3">
                  <Target size={18} className="text-[var(--primary)]" />
                  <h2
                    className="text-xl font-black"
                    style={{ color: "var(--app-fg)" }}
                  >
                    Ajuste de Foco
                  </h2>
                </div>

                <div className="space-y-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">
                      Disciplina Principal
                    </label>
                    <select
                      value={selectedDiscId ?? ""}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        const name =
                          disciplines?.find((d) => d.id === id)?.name ?? "";
                        setSelectedDiscId(id);
                        setSelectedDiscName(name);
                        setSelectedTopicId(null);
                        setSelectedTopicName("");
                      }}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/5 text-sm outline-none"
                    >
                      <option value="">Selecionar...</option>
                      {disciplines?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">
                      Nível de Pressão
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["easy", "medium", "hard"] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => setDifficulty(d)}
                          className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${difficulty === d ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] shadow-lg shadow-[var(--primary-shadow)]" : "bg-white/5 text-white/30 border-white/5 hover:bg-white/10"}`}
                        >
                          {DIFFICULTY_LABELS[d].split(" ")[1]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedDiscId && (
                    <div className="p-4 rounded-2xl bg-[var(--primary-bg-subtle)] border border-[var(--primary-border)] space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-widest opacity-40">
                        Alvo da Sessão
                      </p>
                      <p
                        className="text-xs font-bold"
                        style={{ color: "var(--app-fg)" }}
                      >
                        {selectedDiscName}{" "}
                        {selectedTopicName && (
                          <span className="opacity-40">
                            › {selectedTopicName}
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>

                <Button
                  onClick={startSession}
                  disabled={!selectedDiscId}
                  className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)]"
                >
                  Iniciar Treinamento{" "}
                  <Play size={12} className="ml-2 fill-current" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {phase === "question" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="max-w-3xl mx-auto space-y-6"
          >
            <div className="flex justify-between items-center">
              <div className="h-1 w-full max-w-[60%] bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(history.length / SESSION_SIZE) * 100}%`,
                  }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <Button
                variant="ghost"
                onClick={() => setLibrarianOpen(true)}
                className="text-[10px] gap-2 h-auto py-2 font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                <BookOpen size={14} /> Consultar Biblio
              </Button>
            </div>

            {generateQ.isPending ? (
              <div className="soe-card p-24 text-center space-y-6">
                <div className="relative inline-block">
                  <RefreshCw
                    size={48}
                    className="animate-spin text-[var(--primary)] opacity-20"
                  />
                  <Brain
                    size={24}
                    className="absolute inset-0 m-auto text-[var(--primary)] animate-pulse"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-black uppercase tracking-widest opacity-40">
                    Consultando Mentor...
                  </p>
                  <p className="text-xs opacity-20">
                    Analisando histórico para calibração de dificuldade.
                  </p>
                </div>
              </div>
            ) : (
              currentQuestion && (
                <div className="soe-card p-10 space-y-8 relative overflow-hidden">
                  <div
                    className="text-lg md:text-xl font-bold leading-relaxed"
                    style={{ color: "var(--app-fg)" }}
                  >
                    {currentQuestion.statement}
                  </div>

                  <div className="grid gap-3">
                    {currentQuestion.alternatives.map((alt) => {
                      const isSelected = selectedAnswer === alt.letter;
                      const isCorrect =
                        alt.letter === currentQuestion.correctAnswer;
                      let statusStyle =
                        "bg-white/5 border-white/5 hover:bg-white/10";
                      if (confirmed) {
                        if (isCorrect)
                          statusStyle =
                            "bg-[var(--accent-green)]/10 border-[var(--accent-green)] text-[var(--accent-green)]";
                        else if (isSelected)
                          statusStyle =
                            "bg-rose-500/10 border-rose-500 text-rose-500";
                        else statusStyle = "opacity-30 border-white/5";
                      } else if (isSelected) {
                        statusStyle =
                          "bg-[var(--primary-bg-subtle)] border-[var(--primary)] shadow-lg shadow-[var(--primary-shadow)]";
                      }

                      return (
                        <button
                          key={alt.letter}
                          disabled={confirmed}
                          onClick={() => setSelectedAnswer(alt.letter)}
                          className={`flex items-start gap-3 p-4 rounded-lg border transition-all text-left ${statusStyle}`}
                        >
                          <span className="w-7 h-7 rounded bg-secondary flex items-center justify-center font-bold text-xs shrink-0">
                            {alt.letter}
                          </span>
                          <span className="text-xs font-medium leading-relaxed flex-1">
                            {alt.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-4">
                    {!confirmed ? (
                      <Button
                        onClick={confirmAnswer}
                        disabled={!selectedAnswer}
                        className="w-full py-3 rounded-md font-bold text-[10px] uppercase tracking-wider"
                      >
                        Confirmar Resposta{" "}
                        <ArrowRight size={14} className="ml-2" />
                      </Button>
                    ) : (
                      <Button
                        onClick={() => checkEndOfSession(history)}
                        className="w-full py-3 rounded-md font-bold text-[10px] uppercase tracking-wider bg-secondary hover:bg-muted"
                      >
                        Próxima <ChevronRight size={14} className="ml-2" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            )}
          </motion.div>
        )}

        {phase === "fixation" && diagnosis && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="max-w-3xl mx-auto space-y-8"
          >
            <div className="soe-card p-10 border-l-4 border-rose-500">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                  <Activity size={20} />
                </div>
                <h2
                  className="text-xl font-black"
                  style={{ color: "var(--app-fg)" }}
                >
                  Diagnóstico de Erro
                </h2>
              </div>
              <p className="text-lg font-medium leading-relaxed opacity-80">
                {diagnosis.diagnosis}
              </p>
            </div>

            <div className="soe-card p-10 space-y-8">
              <div className="space-y-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">
                  Teste de Fixação
                </h3>
                <div className="text-lg font-bold leading-relaxed">
                  {diagnosis.fixationQuestions[fixationIndex].statement}
                </div>
              </div>
              <div className="grid gap-3">
                {diagnosis.fixationQuestions[fixationIndex].alternatives.map(
                  (alt) => {
                    const isSelected = fixationAnswer === alt.letter;
                    const isCorrect =
                      alt.letter ===
                      diagnosis.fixationQuestions[fixationIndex].correctAnswer;
                    let statusStyle =
                      "bg-white/5 border-white/5 hover:bg-white/10";
                    if (fixationConfirmed) {
                      if (isCorrect)
                        statusStyle =
                          "bg-[var(--accent-green)]/10 border-[var(--accent-green)] text-[var(--accent-green)]";
                      else if (isSelected)
                        statusStyle =
                          "bg-rose-500/10 border-rose-500 text-rose-500";
                    } else if (isSelected)
                      statusStyle =
                        "bg-white/10 border-[var(--primary-border)]";

                    return (
                      <button
                        key={alt.letter}
                        disabled={fixationConfirmed}
                        onClick={() => setFixationAnswer(alt.letter)}
                        className={`flex items-start gap-4 p-4 rounded-xl border transition-all text-left ${statusStyle}`}
                      >
                        <span className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center font-black text-[10px] shrink-0">
                          {alt.letter}
                        </span>
                        <span className="text-xs font-medium leading-relaxed">
                          {alt.text}
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
              <Button
                onClick={() =>
                  fixationConfirmed
                    ? nextAfterFixation()
                    : setFixationConfirmed(true)
                }
                className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest"
              >
                {fixationConfirmed
                  ? fixationIndex < diagnosis.fixationQuestions.length - 1
                    ? "Próxima Fixação"
                    : "Retomar"
                  : "Validar Fixação"}
              </Button>
            </div>
          </motion.div>
        )}

        {phase === "summary" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-3xl mx-auto space-y-8"
          >
            <div className="soe-card p-12 text-center space-y-6">
              <Trophy size={64} className="text-amber-500 mx-auto" />
              <h2 className="text-3xl font-black">Ciclo Adaptativo Completo</h2>
              <div className="flex justify-center gap-12">
                <div>
                  <p className="text-4xl font-black text-[var(--accent-green)]">
                    {history.filter((h) => h.correct).length}
                  </p>
                  <p className="text-[9px] uppercase tracking-widest opacity-40">
                    Acertos
                  </p>
                </div>
                <div>
                  <p className="text-4xl font-black text-rose-500">
                    {history.filter((h) => !h.correct).length}
                  </p>
                  <p className="text-[9px] uppercase tracking-widest opacity-40">
                    Falhas
                  </p>
                </div>
              </div>
              <Button
                onClick={() => navigate("/")}
                className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest"
              >
                Concluir
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {librarianOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end p-4 pointer-events-none">
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="w-full max-w-md h-[80vh] bg-background border border-border rounded-[3rem] shadow-2xl pointer-events-auto overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-border flex items-center justify-between bg-primary/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary text-white">
                    <BookOpen size={18} />
                  </div>
                  <div>
                    <h3 className="font-black uppercase text-xs tracking-widest">
                      Bibliotecário IA
                    </h3>
                    <p className="text-[9px] opacity-40 font-bold uppercase">
                      RAG: Consultando sua biblioteca local
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setLibrarianOpen(false)}
                  className="p-2 hover:bg-secondary rounded-full"
                >
                  <XCircle size={20} className="opacity-30" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {librarianChat.map((msg, i) => (
                  <div key={i} className="space-y-4">
                    <div className="flex justify-end">
                      <div className="p-4 rounded-3xl rounded-tr-none bg-primary text-white text-xs font-medium">
                        {msg.q}
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="p-5 rounded-3xl rounded-tl-none bg-secondary/50 border border-border/50 text-xs leading-relaxed">
                        {msg.a}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-6 border-t border-border bg-secondary/10">
                <div className="flex gap-2">
                  <input
                    value={librarianQuery}
                    onChange={(e) => setLibrarianQuery(e.target.value)}
                    className="flex-1 px-5 py-4 rounded-2xl bg-background border border-border text-xs outline-none"
                  />
                  <button
                    onClick={() => {
                      const q = librarianQuery;
                      setLibrarianQuery("");
                      askLibrarian.mutate(
                        { query: q, apiKey, provider },
                        {
                          onSuccess: (data: any) =>
                            setLibrarianChat([
                              ...librarianChat,
                              { q, a: data.answer, sources: data.sources },
                            ]),
                        },
                      );
                    }}
                    className="p-4 rounded-2xl bg-primary text-white"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );

  function startSession() {
    if (!selectedDiscId) {
      toast.error("Selecione uma disciplina");
      return;
    }
    setHistory([]);
    setCurrentQuestion(null);
    setPhase("question");
    fetchNextQuestion();
  }
}
