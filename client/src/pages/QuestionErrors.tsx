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
      {text.split("\n").map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} className={line.trim() === "" ? "h-4" : "mb-1"}>
            {parts.map((p, j) =>
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
      className={`group flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-[9px] font-bold uppercase tracking-wider transition-all ${done ? "border-transparent" : "border-border/70"}`}
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
        className="w-full flex items-center gap-3 p-4 hover:bg-secondary/40 transition-colors"
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
            <div className="px-5 pb-5 pt-1 border-t border-border/70">
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
    (e) => !filterOrigin || e.errorOrigin === filterOrigin,
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
    <div className="space-y-5 animate-in fade-in duration-700">
      {/* Premium Header Area */}
      <div className="soe-card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500 opacity-[0.03] blur-[100px] -mr-32 -mt-32" />

        <div className="space-y-2 relative">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-rose-500/10 p-1.5 text-rose-500">
              <XCircle size={15} />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              Questões erradas
            </h2>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Revise o erro, entenda a causa e gere reforço com IA.
          </p>
        </div>

        <div
          className={`flex items-center gap-2 rounded-md border px-3 py-2 ${dbApiKey ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-500" : "border-rose-500/20 bg-rose-500/5 text-rose-500"}`}
        >
          <Zap size={13} />
          <span className="text-[9px] font-bold uppercase tracking-wider">
            {dbApiKey ? `IA ativa · ${dbProvider}` : "IA desativada"}
          </span>
        </div>
      </div>

      {/* Advanced Filter Control */}
      <div className="soe-card grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
        <div className="md:col-span-1 space-y-2">
          <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Disciplina
          </label>
          <select
            value={filterDisc}
            onChange={(e) => {
              setFilterDisc(e.target.value ? Number(e.target.value) : "");
              setFilterTopic("");
            }}
            className="h-10 w-full rounded-md border border-border bg-secondary/30 px-3 text-xs font-semibold text-foreground outline-none focus:border-primary"
          >
            <option value="">Todas as Matérias</option>
            {(disciplines as any[])?.map((d: any) => (
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
        <div className="md:col-span-1 space-y-2">
          <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Assunto
          </label>
          <select
            value={filterTopic}
            onChange={(e) =>
              setFilterTopic(e.target.value ? Number(e.target.value) : "")
            }
            disabled={!filterDisc}
            className="h-10 w-full rounded-md border border-border bg-secondary/30 px-3 text-xs font-semibold text-foreground outline-none focus:border-primary disabled:opacity-40"
          >
            <option value="">Todos os Temas</option>
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
        <div className="md:col-span-1 space-y-2">
          <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Natureza do Erro
          </label>
          <select
            value={filterOrigin}
            onChange={(e) => setFilterOrigin(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-secondary/30 px-3 text-xs font-semibold text-foreground outline-none focus:border-primary"
          >
            <option value="">Qualquer Origem</option>
            {Object.entries(ORIGIN_LABELS).map(([id, info]) => (
              <option key={id} value={id} className="bg-card text-foreground">
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
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary/30 text-[9px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
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
        <div className="soe-card flex flex-col items-center justify-center gap-3 border-dashed p-12 text-center">
          <CheckCircle2 size={26} className="text-muted-foreground/40" />
          <p className="text-sm font-semibold">Nenhum erro registrado</p>
          <p className="text-[11px] text-muted-foreground">
            Suas questões incorretas aparecerão aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold text-muted-foreground">
              {filtered.length} questões salvas
            </span>
            <span className="text-[9px] text-muted-foreground/60">
              clique em detalhes para ver alternativas e IA
            </span>
          </div>

          {filtered.map((e) => {
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
                className={`soe-card group overflow-hidden transition-all duration-300 ${isExpanded ? "border-[var(--primary-border)] shadow-2xl shadow-[var(--primary-shadow)]/5" : "hover:border-border"}`}
              >
                <div className="p-5">
                  <div className="flex flex-col md:flex-row items-start gap-6">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-rose-500/10 bg-rose-500/5 text-rose-500">
                      <XCircle size={16} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {e.banca && (
                            <span className="px-3 py-1 rounded-xl bg-secondary/40 border border-border/70 text-[9px] font-black uppercase tracking-widest opacity-60">
                              {e.banca}
                            </span>
                          )}
                          {e.year && (
                            <span className="px-3 py-1 rounded-xl bg-secondary/40 border border-border/70 text-[9px] font-black uppercase tracking-widest opacity-60">
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
                        <p className="line-clamp-3 text-sm font-semibold leading-relaxed">
                          {e.statement}
                        </p>
                      </div>

                      {e.userAnswer && e.correctAnswer && (
                        <div className="flex w-fit flex-wrap items-center gap-3 rounded-md border border-border bg-secondary/20 p-2.5">
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Você: {e.userAnswer}
                          </div>
                          <div className="w-px h-3 bg-secondary/60" />
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Gabarito: {e.correctAnswer}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-border pt-4 sm:flex-row">
                    <div className="grid w-full grid-cols-2 gap-1.5 sm:w-auto lg:grid-cols-4">
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
                        className={`flex h-9 items-center justify-center gap-2 rounded-md border px-4 text-[9px] font-bold uppercase tracking-wider transition-all ${isExpanded ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"}`}
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
                        className={`flex h-9 w-9 items-center justify-center rounded-md border transition-all ${deleting === e.id ? "border-rose-500 bg-rose-500 text-white animate-pulse" : "border-rose-500/10 bg-rose-500/5 text-rose-500 hover:bg-rose-500/10"}`}
                      >
                        <Trash2 size={15} />
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
                      <div className="space-y-5 border-t border-border bg-secondary/20 px-5 pb-5 pt-4">
                        <div className="space-y-4">
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-30 flex items-center gap-2">
                            <Info size={12} /> Contexto do Enunciado
                          </p>
                          <div className="rounded-md border border-border bg-card p-4">
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
                                    className={`flex gap-4 rounded-md border p-4 transition-all ${isCorrect ? "bg-emerald-500/5 border-emerald-500/20 shadow-lg shadow-emerald-500/5" : isUser ? "bg-rose-500/5 border-rose-500/20" : "bg-secondary/40 border-border/70 opacity-40"}`}
                                  >
                                    <div
                                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold ${isCorrect ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : isUser ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20" : "bg-secondary/60 text-muted-foreground"}`}
                                    >
                                      {a.letter}
                                    </div>
                                    <div className="flex-1 pt-1">
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

                        <div className="grid grid-cols-1 gap-6 pt-6 border-t border-border/70">
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
