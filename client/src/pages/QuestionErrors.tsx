import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  XCircle, Trash2, Filter, Brain, BookOpen,
  AlertTriangle, BookMarked, Crosshair, ChevronDown, ChevronUp,
  Sparkles, Key, X, CheckCircle2, RefreshCw, Lightbulb, Search, CreditCard,
  Zap, ArrowRight, Info, Check, Clock, Calendar
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ORIGIN_LABELS: Record<string, { label: string; color: string }> = {
  attention:  { label: "Atenção",      color: "#f59e0b" },
  forgetting: { label: "Esquecimento", color: "#3b82f6" },
  theory:     { label: "Teoria",       color: "#8b5cf6" },
  trap:       { label: "Pegadinha",    color: "#ef4444" },
};
const ORIGIN_ICONS: Record<string, any> = {
  attention: AlertTriangle, forgetting: Brain, theory: BookMarked, trap: Crosshair,
};

const KEY_STORAGE  = "soe_ai_apikey";
const PROV_STORAGE = "soe_ai_provider";
function loadSavedKey() { try { return localStorage.getItem(KEY_STORAGE) || ""; } catch { return ""; } }
function loadSavedProvider(): "gemini" | "openai" | "claude" { try { return (localStorage.getItem(PROV_STORAGE) as any) || "gemini"; } catch { return "gemini"; } }

