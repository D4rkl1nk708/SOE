import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import {
  Plus, Trash2, Edit2, BookOpen, Brain, ChevronLeft, ChevronRight,
  Check, X, RotateCcw, Zap, Star, AlertTriangle, Eye, EyeOff,
  Filter, Layers, TrendingUp, Info, History, GraduationCap
} from "lucide-react";
import { format, parseISO, isToday, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";

type Mode = "list" | "review" | "create" | "edit";

function CardBadge({ text, color }: { text: string; color: string }) {
  return (
    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
      {text}
    </span>
  );
}

// ── Review Session ─────────────────────────────────────────────────────────────
function ReviewSession({
  cards, onDone, hardMode = false,
}: {
  cards: any[];
  onDone: () => void;
  hardMode?: boolean;
}) {
  const utils = trpc.useUtils();
  const reviewCard = trpc.flashcard.review.useMutation({
    onSuccess: () => utils.flashcard.list.invalidate(),
  });

  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<{ id: number; q: number }[]>([]);
  const [done, setDone] = useState(false);

  const { data: disciplines = [] } = trpc.discipline.list.useQuery();

  const card = cards[idx];

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-10, 10]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0.5, 1, 1, 1, 0.5]);
  const xInput = [-100, 0, 100];
  const colorRight = useTransform(x, xInput, ["rgba(16, 185, 129, 0)", "rgba(16, 185, 129, 0)", "rgba(16, 185, 129, 0.2)"]);
  const colorLeft = useTransform(x, xInput, ["rgba(244, 63, 94, 0.2)", "rgba(244, 63, 94, 0)", "rgba(244, 63, 94, 0)"]);

  const handleRate = async (quality: number) => {
    await reviewCard.mutateAsync({ id: card.id, quality });
    const newResults = [...results, { id: card.id, q: quality }];
    setResults(newResults);
    
    x.set(0);

    if (idx + 1 >= cards.length) {
      setDone(true);
    } else {
      setIdx(i => i + 1);
      setFlipped(false);
    }
  };

  const handleDragEnd = (event: any, info: any) => {
    if (!flipped) {
      if (Math.abs(info.offset.x) > 50) setFlipped(true);
      return;
    }
    if (info.offset.x > 100) {
      handleRate(4); // Acertei
    } else if (info.offset.x < -100) {
      handleRate(1); // Errei
    }
  };

  if (done) {
    const passed = results.filter(r => r.q >= 3).length;
    const failed = results.filter(r => r.q < 3).length;
    const accuracy = results.length > 0 ? Math.round((passed / results.length) * 100) : 0;

    return (
      <div className="flex flex-col items-center justify-center py-12 gap-8 max-w-md mx-auto">
        <div className="relative">
            <div className="absolute inset-0 bg-[var(--primary)] blur-3xl opacity-20 animate-pulse" />
            <div className="relative p-8 rounded-3xl bg-[var(--stat-bg)] border border-[var(--primary-border)] shadow-2xl">
                <Brain className="h-16 w-16 text-[var(--primary)]" />
            </div>
        </div>
        
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black tracking-tight" style={{ color: "var(--app-fg)" }}>Sessão Finalizada!</h2>
          <p className="text-sm opacity-50 font-medium uppercase tracking-widest">{results.length} cards revisados</p>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full">
            <div className="soe-card p-6 flex flex-col items-center gap-1 border-[var(--accent-green)]/20">
                <p className="text-3xl font-black text-[var(--accent-green)]">{passed}</p>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Acertos</p>
            </div>
            <div className="soe-card p-6 flex flex-col items-center gap-1 border-rose-500/20">
                <p className="text-3xl font-black text-rose-500">{failed}</p>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Erros</p>
            </div>
        </div>

        <div className="w-full space-y-2">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest opacity-40 px-1">
                <span>Precisão Mental</span>
                <span>{accuracy}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full bg-[var(--primary)] shadow-[0_0_12px_var(--primary-shadow)] transition-all duration-1000" style={{ width: `${accuracy}%` }} />
            </div>
        </div>

        <button onClick={onDone}
          className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-[var(--primary-foreground)] shadow-xl shadow-[var(--primary-shadow)] transition-all hover:opacity-90 active:scale-95"
          style={{ background: "var(--primary)" }}>
          Retornar ao Painel
        </button>
      </div>
    );
  }

  if (!card && !done) return null;
  const disc = card ? (disciplines as any[]).find((d: any) => d.id === card.disciplineId) : null;

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto py-6 gap-6">
      {/* Progress header */}
      <div className="space-y-3 px-2">
          <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Sessão em curso</span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--primary)" }}>
                {idx + 1} de {cards.length}
              </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full bg-[var(--primary)] transition-all duration-300"
                style={{ width: `${((idx) / cards.length) * 100}%` }} />
          </div>
      </div>

      {/* Card Arena */}
      <div className="relative flex-1" style={{ perspective: "1000px" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={card.id + (flipped ? "-back" : "-front")}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.8}
            onDragEnd={handleDragEnd}
            onClick={() => { if (!flipped) setFlipped(true); }}
            className="flex-1 h-full min-h-[380px] md:min-h-[400px] flex flex-col items-center justify-center rounded-[2rem] md:rounded-[2.5rem] cursor-pointer shadow-2xl relative overflow-hidden group p-6 md:p-10 text-center"
            initial={{ rotateY: flipped ? -90 : 90, opacity: 0, scale: 0.9 }}
            animate={{ rotateY: 0, opacity: 1, scale: 1 }}
            exit={{ rotateY: flipped ? 90 : -90, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", damping: 20, stiffness: 100 }}
            style={{
              x, rotate, opacity,
              background: "var(--card-bg, var(--app-bg))",
              border: `1px solid var(--card-border)`,
              boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
            }}
          >
            {/* Visual feedback overlays */}
            <motion.div className="absolute inset-0 pointer-events-none" style={{ background: colorRight }} />
            <motion.div className="absolute inset-0 pointer-events-none" style={{ background: colorLeft }} />

            {disc && (
              <div className="absolute top-8 left-8">
                 <CardBadge text={disc.name} color={disc.color} />
              </div>
            )}

            <div className="flex flex-col items-center justify-center gap-8 flex-1 w-full">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30">
                {flipped ? "Evocação Completa" : hardMode ? "Desafio Cognitivo — Sem Dicas" : "Pergunta Mental"}
              </span>

              {hardMode && !flipped ? (
                <div className="space-y-6">
                  <div className="w-24 h-24 rounded-[2rem] bg-[var(--primary-bg-subtle)] flex items-center justify-center border border-[var(--primary-border)] shadow-xl shadow-[var(--primary-shadow)] mx-auto">
                    <Brain className="h-10 w-10 text-[var(--primary)]" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-black" style={{ color: "var(--app-fg)" }}>Tente Relembrar</p>
                    <p className="text-xs opacity-50 max-w-[240px] mx-auto leading-relaxed">
                        A "dificuldade desejável" aumenta sua retenção em até 40%. Não vire o card antes de lutar pela memória.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full"
                  style={{ color: "var(--app-fg)" }}
                  dangerouslySetInnerHTML={{ __html: flipped ? `<div class="text-2xl leading-relaxed">${card.back}</div>` : `<div class="text-3xl font-black tracking-tight">${card.front}</div>` }} />
              )}
            </div>

            <div className="flex items-center gap-3 opacity-20 group-hover:opacity-60 transition-opacity">
               {flipped ? <EyeOff size={14} /> : <Eye size={14} />}
               <span className="text-[10px] font-black uppercase tracking-widest">
                  {flipped ? "Toque para ver a pergunta" : "Toque para revelar"}
               </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Control Panel */}
      <div className="px-2">
        {flipped ? (
            <div className="grid grid-cols-4 gap-3">
            {[
                { q: 1, icon: X, color: "#f43f5e", label: "Errei" },
                { q: 3, icon: AlertTriangle, color: "#f59e0b", label: "Difícil" },
                { q: 4, icon: Check, color: "#10b981", label: "Bom" },
                { q: 5, icon: Star, color: "var(--primary)", label: "Fácil" }
            ].map(btn => (
                <button key={btn.q} onClick={() => handleRate(btn.q)}
                className="flex flex-col items-center gap-2 py-4 rounded-2xl transition-all hover:opacity-90 active:scale-95 group border border-white/5"
                style={{ background: `${btn.color}15` }}>
                <btn.icon size={20} style={{ color: btn.color }} className="group-hover:scale-110 transition-transform" />
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: btn.color }}>{btn.label}</span>
                </button>
            ))}
            </div>
        ) : (
            <button onClick={() => setFlipped(true)}
            className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest text-[var(--primary-foreground)] shadow-xl shadow-[var(--primary-shadow)] transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "var(--primary)" }}>
            Revelar Resposta
            </button>
        )}
      </div>
    </div>
  );
}

