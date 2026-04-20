import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import {
  Plus, Trash2, Edit2, BookOpen, Brain, ChevronLeft, ChevronRight,
  Check, X, RotateCcw, Zap, Star, AlertTriangle, Eye, EyeOff,
  Filter, Layers,
} from "lucide-react";
import { format, parseISO, isToday, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";

type Mode = "list" | "review" | "create" | "edit";

function CardBadge({ text, color }: { text: string; color: string }) {
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {text}
    </span>
  );
}

// ── Review Session ─────────────────────────────────────────────────────────────
/**
 * F18 - Flashcard Hard Mode (sem dica)
 * Base científica (Cap 5.7): quanto mais esforço para evocar, maior a retenção.
 * "Provas abertas são mais eficazes que múltipla escolha" (Chaves).
 * No hard mode, a frente do card não mostra nenhum contexto além do tópico —
 * forçando máximo esforço cognitivo antes de revelar o verso.
 */
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

  // Must be called unconditionally (before any early return) — Rules of Hooks
  const { data: disciplines = [] } = trpc.discipline.list.useQuery();

  const card = cards[idx];

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-10, 10]);

  const handleRate = async (quality: number) => {
    await reviewCard.mutateAsync({ id: card.id, quality });
    const newResults = [...results, { id: card.id, q: quality }];
    setResults(newResults);
    
    // reset motion states
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
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
        <div className="p-6 rounded-2xl" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
          <Brain className="h-14 w-14 mx-auto" style={{ color: "var(--primary)" }} />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-black" style={{ color: "var(--app-fg)" }}>Sessão concluída!</h2>
          <p className="text-sm mt-1" style={{ color: "var(--muted-text)" }}>{results.length} flashcard{results.length !== 1 ? "s" : ""} revisado{results.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-4">
          <div className="text-center px-6 py-4 rounded-xl" style={{ background: "color-mix(in srgb, var(--accent-green) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-green) 30%, transparent)" }}>
            <p className="text-3xl font-black" style={{ color: "var(--accent-green)" }}>{passed}</p>
            <p className="text-xs mt-1" style={{ color: "var(--accent-green)" }}>Acertos</p>
          </div>
          <div className="text-center px-6 py-4 rounded-xl" style={{ background: "color-mix(in srgb, var(--accent-red) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)" }}>
            <p className="text-3xl font-black" style={{ color: "var(--accent-red)" }}>{failed}</p>
            <p className="text-xs mt-1" style={{ color: "var(--accent-red)" }}>Para reforçar</p>
          </div>
        </div>
        <button onClick={onDone}
          className="px-8 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-85 active:scale-95"
          style={{ background: "var(--primary)" }}>
          Voltar aos flashcards
        </button>
      </div>
    );
  }

  const disc = (disciplines as any[]).find((d: any) => d.id === card.disciplineId);

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto py-6 gap-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium" style={{ color: "var(--muted-text)" }}>{idx + 1} / {cards.length}</span>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--stat-bg)" }}>
          <div className="h-full rounded-full transition-all duration-300"
            style={{ width: `${((idx) / cards.length) * 100}%`, background: "var(--primary)" }} />
        </div>
      </div>

      {/* Card */}
      <div className="relative flex-1">
        <AnimatePresence>
          <motion.div
            key={card.id + (flipped ? "-back" : "-front")}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={1}
            onDragEnd={handleDragEnd}
            onClick={() => { if (!flipped) setFlipped(true); else setFlipped(false); }}
            className="flex-1 flex flex-col items-center justify-center rounded-2xl cursor-pointer transition-colors active:scale-[0.99] gap-4 p-8"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              x, rotate, zIndex: 100, position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              background: flipped ? "color-mix(in srgb, var(--primary) 6%, var(--card-bg, var(--app-bg)))" : "var(--card-bg, var(--app-bg))",
              border: `2px solid ${flipped ? "var(--primary)" : "var(--card-border)"}`,
            }}
          >
            {disc && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full self-start"
                style={{ background: `${disc.color}22`, color: disc.color }}>
                {disc.name}
              </span>
            )}
        <div className="text-center flex-1 flex flex-col items-center justify-center gap-3">
          <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--muted-text)" }}>
            {flipped ? "RESPOSTA" : hardMode && !flipped ? "MODO DIFÍCIL — EVOQUE SEM DICA" : "PERGUNTA"}
          </p>
          {/* F18: Hard mode hides the front text until user consciously tries to recall */}
          {hardMode && !flipped ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)", border: "2px dashed var(--primary)" }}>
                <Brain className="h-8 w-8" style={{ color: "var(--primary)" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--muted-text)" }}>
                Tente lembrar antes de virar o card.
              </p>
              <p className="text-xs text-center" style={{ color: "var(--muted-text)", maxWidth: 220 }}>
                Quanto mais esforço você fizer agora, mais forte fica a memória.
                (Bjork et al. — "desirable difficulty")
              </p>
            </div>
          ) : (
            <p className="text-xl font-semibold leading-relaxed" style={{ color: "var(--app-fg)" }}
              dangerouslySetInnerHTML={{ __html: flipped ? card.back : card.front }} />
          )}
        </div>
        <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--muted-text)" }}>
          {flipped ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {flipped ? "Clique para ver a pergunta" : hardMode ? "Clique para revelar (após tentar lembrar)" : "Clique para revelar a resposta"}
        </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Rating buttons */}
      {flipped ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => handleRate(1)}
            className="flex flex-col items-center gap-1 py-3 rounded-xl font-semibold transition-all hover:opacity-85 active:scale-95"
            style={{ background: "color-mix(in srgb, var(--accent-red) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-red) 35%, transparent)", color: "var(--accent-red)" }}>
            <X className="h-5 w-5" />
            <span className="text-xs">Errei / Não sei</span>
          </button>
          <button onClick={() => handleRate(3)}
            className="flex flex-col items-center gap-1 py-3 rounded-xl font-semibold transition-all hover:opacity-85 active:scale-95"
            style={{ background: "color-mix(in srgb, var(--accent-amber) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-amber) 35%, transparent)", color: "var(--accent-amber)" }}>
            <AlertTriangle className="h-5 w-5" />
            <span className="text-xs">Com dificuldade</span>
          </button>
          <button onClick={() => handleRate(4)}
            className="flex flex-col items-center gap-1 py-3 rounded-xl font-semibold transition-all hover:opacity-85 active:scale-95"
            style={{ background: "color-mix(in srgb, var(--accent-green) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-green) 35%, transparent)", color: "var(--accent-green)" }}>
            <Check className="h-5 w-5" />
            <span className="text-xs">Acertei</span>
          </button>
          <button onClick={() => handleRate(5)}
            className="flex flex-col items-center gap-1 py-3 rounded-xl font-semibold transition-all hover:opacity-85 active:scale-95"
            style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 35%, transparent)", color: "var(--primary)" }}>
            <Star className="h-5 w-5" />
            <span className="text-xs">Fácil demais</span>
          </button>
        </div>
      ) : (
        <button onClick={() => setFlipped(true)}
          className="w-full py-3.5 rounded-xl font-semibold text-white transition-all hover:opacity-85 active:scale-95"
          style={{ background: "var(--primary)" }}>
          Revelar resposta
        </button>
      )}
    </div>
  );
}