function MD({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed" style={{ color: "var(--app-fg)" }}>
      {text.split("\n").map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} className={line.trim() === "" ? "h-4" : "mb-1"}>
            {parts.map((p, j) =>
              p.startsWith("**") && p.endsWith("**")
                ? <strong key={j} className="text-[var(--primary)] font-black">{p.slice(2, -2)}</strong>
                : <span key={j} className="opacity-90">{p}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AIActionButton({ label, doneLabel, icon: Icon, color, loading, done, onClick }: {
  label: string; doneLabel: string; icon: any; color: string;
  loading: boolean; done: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={loading}
      className={`group flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${done ? 'border-transparent' : 'border-white/5'}`}
      style={{ 
        background: done ? `${color}15` : 'var(--stat-bg)',
        color: done ? color : 'var(--muted-text)',
        opacity: loading ? 0.6 : 1
      }}>
      {loading ? <RefreshCw size={12} className="animate-spin" /> : <Icon size={12} className={done ? '' : 'opacity-30'} />}
      {loading ? "Processando..." : done ? doneLabel : label}
    </button>
  );
}

function AIResultPanel({ title, color, icon: Icon, content, date }: {
  title: string; color: string; icon: any; content: string; date?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl overflow-hidden border transition-all"
        style={{ borderColor: `${color}30`, background: `${color}05` }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors">
        <Icon size={16} style={{ color }} className="shrink-0" />
        <span className="font-black text-[10px] uppercase tracking-widest flex-1 text-left" style={{ color }}>{title}</span>
        {date && <span className="text-[9px] font-bold opacity-30 uppercase tracking-widest">{new Date(date).toLocaleDateString("pt-BR")}</span>}
        {open ? <ChevronUp size={14} className="opacity-20" /> : <ChevronDown size={14} className="opacity-20" />}
      </button>
      <AnimatePresence>
        {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-5 pb-5 pt-1 border-t border-white/5">
                    <MD text={content} />
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function QuestionErrors() {
  const [filterDisc, setFilterDisc] = useState<number | "">("");
  const [filterTopic, setFilterTopic] = useState<number | "">("");
  const [filterOrigin, setFilterOrigin] = useState<string>("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);

  const [loadingAction, setLoadingAction] = useState<{ id: number; action: string } | null>(null);
  const [savedKey] = useState(loadSavedKey);
  const [savedProvider] = useState(loadSavedProvider);

  const { data: disciplines } = trpc.discipline.list.useQuery();
  const { data: topicsData } = trpc.topic.list.useQuery({ disciplineId: filterDisc || undefined }, { enabled: true });
  const topics = (topicsData as any)?.topics ?? [];

  const { data: errorsPage, isLoading, refetch } = trpc.questionError.list.useQuery({
    disciplineId: filterDisc  || undefined,
    topicId:      filterTopic || undefined,
    limit: 200,
  });
  const errors = errorsPage?.items ?? [];

  const deleteError = trpc.questionError.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Questão removida."); setDeleting(null); },
    onError:   () => { toast.error("Erro ao remover."); setDeleting(null); },
  });

  const analyzeMut       = trpc.questionError.analyze.useMutation({ onSuccess: () => { setLoadingAction(null); refetch(); toast.success("Diagnóstico salvo!"); }, onError: (e) => { setLoadingAction(null); toast.error(e.message); } });
  const revisionTipMut   = trpc.questionError.revisionTip.useMutation({ onSuccess: () => { setLoadingAction(null); refetch(); toast.success("Dica de revisão salva!"); }, onError: (e) => { setLoadingAction(null); toast.error(e.message); } });
  const similarMut       = trpc.questionError.similarQuestions.useMutation({ onSuccess: () => { setLoadingAction(null); refetch(); toast.success("Questões similares salvas!"); }, onError: (e) => { setLoadingAction(null); toast.error(e.message); } });
  const flashcardMut     = trpc.questionError.generateFlashcard.useMutation({ onSuccess: (d) => { setLoadingAction(null); refetch(); toast.success("Flashcard criado!"); }, onError: (e) => { setLoadingAction(null); toast.error(e.message); } });

  const filtered = errors.filter(e => !filterOrigin || e.errorOrigin === filterOrigin);
  const discName = (id: number) => (disciplines as any[])?.find((d: any) => d.id === id)?.name ?? "Disciplina";
  const topicName = (id: number) => topics.find((t: any) => t.id === id)?.name ?? "Tema";

  const callAI = (id: number, action: "analyze" | "revisionTip" | "similarQuestions" | "generateFlashcard") => {
    if (!savedKey) { window.dispatchEvent(new CustomEvent('soe-open-ai-modal')); return; }
    setLoadingAction({ id, action });
    setExpanded(id);
    const args = { id, apiKey: savedKey, provider: savedProvider };
    if (action === "analyze") analyzeMut.mutate(args);
    else if (action === "revisionTip") revisionTipMut.mutate(args);
    else if (action === "similarQuestions") similarMut.mutate(args);
    else if (action === "generateFlashcard") flashcardMut.mutate(args);
  };

  const isLoading2 = (id: number, action: string) => loadingAction?.id === id && loadingAction?.action === action;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight" style={{ color: "var(--app-fg)" }}>Questões Erradas</h2>
          <p className="text-sm opacity-50 font-medium">Diagnóstico individualizado com suporte de Inteligência Central.</p>
        </div>
        
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--stat-bg)] border border-[var(--card-border)]">
            <div className={`p-2 rounded-lg ${savedKey ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)]' : 'bg-[var(--card-border)] text-[var(--muted-text)] opacity-40'}`}>
                <Zap size={16} />
            </div>
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40" style={{ color: "var(--muted-text)" }}>Motor IA</p>
                <p className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--app-fg)" }}>{savedKey ? savedProvider : "Desconectado"}</p>
            </div>
        </div>
      </div>

      {/* Modern Filter Dock */}
      <div className="soe-card p-6 flex flex-col md:flex-row gap-4 items-center">
        <div className="flex items-center gap-3 shrink-0 opacity-40 mr-2">
            <Filter size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Filtros</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
            <select value={filterDisc} onChange={e => { setFilterDisc(e.target.value ? Number(e.target.value) : ""); setFilterTopic(""); }} 
                className="bg-[var(--stat-bg)] border border-[var(--card-border)] text-[var(--app-fg)] rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-[var(--primary)] transition-all">
                <option value="">Todas as disciplinas</option>
                {(disciplines as any[])?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={filterTopic} onChange={e => setFilterTopic(e.target.value ? Number(e.target.value) : "")} disabled={!filterDisc}
                className="bg-[var(--stat-bg)] border border-[var(--card-border)] text-[var(--app-fg)] rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-[var(--primary)] transition-all disabled:opacity-20">
                <option value="">Todos os temas</option>
                {topics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={filterOrigin} onChange={e => setFilterOrigin(e.target.value)}
                className="bg-[var(--stat-bg)] border border-[var(--card-border)] text-[var(--app-fg)] rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-[var(--primary)] transition-all">
                <option value="">Todas as origens</option>
                {Object.entries(ORIGIN_LABELS).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
            </select>
        </div>
        {(filterDisc || filterTopic || filterOrigin) && (
            <button onClick={() => { setFilterDisc(""); setFilterTopic(""); setFilterOrigin(""); }}
                className="p-2.5 rounded-xl hover:bg-rose-500/10 text-rose-500 transition-all">
                <X size={18} />
            </button>
        )}
      </div>

      {/* Stats Counter */}
      <div className="flex items-center gap-4 px-2">
        <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse" />
            <span className="text-xs font-black uppercase tracking-[0.2em] opacity-40">
                {filtered.length} Ocorrências Identificadas
            </span>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center opacity-30 font-black uppercase text-[10px] tracking-widest animate-pulse">Varrendo registros de erros...</div>
      ) : filtered.length === 0 ? (
        <div className="soe-card py-20 flex flex-col items-center justify-center gap-6 opacity-40 border-dashed">
            <CheckCircle2 size={48} />
            <div className="text-center">
                <p className="text-xl font-black uppercase tracking-widest">Nada pendente</p>
                <p className="text-xs mt-2">Suas questões erradas aparecerão aqui para diagnóstico.</p>
            </div>
        </div>
      ) : (
        <div className="space-y-6">
            {filtered.map(e => {
                const isExpanded = expanded === e.id;
                const originInfo = e.errorOrigin ? ORIGIN_LABELS[e.errorOrigin] : null;
                const OriginIcon = e.errorOrigin ? ORIGIN_ICONS[e.errorOrigin] : null;
                const hasAnalysis = !!(e as any).aiAnalysis;
                const hasTip = !!(e as any).aiRevisionTip;
                const hasSimilar = !!(e as any).aiSimilarQuestions;
                const hasFlashcard = !!(e as any).aiFlashcardGenerated;

                return (
                    <div key={e.id} className={`soe-card group overflow-hidden transition-all ${isExpanded ? 'border-[var(--primary-border)] shadow-2xl' : 'hover:border-white/10'}`}>
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="shrink-0 w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
                                    <XCircle size={20} />
                                </div>
                                <div className="flex-1 min-w-0 space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {e.banca && <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[9px] font-black uppercase tracking-widest opacity-60">{e.banca}</span>}
                                            {e.year && <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[9px] font-black uppercase tracking-widest opacity-60">{e.year}</span>}
                                            {originInfo && OriginIcon && (
                                                <span className="px-2.5 py-1 rounded-lg flex items-center gap-2 text-[9px] font-black uppercase tracking-widest border"
                                                    style={{ background: `${originInfo.color}15`, borderColor: `${originInfo.color}25`, color: originInfo.color }}>
                                                    <OriginIcon size={10} /> {originInfo.label}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 opacity-30">
                                            <Calendar size={12} />
                                            <span className="text-[9px] font-black uppercase tracking-widest">{new Date(e.createdAt).toLocaleDateString("pt-BR")}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-40">
                                            <BookOpen size={12} />
                                            <span>{discName(e.disciplineId)}</span>
                                            {e.topicId > 0 && <><ArrowRight size={10} /><span>{topicName(e.topicId)}</span></>}
                                        </div>
                                        <p className="text-sm font-bold leading-relaxed line-clamp-2" style={{ color: "var(--app-fg)" }}>{e.statement}</p>
                                    </div>

                                    {e.userAnswer && e.correctAnswer && (
                                        <div className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/5 w-fit">
                                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-500">
                                                <XCircle size={12} /> Marcado: {e.userAnswer}
                                            </div>
                                            <div className="w-px h-3 bg-white/10" />
                                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500">
                                                <CheckCircle2 size={12} /> Gabarito: {e.correctAnswer}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-6 pt-6 border-t border-white/5 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex flex-wrap gap-2">
                                    <AIActionButton label="Diagnóstico" doneLabel="Re-analisar" icon={Brain} color="#7c3aed"
                                        loading={isLoading2(e.id,"analyze")} done={hasAnalysis} onClick={() => callAI(e.id,"analyze")} />
                                    <AIActionButton label="Dica de Revisão" doneLabel="Nova Dica" icon={Lightbulb} color="#f59e0b"
                                        loading={isLoading2(e.id,"revisionTip")} done={hasTip} onClick={() => callAI(e.id,"revisionTip")} />
                                    <AIActionButton label="Similares" doneLabel="Ver Mais" icon={Search} color="#3b82f6"
                                        loading={isLoading2(e.id,"similarQuestions")} done={hasSimilar} onClick={() => callAI(e.id,"similarQuestions")} />
                                    <AIActionButton label="Gerar Card" doneLabel="Criado ✓" icon={CreditCard} color="#10b981"
                                        loading={isLoading2(e.id,"generateFlashcard")} done={hasFlashcard} onClick={() => !hasFlashcard && callAI(e.id,"generateFlashcard")} />
                                </div>

                                <div className="flex items-center gap-2">
                                    <button onClick={() => setExpanded(isExpanded ? null : e.id)}
                                        className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all">
                                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </button>
                                    <button onClick={() => { if (deleting===e.id) { deleteError.mutate({ id:e.id }); } else { setDeleting(e.id); setTimeout(() => setDeleting(null), 3000); } }}
                                        className={`p-3 rounded-xl transition-all border ${deleting===e.id ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white/5 hover:bg-rose-500/10 border-white/10 text-rose-500'}`}>
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                    <div className="px-6 pb-6 space-y-6 pt-4 border-t border-white/5 bg-white/[0.01]">
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-30">Enunciado Completo</p>
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--app-fg)" }}>{e.statement}</p>
                                        </div>

                                        {e.alternatives?.length > 0 && (
                                            <div className="space-y-2">
                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-30">Alternativas</p>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {e.alternatives.map((a: any) => {
                                                        const isUser = a.letter === e.userAnswer;
                                                        const isCorrect = a.letter === e.correctAnswer;
                                                        return (
                                                            <div key={a.letter} className={`p-4 rounded-2xl border flex gap-4 transition-all ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/20' : isUser ? 'bg-rose-500/10 border-rose-500/20' : 'bg-white/5 border-white/5 opacity-50'}`}>
                                                                <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${isCorrect ? 'bg-emerald-500 text-white' : isUser ? 'bg-rose-500 text-white' : 'bg-white/10 text-white/40'}`}>
                                                                    {a.letter}
                                                                </div>
                                                                <div className="flex-1 pt-1">
                                                                    <p className="text-sm font-medium leading-relaxed" style={{ color: "var(--app-fg)" }}>{a.text}</p>
                                                                    <div className="mt-2 flex items-center gap-2">
                                                                        {isCorrect && <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Gabarito Oficial</span>}
                                                                        {isUser && !isCorrect && <span className="text-[9px] font-black uppercase tracking-widest text-rose-500">Sua Resposta</span>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-4 pt-4 border-t border-white/5">
                                            {hasAnalysis && <AIResultPanel title="Análise Cognitiva" color="#7c3aed" icon={Brain} content={(e as any).aiAnalysis} date={(e as any).aiAnalyzedAt} />}
                                            {hasTip && <AIResultPanel title="Estratégia de Estudo" color="#f59e0b" icon={Lightbulb} content={(e as any).aiRevisionTip} date={(e as any).aiRevisionTipAt} />}
                                            {hasSimilar && <AIResultPanel title="Treinamento de Reforço" color="#3b82f6" icon={Search} content={(e as any).aiSimilarQuestions} date={(e as any).aiSimilarQuestionsAt} />}
                                            {hasFlashcard && (
                                                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-500 font-black text-xs uppercase tracking-widest">
                                                    <CreditCard size={18} /> Card criado no seu acervo mental
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}
        </div>
      )}
    </div>
  );
}
