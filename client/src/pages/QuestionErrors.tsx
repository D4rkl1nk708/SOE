import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  XCircle,
  Trash2,
  Filter,
  Brain,
  BookOpen,
  AlertTriangle,
  BookMarked,
  Crosshair,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Key,
  X,
  CheckCircle2,
  RefreshCw,
  Lightbulb,
  Search,
  CreditCard,
  Zap,
  ArrowRight,
  Info,
  Check,
  Clock,
  Calendar,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ORIGIN_LABELS: Record<string, { label: string; color: string }> = {
  attention: { label: "Atenção", color: "#f59e0b" },
  forgetting: { label: "Esquecimento", color: "#3b82f6" },
  theory: { label: "Teoria", color: "#8b5cf6" },
  trap: { label: "Pegadinha", color: "#ef4444" },
};
const ORIGIN_ICONS: Record<string, any> = {
  attention: AlertTriangle,
  forgetting: Brain,
  theory: BookMarked,
  trap: Crosshair,
};

const KEY_STORAGE = "soe_ai_apikey";
const PROV_STORAGE = "soe_ai_provider";
function loadSavedKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || "";
  } catch {
    return "";
  }
}
function loadSavedProvider(): "gemini" | "openai" | "claude" {
  try {
    return (localStorage.getItem(PROV_STORAGE) as any) || "gemini";
  } catch {
    return "gemini";
  }
}