// ── Create / Edit Form ─────────────────────────────────────────────────────────
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
      toast.error("Preencha disciplina, frente e verso.");
      return;
    }
    onSave({ disciplineId: Number(disciplineId), topicId: topicId ? Number(topicId) : undefined, front: front.trim(), back: back.trim() });
  };

  const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" };

  return (
    <div className="max-w-2xl mx-auto space-y-4 py-4">
      <h2 className="text-lg font-bold" style={{ color: "var(--app-fg)" }}>{initial ? "Editar Flashcard" : "Novo Flashcard"}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted-text)" }}>Disciplina *</label>
          <select value={disciplineId} onChange={e => { setDisciplineId(e.target.value as any); setTopicId(""); }}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle}>
            <option value="">Selecionar...</option>
            {(disciplines as any[]).map((d: any) => <option key={d.id} value={d.id} style={{ background: "var(--input-bg)", color: "var(--app-fg)" }}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted-text)" }}>Tema (opcional)</label>
          <select value={topicId} onChange={e => setTopicId(e.target.value as any)} disabled={!disciplineId}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none disabled:opacity-40" style={inputStyle}>
            <option value="">Sem tema</option>
            {(topics as any[]).map((t: any) => <option key={t.id} value={t.id} style={{ background: "var(--input-bg)", color: "var(--app-fg)" }}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted-text)" }}>Frente (Pergunta) *</label>
        <textarea value={front} onChange={e => setFront(e.target.value)} rows={3}
          placeholder="Ex: O que é o Habeas Corpus?"
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
          style={inputStyle} />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted-text)" }}>Verso (Resposta) *</label>
        <textarea value={back} onChange={e => setBack(e.target.value)} rows={4}
          placeholder="Ex: Remédio constitucional que protege a liberdade de locomoção..."
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
          style={inputStyle} />
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}>
          Cancelar
        </button>
        <button onClick={handleSubmit}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: "var(--primary)" }}>
          {initial ? "Salvar alterações" : "Criar flashcard"}
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
  const [hardMode, setHardMode] = useState(false); // F18 - Modo difícil sem dica

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

  if (isLoading) return <div className="p-8 text-center" style={{ color: "var(--muted-text)" }}>Carregando...</div>;

  if (mode === "review") {
    if (reviewCards.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Check className="h-16 w-16" style={{ color: "var(--accent-green)" }} />
          <p className="text-xl font-bold" style={{ color: "var(--app-fg)" }}>Tudo em dia!</p>
          <p className="text-sm" style={{ color: "var(--muted-text)" }}>Nenhum flashcard para revisar agora.</p>
          <button onClick={() => setMode("list")} className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--primary)" }}>
            Voltar
          </button>
        </div>
      );
    }
    return (
      <div className="h-[calc(100vh-5rem)]">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setMode("list")} className="p-2 rounded-lg" style={{ color: "var(--muted-text)" }}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="font-bold text-lg" style={{ color: "var(--app-fg)" }}>Revisando {reviewCards.length} flashcard{reviewCards.length !== 1 ? "s" : ""}</h1>
          {/* F18 - Hard mode badge */}
          {hardMode && (
            <span className="ml-auto text-xs font-bold px-2 py-1 rounded-full"
              style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)", border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)" }}>
              🧠 Modo Difícil
            </span>
          )}
        </div>
        <ReviewSession cards={reviewCards} onDone={() => setMode("list")} hardMode={hardMode} />
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="pb-24 md:pb-0">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setMode("list")} className="p-2 rounded-lg" style={{ color: "var(--muted-text)" }}><ChevronLeft className="h-5 w-5" /></button>
          <h1 className="font-bold text-lg" style={{ color: "var(--app-fg)" }}>Novo Flashcard</h1>
        </div>
        <FlashcardForm onSave={(d) => createCard.mutate(d)} onCancel={() => setMode("list")} />
      </div>
    );
  }

  if (mode === "edit" && editingCard) {
    return (
      <div className="pb-24 md:pb-0">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setMode("list")} className="p-2 rounded-lg" style={{ color: "var(--muted-text)" }}><ChevronLeft className="h-5 w-5" /></button>
          <h1 className="font-bold text-lg" style={{ color: "var(--app-fg)" }}>Editar Flashcard</h1>
        </div>
        <FlashcardForm
          initial={editingCard}
          onSave={(d) => updateCard.mutate({ id: editingCard.id, front: d.front, back: d.back })}
          onCancel={() => setMode("list")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ color: "var(--app-fg)" }}>Flashcards</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-text)" }}>Revisão espaçada com algoritmo SM-2</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMode("create")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "var(--primary)" }}>
            <Plus className="h-4 w-4" /> Novo card
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: (cards as any[]).length, color: "var(--primary)" },
          { label: "Para revisar hoje", value: dueCards.length, color: dueCards.length > 0 ? "var(--accent-amber)" : "var(--accent-green)" },
          { label: "Dominados", value: (cards as any[]).filter((c: any) => c.interval >= 21).length, color: "var(--accent-green)" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-text)" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Review CTA */}
      {dueCards.length > 0 && (
        <div className="flex items-center justify-between p-4 rounded-2xl"
          style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)" }}>
          <div className="flex items-center gap-3">
            <Brain className="h-8 w-8" style={{ color: "var(--primary)" }} />
            <div>
              <p className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>{dueCards.length} flashcard{dueCards.length !== 1 ? "s" : ""} para revisar hoje</p>
              <p className="text-xs" style={{ color: "var(--muted-text)" }}>Não deixe a revisão acumular!</p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 items-end">
            <button onClick={() => { setReviewFilter("due"); setMode("review"); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: "var(--primary)" }}>
              <Zap className="h-4 w-4" /> Revisar agora
            </button>
            {/* F18 - Hard mode toggle */}
            <button
              onClick={() => setHardMode(h => !h)}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: hardMode ? "color-mix(in srgb, var(--primary) 20%, transparent)" : "transparent",
                color: hardMode ? "var(--primary)" : "var(--muted-text)",
                border: `1px solid ${hardMode ? "color-mix(in srgb, var(--primary) 40%, transparent)" : "var(--card-border)"}`,
              }}
              title="Modo Difícil: esconde o enunciado para forçar evocação pura (mais eficaz, segundo Bjork et al.)"
            >
              🧠 {hardMode ? "Modo difícil ON" : "Ativar modo difícil"}
            </button>
          </div>
        </div>
      )}

      {/* Filter + list header */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4" style={{ color: "var(--muted-text)" }} />
        <button onClick={() => setFilterDisc(null)}
          className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
          style={{
            background: !filterDisc ? "var(--primary)" : "var(--stat-bg)",
            color: !filterDisc ? "white" : "var(--muted-text)",
          }}>
          Todas
        </button>
        {(disciplines as any[]).filter((d: any) => filteredCards.some((c: any) => c.disciplineId === d.id)).map((d: any) => (
          <button key={d.id} onClick={() => setFilterDisc(filterDisc === d.id ? null : d.id)}
            className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
            style={{
              background: filterDisc === d.id ? d.color : "var(--stat-bg)",
              color: filterDisc === d.id ? "white" : "var(--muted-text)",
              border: `1px solid ${filterDisc === d.id ? d.color : "var(--card-border)"}`,
            }}>
            {d.name}
          </button>
        ))}
        {filteredCards.length > 0 && (
          <button onClick={() => { setReviewFilter("all"); setMode("review"); }}
            className="ml-auto text-xs px-3 py-1.5 rounded-full font-medium"
            style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--muted-text)" }}>
            Revisar filtro ({filteredCards.length})
          </button>
        )}
      </div>

      {/* Card list */}
      {filteredCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4"
          style={{ border: "2px dashed var(--card-border)", borderRadius: 16 }}>
          <Layers className="h-12 w-12" style={{ color: "var(--muted-text)", opacity: 0.3 }} />
          <p className="font-semibold" style={{ color: "var(--app-fg)" }}>Nenhum flashcard ainda</p>
          <p className="text-sm text-center max-w-xs" style={{ color: "var(--muted-text)" }}>
            Crie flashcards para revisar conteúdos usando repetição espaçada
          </p>
          <button onClick={() => setMode("create")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: "var(--primary)" }}>
            <Plus className="h-4 w-4" /> Criar primeiro flashcard
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredCards.map((card: any) => {
            const disc = (disciplines as any[]).find((d: any) => d.id === card.disciplineId);
            const isDue = card.nextReviewDate <= today;
            const daysUntil = Math.max(0, Math.ceil((new Date(card.nextReviewDate).getTime() - new Date(today).getTime()) / 86400000));
            return (
              <div key={card.id} className="rounded-xl p-4 space-y-3 transition-all"
                style={{
                  background: "var(--card-bg, var(--app-bg))",
                  border: `1px solid ${isDue ? "color-mix(in srgb, var(--accent-amber) 40%, var(--card-border))" : "var(--card-border)"}`,
                }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {disc && <CardBadge text={disc.name} color={disc.color} />}
                    {isDue
                      ? <CardBadge text="Revisar hoje" color="var(--accent-amber, #d97706)" />
                      : <CardBadge text={`Em ${daysUntil}d`} color="var(--accent-green, #16a34a)" />}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditingCard(card); setMode("edit"); }}
                      className="p-1.5 rounded-lg transition-all hover:opacity-60"
                      style={{ color: "var(--muted-text)" }}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => { if (confirm("Excluir flashcard?")) deleteCard.mutate({ id: card.id }); }}
                      className="p-1.5 rounded-lg transition-all hover:opacity-60"
                      style={{ color: "var(--accent-red, #dc2626)" }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "var(--muted-text)" }}>Frente</p>
                  <p className="text-sm font-medium line-clamp-2" style={{ color: "var(--app-fg)" }}
                    dangerouslySetInnerHTML={{ __html: card.front }} />
                </div>
                <div className="h-px" style={{ background: "var(--card-border)" }} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "var(--muted-text)" }}>Verso</p>
                  <p className="text-sm line-clamp-2" style={{ color: "var(--muted-text)" }}
                    dangerouslySetInnerHTML={{ __html: card.back }} />
                </div>
                <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--muted-text)" }}>
                  <RotateCcw className="h-3 w-3" />
                  <span>{card.repetitions} repetição{card.repetitions !== 1 ? "ões" : ""}</span>
                  <span>·</span>
                  <span>Intervalo: {card.interval}d</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
