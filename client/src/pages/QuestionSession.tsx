import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import {
  ChevronLeft, CheckCircle2, XCircle, SkipForward, Globe,
  BookOpen, Save, BarChart2, AlertTriangle, Brain, BookMarked, Crosshair,
  RotateCcw, Play, CircleDot, Flag, Clock, ClipboardPaste, Trash2, ListChecks, ClipboardX,
  PenLine, Timer, Search, Zap, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import QuestionErrors from "./QuestionErrors";
import SubjectiveAnswersTab from "@/components/SubjectiveAnswersTab";
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

  const [activeTab, setActiveTab] = useState<"session" | "errors" | "browser" | "subjetivas">("session");
  const [showTimer, setShowTimer] = useState(false);

  const { data: pushTokenData } = trpc.import.getICalUrl.useQuery();
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

  const [phase, setPhase]                 = useState<Phase>("setup");
  const [selectedDisc, setSelectedDisc]   = useState<number | null>(prefillDiscId);
  const [selectedTopic, setSelectedTopic] = useState<number | null>(prefillTopicId);
  const [totalQ, setTotalQ]               = useState(shouldAutoStart ? 5 : 10);
  const [autoStarted, setAutoStarted]     = useState(false);
  const [showQuickPick, setShowQuickPick] = useState(shouldAutoStart);

  const [currentIndex, setCurrentIndex]     = useState(0);
  const [results, setResults]               = useState<QuestionResult[]>([]);
  const [awaitingOrigin, setAwaitingOrigin] = useState(false);
  const [startTime, setStartTime]           = useState<number | null>(null);
  const [elapsed, setElapsed]               = useState(0);

  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText]         = useState("");
  const [parsed, setParsed]               = useState<ParsedQuestion | null>(null);
  const [parseError, setParseError]       = useState("");
  const [qSaved, setQSaved]               = useState(false);

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

  useEffect(() => {
    if (phase !== "session" || startTime === null) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [phase, startTime]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const advance = () => {
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

  const correctCount  = results.filter(r => r.correct).length;
  const wrongCount    = results.filter(r => !r.correct).length;
  const accuracy      = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;
  const progress      = (currentIndex / totalQ) * 100;

  if (showQuickPick && prefillTopicName) {
    return (
      <div className="max-w-sm mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-5">
        <div className="text-center space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-60">Sessão Agendada</p>
          <h2 className="text-3xl font-black">{prefillTopicName}</h2>
        </div>
        <div className="w-full soe-card p-6 space-y-4">
          <p className="text-sm font-bold text-center">Quantas questões na sessão?</p>
          <div className="grid grid-cols-3 gap-2">
            {[5, 10, 15, 20, 30, 50].map(n => (
              <button key={n} onClick={() => setTotalQ(n)}
                className={`py-2 rounded-xl text-xs font-black transition-all ${totalQ === n ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-white/5 opacity-50 hover:opacity-100'}`} style={{ color: "var(--app-fg)" }}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setShowQuickPick(false)}
          className="w-full py-3 rounded-xl text-sm font-black flex items-center gap-2 justify-center bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-shadow)] active:scale-95 transition-transform">
          <Play className="w-4 h-4 fill-[var(--primary-foreground)]" /> Iniciar Agora
        </button>
        <button onClick={() => navigate("/")} className="text-sm opacity-50 hover:opacity-100 transition-opacity">Cancelar</button>
      </div>
    );
  }

  const TabNav = () => (
    <div className="flex gap-1 p-1.5 rounded-2xl bg-white/5 border border-white/10 w-full overflow-x-auto no-scrollbar">
      {[
        { id: "session", label: "Questões", icon: ListChecks },
        { id: "browser", label: "Browser", icon: Globe },
        { id: "errors", label: "Erros", icon: ClipboardX },
        { id: "subjetivas", label: "Subjetivas", icon: PenLine },
      ].map(t => (
        <button key={t.id} onClick={() => setActiveTab(t.id as any)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === t.id ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-shadow)]' : 'opacity-40 hover:opacity-70'}`} style={{ color: activeTab === t.id ? undefined : "var(--app-fg)" }}>
          <t.icon className="h-4 w-4" /> {t.label}
        </button>
      ))}
    </div>
  );

  // ── RENDER SETUP ───────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="max-w-5xl mx-auto space-y-8 pb-20">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[var(--primary-bg-subtle)] rounded-2xl border border-[var(--primary-border)] shadow-xl shadow-[var(--primary-shadow)]">
              <Zap className="w-6 h-6 text-[var(--primary)]" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--app-fg)" }}>Treino</h1>
              <p className="text-sm opacity-60">Questões e performance.</p>
            </div>
          </div>
          <TabNav />
        </div>

        {activeTab === "browser" && (
          <div className="soe-card p-12 flex flex-col items-center text-center space-y-6 max-w-2xl mx-auto">
            <div className="w-20 h-20 rounded-3xl bg-[var(--primary-bg-subtle)] flex items-center justify-center border border-[var(--primary-border)]">
              <Globe className="w-10 h-10 text-[var(--primary)]" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black">Navegador TEC Integrado</h2>
              <p className="text-sm opacity-60 leading-relaxed">
                Abra o site do TEC Concursos diretamente dentro do SOE com a extensão já configurada. 
                Seus acertos e erros serão sincronizados em tempo real.
              </p>
            </div>
            <button 
              onClick={() => {
                if ((window as any).electron?.ipcRenderer) {
                  (window as any).electron.ipcRenderer.send("open-tec-browser", pushTokenRef.current);
                } else {
                  toast.error("O Navegador do TEC só está disponível no aplicativo Desktop.");
                }
              }}
              className="px-8 py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black flex items-center gap-3 hover:opacity-90 transition-all active:scale-95 shadow-xl shadow-[var(--primary-shadow)]">
              <ExternalLink className="w-5 h-5"/> Acessar TEC Concursos
            </button>
          </div>
        )}

        {activeTab === "errors" && <QuestionErrors />}
        {activeTab === "subjetivas" && <SubjectiveAnswersTab />}

        {activeTab === "session" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            <div className="lg:col-span-7 space-y-6">
              <div className="soe-card p-6 space-y-6">
                <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                  <Play className="w-5 h-5 text-[var(--primary)]" />
                  <h3 className="font-black text-sm uppercase tracking-widest">Configurar Sessão Manual</h3>
                </div>

                {prefillTopicName && selectedTopic && (
                  <div className="p-4 rounded-2xl bg-[var(--primary-bg-subtle)] border border-[var(--primary-border)] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--primary-bg-subtle)] flex items-center justify-center">
                        <Zap className="w-5 h-5 text-[var(--primary)]" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black opacity-50 uppercase">Agendado</p>
                        <p className="text-sm font-black">{prefillTopicName}</p>
                      </div>
                    </div>
                    <button onClick={() => { setSelectedTopic(null); sessionStorage.removeItem("qs_prefill"); }}
                      className="text-[10px] font-black uppercase text-[var(--primary)] px-3 py-1.5 rounded-lg border border-[var(--primary-border)] hover:bg-[var(--primary-bg-subtle)] transition-all">
                      Trocar
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">Disciplina</label>
                    <select className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      value={selectedDisc ?? ""}
                      onChange={e => { setSelectedDisc(e.target.value ? Number(e.target.value) : null); setSelectedTopic(null); }}>
                      <option value="" className="bg-slate-900">Selecionar...</option>
                      {(disciplines as any[])?.map(d => <option key={d.id} value={d.id} className="bg-slate-900">{d.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">Tema / Assunto</label>
                    <select className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-20"
                      value={selectedTopic ?? ""}
                      onChange={e => setSelectedTopic(e.target.value ? Number(e.target.value) : null)}
                      disabled={!selectedDisc}>
                      <option value="" className="bg-slate-900">Selecionar...</option>
                      {topics.map((t: any) => <option key={t.id} value={t.id} className="bg-slate-900">{t.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">Quantidade de Questões</label>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {[5, 10, 15, 20, 30, 50].map(n => (
                      <button key={n} onClick={() => setTotalQ(n)}
                        className={`py-2 rounded-xl text-xs font-black transition-all ${totalQ === n ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-white/5 opacity-40 hover:opacity-100'}`} style={{ color: "var(--app-fg)" }}>
                        {n}
                      </button>
                    ))}
                    <input type="number" value={totalQ}
                      onChange={e => setTotalQ(Math.max(1, parseInt(e.target.value) || 1))}
                      className="bg-white/5 border border-white/10 rounded-xl px-2 text-center text-xs font-black focus:outline-none focus:ring-2 focus:ring-[var(--primary-shadow)]" />
                  </div>
                </div>

                <button className="w-full h-14 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-20 disabled:grayscale"
                  disabled={!selectedDisc || !selectedTopic}
                  onClick={() => { setStartTime(Date.now()); setPhase("session"); setCurrentIndex(0); setResults([]); setAwaitingOrigin(false); setElapsed(0); sessionStorage.removeItem("qs_prefill"); }}>
                  <Play className="w-5 h-5 fill-[var(--primary-foreground)]" /> INICIAR
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
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--primary)]">Timer de Estudo</h3>
                </div>
                <StudyTimer />
              </div>
              
              <div className="soe-card p-6 bg-gradient-to-br from-emerald-500/5 to-transparent border-emerald-500/10">
                <h4 className="font-black text-xs uppercase tracking-widest text-emerald-500 mb-2">Por que registrar aqui?</h4>
                <p className="text-xs opacity-60 leading-relaxed">
                  Ao registrar suas questões manualmente ou pelo browser, o SOE constrói seu 
                  <strong> Mapa de Calor de Performance</strong>, permitindo que a IA identifique seus pontos fracos automaticamente.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── RENDER SESSION ─────────────────────────────────────────────────
  if (phase === "session") {
    const topicName = topics.find((t: any) => t.id === selectedTopic)?.name;
    const discName  = (disciplines as any[])?.find(d => d.id === selectedDisc)?.name;

    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-20">
        
        {/* Header imersivo */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--primary)]">{topicName ?? discName}</p>
            <h2 className="text-4xl font-black tracking-tight">Questão {currentIndex + 1} <span className="opacity-20">/ {totalQ}</span></h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <p className="text-[10px] font-black opacity-40 uppercase">Cronômetro</p>
              <p className="text-2xl font-black tabular-nums font-mono text-[var(--primary)]">{fmt(elapsed)}</p>
            </div>
          </div>
        </div>

        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full bg-[var(--primary)] shadow-[0_0_15px_var(--primary-shadow)] transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Acertos", value: correctCount,    color: "text-emerald-500", bg: "bg-emerald-500/5" },
            { label: "Erros",   value: wrongCount,      color: "text-rose-500",    bg: "bg-rose-500/5" },
            { label: "Taxa",    value: `${accuracy}%`,  color: "text-sky-500",     bg: "bg-sky-500/5" },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl p-4 text-center border border-white/5 ${s.bg}`}>
              <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">{s.label}</p>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {!awaitingOrigin && !showPasteArea && (
          <div className="soe-card p-10 space-y-8 flex flex-col items-center">
            <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center relative">
              <span className="text-4xl font-black opacity-20">#{currentIndex + 1}</span>
              <div className="absolute inset-0 rounded-full border-4 border-[var(--primary-shadow)] border-t-[var(--primary)] animate-spin" />
            </div>
            
            <div className="text-center space-y-2">
              <h3 className="text-xl font-black">Qual o resultado?</h3>
              <p className="text-sm opacity-50">Selecione para avançar no treinamento.</p>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full">
              <button onClick={() => handleAnswer(true)}
                className="py-6 md:py-8 rounded-[2rem] bg-emerald-500 text-white font-black text-lg flex flex-col items-center gap-3 shadow-xl shadow-emerald-500/20 active:scale-[0.95] transition-all group">
                <CheckCircle2 className="w-10 h-10 group-hover:scale-110 transition-transform" /> ACERTEI
              </button>
              <button onClick={() => handleAnswer(false)}
                className="py-6 md:py-8 rounded-[2rem] bg-rose-500 text-white font-black text-lg flex flex-col items-center gap-3 shadow-xl shadow-rose-500/20 active:scale-[0.95] transition-all group">
                <XCircle className="w-10 h-10 group-hover:scale-110 transition-transform" /> ERREI
              </button>
            </div>

            <button onClick={() => { setResults(p => [...p, { index: currentIndex, correct: false, errorOrigin: null }]); advance(); }}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-widest opacity-30 hover:opacity-100 transition-opacity">
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
              {ERROR_ORIGINS.map(o => {
                const Icon = o.icon;
                return (
                  <button key={o.id} onClick={() => handleOrigin(o.id)}
                    className="p-4 rounded-2xl text-left transition-all active:scale-95 border border-white/10 bg-white/5 hover:bg-white/10 group">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-1.5 rounded-lg transition-colors" style={{ background: `${o.color}22` }}>
                        <Icon className="w-4 h-4" style={{ color: o.color }} />
                      </div>
                      <span className="font-black text-sm uppercase tracking-widest" style={{ color: o.color }}>{o.label}</span>
                    </div>
                    <p className="text-[11px] opacity-50 font-medium leading-relaxed">{o.desc}</p>
                  </button>
                );
              })}
            </div>
            <button onClick={() => handleOrigin(null)} className="w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest opacity-30 border border-white/5">
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
              {qSaved && <div className="bg-emerald-500/20 px-3 py-1 rounded-full flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="text-[10px] font-black text-emerald-500">SALVA</span></div>}
            </div>

            {!parsed ? (
              <div className="space-y-4">
                <p className="text-xs opacity-50 leading-relaxed">
                  Cole o texto da questão do TEC para análise posterior da IA.
                </p>
                <textarea rows={5} value={pasteText}
                  onChange={e => { setPasteText(e.target.value); setParseError(""); }}
                  placeholder={"Cole aqui..."}
                  className="w-full rounded-2xl bg-black/40 border border-white/10 p-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary-shadow)] resize-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={advance} className="py-4 rounded-2xl font-black text-xs uppercase tracking-widest opacity-40 bg-white/5 border border-white/10">Pular</button>
                  <button onClick={() => { const r = parseTEC(pasteText); if (!r.ok) { setParseError(r.error); return; } setParsed(r.q); setParseError(""); }}
                    disabled={!pasteText.trim()}
                    className="py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest disabled:opacity-20 transition-all">
                    Processar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <p className="text-xs font-black text-[var(--primary)] uppercase">{parsed.questionId || "Questão Identificada"}</p>
                  <p className="text-xs opacity-60 leading-relaxed line-clamp-4">{parsed.statement}</p>
                </div>
                
                {!qSaved ? (
                  <button onClick={handleSaveQuestion} disabled={saveQuestionError.isPending}
                    className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black text-sm shadow-lg shadow-emerald-500/20">
                    {saveQuestionError.isPending ? "SALVANDO..." : "CONFIRMAR E SALVAR"}
                  </button>
                ) : (
                  <button onClick={advance} className="w-full py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-sm flex items-center justify-center gap-2">
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
  const totalWrong    = results.filter(r => !r.correct);
  const originCounts  = ERROR_ORIGINS.map(o => ({ ...o, count: totalWrong.filter(r => r.errorOrigin === o.id).length })).filter(o => o.count > 0);
  const finalAccuracy = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;
  const accuracyColorClass = finalAccuracy >= 70 ? "text-emerald-500" : finalAccuracy >= 50 ? "text-[var(--primary)]" : "text-rose-500";
  const accuracyBorderClass = finalAccuracy >= 70 ? "border-emerald-500/30" : finalAccuracy >= 50 ? "border-[var(--primary)]/30" : "border-rose-500/30";

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="p-4 bg-[var(--primary)]/10 rounded-full mb-2">
          <Flag className="w-8 h-8 text-[var(--primary)]" />
        </div>
        <h1 className="text-4xl font-black tracking-tight">Sessão Finalizada</h1>
        <p className="text-sm opacity-50">Treinamento concluído. Confira seu desempenho.</p>
      </div>

      <div className={`soe-card p-10 text-center space-y-4 border-2 ${accuracyBorderClass}`}>
        <p className={`text-8xl font-black ${accuracyColorClass}`}>{finalAccuracy}%</p>
        <p className="text-sm font-bold opacity-60 uppercase tracking-widest">{correctCount} acertos · {wrongCount} erros · {totalQ} totais</p>
        <div className="h-3 rounded-full bg-white/5 overflow-hidden max-w-xs mx-auto mt-6">
          <div className={`h-full transition-all duration-1000`} style={{ width: `${finalAccuracy}%`, backgroundColor: finalAccuracy >= 70 ? '#10b981' : finalAccuracy >= 50 ? 'var(--primary)' : '#f43f5e' }} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {originCounts.length > 0 && (
          <div className="soe-card p-6 space-y-4">
            <h3 className="font-black text-xs uppercase tracking-[0.2em] opacity-40 flex items-center gap-2">
              <BarChart2 className="w-4 h-4" /> Diagnóstico do Erro
            </h3>
            <div className="space-y-4">
              {originCounts.map(o => {
                const pct = Math.round((o.count / totalWrong.length) * 100);
                return (
                  <div key={o.id} className="space-y-2">
                    <div className="flex justify-between text-xs font-black uppercase">
                      <span style={{ color: o.color }}>{o.label}</span>
                      <span>{o.count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full" style={{ width: `${pct}%`, backgroundColor: o.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="soe-card p-6 flex flex-col justify-center items-center text-center space-y-4">
          <div className="p-3 bg-white/5 rounded-2xl">
            <Clock className="w-8 h-8 opacity-40" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Tempo Total Investido</p>
            <p className="text-3xl font-black tabular-nums">{fmt(elapsed)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-4">
        <button onClick={handleSaveSession} disabled={setPerformance.isPending || !selectedTopic}
          className="w-full py-5 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-lg shadow-xl shadow-[var(--primary-shadow)] active:scale-[0.98] transition-all flex items-center justify-center gap-3">
          <Save className="w-6 h-6" /> {setPerformance.isPending ? "SALVANDO..." : "CONCLUIR E SALVAR"}
        </button>
        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => { setPhase("setup"); setResults([]); setCurrentIndex(0); setAwaitingOrigin(false); setShowPasteArea(false); }}
            className="py-4 rounded-2xl bg-white/5 border border-white/10 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2">
            <RotateCcw className="w-4 h-4" /> Nova Sessão
          </button>
          <button onClick={() => navigate("/")}
            className="py-4 rounded-2xl bg-white/5 border border-white/10 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2">
            <ChevronLeft className="w-4 h-4" /> Voltar ao Início
          </button>
        </div>
      </div>
    </div>
  );
}