function MD({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed" style={{ color: "var(--app-fg)" }}>
      {text.split("\n").map((line: any, i: any) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} className={line.trim() === "" ? "h-4" : "mb-1"}>
            {parts.map((p: any, j: any) =>
              p.startsWith("**") && p.endsWith("**") ? (
                <strong key={j} className="text-[var(--primary)] font-black">
                  {p.slice(2, -2)}
                </strong>
              ) : (
                <span key={j} className="opacity-90">
                  {p}
                </span>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}

function AIActionButton({
  label,
  doneLabel,
  icon: Icon,
  color,
  loading,
  done,
  onClick,
}: {
  label: string;
  doneLabel: string;
  icon: any;
  color: string;
  loading: boolean;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`group flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${done ? "border-transparent" : "border-white/5"}`}
      style={{
        background: done ? `${color}15` : "var(--stat-bg)",
        color: done ? color : "var(--muted-text)",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? (
        <RefreshCw size={12} className="animate-spin" />
      ) : (
        <Icon size={12} className={done ? "" : "opacity-30"} />
      )}
      {loading ? "Processando..." : done ? doneLabel : label}
    </button>
  );
}

function AIResultPanel({
  title,
  color,
  icon: Icon,
  content,
  date,
}: {
  title: string;
  color: string;
  icon: any;
  content: string;
  date?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div
      className="rounded-2xl overflow-hidden border transition-all"
      style={{ borderColor: `${color}30`, background: `${color}05` }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors"
      >
        <Icon size={16} style={{ color }} className="shrink-0" />
        <span
          className="font-black text-[10px] uppercase tracking-widest flex-1 text-left"
          style={{ color }}
        >
          {title}
        </span>
        {date && (
          <span className="text-[9px] font-bold opacity-30 uppercase tracking-widest">
            {new Date(date).toLocaleDateString("pt-BR")}
          </span>
        )}
        {open ? (
          <ChevronUp size={14} className="opacity-20" />
        ) : (
          <ChevronDown size={14} className="opacity-20" />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
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

  const [loadingAction, setLoadingAction] = useState<{
    id: number;
    action: string;
  } | null>(null);

  const utils = trpc.useUtils();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: disciplines } = trpc.discipline.list.useQuery();
  const { data: topicsData } = trpc.topic.list.useQuery(
    { disciplineId: filterDisc || undefined },
    { enabled: !!filterDisc },
  );
  const topics = (topicsData as any)?.topics ?? [];

  const {
    data: errorsPage,
    isLoading,
    refetch,
  } = trpc.questionError.list.useQuery({
    disciplineId: filterDisc || undefined,
    topicId: filterTopic || undefined,
    limit: 200,
  });
  const errors = errorsPage?.items ?? [];

  // Extract keys from DB
  const aiSettings = (stats?.settings as any) || {};
  const dbApiKey = aiSettings.aiApiKey || "";
  const dbProvider = aiSettings.aiProvider || "gemini";

  const deleteError = trpc.questionError.delete.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Questão removida.");
      setDeleting(null);
    },
    onError: () => {
      toast.error("Erro ao remover.");
      setDeleting(null);
    },
  });

  const analyzeMut = trpc.questionError.analyze.useMutation({
    onSuccess: () => {
      setLoadingAction(null);
      refetch();
      toast.success("Diagnóstico salvo!");
    },
    onError: (e) => {
      setLoadingAction(null);
      toast.error(e.message);
    },
  });
  const revisionTipMut = trpc.questionError.revisionTip.useMutation({
    onSuccess: () => {
      setLoadingAction(null);
      refetch();
      toast.success("Dica de revisão salva!");
    },
    onError: (e) => {
      setLoadingAction(null);
      toast.error(e.message);
    },
  });
  const similarMut = trpc.questionError.similarQuestions.useMutation({
    onSuccess: () => {
      setLoadingAction(null);
      refetch();
      toast.success("Questões similares salvas!");
    },
    onError: (e) => {
      setLoadingAction(null);
      toast.error(e.message);
    },
  });
  const flashcardMut = trpc.questionError.generateFlashcard.useMutation({
    onSuccess: (d) => {
      setLoadingAction(null);
      refetch();
      toast.success("Flashcard criado!");
    },
    onError: (e) => {
      setLoadingAction(null);
      toast.error(e.message);
    },
  });

  const filtered = errors.filter(
    (e: any) => !filterOrigin || e.errorOrigin === filterOrigin,
  );
  const discName = (id: number) =>
    (disciplines as any[])?.find((d: any) => d.id === id)?.name ?? "Disciplina";
  const topicName = (id: number) =>
    topics.find((t: any) => t.id === id)?.name ?? "Tema";

  const callAI = (
    id: number,
    action:
      | "analyze"
      | "revisionTip"
      | "similarQuestions"
      | "generateFlashcard",
  ) => {
    if (!dbApiKey) {
      toast.error("Configuração de IA ausente no Perfil!");
      return;
    }
    setLoadingAction({ id, action });
    setExpanded(id);
    const args = { id, apiKey: dbApiKey, provider: dbProvider };

    if (action === "analyze") analyzeMut.mutate(args);
    else if (action === "revisionTip") revisionTipMut.mutate(args);
    else if (action === "similarQuestions") similarMut.mutate(args);
    else if (action === "generateFlashcard") flashcardMut.mutate(args);
  };

  const isActionLoading = (id: number, action: string) =>
    loadingAction?.id === id && loadingAction?.action === action;

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      {/* Premium Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 bg-white/[0.02] border border-white/5 p-8 rounded-[2.5rem] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500 opacity-[0.03] blur-[100px] -mr-32 -mt-32" />

        <div className="space-y-2 relative">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500/10 rounded-lg text-rose-500">
              <XCircle size={18} />
            </div>
            <h2
              className="text-3xl font-black tracking-tight"
              style={{ color: "var(--app-fg)" }}
            >
              Painel de Erros
            </h2>
          </div>
          <p className="text-sm opacity-50 font-medium">
            Transforme suas falhas em aprendizado com diagnóstico de IA.
          </p>
        </div>

        <div
          className={`flex items-center gap-4 px-6 py-4 rounded-2xl border transition-all ${dbApiKey ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-500" : "bg-rose-500/5 border-rose-500/10 text-rose-500"}`}
        >
          <Zap size={18} className={dbApiKey ? "animate-pulse" : ""} />
          <div className="text-left">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">
              Status do Motor
            </p>
            <p className="text-xs font-black uppercase tracking-widest">
              {dbApiKey ? `IA Ativa (${dbProvider})` : "IA Desativada"}
            </p>
          </div>
        </div>
      </div>

      {/* Advanced Filter Control */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-2 bg-white/[0.01] rounded-[2rem]">
        <div className="md:col-span-1 space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest opacity-30 ml-2">
            Disciplina
          </label>
          <select
            value={filterDisc}
            onChange={(e) => {
              setFilterDisc(e.target.value ? Number(e.target.value) : "");
              setFilterTopic("");
            }}
            className="w-full bg-white/5 border border-white/5 text-[var(--app-fg)] rounded-2xl px-5 h-14 text-xs font-bold outline-none focus:border-[var(--primary)] transition-all cursor-pointer"
          >
            <option value="">Todas as Matérias</option>
            {(disciplines as any[])?.map((d: any) => (
              <option key={d.id} value={d.id} className="bg-slate-900">
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-1 space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest opacity-30 ml-2">
            Assunto
          </label>
          <select
            value={filterTopic}
            onChange={(e) =>
              setFilterTopic(e.target.value ? Number(e.target.value) : "")
            }
            disabled={!filterDisc}
            className="w-full bg-white/5 border border-white/5 text-[var(--app-fg)] rounded-2xl px-5 h-14 text-xs font-bold outline-none focus:border-[var(--primary)] transition-all disabled:opacity-20 cursor-pointer"
          >
            <option value="">Todos os Temas</option>
            {topics.map((t: any) => (
              <option key={t.id} value={t.id} className="bg-slate-900">
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-1 space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest opacity-30 ml-2">
            Natureza do Erro
          </label>
          <select
            value={filterOrigin}
            onChange={(e) => setFilterOrigin(e.target.value)}
            className="w-full bg-white/5 border border-white/5 text-[var(--app-fg)] rounded-2xl px-5 h-14 text-xs font-bold outline-none focus:border-[var(--primary)] transition-all cursor-pointer"
          >
            <option value="">Qualquer Origem</option>
            {Object.entries(ORIGIN_LABELS).map(([id, info]) => (
              <option key={id} value={id} className="bg-slate-900">
                {info.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end pb-1 px-1">
          <button
            onClick={() => {
              setFilterDisc("");
              setFilterTopic("");
              setFilterOrigin("");
            }}
            className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/10 hover:text-rose-500 transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw size={14} /> Limpar Filtros
          </button>
        </div>
      </div>

      {/* Main Content */}
      {isLoading ? (
        <div className="py-20 text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-[var(--primary)]/10 border-t-[var(--primary)] animate-spin mx-auto" />
          <p className="opacity-30 font-black uppercase text-[10px] tracking-widest">
            Sincronizando banco de erros...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="soe-card p-24 flex flex-col items-center justify-center gap-6 opacity-40 border-dashed">
          <div className="w-20 h-20 rounded-[2rem] bg-white/5 flex items-center justify-center mb-2">
            <CheckCircle2 size={32} />
          </div>
          <div className="text-center">
            <p className="text-xl font-black uppercase tracking-widest">
              Nenhum Erro Registrado
            </p>
            <p className="text-xs mt-2 font-medium">
              Suas questões incorretas serão listadas aqui automaticamente.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-4 px-2 mb-4">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">
              {filtered.length} Incidentes Detectados no Período
            </span>
          </div>

          {filtered.map((e: any) => {
            const isExpanded = expanded === e.id;
            const originInfo = e.errorOrigin
              ? ORIGIN_LABELS[e.errorOrigin]
              : null;
            const OriginIcon = e.errorOrigin
              ? ORIGIN_ICONS[e.errorOrigin]
              : null;
            const hasAnalysis = !!(e as any).aiAnalysis;
            const hasTip = !!(e as any).aiRevisionTip;
            const hasSimilar = !!(e as any).aiSimilarQuestions;
            const hasFlashcard = !!(e as any).aiFlashcardGenerated;

            return (
              <div
                key={e.id}
                className={`soe-card group overflow-hidden transition-all duration-300 ${isExpanded ? "border-[var(--primary-border)] shadow-2xl shadow-[var(--primary-shadow)]/5" : "hover:border-white/10"}`}
              >
                <div className="p-8">
                  <div className="flex flex-col md:flex-row items-start gap-6">
                    <div className="shrink-0 w-14 h-14 rounded-[1.2rem] bg-rose-500/5 border border-rose-500/10 flex items-center justify-center text-rose-500 shadow-inner">
                      <XCircle size={24} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {e.banca && (
                            <span className="px-3 py-1 rounded-xl bg-white/5 border border-white/5 text-[9px] font-black uppercase tracking-widest opacity-60">
                              {e.banca}
                            </span>
                          )}
                          {e.year && (
                            <span className="px-3 py-1 rounded-xl bg-white/5 border border-white/5 text-[9px] font-black uppercase tracking-widest opacity-60">
                              {e.year}
                            </span>
                          )}
                          {originInfo && OriginIcon && (
                            <span
                              className="px-3 py-1 rounded-xl flex items-center gap-2 text-[9px] font-black uppercase tracking-widest border"
                              style={{
                                background: `${originInfo.color}15`,
                                borderColor: `${originInfo.color}25`,
                                color: originInfo.color,
                              }}
                            >
                              <OriginIcon size={12} /> {originInfo.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 opacity-30">
                          <Clock size={12} />
                          <span className="text-[9px] font-black uppercase tracking-widest">
                            {new Date(e.createdAt).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                          <span className="text-[var(--primary)]">
                            {discName(e.disciplineId)}
                          </span>
                          {e.topicId > 0 && (
                            <>
                              <ArrowRight size={10} className="opacity-20" />
                              <span className="opacity-60">
                                {topicName(e.topicId)}
                              </span>
                            </>
                          )}
                        </div>
                        <p
                          className="text-base font-black leading-tight tracking-tight"
                          style={{ color: "var(--app-fg)" }}
                        >
                          {e.statement}
                        </p>
                      </div>

                      {e.userAnswer && e.correctAnswer && (
                        <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.01] border border-white/5 w-fit">
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Você: {e.userAnswer}
                          </div>
                          <div className="w-px h-3 bg-white/10" />
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Gabarito: {e.correctAnswer}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-8 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 w-full sm:w-auto">
                      <AIActionButton
                        label="Analisar"
                        doneLabel="Re-analisar"
                        icon={Brain}
                        color="#8b5cf6"
                        loading={isActionLoading(e.id, "analyze")}
                        done={hasAnalysis}
                        onClick={() => callAI(e.id, "analyze")}
                      />
                      <AIActionButton
                        label="Estratégia"
                        doneLabel="Ver Dica"
                        icon={Lightbulb}
                        color="#f59e0b"
                        loading={isActionLoading(e.id, "revisionTip")}
                        done={hasTip}
                        onClick={() => callAI(e.id, "revisionTip")}
                      />
                      <AIActionButton
                        label="Similares"
                        doneLabel="Ver Mais"
                        icon={Search}
                        color="#3b82f6"
                        loading={isActionLoading(e.id, "similarQuestions")}
                        done={hasSimilar}
                        onClick={() => callAI(e.id, "similarQuestions")}
                      />
                      <AIActionButton
                        label="Criar Card"
                        doneLabel="Card ✓"
                        icon={CreditCard}
                        color="#10b981"
                        loading={isActionLoading(e.id, "generateFlashcard")}
                        done={hasFlashcard}
                        onClick={() =>
                          !hasFlashcard && callAI(e.id, "generateFlashcard")
                        }
                      />
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button
                        onClick={() => setExpanded(isExpanded ? null : e.id)}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-3 px-6 h-12 rounded-2xl transition-all border ${isExpanded ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "bg-white/5 hover:bg-white/10 border-white/5 font-black text-[10px] uppercase tracking-widest"}`}
                      >
                        {isExpanded ? (
                          <ChevronUp size={18} />
                        ) : (
                          <div className="flex items-center gap-2 uppercase tracking-widest text-[9px] font-black">
                            Detalhes <ChevronDown size={14} />
                          </div>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          if (deleting === e.id) {
                            deleteError.mutate({ id: e.id });
                          } else {
                            setDeleting(e.id);
                            setTimeout(() => setDeleting(null), 3000);
                          }
                        }}
                        className={`w-12 h-12 rounded-2xl transition-all border flex items-center justify-center ${deleting === e.id ? "bg-rose-500 border-rose-500 text-white animate-pulse" : "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/10 text-rose-500"}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-8 pb-8 space-y-8 pt-6 border-t border-white/5 bg-black/20">
                        <div className="space-y-4">
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-30 flex items-center gap-2">
                            <Info size={12} /> Contexto do Enunciado
                          </p>
                          <div className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 shadow-inner">
                            <p
                              className="text-sm font-medium leading-relaxed whitespace-pre-wrap"
                              style={{ color: "var(--app-fg)" }}
                            >
                              {e.statement}
                            </p>
                          </div>
                        </div>

                        {e.alternatives?.length > 0 && (
                          <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-30">
                              Análise das Alternativas
                            </p>
                            <div className="grid grid-cols-1 gap-3">
                              {e.alternatives.map((a: any) => {
                                const isUser = a.letter === e.userAnswer;
                                const isCorrect = a.letter === e.correctAnswer;
                                return (
                                  <div
                                    key={a.letter}
                                    className={`p-5 rounded-[1.5rem] border flex gap-6 transition-all ${isCorrect ? "bg-emerald-500/5 border-emerald-500/20 shadow-lg shadow-emerald-500/5" : isUser ? "bg-rose-500/5 border-rose-500/20" : "bg-white/5 border-white/5 opacity-40"}`}
                                  >
                                    <div
                                      className={`shrink-0 w-10 h-10 rounded-[1rem] flex items-center justify-center font-black text-sm ${isCorrect ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : isUser ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20" : "bg-white/10 text-white/40"}`}
                                    >
                                      {a.letter}
                                    </div>
                                    <div className="flex-1 pt-2">
                                      <p
                                        className="text-sm font-semibold leading-relaxed"
                                        style={{ color: "var(--app-fg)" }}
                                      >
                                        {a.text}
                                      </p>
                                      <div className="mt-3 flex items-center gap-3">
                                        {isCorrect && (
                                          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1.5">
                                            <CheckCircle2 size={12} /> Gabarito
                                            Correto
                                          </span>
                                        )}
                                        {isUser && !isCorrect && (
                                          <span className="text-[9px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1.5">
                                            <XCircle size={12} /> Sua Escolha
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-6 pt-6 border-t border-white/5">
                          {hasAnalysis && (
                            <AIResultPanel
                              title="Análise Cognitiva & Diagnóstico"
                              color="#8b5cf6"
                              icon={Brain}
                              content={(e as any).aiAnalysis}
                              date={(e as any).aiAnalyzedAt}
                            />
                          )}
                          {hasTip && (
                            <AIResultPanel
                              title="Estratégia de Correção & Revisão"
                              color="#f59e0b"
                              icon={Lightbulb}
                              content={(e as any).aiRevisionTip}
                              date={(e as any).aiRevisionTipAt}
                            />
                          )}
                          {hasSimilar && (
                            <AIResultPanel
                              title="Questões de Reforço Relacionadas"
                              color="#3b82f6"
                              icon={Search}
                              content={(e as any).aiSimilarQuestions}
                              date={(e as any).aiSimilarQuestionsAt}
                            />
                          )}
                          {hasFlashcard && (
                            <div className="p-6 rounded-[2rem] bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-4 text-emerald-500 font-black text-xs uppercase tracking-widest">
                              <div className="p-2 bg-emerald-500/20 rounded-xl">
                                <CreditCard size={20} />
                              </div>
                              <span>
                                Flashcard gerado com sucesso no seu banco de
                                estudos
                              </span>
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