// ── Form logic remains functional but styled ─────────────────────────────────
function FlashcardForm({
  initial, onSave, onCancel,
}: {
  initial?: any;
  onSave: (data: { disciplineId: number; topicId?: number; front: string; back: string }) => void;
  onCancel: () => void;
}) {
  const { data: disciplines = [] } = trpc.discipline.list.useQuery();
  const [disciplineId, setDisciplineId] = useState<number | "">(initial?.disciplineId ?? "");
  const [topicId, setTopicId] = useState<number | "">(initial?.topicId ?? "");
  const [front, setFront] = useState(initial?.front ?? "");
  const [back, setBack] = useState(initial?.back ?? "");

  const { data: topicsData } = trpc.topic.list.useQuery(
    { disciplineId: disciplineId ? Number(disciplineId) : undefined },
    { enabled: !!disciplineId }
  );
  const topics = (topicsData as any)?.topics ?? topicsData ?? [];

  const handleSubmit = () => {
    if (!disciplineId || !front.trim() || !back.trim()) {
      toast.error("Preencha os campos obrigatórios.");
      return;
    }
    onSave({ disciplineId: Number(disciplineId), topicId: topicId ? Number(topicId) : undefined, front: front.trim(), back: back.trim() });
  };

  const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" };

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">
      <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-[var(--primary-bg-subtle)] rounded-xl border border-[var(--primary-border)]">
              <Layers className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <h2 className="text-xl font-black" style={{ color: "var(--app-fg)" }}>
              {initial ? "Refinar Flashcard" : "Novo Flashcard"}
          </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Disciplina *</label>
          <select value={disciplineId} onChange={e => { setDisciplineId(e.target.value as any); setTopicId(""); }}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none appearance-none" style={inputStyle}>
            <option value="">Selecionar...</option>
            {(disciplines as any[]).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Tema Associado</label>
          <select value={topicId} onChange={e => setTopicId(e.target.value as any)} disabled={!disciplineId}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none appearance-none disabled:opacity-40" style={inputStyle}>
            <option value="">Sem tema específico</option>
            {(topics as any[]).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Frente (Pergunta/Conceito) *</label>
        <textarea value={front} onChange={e => setFront(e.target.value)} rows={3}
          placeholder="Ex: Qual o princípio da anterioridade tributária?"
          className="w-full px-4 py-4 rounded-2xl text-sm outline-none resize-none focus:ring-2 focus:ring-[var(--primary-border)]"
          style={inputStyle} />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Verso (Explicação/Resposta) *</label>
        <textarea value={back} onChange={e => setBack(e.target.value)} rows={5}
          placeholder="Ex: Impede que tributos sejam cobrados no mesmo exercício financeiro em que foi publicada a lei..."
          className="w-full px-4 py-4 rounded-2xl text-sm outline-none resize-none focus:ring-2 focus:ring-[var(--primary-border)]"
          style={inputStyle} />
      </div>

      <div className="flex gap-4 pt-4">
        <button onClick={onCancel}
          className="flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-white/5"
          style={{ border: "1px solid var(--card-border)", color: "var(--muted-text)" }}>
          Descartar
        </button>
        <button onClick={handleSubmit}
          className="flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--primary-foreground)] shadow-xl shadow-[var(--primary-shadow)] transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: "var(--primary)" }}>
          {initial ? "Salvar Alterações" : "Gerar Flashcard"}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Flashcards() {
  const utils = trpc.useUtils();
  const { data: cards = [], isLoading } = trpc.flashcard.list.useQuery();
  const { data: disciplines = [] } = trpc.discipline.list.useQuery();

  const createCard = trpc.flashcard.create.useMutation({ onSuccess: () => { utils.flashcard.list.invalidate(); toast.success("Flashcard criado!"); setMode("list"); } });
  const updateCard = trpc.flashcard.update.useMutation({ onSuccess: () => { utils.flashcard.list.invalidate(); toast.success("Flashcard atualizado!"); setMode("list"); } });
  const deleteCard = trpc.flashcard.delete.useMutation({ onSuccess: () => { utils.flashcard.list.invalidate(); toast.success("Flashcard excluído."); } });

  const [mode, setMode] = useState<Mode>("list");
  const [editingCard, setEditingCard] = useState<any | null>(null);
  const [filterDisc, setFilterDisc] = useState<number | null>(null);
  const [reviewFilter, setReviewFilter] = useState<"due" | "all">("due");
  const [hardMode, setHardMode] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const dueCards = useMemo(() => (cards as any[]).filter((c: any) => c.nextReviewDate <= today), [cards, today]);
  
  const filteredCards = useMemo(() => {
    let list = cards as any[];
    if (filterDisc) list = list.filter((c: any) => c.disciplineId === filterDisc);
    return list;
  }, [cards, filterDisc]);

  const reviewCards = useMemo(() => {
    let list = reviewFilter === "due" ? dueCards : cards as any[];
    if (filterDisc) list = list.filter((c: any) => c.disciplineId === filterDisc);
    return list;
  }, [dueCards, cards, filterDisc, reviewFilter]);

  if (isLoading) return <div className="p-8 text-center opacity-30 font-black uppercase text-xs tracking-widest">Sintonizando Banco de Dados...</div>;

  if (mode === "review") {
    return (
      <div className="h-[calc(100vh-6rem)] flex flex-col">
        <div className="flex items-center justify-between mb-4 px-2">
            <button onClick={() => setMode("list")} className="flex items-center gap-2 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-xs font-black uppercase tracking-widest">
                <ChevronLeft className="h-4 w-4" /> Cancelar
            </button>
            {hardMode && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--primary-border)] bg-[var(--primary-bg-subtle)]">
                    <Zap size={14} className="text-[var(--primary)]" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--primary)]">Evoque: Modo Difícil</span>
                </div>
            )}
        </div>
        {reviewCards.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <Check className="h-20 w-20 text-[var(--accent-green)] p-5 rounded-[2rem] bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/20" />
                <div className="text-center">
                    <p className="text-2xl font-black" style={{ color: "var(--app-fg)" }}>Tudo em Dia!</p>
                    <p className="text-sm opacity-50">Você completou todas as revisões desta seleção.</p>
                </div>
                <button onClick={() => setMode("list")} className="px-10 py-3 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest">Painel Principal</button>
            </div>
        ) : (
            <ReviewSession cards={reviewCards} onDone={() => setMode("list")} hardMode={hardMode} />
        )}
      </div>
    );
  }

  if (mode === "create" || mode === "edit") {
      return (
          <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-300">
              <button onClick={() => setMode("list")} className="w-fit flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-xs font-black uppercase tracking-widest mb-4">
                  <ChevronLeft className="h-4 w-4" /> Voltar
              </button>
              <FlashcardForm 
                initial={mode === "edit" ? editingCard : undefined} 
                onSave={(d) => mode === "edit" ? updateCard.mutate({ id: editingCard.id, front: d.front, back: d.back }) : createCard.mutate(d)} 
                onCancel={() => setMode("list")} 
              />
          </div>
      );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Immersive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[var(--primary-bg-subtle)] rounded-2xl border border-[var(--primary-border)] shadow-xl shadow-[var(--primary-shadow)]">
            <GraduationCap className="w-6 h-6 text-[var(--primary)]" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--app-fg)" }}>Cards</h1>
            <p className="text-sm opacity-60">Repetição espaçada.</p>
          </div>
        </div>
        <button onClick={() => setMode("create")}
            className="w-full sm:w-auto px-6 h-12 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)] active:scale-95 transition-all">
            <Plus className="h-4 w-4 mr-2" /> Novo
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
        {[
          { label: "Acervo", value: cards.length, color: "var(--primary)", icon: Layers },
          { label: "Pendente", value: dueCards.length, color: dueCards.length > 0 ? "var(--accent-amber)" : "var(--accent-green)", icon: History },
          { label: "Maestria", value: `${Math.round((cards.filter((c: any) => c.interval >= 21).length / (cards.length || 1)) * 100)}%`, color: "var(--accent-green)", icon: TrendingUp },
        ].map((s, idx) => (
          <div key={s.label} className={`soe-card p-4 md:p-6 flex items-center justify-between group overflow-hidden relative ${idx === 2 ? 'col-span-2 md:col-span-1' : ''}`}>
            <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">{s.label}</p>
                <p className="text-2xl md:text-3xl font-black" style={{ color: s.color }}>{s.value}</p>
            </div>
            <s.icon size={32} className="absolute -right-2 -bottom-2 opacity-[0.03] group-hover:opacity-[0.08] group-hover:-rotate-12 transition-all" style={{ color: s.color }} />
          </div>
        ))}
      </div>

      {/* Hero CTA */}
      <AnimatePresence>
      {dueCards.length > 0 && (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden p-0.5 rounded-[2rem] md:rounded-[2.5rem] bg-gradient-to-br from-[var(--primary-border)] to-transparent shadow-2xl">
            <div className="bg-[var(--card-bg,var(--app-bg))] rounded-[1.9rem] md:rounded-[2.4rem] p-6 md:p-10 flex flex-col md:flex-row items-center gap-6 md:gap-8">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl bg-[var(--primary-bg-subtle)] flex items-center justify-center border border-[var(--primary-border)] shadow-2xl shadow-[var(--primary-shadow)] shrink-0">
                    <Brain className="w-8 h-8 md:w-10 md:h-10 text-[var(--primary)] animate-pulse" />
                </div>
                <div className="flex-1 text-center md:text-left space-y-1 md:space-y-2">
                    <h3 className="text-xl md:text-2xl font-black leading-tight" style={{ color: "var(--app-fg)" }}>
                        {dueCards.length} Cards pendentes
                    </h3>
                    <p className="text-xs md:text-sm opacity-50 max-w-lg">
                        Sua curva de esquecimento está em ação. Revise agora para consolidar o conhecimento.
                    </p>
                </div>
                <div className="flex flex-col gap-3 w-full md:w-auto">
                    <button onClick={() => { setReviewFilter("due"); setMode("review"); }}
                        className="px-8 h-12 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)] hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2">
                        <Zap size={14} /> Começar Sessão
                    </button>
                    <button onClick={() => setHardMode(!hardMode)}
                        className={`px-8 h-10 rounded-2xl border font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all ${hardMode ? 'bg-[var(--primary-bg-subtle)] border-[var(--primary-border)] text-[var(--primary)]' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}`}>
                        🧠 {hardMode ? "Modo Difícil Ativo" : "Ativar Modo Difícil"}
                    </button>
                </div>
            </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Filter Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="p-2 rounded-xl bg-white/5 border border-white/5 mr-2">
            <Filter size={14} className="opacity-40" />
        </div>
        <button onClick={() => setFilterDisc(null)}
          className={`text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all border ${!filterDisc ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] shadow-lg shadow-[var(--primary-shadow)]' : 'bg-white/5 text-white/30 border-white/5 hover:bg-white/10'}`}>
          Todos
        </button>
        {disciplines.filter((d: any) => cards.some((c: any) => c.disciplineId === d.id)).map((d: any) => (
          <button key={d.id} onClick={() => setFilterDisc(filterDisc === d.id ? null : d.id)}
            className={`text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all border ${filterDisc === d.id ? 'text-white' : 'bg-white/5 text-white/30 border-white/5 hover:bg-white/10'}`}
            style={{ 
                backgroundColor: filterDisc === d.id ? d.color : undefined,
                borderColor: filterDisc === d.id ? d.color : undefined,
                boxShadow: filterDisc === d.id ? `0 8px 20px -6px ${d.color}60` : undefined
            }}>
            {d.name}
          </button>
        ))}
      </div>

      {/* Card Grid */}
      {filteredCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-6 rounded-[2.5rem] border-2 border-dashed border-white/5 bg-white/[0.01]">
            <Layers size={48} className="opacity-10" />
            <div className="text-center space-y-2">
                <p className="font-black text-xl opacity-40 uppercase tracking-widest">Nada por aqui</p>
                <p className="text-xs opacity-20 max-w-xs mx-auto">Sua coleção de flashcards aparecerá aqui. Comece criando o seu primeiro card de estudo.</p>
            </div>
            <button onClick={() => setMode("create")} className="px-8 py-3 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity">
                + Adicionar Card
            </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCards.map((card: any) => {
            const disc = disciplines.find((d: any) => d.id === card.disciplineId);
            const isDue = card.nextReviewDate <= today;
            return (
              <div key={card.id} className="soe-card p-6 flex flex-col gap-4 group hover:border-[var(--primary-border)] transition-colors">
                <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                        {disc && <CardBadge text={disc.name} color={disc.color} />}
                        {isDue && <CardBadge text="Revisar" color="var(--accent-amber)" />}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingCard(card); setMode("edit"); }} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all">
                            <Edit2 size={12} />
                        </button>
                        <button onClick={() => { if (confirm("Excluir definitivamente?")) deleteCard.mutate({ id: card.id }); }} className="p-2 rounded-lg bg-white/5 hover:bg-rose-500/20 text-white/40 hover:text-rose-500 transition-all">
                            <Trash2 size={12} />
                        </button>
                    </div>
                </div>
                
                <div className="flex-1 space-y-4">
                    <div className="space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-20">Frente</p>
                        <p className="text-sm font-bold leading-relaxed line-clamp-3" style={{ color: "var(--app-fg)" }} dangerouslySetInnerHTML={{ __html: card.front }} />
                    </div>
                    <div className="h-px bg-white/5 w-1/4" />
                    <div className="space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-20">Verso</p>
                        <p className="text-xs opacity-50 line-clamp-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: card.back }} />
                    </div>
                </div>

                <div className="pt-4 mt-2 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 opacity-30">
                        <RotateCcw size={10} />
                        <span className="text-[9px] font-black uppercase tracking-widest">{card.repetitions} evocações</span>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-30">Gap: {card.interval}d</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
