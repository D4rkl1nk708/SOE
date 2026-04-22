import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import {
  ChevronLeft, CheckCircle2, XCircle, SkipForward, Globe,
  BookOpen, Save, BarChart2, AlertTriangle, Brain, BookMarked, Crosshair,
  RotateCcw, Play, CircleDot, Flag, Clock, ClipboardPaste, Trash2, ListChecks, ClipboardX,
  PenLine, Timer, Search, Zap, ExternalLink, FileText, Camera, Image as ImageIcon, Send, Eye, Wand2, Plus, ArrowRight,
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

  const [activeTab, setActiveTab] = useState<"session" | "errors" | "browser" | "subjetivas" | "essays">("session");
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
        { id: "essays", label: "Redações", icon: FileText },
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
      <div className="max-w-7xl mx-auto space-y-8 pb-20">
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
          <div className="w-full sm:w-auto">
            <TabNav />
          </div>
        </div>

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
                    <select className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 font-bold text-sm focus:outline-none"
                      value={selectedDisc ?? ""}
                      onChange={e => { setSelectedDisc(e.target.value ? Number(e.target.value) : null); setSelectedTopic(null); }}>
                      <option value="" className="bg-slate-900">Selecionar...</option>
                      {(disciplines as any[])?.map(d => <option key={d.id} value={d.id} className="bg-slate-900">{d.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">Tema / Assunto</label>
                    <select className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 font-bold text-sm focus:outline-none disabled:opacity-20"
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
                      className="bg-white/5 border border-white/10 rounded-xl px-2 text-center text-xs font-black" />
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
                <div className="absolute top-0 right-0 p-4 opacity-5"><Timer className="w-20 h-20" /></div>
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
                  { (window as any).electron?.ipcRenderer ? 
                    " Seus acertos e erros serão sincronizados automaticamente via motor desktop." : 
                    " No mobile, usamos um túnel seguro para garantir o rastreio automático." }
                </p>
              </div>
              <button 
                onClick={() => {
                  if ((window as any).electron?.ipcRenderer) {
                    (window as any).electron.ipcRenderer.send("open-tec-browser", pushTokenRef.current);
                  } else {
                    (window as any).showTecMobile = true;
                    document.dispatchEvent(new CustomEvent('soe-open-mobile-browser'));
                  }
                }}
                className="px-8 py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black flex items-center gap-3 hover:opacity-90 transition-all active:scale-95 shadow-xl shadow-[var(--primary-shadow)]">
                <ExternalLink className="w-5 h-5"/> { (window as any).electron?.ipcRenderer ? "Acessar TEC Concursos" : "Abrir Navegador Automático" }
              </button>
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
      <MobileTecBrowser pushToken={pushTokenData?.token || ""} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Navegador Mobile Embutido
// ─────────────────────────────────────────────────────────────────────────────
function MobileTecBrowser({ pushToken }: { pushToken: string }) {
    const [isOpen, setIsOpen] = useState(false);
    
    useEffect(() => {
        const handler = () => setIsOpen(true);
        document.addEventListener('soe-open-mobile-browser', handler);
        return () => document.removeEventListener('soe-open-mobile-browser', handler);
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        const handleMessage = async (event: MessageEvent) => {
            if (event.data && event.data._soe_internal) {
                const { type, payload } = event.data;
                console.log("[Mobile Browser] Mensagem recebida:", type, payload);
                
                // Mapeia os diferentes tipos de mensagens para os endpoints do servidor
                let requests: { endpoint: string, body: any }[] = [];
                
                if (type === 'SOE_TEC_INCREMENT_STATS') {
                    requests.push({ endpoint: '/api/tec/increment', body: payload });
                } else if (type === 'SOE_TEC_WRONG_QUESTION') {
                    requests.push({ endpoint: '/api/tec/wrong-question', body: payload });
                } else if (type === 'SOE_DEBUG_LOG') {
                    requests.push({ endpoint: '/api/_debug_log', body: payload });
                } else if (type === 'SOE_TEC_DATA' && payload.rows) {
                    // Se receber o pacotão de dados, usa a rota de caderno-push que é atômica/totalizadora
                    requests.push({ 
                        endpoint: '/api/tec/caderno-push', 
                        body: {
                            cadernoId: payload.cadernoId || 'unknown',
                            cadernoUrl: payload.cadernoUrl || '',
                            rows: payload.rows.map((row: any) => ({
                                disciplina: row.disciplina,
                                assunto: row.assunto,
                                acertos: row.acertos,
                                erros: row.erros
                            }))
                        }
                    });
                }
                
                if (requests.length > 0) {
                    try {
                        for (const req of requests) {
                            const res = await fetch(req.endpoint, {
                                method: 'POST',
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'X-SOE-Token': pushToken 
                                },
                                body: JSON.stringify(req.body)
                            });
                            const data = await res.json();
                            
                            if (data.blockPage) {
                                toast.error(data.alertMessage, { duration: 8000, position: 'top-center' });
                            }
                        }
                        
                        if (type === 'SOE_TEC_INCREMENT_STATS' || type === 'SOE_TEC_DATA') {
                            toast.success(`Progresso sincronizado!`, { position: 'bottom-center' });
                        }
                    } catch (e) {
                        console.error("[Mobile Browser] Erro na requisição:", e);
                    }
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [isOpen, pushToken]);

    const forceSync = () => {
        const iframe = document.querySelector('iframe[title="TEC Browser Mobile"]') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
            // Envia um comando para o script injetado rodar a varredura
            iframe.contentWindow.postMessage({ type: 'SOE_FORCE_SCRAPE', _soe_internal: true }, "*");
            toast.info("Sincronizando...", { duration: 1000 });
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in slide-in-from-bottom duration-500">
            <div className="h-16 shrink-0 bg-slate-900 border-b border-white/10 flex items-center justify-between px-6">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center">
                        <Zap size={16} className="text-black" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase opacity-40">Modo Mobile Automático</p>
                        <p className="text-xs font-bold">TEC Concursos</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={forceSync} className="p-3 bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--primary)] hover:text-black transition-all flex items-center gap-2">
                        <RotateCcw size={12} /> Sincronizar
                    </button>
                    <button onClick={() => setIsOpen(false)} className="p-3 bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 hover:text-rose-500 transition-all">
                        Fechar
                    </button>
                </div>
            </div>
            <div className="flex-1 bg-white">
                <iframe 
                    src={`/api/tec-browser/proxy?url=${encodeURIComponent('https://www.tecconcursos.com.br/questoes')}`}
                    className="w-full h-full border-none"
                    title="TEC Browser Mobile"
                />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA DE REDAÇÕES
// ─────────────────────────────────────────────────────────────────────────────
function EssaysTab() {
  const [isCreating, setIsCreating] = useState(false);
  const [selectedEssay, setSelectedEssay] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [banca, setBanca] = useState("CESPE");
  const [transcription, setTranscription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [disciplineId, setDisciplineId] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const utils = trpc.useContext();
  const disciplines = trpc.discipline.list.useQuery();
  const essays = trpc.essay.list.useQuery();
  const saveEssay = trpc.essay.save.useMutation();
  const analyzeEssay = trpc.essay.analyze.useMutation();
  const transcribeEssay = trpc.essay.transcribe.useMutation();
  const deleteEssay = trpc.essay.delete.useMutation();

  const handleTranscribe = async (img: string) => {
    if (!img) return;
    setIsTranscribing(true);
    try {
      const user = await utils.auth.me.fetch();
      const apiKey = user?.settings?.aiApiKey || "";
      const provider = user?.settings?.aiProvider || "gemini";
      
      if (!apiKey) {
        toast.error("Chave API não configurada. Transcrição não pôde ser iniciada.");
        return;
      }

      const res = await transcribeEssay.mutateAsync({ image: img, apiKey, provider });
      setTranscription(res.transcription);
      toast.success("Transcrição automática concluída!");
    } catch (e: any) {
      toast.error("Falha na transcrição: " + e.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setImage(base64);
        handleTranscribe(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreate = async () => {
    if (!title || !disciplineId) {
      toast.error("Preencha o tema e selecione a disciplina.");
      return;
    }
    try {
      const isDraft = !transcription;
      const res = await saveEssay.mutateAsync({
        disciplineId,
        title,
        banca,
        transcription,
        originalImage: image || undefined,
        status: isDraft ? "draft" : "pending"
      });
      
      if (isDraft) {
        toast.success("Redação salva como rascunho! Transcreva o texto para solicitar a correção.");
      } else {
        toast.success("Redação salva! Iniciando correção...");
        handleAnalyze(res.id);
      }
      setIsCreating(false);
    } catch { toast.error("Erro ao salvar redação."); }
  };

  const handleAnalyze = async (id: number) => {
    setIsAnalyzing(true);
    try {
      const user = await utils.auth.me.fetch();
      const apiKey = user?.settings?.aiApiKey || "";
      const provider = user?.settings?.aiProvider || "gemini";
      
      if (!apiKey) { toast.error("Chave API não configurada no Perfil."); return; }
      
      await analyzeEssay.mutateAsync({ id, apiKey, provider });
      toast.success("Correção finalizada!");
      utils.essay.list.invalidate();
    } catch (e: any) { toast.error(e.message); }
    finally { setIsAnalyzing(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta redação?")) return;
    await deleteEssay.mutateAsync({ id });
    utils.essay.list.invalidate();
    if (selectedEssay?.id === id) setSelectedEssay(null);
  };

  if (isCreating) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <button onClick={() => setIsCreating(false)} className="flex items-center gap-2 text-sm opacity-50 hover:opacity-100">
            <ChevronLeft size={16} /> Voltar
          </button>
          <h2 className="text-xl font-black uppercase tracking-tighter">Nova Redação</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            <div className="soe-card p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase opacity-40">Disciplina</label>
                <select value={disciplineId} onChange={e => setDisciplineId(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--primary)] transition-all">
                  <option value={0}>Selecionar...</option>
                  {disciplines.data?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase opacity-40">Banca Examinadora</label>
                <select value={banca} onChange={e => setBanca(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--primary)] transition-all">
                  <option value="CESPE">CESPE / Cebraspe</option>
                  <option value="FCC">FCC</option>
                  <option value="FGV">FGV</option>
                  <option value="VUNESP">VUNESP</option>
                  <option value="Outra">Outra</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase opacity-40">Imagem da Redação (Opcional)</label>
                <div className="relative group">
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" id="essay-image" />
                  <label htmlFor="essay-image" className="flex flex-col items-center justify-center gap-3 w-full h-48 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all">
                    {image ? (
                      <img src={image} className="w-full h-full object-cover rounded-2xl" />
                    ) : (
                      <>
                        <Camera className="w-8 h-8 opacity-20" />
                        <span className="text-xs font-bold opacity-40">Tirar foto ou Upload</span>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="soe-card p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase opacity-40">Tema da Redação</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Os desafios da segurança pública no Brasil..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-[var(--primary)] transition-all" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase opacity-40">Transcrição do Texto</label>
                  <button 
                    onClick={() => image && handleTranscribe(image)} 
                    disabled={!image || isTranscribing}
                    className="text-[10px] font-black uppercase text-[var(--primary)] flex items-center gap-1 hover:opacity-70 disabled:opacity-30 transition-all"
                  >
                    {isTranscribing ? <RotateCcw size={12} className="animate-spin" /> : <Wand2 size={12} />}
                    {isTranscribing ? 'Transcrevendo...' : 'Transcrever via IA (Beta)'}
                  </button>
                </div>
                <div className="relative">
                  <textarea value={transcription} onChange={e => setTranscription(e.target.value)} rows={20}
                    placeholder={isTranscribing ? "Aguarde, a IA está lendo sua imagem..." : "Escreva ou cole aqui o texto da sua redação para correção..."}
                    className={`w-full bg-white/5 border border-white/10 rounded-xl px-6 py-5 text-base leading-relaxed focus:outline-none focus:border-[var(--primary)] transition-all min-h-[500px] resize-none ${isTranscribing ? 'animate-pulse opacity-50' : ''}`} />
                  {isTranscribing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl">
                      <div className="bg-black/60 px-6 py-3 rounded-full flex items-center gap-3 backdrop-blur-md border border-white/10">
                        <RotateCcw className="animate-spin text-[var(--primary)]" size={16} />
                        <span className="text-xs font-black uppercase tracking-widest">IA Transcrevendo...</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={handleCreate} disabled={saveEssay.isLoading || isTranscribing}
                className="w-full py-4 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)] hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {saveEssay.isLoading ? <RotateCcw className="animate-spin" /> : isTranscribing ? <><RotateCcw className="animate-spin" size={18} /> Aguarde a Transcrição...</> : <><Send size={18} /> Salvar e Corrigir</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-black uppercase tracking-tighter">Minhas Redações</h2>
          <p className="text-xs opacity-50 font-bold">Corrija suas produções com inteligência artificial de banca.</p>
        </div>
        <button onClick={() => setIsCreating(true)} className="px-6 py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all">
          <Plus size={16} /> Nova Redação
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-3">
          {essays.isLoading ? (
             <div className="animate-pulse space-y-3">
               {[1,2,3].map(i => <div key={i} className="h-20 bg-white/5 rounded-2xl" />)}
             </div>
          ) : essays.data?.length === 0 ? (
            <div className="soe-card p-10 text-center space-y-3 opacity-30">
              <FileText className="w-12 h-12 mx-auto" />
              <p className="text-sm font-bold">Nenhuma redação ainda.</p>
            </div>
          ) : (
            essays.data?.map(essay => (
              <div key={essay.id} onClick={() => setSelectedEssay(essay)}
                className={`soe-card p-4 cursor-pointer transition-all border-2 ${selectedEssay?.id === essay.id ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-transparent hover:border-white/10'}`}>
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1 overflow-hidden">
                    <p className="text-[10px] font-black uppercase opacity-40">{essay.banca} • {new Date(essay.createdAt).toLocaleDateString()}</p>
                    <h4 className="font-bold text-sm truncate">{essay.title}</h4>
                    {essay.correction && (
                      <div className="flex items-center gap-2">
                        <div className="px-2 py-0.5 rounded-full bg-[var(--primary)]/20 text-[var(--primary)] text-[10px] font-black">
                          NOTA: {essay.correction.score}
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(essay.id); }} className="p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="lg:col-span-8">
          {!selectedEssay ? (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center soe-card p-10 opacity-20 border-dashed">
               <Eye className="w-16 h-16 mb-4" />
               <p className="font-bold">Selecione uma redação para ver a correção</p>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="soe-card p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-black uppercase">{selectedEssay.banca}</span>
                      <span className="text-[10px] font-black uppercase opacity-40">{new Date(selectedEssay.createdAt).toLocaleString()}</span>
                    </div>
                    <h2 className="text-3xl font-black tracking-tighter leading-tight">{selectedEssay.title}</h2>
                  </div>
                  {selectedEssay.correction && (
                    <div className="text-center p-4 rounded-3xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-shadow)] text-[var(--primary-foreground)] shadow-2xl">
                      <p className="text-[10px] font-black uppercase opacity-60">Nota Final</p>
                      <p className="text-5xl font-black">{selectedEssay.correction.score}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-white/5">
                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-[var(--primary)]">Texto Transcrito</h4>
                    <div className="p-6 rounded-2xl bg-white/5 text-sm leading-relaxed whitespace-pre-wrap font-serif opacity-80 border border-white/5 max-h-[500px] overflow-y-auto">
                      {selectedEssay.transcription}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-[var(--primary)]">Análise do Examinador (IA)</h4>
                    {selectedEssay.status === "pending" || isAnalyzing ? (
                      <div className="p-10 flex flex-col items-center justify-center gap-4 soe-card bg-white/5">
                        <RotateCcw className="w-8 h-8 animate-spin text-[var(--primary)]" />
                        <p className="text-xs font-bold animate-pulse">A IA está analisando sua redação...</p>
                      </div>
                    ) : selectedEssay.correction ? (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(selectedEssay.correction.gradeBreakdown || {}).map(([key, val]: [any, any]) => (
                            <div key={key} className="p-3 rounded-xl bg-white/5 border border-white/10">
                              <p className="text-[8px] font-black uppercase opacity-40">{key}</p>
                              <p className="text-sm font-black">{val}</p>
                            </div>
                          ))}
                        </div>
                        <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-headings:font-black prose-headings:tracking-tighter">
                          <div dangerouslySetInnerHTML={{ __html: (selectedEssay.correction.feedback || "").replace(/\n/g, '<br/>') }} />
                        </div>
                        
                        {selectedEssay.correction.errors?.length > 0 && (
                          <div className="space-y-3">
                            <h5 className="text-[10px] font-black uppercase opacity-40">Erros Identificados</h5>
                            {selectedEssay.correction.errors.map((err: any, i: number) => (
                              <div key={i} className="p-4 rounded-xl bg-red-500/5 border border-red-500/10 space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase text-red-500">{err.type}</span>
                                  {err.line && <span className="text-[10px] font-bold opacity-30">Linha {err.line}</span>}
                                </div>
                                <p className="text-xs font-bold">{err.description}</p>
                                {err.suggestion && (
                                  <div className="flex items-center gap-2 mt-2 text-[10px] font-black">
                                    <span className="opacity-40 uppercase">Sugestão:</span>
                                    <span className="text-green-500 bg-green-500/10 px-2 py-0.5 rounded">{err.suggestion}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <button onClick={() => handleAnalyze(selectedEssay.id)}
                        className="w-full py-6 border-2 border-dashed border-white/10 rounded-3xl hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all flex flex-col items-center gap-3">
                        <Wand2 className="w-8 h-8 opacity-20" />
                        <span className="text-xs font-bold opacity-40 uppercase tracking-widest">Solicitar Correção IA</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
