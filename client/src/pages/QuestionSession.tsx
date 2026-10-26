import { MobileTecBrowser } from "@/components/question-session/MobileTecBrowser";
import { EssaysTab } from "@/components/question-session/EssaysTab";
import { AiPostMortem } from "@/components/question-session/AiPostMortem";
import { MnemonicSos } from "@/components/question-session/MnemonicSos";

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import {
  ChevronLeft,
  CheckCircle2,
  XCircle,
  SkipForward,
  Globe,
  BookOpen,
  Save,
  BarChart2,
  AlertTriangle,
  Brain,
  BookMarked,
  Crosshair,
  RotateCcw,
  Play,
  CircleDot,
  Flag,
  Clock,
  ClipboardPaste,
  Trash2,
  ListChecks,
  ClipboardX,
  PenLine,
  Timer,
  Search,
  Zap,
  ExternalLink,
  FileText,
  Camera,
  Image as ImageIcon,
  Send,
  Eye,
  Wand2,
  Plus,
  ArrowRight,
  X,
  CheckCircle,
  Star,
  MessageSquare,
  Target,
  FlaskConical,
  RefreshCw,
  Sparkles,
  Settings,
  Wifi,
  WifiOff,
} from "lucide-react";
import { initTecBrowserListener } from "@/lib/tecBrowser";
import { openTecBrowser } from "@/lib/openTecBrowser";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import QuestionErrors from "./QuestionErrors";
import SubjectiveAnswersTab, {
  HighlightedText,
} from "@/components/SubjectiveAnswersTab";
import { StudyTimer } from "@/components/StudyTimer";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────
type ErrorOrigin = "attention" | "forgetting" | "theory" | "trap" | null;
type Phase = "setup" | "session" | "summary";

interface QuestionResult {
  index: number;
  correct: boolean;
  errorOrigin: ErrorOrigin;
  savedQuestion?: boolean;
  confidence?: "chute" | "acho" | "certeza" | null;
  sawResult?: boolean;
}

interface ParsedQuestion {
  questionId?: string;
  banca?: string;
  year?: number;
  contest?: string;
  statement: string;
  alternatives: { letter: string; text: string }[];
  userAnswer?: string;
  correctAnswer?: string;
}

