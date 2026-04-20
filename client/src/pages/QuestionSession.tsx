import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import {
  ChevronLeft, CheckCircle2, XCircle, SkipForward, Globe,
  BookOpen, Save, BarChart2, AlertTriangle, Brain, BookMarked, Crosshair,
  RotateCcw, Play, CircleDot, Flag, Clock, ClipboardPaste, Trash2, ListChecks, ClipboardX,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import QuestionErrors from "./QuestionErrors";
import SubjectiveAnswersTab from "@/components/SubjectiveAnswersTab";

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
  { id: "attention"  as const, label: "Atenção",      desc: "Erro por falta de atenção",   icon: AlertTriangle, color: "#f59e0b" },
  { id: "forgetting" as const, label: "Esquecimento",  desc: "Não lembrei o conteúdo",      icon: Brain,         color: "#3b82f6" },
  { id: "theory"     as const, label: "Teoria",        desc: "Não sei o conteúdo ainda",    icon: BookMarked,    color: "#8b5cf6" },
  { id: "trap"       as const, label: "Pegadinha",     desc: "Fui enganado pela questão",   icon: Crosshair,     color: "#ef4444" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Parser TEC
// ─────────────────────────────────────────────────────────────────────────────
function parseTEC(raw: string): { ok: true; q: ParsedQuestion } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Cole uma questão primeiro." };

  const headerMatch = text.match(/^(#\d+)\s+(.+?)\s*-\s*(\d{4})\s*-\s*(.+?)[\n\r]/);
  const questionId = headerMatch?.[1];
  const banca      = headerMatch?.[2]?.trim();
  const year       = headerMatch?.[3] ? parseInt(headerMatch[3]) : undefined;
  const contest    = headerMatch?.[4]?.trim();

  const withoutHeader = headerMatch ? text.slice(text.indexOf("\n") + 1).trim() : text;

  const altStartMatch = withoutHeader.match(/(?:^|\n)(A\n|A\)|A\s*\n)/m);
  const altIdx = altStartMatch ? withoutHeader.indexOf(altStartMatch[0]) : -1;
  let statement = altIdx > 0 ? withoutHeader.slice(0, altIdx).trim() : withoutHeader;
  statement = statement.replace(/\n(No que se refere|Assinale|Julgue|Com base)[^\n]*$/i, "").trim();

  const alternatives: { letter: string; text: string }[] = [];
  const altRegex = /\n([A-E])\n([\s\S]*?)(?=\n[A-E]\n|Você selecionou|$)/g;
  let m: RegExpExecArray | null;
  while ((m = altRegex.exec("\n" + withoutHeader)) !== null) {
    alternatives.push({ letter: m[1], text: m[2].trim() });
  }

  const userAnswer    = text.match(/Você selecionou:\s*([A-E])/i)?.[1];
  const correctAnswer = text.match(/(?:Gabarito|a correta é):\s*([A-E])/i)?.[1];

  if (!statement) return { ok: false, error: "Não consegui identificar o enunciado. Verifique o formato." };

  return { ok: true, q: { questionId, banca, year, contest, statement, alternatives, userAnswer, correctAnswer } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────
export default function QuestionSession() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const urlTopicId = urlParams.get("topicId") ? Number(urlParams.get("topicId")) : null;

  // Tab de navegação interna
  const [activeTab, setActiveTab] = useState<"session" | "errors" | "browser" | "subjetivas">("session");

  // getICalUrl auto-generates a push token if the user doesn't have one yet
  const { data: pushTokenData } = trpc.import.getICalUrl.useQuery();
  // Use a ref so the webview closure always reads the current token value
  const pushTokenRef = useRef<string>("");
  useEffect(() => {
    if (pushTokenData?.token) pushTokenRef.current = pushTokenData.token;
  }, [pushTokenData?.token]);

  const prefill = (() => {
    try { return JSON.parse(sessionStorage.getItem("qs_prefill") || "null"); } catch { return null; }
  })();
  const prefillTopicId   = prefill?.topicId     ? Number(prefill.topicId)     : urlTopicId;
  const prefillDiscId    = prefill?.disciplineId ? Number(prefill.disciplineId) : null;
  const prefillTopicName = prefill?.topicName   ?? urlParams.get("topicName");
  const shouldAutoStart  = !!prefill?.autoStart;

  // Estado principal
  const [phase, setPhase]                 = useState<Phase>("setup");
  const [selectedDisc, setSelectedDisc]   = useState<number | null>(prefillDiscId);
  const [selectedTopic, setSelectedTopic] = useState<number | null>(prefillTopicId);
  const [totalQ, setTotalQ]               = useState(shouldAutoStart ? 5 : 10);
  const [autoStarted, setAutoStarted]     = useState(false);
  const [showQuickPick, setShowQuickPick] = useState(shouldAutoStart);

  // Estado sessão
  const [currentIndex, setCurrentIndex]     = useState(0);
  const [results, setResults]               = useState<QuestionResult[]>([]);
  const [awaitingOrigin, setAwaitingOrigin] = useState(false);
  const [startTime, setStartTime]           = useState<number | null>(null);
  const [elapsed, setElapsed]               = useState(0);

  // Estado Colagem (Opcional após erro)
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText]         = useState("");
  const [parsed, setParsed]               = useState<ParsedQuestion | null>(null);
  const [parseError, setParseError]       = useState("");
  const [qSaved, setQSaved]               = useState(false);

  // Dados
  const utils = trpc.useUtils();
  const { data: disciplines }   = trpc.discipline.list.useQuery();
  const { data: topicsData }    = trpc.topic.list.useQuery(
    { disciplineId: selectedDisc ?? undefined },
    { enabled: !!selectedDisc }
  );
  const topics = (topicsData as any)?.topics ?? [];
  const { data: revisionsData } = trpc.revision.list.useQuery(
    { completed: false },
    { enabled: !!selectedTopic }
  );

  // Mutations
  const setPerformance = trpc.topic.setPerformance.useMutation({
    onSuccess: () => { utils.dashboard.getStats.invalidate(); utils.topic.list.invalidate(); },
  });
  const addStudyTime = trpc.topic.addStudyTime.useMutation({
    onSuccess: () => { utils.dashboard.getStats.invalidate(); utils.topic.list.invalidate(); },
  });
  const markTestCompleted = trpc.revision.markCompleted.useMutation({
    onSuccess: () => { utils.calendar.getData.invalidate(); utils.dashboard.getStats.invalidate(); },
  });
  const saveQuestionError = trpc.questionError.save.useMutation({
    onSuccess: () => { 
      setQSaved(true); 
      toast.success("Questão registrada para diagnóstico!");
      utils.questionError.list.invalidate(); 
    },
    onError: (e) => toast.error("Erro ao salvar: " + e.message),
  });

  // Auto-start do Calendário
  useEffect(() => {
    if (!shouldAutoStart || autoStarted || !selectedDisc || !selectedTopic || showQuickPick) return;
    setAutoStarted(true);
    sessionStorage.removeItem("qs_prefill");
    setStartTime(Date.now());
    setPhase("session");
    setCurrentIndex(0);
    setResults([]);
    setAwaitingOrigin(false);
    setElapsed(0);
  }, [shouldAutoStart, autoStarted, selectedDisc, selectedTopic, showQuickPick]);

  // Timer
  useEffect(() => {
    if (phase !== "session" || startTime === null) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [phase, startTime]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // Handlers
  const advance = () => {
    // Reset states for next question
    setShowPasteArea(false);
    setPasteText("");
    setParsed(null);
    setParseError("");
    setQSaved(false);
    
    if (currentIndex + 1 >= totalQ) setPhase("summary");
    else setCurrentIndex(i => i + 1);
  };

  const handleAnswer = (correct: boolean) => {
    if (correct) { 
      setResults(p => [...p, { index: currentIndex, correct: true, errorOrigin: null }]); 
      advance(); 
    } else {
      setAwaitingOrigin(true);
    }
  };

  const handleOrigin = (origin: ErrorOrigin) => {
    // We don't advance yet, we stay in the "awaitingOrigin" view but now showing the paste option
    // Actually, let's update the results and then show the optional paste area
    setResults(p => [...p, { index: currentIndex, correct: false, errorOrigin: origin }]);
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

  // Salvar sessão final
  const handleSaveSession = async () => {
    if (!selectedTopic) { toast.error("Selecione um tema para salvar."); return; }
    const correct = results.filter(r => r.correct).length;
    const wrong   = results.filter(r => !r.correct).length;
    try {
      const cur  = (topicsData as any)?.topics?.find((t: any) => t.id === selectedTopic);
      const prev = cur?.performance;
      await setPerformance.mutateAsync({
        topicId: selectedTopic,
        correctCount:      (prev?.correctCount      ?? 0) + correct,
        errorCount:        (prev?.errorCount        ?? 0) + wrong,
        errorByAttention:  (prev?.errorByAttention  ?? 0) + results.filter(r => r.errorOrigin === "attention").length,
        errorByForgetting: (prev?.errorByForgetting ?? 0) + results.filter(r => r.errorOrigin === "forgetting").length,
        errorByTheory:     (prev?.errorByTheory     ?? 0) + results.filter(r => r.errorOrigin === "theory").length,
        errorByTrap:       (prev?.errorByTrap       ?? 0) + results.filter(r => r.errorOrigin === "trap").length,
      });
      if (elapsed > 0) await addStudyTime.mutateAsync({ topicId: selectedTopic, seconds: elapsed });
      const today   = new Date().toISOString().split("T")[0];
      const nextTest = (revisionsData ?? [])
        .filter((r: any) => r.topicId === selectedTopic && r.type === "test" && !r.completed && r.scheduledDate <= today)
        .sort((a: any, b: any) => b.scheduledDate.localeCompare(a.scheduledDate))[0];
      if (nextTest) await markTestCompleted.mutateAsync({ id: nextTest.id, completed: true });
      toast.success(`Sessão salva! ${correct}/${totalQ} acertos.`);
      navigate("/");
    } catch { toast.error("Erro ao salvar sessão."); }
  };

  // Computed
  const correctCount  = results.filter(r => r.correct).length;
  const wrongCount    = results.filter(r => !r.correct).length;
  const accuracy      = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;
  const progress      = (currentIndex / totalQ) * 100;

  // ─────────────────────────────────────────────────────────────────────────
  // Quick-pick (Calendário com autoStart)
  // ─────────────────────────────────────────────────────────────────────────
  if (showQuickPick && prefillTopicName) {
    return (
      <div className="max-w-sm mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-5">
        <div className="text-center space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Sessão Agendada</p>
          <h2 className="text-2xl font-black" style={{ color: "var(--app-fg)" }}>{prefillTopicName}</h2>
        </div>
        <div className="w-full rounded-2xl p-5 space-y-4" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          <p className="text-sm font-semibold text-center" style={{ color: "var(--app-fg)" }}>Quantas questões?</p>
          <div className="grid grid-cols-3 gap-2">
            {[5, 10, 15, 20, 30, 50].map(n => (
              <button key={n} onClick={() => setTotalQ(n)}
                className="py-3 rounded-xl text-sm font-bold transition-all"
                style={{ background: totalQ === n ? "var(--primary)" : "var(--stat-bg)", color: totalQ === n ? "white" : "var(--muted-text)", border: `1px solid ${totalQ === n ? "var(--primary)" : "var(--card-border)"}` }}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setShowQuickPick(false)}
          className="w-full py-4 rounded-2xl text-base font-black flex items-center gap-2 justify-center"
          style={{ background: "var(--primary)", color: "white" }}>
          <Play className="w-5 h-5" /> Iniciar com {totalQ} questões
        </button>
        <button onClick={() => navigate("/")} className="text-sm" style={{ color: "var(--muted-text)" }}>Cancelar</button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup
  // ─────────────────────────────────────────────────────────────────────────
  const TabNav = () => (
    <div className="flex gap-1 p-1 rounded-2xl shrink-0 flex-wrap" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", width: "fit-content" }}>
      <button onClick={() => setActiveTab("session")}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
        style={{ background: activeTab === "session" ? "var(--primary)" : "transparent", color: activeTab === "session" ? "white" : "var(--muted-text)" }}>
        <ListChecks className="h-4 w-4" /> Sessão
      </button>
      <button onClick={() => setActiveTab("browser")}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
        style={{ background: activeTab === "browser" ? "var(--primary)" : "transparent", color: activeTab === "browser" ? "white" : "var(--muted-text)" }}>
        <Globe className="h-4 w-4" /> Navegador TEC
      </button>
      <button onClick={() => setActiveTab("errors")}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
        style={{ background: activeTab === "errors" ? "var(--primary)" : "transparent", color: activeTab === "errors" ? "white" : "var(--muted-text)" }}>
        <ClipboardX className="h-4 w-4" /> Questões Erradas
      </button>
      <button onClick={() => setActiveTab("subjetivas")}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
        style={{ background: activeTab === "subjetivas" ? "var(--primary)" : "transparent", color: activeTab === "subjetivas" ? "white" : "var(--muted-text)" }}>
        <PenLine className="h-4 w-4" /> Subjetivas
      </button>
    </div>
  );

  if (phase === "setup") {
    if (activeTab === "browser") {
      return (
        <div className="space-y-4 flex flex-col h-[calc(100vh-140px)]">
          <TabNav />
          <div className="flex-1 rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-4" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", border: "1px solid" }}>
            <Globe className="w-16 h-16" style={{ color: "var(--primary)" }} />
            <p className="font-bold text-lg" style={{ color: "var(--app-fg)" }}>Navegador Nativo do TEC</p>
            <p className="text-sm max-w-md" style={{ color: "var(--muted-text)" }}>
              O SOE agora carrega a sua Extensão do Chrome nativamente!
              Ao abrir o navegador do TEC pelo botão abaixo, suas questões serão sincronizadas automaticamente com o SOE sem precisar de configurações adicionais.
            </p>
            <button 
              onClick={() => {
                if ((window as any).electron?.ipcRenderer) {
                  (window as any).electron.ipcRenderer.send("open-tec-browser", pushTokenRef.current);
                } else {
                  toast.error("O Navegador do TEC só está disponível no aplicativo Desktop.");
                }
              }}
              className="px-6 py-3 rounded-xl font-bold text-white flex items-center gap-2 mt-4 hover:opacity-90 active:scale-95 transition-all" style={{ background: "var(--primary)" }}>
              <Globe className="w-5 h-5"/> Abrir TEC Concursos
            </button>
          </div>
        </div>
      );
    }

    if (activeTab === "errors") {
      return (
        <div className="space-y-4">
          <TabNav />
          <QuestionErrors />
        </div>
      );
    }

    if (activeTab === "subjetivas") {
      return (
        <div className="space-y-4">
          <TabNav />
          <SubjectiveAnswersTab />
        </div>
      );
    }

    return (
      <div className="max-w-lg mx-auto space-y-4">
        <TabNav />
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2 rounded-xl hover:opacity-70" style={{ color: "var(--muted-text)" }}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black" style={{ color: "var(--app-fg)" }}>Sessão de Questões</h1>
            <p className="text-sm" style={{ color: "var(--muted-text)" }}>Registre acertos e erros em tempo real</p>
          </div>
        </div>

        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--card-bg, var(--app-bg))", border: "1px solid var(--card-border)" }}>
          {prefillTopicName && selectedTopic && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl"
              style={{ background: "color-mix(in srgb, var(--gold) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--gold) 25%, transparent)" }}>
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--gold)" }}>Tema do Calendário</p>
                <p className="text-sm font-bold" style={{ color: "var(--app-fg)" }}>{prefillTopicName}</p>
              </div>
              <button onClick={() => { setSelectedTopic(null); sessionStorage.removeItem("qs_prefill"); }}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ color: "var(--muted-text)", border: "1px solid var(--card-border)" }}>
                Trocar
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Disciplina</label>
              <select className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
                style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}
                value={selectedDisc ?? ""}
                onChange={e => { setSelectedDisc(e.target.value ? Number(e.target.value) : null); setSelectedTopic(null); }}>
                <option value="">Selecionar...</option>
                {(disciplines as any[])?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Tema</label>
              <select className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
                style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)", opacity: selectedDisc ? 1 : 0.5 }}
                value={selectedTopic ?? ""}
                onChange={e => setSelectedTopic(e.target.value ? Number(e.target.value) : null)}
                disabled={!selectedDisc}>
                <option value="">Selecionar...</option>
                {topics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Número de questões</label>
            <div className="flex gap-2 flex-wrap">
              {[5, 10, 15, 20, 30, 50].map(n => (
                <button key={n} onClick={() => setTotalQ(n)}
                  className="px-3 py-1.5 rounded-xl text-sm font-bold transition-all"
                  style={{ background: totalQ === n ? "var(--primary)" : "var(--stat-bg)", color: totalQ === n ? "white" : "var(--muted-text)", border: `1px solid ${totalQ === n ? "var(--primary)" : "var(--card-border)"}` }}>
                  {n}
                </button>
              ))}
              <input type="number" min={1} max={200} value={totalQ}
                onChange={e => setTotalQ(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
                className="w-16 px-2 py-1.5 rounded-xl text-sm text-center font-bold focus:outline-none"
                style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}
                placeholder="Outro" />
            </div>
          </div>
        </div>

        <Button className="w-full py-4 text-base font-bold flex items-center gap-2 justify-center"
          disabled={!selectedDisc || !selectedTopic}
          onClick={() => {
            setStartTime(Date.now());
            setPhase("session");
            setCurrentIndex(0);
            setResults([]);
            setAwaitingOrigin(false);
            setElapsed(0);
            sessionStorage.removeItem("qs_prefill");
          }}>
          <Play className="w-5 h-5" /> Iniciar Sessão
        </Button>
        {(!selectedDisc || !selectedTopic) && (
          <p className="text-center text-xs" style={{ color: "var(--muted-text)" }}>Selecione disciplina e tema para começar</p>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sessão (Flow + Colagem Opcional)
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === "session") {
    const topicName = topics.find((t: any) => t.id === selectedTopic)?.name;
    const discName  = (disciplines as any[])?.find(d => d.id === selectedDisc)?.name;

    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>{topicName ?? discName}</p>
            <p className="font-black text-lg" style={{ color: "var(--app-fg)" }}>Questão {currentIndex + 1} / {totalQ}</p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
            <Clock className="w-3.5 h-3.5" style={{ color: "var(--muted-text)" }} />
            <span className="font-mono text-sm font-bold" style={{ color: "var(--muted-text)" }}>{fmt(elapsed)}</span>
          </div>
        </div>

        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--stat-bg)" }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: "var(--primary)" }} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Acertos", value: correctCount,    color: "var(--accent-green)" },
            { label: "Erros",   value: wrongCount,      color: "var(--accent-red, #dc2626)" },
            { label: "Taxa",    value: `${accuracy}%`,  color: "var(--primary)" },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--muted-text)" }}>{s.label}</p>
              <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* 1. Tela Inicial da Questão: Acerto ou Erro */}
        {!awaitingOrigin && !showPasteArea && (
          <div className="rounded-2xl p-6 space-y-5" style={{ background: "var(--card-bg, var(--app-bg))", border: "1px solid var(--card-border)" }}>
            <div className="flex items-center justify-center gap-3 py-6">
              <CircleDot className="w-8 h-8" style={{ color: "var(--primary)" }} />
              <div className="text-center">
                <p className="text-4xl font-black" style={{ color: "var(--app-fg)" }}>#{currentIndex + 1}</p>
                <p className="text-sm mt-1" style={{ color: "var(--muted-text)" }}>Você acertou ou errou?</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleAnswer(true)}
                className="py-5 rounded-2xl font-bold text-lg text-white flex flex-col items-center gap-2 active:scale-95 transition-all"
                style={{ background: "var(--accent-green)" }}>
                <CheckCircle2 className="w-8 h-8" /> Acertei
              </button>
              <button onClick={() => handleAnswer(false)}
                className="py-5 rounded-2xl font-bold text-lg text-white flex flex-col items-center gap-2 active:scale-95 transition-all"
                style={{ background: "var(--accent-red, #dc2626)" }}>
                <XCircle className="w-8 h-8" /> Errei
              </button>
            </div>
            <button
              onClick={() => { setResults(p => [...p, { index: currentIndex, correct: false, errorOrigin: null }]); advance(); }}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm rounded-xl"
              style={{ color: "var(--muted-text)" }}>
              <SkipForward className="w-4 h-4" /> Pular
            </button>
          </div>
        )}

        {/* 2. Tela de Origem do Erro (Aparece após clicar em Errei) */}
        {awaitingOrigin && (
          <div className="rounded-2xl p-5 space-y-4" style={{ background: "var(--card-bg, var(--app-bg))", border: "2px solid var(--accent-red, #dc2626)" }}>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5" style={{ color: "var(--accent-red, #dc2626)" }} />
              <p className="font-bold" style={{ color: "var(--app-fg)" }}>Qual foi a origem do erro?</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {ERROR_ORIGINS.map(o => {
                const Icon = o.icon;
                return (
                  <button key={o.id} onClick={() => handleOrigin(o.id)}
                    className="p-3.5 rounded-xl text-left transition-all active:scale-95 border"
                    style={{ background: `color-mix(in srgb, ${o.color} 8%, transparent)`, borderColor: o.color }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4" style={{ color: o.color }} />
                      <span className="font-bold text-sm" style={{ color: o.color }}>{o.label}</span>
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--muted-text)" }}>{o.desc}</p>
                  </button>
                );
              })}
            </div>
            <button onClick={() => handleOrigin(null)} className="w-full py-2 text-sm rounded-xl"
              style={{ color: "var(--muted-text)", border: "1px solid var(--card-border)" }}>
              Prefiro não classificar
            </button>
          </div>
        )}

        {/* 3. Tela de Colagem Opcional (Aparece após classificar o erro) */}
        {showPasteArea && (
          <div className="rounded-2xl p-5 space-y-4" style={{ background: "var(--card-bg, var(--app-bg))", border: "1px solid var(--card-border)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardPaste className="w-5 h-5" style={{ color: "var(--primary)" }} />
                <p className="font-bold" style={{ color: "var(--app-fg)" }}>Registrar questão? (Opcional)</p>
              </div>
              {qSaved && <CheckCircle2 className="w-5 h-5" style={{ color: "var(--accent-green)" }} />}
            </div>

            {!parsed ? (
              <div className="space-y-3">
                <p className="text-xs" style={{ color: "var(--muted-text)" }}>
                  Cole o texto do TEC abaixo para salvar esta questão no seu banco de erros e permitir diagnósticos por IA.
                </p>
                <textarea rows={4} value={pasteText}
                  onChange={e => { setPasteText(e.target.value); setParseError(""); }}
                  placeholder={"#3872741 CEBRASPE...\nEnunciado...\nVocê selecionou: B, a correta é: C"}
                  className="w-full rounded-xl p-3 text-xs resize-none focus:outline-none"
                  style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)", fontFamily: "monospace" }}
                />
                {parseError && <p className="text-xs" style={{ color: "var(--accent-red, #dc2626)" }}>{parseError}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={advance}
                    className="py-3 rounded-xl text-sm font-bold"
                    style={{ background: "var(--stat-bg)", color: "var(--muted-text)", border: "1px solid var(--card-border)" }}>
                    Pular colagem
                  </button>
                  <button
                    onClick={() => {
                      const result = parseTEC(pasteText);
                      if (!result.ok) { setParseError(result.error); return; }
                      setParsed(result.q);
                      setParseError("");
                    }}
                    disabled={!pasteText.trim()}
                    className="py-3 rounded-xl text-sm font-bold"
                    style={{ background: pasteText.trim() ? "var(--primary)" : "var(--stat-bg)", color: pasteText.trim() ? "white" : "var(--muted-text)" }}>
                    Processar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-xl text-xs space-y-2" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
                  <div className="flex justify-between items-start">
                    <span className="font-bold" style={{ color: "var(--app-fg)" }}>{parsed.questionId || "Questão detectada"}</span>
                    <button onClick={() => { setParsed(null); setPasteText(""); }} style={{ color: "var(--accent-red)" }}><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <p className="line-clamp-3" style={{ color: "var(--muted-text)" }}>{parsed.statement}</p>
                </div>
                
                {!qSaved ? (
                  <button onClick={handleSaveQuestion} disabled={saveQuestionError.isPending}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white"
                    style={{ background: "var(--primary)" }}>
                    {saveQuestionError.isPending ? "Salvando..." : "Confirmar e Salvar Questão"}
                  </button>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm font-bold" style={{ color: "var(--accent-green)" }}>
                    <CheckCircle2 className="w-5 h-5" /> Questão salva com sucesso!
                  </div>
                )}
                
                <button onClick={advance}
                  className="w-full py-3 rounded-xl text-sm font-bold"
                  style={{ background: "var(--stat-bg)", border: "2px solid var(--primary)", color: "var(--primary)" }}>
                  Próxima questão →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  const totalWrong    = results.filter(r => !r.correct);
  const originCounts  = ERROR_ORIGINS.map(o => ({ ...o, count: totalWrong.filter(r => r.errorOrigin === o.id).length })).filter(o => o.count > 0);
  const finalAccuracy = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;
  const accuracyColor = finalAccuracy >= 70 ? "var(--accent-green)" : finalAccuracy >= 50 ? "var(--accent-amber)" : "var(--accent-red, #dc2626)";

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Flag className="w-6 h-6" style={{ color: "var(--primary)" }} />
        <h1 className="text-2xl font-black" style={{ color: "var(--app-fg)" }}>Resultado da Sessão</h1>
      </div>

      <div className="rounded-2xl p-6 text-center space-y-2" style={{ background: "var(--card-bg, var(--app-bg))", border: `2px solid ${accuracyColor}` }}>
        <p className="text-7xl font-black" style={{ color: accuracyColor }}>{finalAccuracy}%</p>
        <p className="text-sm" style={{ color: "var(--muted-text)" }}>{correctCount} acertos e {wrongCount} erros de {totalQ} questões</p>
        <div className="h-2 rounded-full overflow-hidden mt-3" style={{ background: "var(--stat-bg)" }}>
          <div className="h-full rounded-full" style={{ width: `${finalAccuracy}%`, background: accuracyColor }} />
        </div>
      </div>

      {originCounts.length > 0 && (
        <div className="rounded-2xl p-5 space-y-3" style={{ background: "var(--card-bg, var(--app-bg))", border: "1px solid var(--card-border)" }}>
          <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: "var(--muted-text)" }}>
            <BarChart2 className="w-4 h-4" /> Diagnóstico dos Erros
          </h3>
          {originCounts.map(o => {
            const Icon = o.icon;
            const pct = Math.round((o.count / totalWrong.length) * 100);
            return (
              <div key={o.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2"><Icon className="w-4 h-4" style={{ color: o.color }} /><span className="font-semibold" style={{ color: o.color }}>{o.label}</span></div>
                  <span className="font-bold" style={{ color: "var(--app-fg)" }}>{o.count} ({pct}%)</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--stat-bg)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: o.color }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
        <Clock className="w-4 h-4" style={{ color: "var(--muted-text)" }} />
        <span className="text-sm" style={{ color: "var(--muted-text)" }}>Duração: <strong style={{ color: "var(--app-fg)" }}>{fmt(elapsed)}</strong></span>
      </div>

      <div className="space-y-2">
        <Button className="w-full py-4 text-base font-bold flex items-center gap-2 justify-center"
          onClick={handleSaveSession} disabled={setPerformance.isPending || !selectedTopic}>
          <Save className="w-5 h-5" />
          {setPerformance.isPending ? "Salvando..." : "Salvar e voltar"}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { setPhase("setup"); setResults([]); setCurrentIndex(0); setAwaitingOrigin(false); setShowPasteArea(false); }}
            className="py-3 rounded-xl text-sm font-semibold flex items-center gap-2 justify-center"
            style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--muted-text)" }}>
            <RotateCcw className="w-4 h-4" /> Nova sessão
          </button>
          <button onClick={() => navigate("/")}
            className="py-3 rounded-xl text-sm font-semibold flex items-center gap-2 justify-center"
            style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--muted-text)" }}>
            <BookOpen className="w-4 h-4" /> Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