const ERROR_ORIGINS = [
  {
    id: "attention" as const,
    label: "Atenção",
    desc: "Erro por falta de atenção",
    icon: AlertTriangle,
    color: "#f59e0b",
  },
  {
    id: "forgetting" as const,
    label: "Esquecimento",
    desc: "Não lembrei o conteúdo",
    icon: Brain,
    color: "#3b82f6",
  },
  {
    id: "theory" as const,
    label: "Teoria",
    desc: "Não sei o conteúdo ainda",
    icon: BookMarked,
    color: "#8b5cf6",
  },
  {
    id: "trap" as const,
    label: "Pegadinha",
    desc: "Fui enganado pela questão",
    icon: Crosshair,
    color: "#ef4444",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Parser TEC
// ─────────────────────────────────────────────────────────────────────────────
function parseTEC(
  raw: string,
): { ok: true; q: ParsedQuestion } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Cole uma questão primeiro." };

  const headerMatch = text.match(
    /^(#\d+)\s+(.+?)\s*-\s*(\d{4})\s*-\s*(.+?)[\n\r]/,
  );
  const questionId = headerMatch?.[1];
  const banca = headerMatch?.[2]?.trim();
  const year = headerMatch?.[3] ? parseInt(headerMatch[3]) : undefined;
  const contest = headerMatch?.[4]?.trim();

  const withoutHeader = headerMatch
    ? text.slice(text.indexOf("\n") + 1).trim()
    : text;

  const altStartMatch = withoutHeader.match(/(?:^|\n)(A\n|A\)|A\s*\n)/m);
  const altIdx = altStartMatch ? withoutHeader.indexOf(altStartMatch[0]) : -1;
  let statement =
    altIdx > 0 ? withoutHeader.slice(0, altIdx).trim() : withoutHeader;
  statement = statement
    .replace(/\n(No que se refere|Assinale|Julgue|Com base)[^\n]*$/i, "")
    .trim();

  const alternatives: { letter: string; text: string }[] = [];
  const altRegex = /\n([A-E])\n([\s\S]*?)(?=\n[A-E]\n|Você selecionou|$)/g;
  let m: RegExpExecArray | null;
  while ((m = altRegex.exec("\n" + withoutHeader)) !== null) {
    alternatives.push({ letter: m[1], text: m[2].trim() });
  }

  const userAnswer = text.match(/Você selecionou:\s*([A-E])/i)?.[1];
  const correctAnswer = text.match(/(?:Gabarito|a correta é):\s*([A-E])/i)?.[1];

  if (!statement)
    return {
      ok: false,
      error: "Não consegui identificar o enunciado. Verifique o formato.",
    };

  return {
    ok: true,
    q: {
      questionId,
      banca,
      year,
      contest,
      statement,
      alternatives,
      userAnswer,
      correctAnswer,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────
export default function QuestionSession() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const urlTopicId = urlParams.get("topicId")
    ? Number(urlParams.get("topicId"))
    : null;

  const [activeTab, setActiveTab] = useState<
    "session" | "errors" | "browser" | "subjetivas" | "essays"
  >("browser");
  const [showTimer, setShowTimer] = useState(false);

  const { data: pushTokenData } = trpc.import.getICalUrl.useQuery();
  const pushTokenRef = useRef<string>("");
  useEffect(() => {
    if (pushTokenData?.token) pushTokenRef.current = pushTokenData.token;
    initTecBrowserListener(pushTokenData?.token || "");
  }, [pushTokenData?.token]);

  const prefill = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("qs_prefill") || "null");
    } catch {
      return null;
    }
  })();
  const prefillTopicId = prefill?.topicId
    ? Number(prefill.topicId)
    : urlTopicId;
  const prefillDiscId = prefill?.disciplineId
    ? Number(prefill.disciplineId)
    : null;
  const prefillTopicName = prefill?.topicName ?? urlParams.get("topicName");
  const shouldAutoStart = !!prefill?.autoStart;

  const [phase, setPhase] = useState<Phase>("setup");
  const [selectedDisc, setSelectedDisc] = useState<number | null>(
    prefillDiscId,
  );
  const [selectedTopic, setSelectedTopic] = useState<number | null>(
    prefillTopicId,
  );
  const [totalQ, setTotalQ] = useState(shouldAutoStart ? 5 : 10);
  const [autoStarted, setAutoStarted] = useState(false);
  const [showQuickPick, setShowQuickPick] = useState(shouldAutoStart);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [awaitingOrigin, setAwaitingOrigin] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [confidence, setConfidence] = useState<
    "chute" | "acho" | "certeza" | null
  >(null);
  const [sawResult, setSawResult] = useState(false);
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());

  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<ParsedQuestion | null>(null);
  const [parseError, setParseError] = useState("");
  const [qSaved, setQSaved] = useState(false);

  const utils = trpc.useUtils();
  const { data: disciplines } = trpc.discipline.list.useQuery();
  const { data: topicsData } = trpc.topic.list.useQuery(
    { disciplineId: selectedDisc ?? undefined },
    { enabled: !!selectedDisc },
  );
  const topics = (topicsData as any)?.topics ?? [];
  const { data: revisionsData } = trpc.revision.list.useQuery(
    { completed: false },
    { enabled: !!selectedTopic },
  );

  const setPerformance = trpc.topic.setPerformance.useMutation({
    onSuccess: () => {
      utils.dashboard.getStats.invalidate();
      utils.topic.list.invalidate();
    },
  });
  const addStudyTime = trpc.topic.addStudyTime.useMutation({
    onSuccess: () => {
      utils.dashboard.getStats.invalidate();
      utils.topic.list.invalidate();
    },
  });
  const markTestCompleted = trpc.revision.markCompleted.useMutation({
    onSuccess: () => {
      utils.calendar.getData.invalidate();
      utils.dashboard.getStats.invalidate();
    },
  });
  const recordAttempt = trpc.study.recordAttempt.useMutation();
  const saveQuestionError = trpc.questionError.save.useMutation({
    onSuccess: () => {
      setQSaved(true);
      toast.success("Questão registrada para diagnóstico!");
      utils.questionError.list.invalidate();
    },
    onError: (e) => toast.error("Erro ao salvar: " + e.message),
  });

  useEffect(() => {
    if (
      !shouldAutoStart ||
      autoStarted ||
      !selectedDisc ||
      !selectedTopic ||
      showQuickPick
    )
      return;
    setAutoStarted(true);
    sessionStorage.removeItem("qs_prefill");
    setStartTime(Date.now());
    setQuestionStartedAt(Date.now());
    setPhase("session");
    setCurrentIndex(0);
    setResults([]);
    setAwaitingOrigin(false);
    setElapsed(0);
  }, [
    shouldAutoStart,
    autoStarted,
    selectedDisc,
    selectedTopic,
    showQuickPick,
  ]);

  useEffect(() => {
    if (phase !== "session" || startTime === null) return;
    const iv = setInterval(
      () => setElapsed(Math.floor((Date.now() - startTime) / 1000)),
      1000,
    );
    return () => clearInterval(iv);
  }, [phase, startTime]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const advance = () => {
    setShowPasteArea(false);
    setPasteText("");
    setParsed(null);
    setParseError("");
    setQSaved(false);
    setConfidence(null);
    setSawResult(false);
    setQuestionStartedAt(Date.now());
    if (currentIndex + 1 >= totalQ) setPhase("summary");
    else setCurrentIndex((i) => i + 1);
  };

  const recordCurrentAttempt = (correct: boolean, answered = true) => {
    if (!selectedTopic) return;
    recordAttempt.mutate({
      topicId: selectedTopic,
      disciplineId: selectedDisc ?? undefined,
      answered,
      correct,
      confidence,
      confidencePhase: confidence
        ? sawResult
          ? "after_result"
          : "before_result"
        : null,
      seconds: Math.max(0, Math.round((Date.now() - questionStartedAt) / 1000)),
      source: "manual",
    });
  };

  const handleAnswer = (correct: boolean) => {
    recordCurrentAttempt(correct, true);
    if (correct) {
      setResults((p) => [
        ...p,
        {
          index: currentIndex,
          correct: true,
          errorOrigin: null,
          confidence,
          sawResult,
        },
      ]);
      advance();
    } else {
      setAwaitingOrigin(true);
    }
  };

  const handleOrigin = (origin: ErrorOrigin) => {
    setResults((p) => [
      ...p,
      {
        index: currentIndex,
        correct: false,
        errorOrigin: origin,
        confidence,
        sawResult,
      },
    ]);
    setAwaitingOrigin(false);
    setShowPasteArea(true);
  };

  const handleSaveQuestion = () => {
    if (!parsed || !selectedTopic || !selectedDisc) return;
    const lastResult = results[results.length - 1];
    saveQuestionError.mutate({
      topicId: selectedTopic,
      disciplineId: selectedDisc,
      questionId: parsed.questionId,
      banca: parsed.banca,
      year: parsed.year,
      contest: parsed.contest,
      statement: parsed.statement,
      alternatives: parsed.alternatives,
      userAnswer: parsed.userAnswer,
      correctAnswer: parsed.correctAnswer,
      errorOrigin: lastResult?.errorOrigin ?? undefined,
    });
  };

  const handleSaveSession = async () => {
    if (!selectedTopic) {
      toast.error("Selecione um tema para salvar.");
      return;
    }
    const correct = results.filter((r) => r.correct).length;
    const wrong = results.filter((r) => !r.correct).length;
    try {
      const cur = (topicsData as any)?.topics?.find(
        (t: any) => t.id === selectedTopic,
      );
      const prev = cur?.performance;
      await setPerformance.mutateAsync({
        topicId: selectedTopic,
        correctCount: (prev?.correctCount ?? 0) + correct,
        errorCount: (prev?.errorCount ?? 0) + wrong,
        errorByAttention:
          (prev?.errorByAttention ?? 0) +
          results.filter((r) => r.errorOrigin === "attention").length,
        errorByForgetting:
          (prev?.errorByForgetting ?? 0) +
          results.filter((r) => r.errorOrigin === "forgetting").length,
        errorByTheory:
          (prev?.errorByTheory ?? 0) +
          results.filter((r) => r.errorOrigin === "theory").length,
        errorByTrap:
          (prev?.errorByTrap ?? 0) +
          results.filter((r) => r.errorOrigin === "trap").length,
      });
      if (elapsed > 0)
        await addStudyTime.mutateAsync({
          topicId: selectedTopic,
          seconds: elapsed,
        });
      const today = new Date().toISOString().split("T")[0];
      const nextTest = (revisionsData ?? [])
        .filter(
          (r: any) =>
            r.topicId === selectedTopic &&
            r.type === "test" &&
            !r.completed &&
            r.scheduledDate <= today,
        )
        .sort((a: any, b: any) =>
          (b.scheduledDate || "").localeCompare(a.scheduledDate || ""),
        )[0];
      if (nextTest)
        await markTestCompleted.mutateAsync({
          id: nextTest.id,
          completed: true,
        });
      toast.success(`Sessão salva! ${correct}/${totalQ} acertos.`);
      navigate("/");
    } catch {
      toast.error("Erro ao salvar sessão.");
    }
  };

  const correctCount = results.filter((r) => r.correct).length;
  const wrongCount = results.filter((r) => !r.correct).length;
  const accuracy =
    results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;
  const progress = (currentIndex / totalQ) * 100;

  const TabNav = () => (
    <div className="flex gap-1 p-1.5 rounded-2xl bg-secondary/40 border border-border w-full overflow-x-auto no-scrollbar">
      {[
        { id: "browser", label: "TEC", icon: Globe },
        { id: "errors", label: "Erros", icon: ClipboardX },
        { id: "subjetivas", label: "Subjetivas", icon: PenLine },
        { id: "essays", label: "Redações", icon: FileText },
      ].map((t) => (
        <button
          key={t.id}
          onClick={() => setActiveTab(t.id as any)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === t.id ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
        >
          <t.icon className="h-4 w-4" /> {t.label}
        </button>
      ))}
    </div>
  );

  // ── RENDER SETUP ───────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="max-w-7xl mx-auto space-y-8 pb-20">
        <PageHeader
          eyebrow="Execução"
          title="Treino"
          description="Abra o TEC, responda e deixe o SOE registrar cada acerto e erro."
          actions={<TabNav />}
        />

        {activeTab === "session" && (
          <>
            <div className="soe-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-[var(--primary-border)] bg-[var(--primary-bg-subtle)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--primary-bg-subtle)] border border-[var(--primary-border)] flex items-center justify-center">
                  <Globe className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">
                    Fluxo principal: TEC Browser
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Abra o TEC dentro do SOE. Cada acerto/erro volta
                    automaticamente para o seu histórico.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab("browser")}
                  className="h-10 px-3 rounded-xl border border-border text-[9px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  Voltar ao TEC
                </button>
                <button
                  onClick={() => void openTecBrowser(pushTokenRef.current)}
                  className="h-10 px-4 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95"
                >
                  <ExternalLink className="w-4 h-4" /> Abrir TEC
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-7 space-y-6">
                <div className="soe-card p-6 space-y-6">
                  <div className="flex items-center gap-3 border-b border-border/60 pb-4">
                    <Play className="w-5 h-5 text-[var(--primary)]" />
                    <h3 className="font-black text-sm uppercase tracking-widest">
                      Registro manual (opcional)
                    </h3>
                  </div>

                  {prefillTopicName && selectedTopic && (
                    <div className="p-4 rounded-2xl bg-[var(--primary-bg-subtle)] border border-[var(--primary-border)] flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--primary-bg-subtle)] flex items-center justify-center">
                          <Zap className="w-5 h-5 text-[var(--primary)]" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black opacity-50 uppercase">
                            Agendado
                          </p>
                          <p className="text-sm font-black">
                            {prefillTopicName}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedTopic(null);
                          sessionStorage.removeItem("qs_prefill");
                        }}
                        className="text-[10px] font-black uppercase text-[var(--primary)] px-3 py-1.5 rounded-lg border border-[var(--primary-border)] hover:bg-[var(--primary-bg-subtle)] transition-all"
                      >
                        Trocar
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">
                        Disciplina
                      </label>
                      <select
                        data-testid="discipline-select"
                        className="w-full px-4 py-3 rounded-2xl bg-secondary/40 border border-border font-bold text-sm focus:outline-none"
                        value={selectedDisc ?? ""}
                        onChange={(e) => {
                          setSelectedDisc(
                            e.target.value ? Number(e.target.value) : null,
                          );
                          setSelectedTopic(null);
                        }}
                      >
                        <option value="" className="bg-card text-foreground">
                          Selecionar...
                        </option>
                        {(disciplines as any[])?.map((d) => (
                          <option
                            key={d.id}
                            value={d.id}
                            className="bg-card text-foreground"
                          >
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">
                        Tema / Assunto
                      </label>
                      <select
                        data-testid="topic-select"
                        className="w-full px-4 py-3 rounded-2xl bg-secondary/40 border border-border font-bold text-sm focus:outline-none disabled:opacity-20"
                        value={selectedTopic ?? ""}
                        onChange={(e) =>
                          setSelectedTopic(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        disabled={!selectedDisc}
                      >
                        <option value="" className="bg-card text-foreground">
                          Selecionar...
                        </option>
                        {topics.map((t: any) => (
                          <option
                            key={t.id}
                            value={t.id}
                            className="bg-card text-foreground"
                          >
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">
                      Quantidade de Questões
                    </label>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                      {[5, 10, 15, 20, 30, 50].map((n) => (
                        <button
                          key={n}
                          onClick={() => setTotalQ(n)}
                          className={`py-2 rounded-xl text-xs font-black transition-all ${totalQ === n ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-secondary/40 opacity-40 hover:opacity-100"}`}
                          style={{ color: "var(--app-fg)" }}
                        >
                          {n}
                        </button>
                      ))}
                      <input
                        type="number"
                        value={totalQ}
                        onChange={(e) =>
                          setTotalQ(Math.max(1, parseInt(e.target.value) || 1))
                        }
                        className="bg-secondary/40 border border-border rounded-xl px-2 text-center text-xs font-black"
                      />
                    </div>
                  </div>

                  <button
                    className="w-full h-14 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-20 disabled:grayscale"
                    disabled={!selectedDisc || !selectedTopic}
                    onClick={() => {
                      setStartTime(Date.now());
                      setPhase("session");
                      setCurrentIndex(0);
                      setResults([]);
                      setAwaitingOrigin(false);
                      setElapsed(0);
                      sessionStorage.removeItem("qs_prefill");
                    }}
                  >
                    <Play className="w-5 h-5 fill-[var(--primary-foreground)]" />{" "}
                    INICIAR
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5 space-y-6">
                <div className="soe-card p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Timer className="w-20 h-20" />
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <Timer className="w-4 h-4 text-[var(--primary)]" />
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--primary)]">
                      Timer de Estudo
                    </h3>
                  </div>
                  <StudyTimer />
                </div>

                <div className="soe-card p-6 bg-gradient-to-br from-emerald-500/5 to-transparent border-emerald-500/10">
                  <h4 className="font-black text-xs uppercase tracking-widest text-emerald-500 mb-2">
                    Por que registrar aqui?
                  </h4>
                  <p className="text-xs opacity-60 leading-relaxed">
                    Ao registrar suas questões manualmente ou pelo browser, o
                    SOE constrói seu
                    <strong> Mapa de Calor de Performance</strong>, permitindo
                    que a IA identifique seus pontos fracos automaticamente.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "browser" && (
          <div className="space-y-6">
            <div className="soe-card p-12 flex flex-col items-center text-center space-y-6 max-w-2xl mx-auto">
              <div className="w-20 h-20 rounded-3xl bg-[var(--primary-bg-subtle)] flex items-center justify-center border border-[var(--primary-border)]">
                <Globe className="w-10 h-10 text-[var(--primary)]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black">Navegador TEC Integrado</h2>
                <p className="text-sm opacity-60 leading-relaxed">
                  Abra o site do TEC Concursos diretamente dentro do SOE.
                  {(window as any).electron?.ipcRenderer
                    ? " Seus acertos e erros serão sincronizados automaticamente via motor desktop."
                    : " No mobile, usamos um túnel seguro para garantir o rastreio automático."}
                </p>
              </div>
              <button
                onClick={() => void openTecBrowser(pushTokenRef.current)}
                className="px-8 py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black flex items-center gap-3 hover:opacity-90 transition-all active:scale-95 shadow-xl shadow-[var(--primary-shadow)]"
              >
                <ExternalLink className="w-5 h-5" />{" "}
                {(window as any).electron?.ipcRenderer
                  ? "Acessar TEC Concursos"
                  : "Abrir Navegador Automático"}
              </button>
              <button
                onClick={() => setActiveTab("session")}
                className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Treino manual (opcional)
              </button>
              <p className="text-[9px] text-muted-foreground/70">
                {(() => {
                  try {
                    const raw = localStorage.getItem("soe_tec_last_event");
                    const last = raw ? JSON.parse(raw) : null;
                    return last?.at
                      ? `Última captura TEC: ${new Date(last.at).toLocaleString("pt-BR")}`
                      : "Nenhum evento TEC recebido ainda. Abra o TEC por este botão.";
                  } catch {
                    return "Capture TEC pronta para receber eventos.";
                  }
                })()}
              </p>
            </div>
            <MobileTecBrowser pushToken={pushTokenData?.token || ""} />
          </div>
        )}

        {activeTab === "errors" && <QuestionErrors />}
        {activeTab === "subjetivas" && <SubjectiveAnswersTab />}
        {activeTab === "essays" && <EssaysTab />}
      </div>
    );
  }

  // ── RENDER SESSION ─────────────────────────────────────────────────
  if (phase === "session") {
    const topicName = topics.find((t: any) => t.id === selectedTopic)?.name;
    const discName = (disciplines as any[])?.find(
      (d) => d.id === selectedDisc,
    )?.name;

    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-20">
        {/* Header imersivo */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--primary)]">
              {topicName ?? discName}
            </p>
            <h2 className="text-4xl font-black tracking-tight">
              Questão {currentIndex + 1}{" "}
              <span className="opacity-20">/ {totalQ}</span>
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <p className="text-[10px] font-black opacity-40 uppercase">
                Cronômetro
              </p>
              <p className="text-2xl font-black tabular-nums font-mono text-[var(--primary)]">
                {fmt(elapsed)}
              </p>
            </div>
          </div>
        </div>

        <div className="h-1.5 rounded-full bg-secondary/40 overflow-hidden">
          <div
            className="h-full bg-[var(--primary)] shadow-[0_0_15px_var(--primary-shadow)] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "Acertos",
              value: correctCount,
              color: "text-emerald-500",
              bg: "bg-emerald-500/5",
            },
            {
              label: "Erros",
              value: wrongCount,
              color: "text-rose-500",
              bg: "bg-rose-500/5",
            },
            {
              label: "Taxa",
              value: `${accuracy}%`,
              color: "text-sky-500",
              bg: "bg-sky-500/5",
            },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-2xl p-4 text-center border border-border/60 ${s.bg}`}
            >
              <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">
                {s.label}
              </p>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {!awaitingOrigin && !showPasteArea && (
          <div className="soe-card p-10 space-y-8 flex flex-col items-center">
            <div className="w-20 h-20 rounded-2xl bg-secondary/40 border border-border flex items-center justify-center">
              <span className="text-3xl font-black opacity-30">
                #{currentIndex + 1}
              </span>
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-black">Qual o resultado?</h3>
              <p className="text-sm opacity-50">
                Marque a confiança antes de registrar o gabarito no SOE.
              </p>
            </div>

            <div className="w-full space-y-2 rounded-lg border border-border/70 bg-secondary/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                  Sua confiança
                </p>
                <label className="flex cursor-pointer items-center gap-1.5 text-[9px] font-semibold text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={sawResult}
                    onChange={(e) => setSawResult(e.target.checked)}
                    className="h-3 w-3 accent-[var(--primary)]"
                  />
                  Já vi o gabarito
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "chute", label: "Chute" },
                  { id: "acho", label: "Acho" },
                  { id: "certeza", label: "Certeza" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() =>
                      setConfidence((prev) =>
                        prev === item.id
                          ? null
                          : (item.id as typeof confidence),
                      )
                    }
                    className={`rounded-md border py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      confidence === item.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground/70">
                {sawResult
                  ? "Marcado como pós-gabarito: não entra na calibração."
                  : "Ideal: marcar antes de ver o resultado no TEC."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full">
              <button
                onClick={() => handleAnswer(true)}
                className="py-6 md:py-8 rounded-2xl bg-emerald-500 text-white font-black text-lg flex flex-col items-center gap-3 shadow-xl shadow-emerald-500/20 active:scale-[0.95] transition-all group"
              >
                <CheckCircle2 className="w-10 h-10 group-hover:scale-110 transition-transform" />{" "}
                ACERTEI
              </button>
              <button
                onClick={() => handleAnswer(false)}
                className="py-6 md:py-8 rounded-2xl bg-rose-500 text-white font-black text-lg flex flex-col items-center gap-3 shadow-xl shadow-rose-500/20 active:scale-[0.95] transition-all group"
              >
                <XCircle className="w-10 h-10 group-hover:scale-110 transition-transform" />{" "}
                ERREI
              </button>
            </div>

            <button
              onClick={() => {
                recordCurrentAttempt(false, false);
                setResults((p) => [
                  ...p,
                  {
                    index: currentIndex,
                    correct: false,
                    errorOrigin: null,
                    confidence: null,
                    sawResult,
                  },
                ]);
                advance();
              }}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-widest opacity-30 hover:opacity-100 transition-opacity"
            >
              <SkipForward className="w-4 h-4" /> Pular Questão
            </button>
          </div>
        )}

        {awaitingOrigin && (
          <div className="soe-card p-8 space-y-6 border-rose-500/30 bg-rose-500/5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500 rounded-lg">
                <XCircle className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-black text-lg">O que causou o erro?</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ERROR_ORIGINS.map((o) => {
                const Icon = o.icon;
                return (
                  <button
                    key={o.id}
                    onClick={() => handleOrigin(o.id)}
                    className="p-4 rounded-2xl text-left transition-all active:scale-95 border border-border bg-secondary/40 hover:bg-secondary/60 group"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ background: `${o.color}22` }}
                      >
                        <Icon className="w-4 h-4" style={{ color: o.color }} />
                      </div>
                      <span
                        className="font-black text-sm uppercase tracking-widest"
                        style={{ color: o.color }}
                      >
                        {o.label}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-50 font-medium leading-relaxed">
                      {o.desc}
                    </p>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => handleOrigin(null)}
              className="w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest opacity-30 border border-border/60"
            >
              Ignorar classificação
            </button>
          </div>
        )}

        {showPasteArea && (
          <div className="soe-card p-8 space-y-6 animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardPaste className="w-6 h-6 text-[var(--primary)]" />
                <h3 className="font-black text-lg">Salvar questão no banco?</h3>
              </div>
              {qSaved && (
                <div className="bg-emerald-500/20 px-3 py-1 rounded-full flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-[10px] font-black text-emerald-500">
                    SALVA
                  </span>
                </div>
              )}
            </div>

            {!parsed ? (
              <div className="space-y-4">
                <p className="text-xs opacity-50 leading-relaxed">
                  Cole o texto da questão do TEC para análise posterior da IA.
                </p>
                <textarea
                  rows={5}
                  value={pasteText}
                  onChange={(e) => {
                    setPasteText(e.target.value);
                    setParseError("");
                  }}
                  placeholder={"Cole aqui..."}
                  className="w-full rounded-2xl bg-secondary/20 border border-border p-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary-shadow)] resize-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={advance}
                    className="py-4 rounded-2xl font-black text-xs uppercase tracking-widest opacity-40 bg-secondary/40 border border-border"
                  >
                    Pular
                  </button>
                  <button
                    onClick={() => {
                      const r = parseTEC(pasteText);
                      if (!r.ok) {
                        setParseError(r.error);
                        return;
                      }
                      setParsed(r.q);
                      setParseError("");
                    }}
                    disabled={!pasteText.trim()}
                    className="py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest disabled:opacity-20 transition-all"
                  >
                    Processar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="p-4 rounded-2xl bg-secondary/40 border border-border space-y-3">
                  <p className="text-xs font-black text-[var(--primary)] uppercase">
                    {parsed.questionId || "Questão Identificada"}
                  </p>
                  <p className="text-xs opacity-60 leading-relaxed line-clamp-4">
                    {parsed.statement}
                  </p>
                </div>

                {!qSaved ? (
                  <button
                    onClick={handleSaveQuestion}
                    disabled={saveQuestionError.isPending}
                    className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black text-sm shadow-lg shadow-emerald-500/20"
                  >
                    {saveQuestionError.isPending
                      ? "SALVANDO..."
                      : "CONFIRMAR E SALVAR"}
                  </button>
                ) : (
                  <button
                    onClick={advance}
                    className="w-full py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-sm flex items-center justify-center gap-2"
                  >
                    PRÓXIMA QUESTÃO <SkipForward className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── RENDER SUMMARY ─────────────────────────────────────────────────
  const totalWrong = results.filter((r) => !r.correct);
  const calibratedResults = results.filter((r) => r.confidence && !r.sawResult);
  const overconfidence = calibratedResults.filter(
    (r) => r.confidence === "certeza" && !r.correct,
  ).length;
  const underconfidence = calibratedResults.filter(
    (r) => r.confidence === "chute" && r.correct,
  ).length;
  const originCounts = ERROR_ORIGINS.map((o) => ({
    ...o,
    count: totalWrong.filter((r) => r.errorOrigin === o.id).length,
  })).filter((o) => o.count > 0);
  const finalAccuracy =
    totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;
  const accuracyColorClass =
    finalAccuracy >= 70
      ? "text-emerald-500"
      : finalAccuracy >= 50
        ? "text-[var(--primary)]"
        : "text-rose-500";
  const accuracyBorderClass =
    finalAccuracy >= 70
      ? "border-emerald-500/30"
      : finalAccuracy >= 50
        ? "border-[var(--primary)]/30"
        : "border-rose-500/30";

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="p-4 bg-[var(--primary-bg-subtle)] rounded-full mb-2">
          <Flag className="w-8 h-8 text-[var(--primary)]" />
        </div>
        <h1 className="text-4xl font-black tracking-tight">
          Sessão Finalizada
        </h1>
        <p className="text-sm opacity-50">
          Treinamento concluído. Confira seu desempenho.
        </p>
      </div>

      <div
        className={`soe-card p-10 text-center space-y-4 border-2 ${accuracyBorderClass}`}
      >
        <p className={`text-8xl font-black ${accuracyColorClass}`}>
          {finalAccuracy}%
        </p>
        <p className="text-sm font-bold opacity-60 uppercase tracking-widest">
          {correctCount} acertos · {wrongCount} erros · {totalQ} totais
        </p>
        <div className="h-3 rounded-full bg-secondary/40 overflow-hidden max-w-xs mx-auto mt-6">
          <div
            className={`h-full transition-all duration-1000`}
            style={{
              width: `${finalAccuracy}%`,
              backgroundColor:
                finalAccuracy >= 70
                  ? "#10b981"
                  : finalAccuracy >= 50
                    ? "var(--primary)"
                    : "#f43f5e",
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {originCounts.length > 0 && (
          <div className="soe-card p-6 space-y-4">
            <h3 className="font-black text-xs uppercase tracking-[0.2em] opacity-40 flex items-center gap-2">
              <BarChart2 className="w-4 h-4" /> Diagnóstico do Erro
            </h3>
            <div className="space-y-4">
              {originCounts.map((o) => {
                const pct = Math.round((o.count / totalWrong.length) * 100);
                return (
                  <div key={o.id} className="space-y-2">
                    <div className="flex justify-between text-xs font-black uppercase">
                      <span style={{ color: o.color }}>{o.label}</span>
                      <span>
                        {o.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary/40 overflow-hidden">
                      <div
                        className="h-full"
                        style={{ width: `${pct}%`, backgroundColor: o.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* NEW: IA Mnemonic SOS */}
            <div className="pt-4 border-t border-rose-500/10">
              <MnemonicSos topicId={selectedTopic} />
            </div>
          </div>
        )}

        <div className="soe-card p-6 flex flex-col justify-center items-center text-center space-y-4">
          <div className="p-3 bg-secondary/40 rounded-2xl">
            <Clock className="w-8 h-8 opacity-40" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40">
              Tempo Total Investido
            </p>
            <p className="text-3xl font-black tabular-nums">{fmt(elapsed)}</p>
          </div>
        </div>
      </div>

      <div className="soe-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Recibo da sessão
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Calibradas", value: calibratedResults.length },
            { label: "Overconfidence", value: overconfidence },
            { label: "Subconfiança", value: underconfidence },
            { label: "Erros", value: totalWrong.length },
          ].map((item) => (
            <div key={item.label} className="rounded-md bg-secondary/20 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {item.label}
              </p>
              <p className="text-lg font-semibold tabular-nums">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {totalWrong.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/question-errors")}
            >
              Revisar erros
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => navigate("/plan")}>
            Ver próximo passo
          </Button>
        </div>
      </div>

      {/* AI Post-Mortem Section */}
      <AiPostMortem
        topic={selectedTopic}
        accuracy={finalAccuracy}
        results={results}
      />

      <div className="space-y-4 pt-4">
        <button
          onClick={handleSaveSession}
          disabled={setPerformance.isPending || !selectedTopic}
          className="w-full py-5 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-lg shadow-xl shadow-[var(--primary-shadow)] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
        >
          <Save className="w-6 h-6" />{" "}
          {setPerformance.isPending ? "SALVANDO..." : "CONCLUIR E SALVAR"}
        </button>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => {
              setPhase("setup");
              setResults([]);
              setCurrentIndex(0);
              setAwaitingOrigin(false);
              setShowPasteArea(false);
            }}
            className="py-4 rounded-2xl bg-secondary/40 border border-border font-black text-xs uppercase tracking-widest hover:bg-secondary/60 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> Nova Sessão
          </button>
          <button
            onClick={() => navigate("/")}
            className="py-4 rounded-2xl bg-secondary/40 border border-border font-black text-xs uppercase tracking-widest hover:bg-secondary/60 transition-all flex items-center justify-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" /> Voltar ao Início
          </button>
        </div>
      </div>
      <MobileTecBrowser pushToken={pushTokenData?.token || ""} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
