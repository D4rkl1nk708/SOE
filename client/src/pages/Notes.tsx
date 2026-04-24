import { useState, useRef, useEffect, Fragment } from "react";
import { trpc } from "@/lib/trpc";
import {
  Search,
  Plus,
  FileText,
  Trash2,
  Upload,
  Sparkles,
  ChevronLeft,
  Bold,
  Italic,
  Underline,
  Highlighter,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  ImagePlus,
  Check,
  Clock,
  Download,
  ChevronRight,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

// ── Rich Text Editor Component ────────────────────────────────────────────────
function RichEditor({
  value,
  onChange,
  placeholder,
  onAiAction,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onAiAction: (action: any) => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const lastHtml = useRef(value);
  const [showAiMenu, setShowAiMenu] = useState(false);

  const handleAiAction = async (action: any) => {
    setShowAiMenu(false);
    const selection = window.getSelection()?.toString();
    if (!selection) {
      toast.error("Selecione um trecho do texto primeiro.");
      return;
    }
    const loadingId = toast.loading("IA processando...");
    try {
      await onAiAction({ action, text: selection });
      toast.dismiss(loadingId);
    } catch (err: any) {
      toast.dismiss(loadingId);
      toast.error(err.message || "Erro IA");
    }
  };

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
      lastHtml.current = value;
    }
  }, [value]);

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    ref.current?.focus();
    handleInput();
  };

  const handleInput = () => {
    const html = ref.current?.innerHTML ?? "";
    if (html !== lastHtml.current) {
      lastHtml.current = html;
      onChange(html);
    }
  };

  const insertImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      ref.current?.focus();
      document.execCommand("insertImage", false, src);
      handleInput();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const toolbarGroups = [
    [
      { icon: <Bold size={16} />, cmd: "bold", title: "Negrito" },
      { icon: <Italic size={16} />, cmd: "italic", title: "Itálico" },
      { icon: <Underline size={16} />, cmd: "underline", title: "Sublinhado" },
      {
        icon: <Highlighter size={16} />,
        cmd: "hiliteColor",
        val: "#fef08a",
        title: "Destacar",
      },
    ],
    [
      {
        icon: <span className="text-xs font-black">H1</span>,
        cmd: "formatBlock",
        val: "H2",
        title: "Título",
      },
      {
        icon: <span className="text-xs font-bold">H2</span>,
        cmd: "formatBlock",
        val: "H3",
        title: "Subtítulo",
      },
    ],
    [
      { icon: <List size={16} />, cmd: "insertUnorderedList", title: "Lista" },
      {
        icon: <ListOrdered size={16} />,
        cmd: "insertOrderedList",
        title: "Numerada",
      },
    ],
    [
      { icon: <AlignLeft size={16} />, cmd: "justifyLeft", title: "Esquerda" },
      {
        icon: <AlignCenter size={16} />,
        cmd: "justifyCenter",
        title: "Centro",
      },
    ],
  ];

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      <input
        ref={imgInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={insertImage}
      />

      {/* Premium Toolbar */}
      <div className="flex items-center gap-1 px-2 md:px-6 py-2 border-b border-white/5 bg-white/[0.01] relative">
        <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth mask-fade-right pr-12">
          {toolbarGroups.map((group, gi) => (
            <Fragment key={gi}>
              {gi > 0 && <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />}
              {group.map((btn) => (
                <button
                  key={btn.cmd + (btn.val ?? "")}
                  title={btn.title}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    exec(btn.cmd, btn.val);
                  }}
                  className="w-12 h-12 md:w-9 md:h-9 shrink-0 rounded-xl flex items-center justify-center hover:bg-white/10 text-white/40 hover:text-white transition-all active:scale-90"
                >
                  {btn.icon}
                </button>
              ))}
            </Fragment>
          ))}
          <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              imgInputRef.current?.click();
            }}
            className="w-12 h-12 md:w-9 md:h-9 shrink-0 rounded-xl flex items-center justify-center hover:bg-white/10 text-white/40 hover:text-white transition-all"
          >
            <ImagePlus size={16} />
          </button>
        </div>

        {/* AI Magic Button - Fixed on Right */}
        <div className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 flex items-center pl-4 bg-gradient-to-l from-[var(--app-bg)] via-[var(--app-bg)] to-transparent">
          <div className="relative">
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                setShowAiMenu(!showAiMenu);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-black uppercase tracking-widest shadow-lg shadow-[var(--primary-shadow)] hover:brightness-110 active:scale-95 transition-all"
            >
              <Sparkles size={14} />{" "}
              <span className="hidden sm:inline">IA</span>
            </button>

            <AnimatePresence>
              {showAiMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="absolute top-full right-0 mt-3 p-1.5 rounded-2xl shadow-2xl z-[100] w-52 bg-[var(--card-bg)] border border-white/10 backdrop-blur-3xl overflow-hidden"
                >
                  {[
                    { id: "summarize", label: "Resumir Seleção" },
                    { id: "improve", label: "Melhorar Escrita" },
                    { id: "explain", label: "Simplificar Conceito" },
                    { id: "autocomplete", label: "Expandir Ideia" },
                  ].map((a) => (
                    <button
                      key={a.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleAiAction(a.id as any);
                      }}
                      className="w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-white/5 transition-all opacity-60 hover:opacity-100"
                    >
                      {a.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar px-4 md:px-12 py-6">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleInput}
          className="w-full h-full min-h-[400px] text-base outline-none leading-loose selection:bg-[var(--primary-bg-subtle)]"
          style={{ color: "var(--app-fg)" }}
          data-placeholder={placeholder}
        />
        <style>{`
          .mask-fade-right { mask-image: linear-gradient(to right, black 85%, transparent 100%); }
          [contenteditable]::selection { background: var(--primary-bg-subtle); color: var(--primary); }
          [contenteditable]:empty:before { content: attr(data-placeholder); color: var(--muted-text); opacity: 0.3; pointer-events: none; }
          [contenteditable] h2 { font-size: 2em; font-weight: 950; margin: 1.5em 0 0.5em; color: var(--app-fg); letter-spacing: -0.03em; line-height: 1.1; }
          [contenteditable] h3 { font-size: 1.5em; font-weight: 800; margin: 1.2em 0 0.4em; color: var(--primary); letter-spacing: -0.01em; }
          [contenteditable] p { margin: 1em 0; line-height: 1.8; opacity: 0.8; font-size: 1.05em; }
          [contenteditable] b, [contenteditable] strong { font-weight: 800; color: var(--app-fg); }
          [contenteditable] img { max-width: 100%; border-radius: 1.5rem; margin: 2em 0; box-shadow: 0 20px 40px rgba(0,0,0,0.3); border: 1px solid var(--card-border); }
        `}</style>
      </div>
    </div>
  );
}

// ── Main Notes Page ────────────────────────────────────────────────────────────
export default function Notes() {
  const utils = trpc.useUtils();
  const { data: notes = [], isLoading } = trpc.note.list.useQuery();
  const { data: disciplines = [] } = trpc.discipline.list.useQuery();
  const { data: topicsData } = trpc.topic.list.useQuery({});
  const allTopics = (topicsData as any)?.topics ?? topicsData ?? [];

  const upsertNote = trpc.note.upsert.useMutation({
    onSuccess: () => {
      utils.note.list.invalidate();
    },
  });
  const deleteNote = trpc.note.delete.useMutation({
    onSuccess: () => {
      utils.note.list.invalidate();
      toast.success("Excluído.");
      setActiveNoteId(null);
    },
  });
  const generateFlashcardsMut = trpc.ai.generateFlashcardsFromText.useMutation({
    onSuccess: (data) => {
      toast.success(`${(data as any).createdCount} flashcards criados!`);
      utils.flashcard.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterDisciplineId, setFilterDisciplineId] = useState<number | null>(
    null,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDisciplineId, setNewDisciplineId] = useState<number | "">("");
  const [newTopicId, setNewTopicId] = useState<number | "">("");
  const importFileRef = useRef<HTMLInputElement>(null);

  const activeNote = notes.find((n) => n.id === activeNoteId);
  const [editorContent, setEditorContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const saveTimeout = useRef<any>(null);

  useEffect(() => {
    if (activeNote) {
      setEditorContent(activeNote.content);
      setIsDirty(false);
    }
  }, [activeNoteId]);

  const handleEditorChange = (content: string) => {
    setEditorContent(content);
    setIsDirty(true);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      if (activeNote) {
        upsertNote.mutate({
          id: activeNote.id,
          disciplineId: activeNote.disciplineId,
          topicId: activeNote.topicId ?? undefined,
          title: activeNote.title,
          content,
        });
        setIsDirty(false);
      }
    }, 1500);
  };

  const handleAiAction = async ({
    action,
    text,
  }: {
    action: string;
    text: string;
  }) => {
    const stats = await utils.dashboard.getStats.fetch();
    const apiKey = (stats?.settings as any)?.aiApiKey;
    const provider = (stats?.settings as any)?.aiProvider;

    const res = await (utils.client.ai.processText as any).mutate({
      action,
      text,
      apiKey,
      provider,
    });
    const newContent =
      editorContent + `\n\n<blockquote>${res.result}</blockquote>\n\n`;
    handleEditorChange(newContent);
  };

  const handleGenerateFlashcards = async () => {
    if (!activeNote) return;
    const stats = await utils.dashboard.getStats.fetch();
    const apiKey = (stats?.settings as any)?.aiApiKey;
    const provider = (stats?.settings as any)?.aiProvider;

    generateFlashcardsMut.mutate({
      text: editorContent.replace(/<[^>]+>/g, " "),
      disciplineId: activeNote.disciplineId,
      topicId: activeNote.topicId ?? undefined,
      noteId: activeNote.id,
      apiKey,
      provider,
    });
  };

  const handleCreate = () => {
    if (!newTitle || !newDisciplineId) return;
    upsertNote.mutate(
      {
        title: newTitle,
        disciplineId: Number(newDisciplineId),
        topicId: newTopicId ? Number(newTopicId) : undefined,
        content: "",
      },
      {
        onSuccess: (res: any) => {
          setIsCreating(false);
          setNewTitle("");
          setNewDisciplineId("");
          setNewTopicId("");
          setActiveNoteId(res.id);
        },
      },
    );
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast.info("Importando arquivo...");
    // Mock import logic - in reality would use a server endpoint to parse PDF/Docx
    const content = `[Importado de ${file.name}]\n\nConteúdo extraído do arquivo selecionado...`;
    handleCreate(); // This is simplified for the demo
  };

  const filteredNotes = notes.filter((n) => {
    const matchesSearch =
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase());
    const matchesDisc = filterDisciplineId
      ? n.disciplineId === filterDisciplineId
      : true;
    return matchesSearch && matchesDisc;
  });

  return (
    <div className="flex h-[calc(100vh-10.5rem)] md:h-[calc(100vh-4rem)] -mx-3 -mb-3 md:-mx-6 md:-mb-6 overflow-hidden bg-[var(--app-bg)] relative">
      {/* Sidebar */}
      <div
        className={`${activeNoteId ? "hidden md:flex" : "flex"} flex flex-col w-full md:w-[320px] shrink-0 border-r border-white/5 bg-white/[0.01] backdrop-blur-3xl transition-all`}
      >
        <div className="p-4 md:p-6 space-y-4 md:space-y-6">
          <div className="flex items-center justify-between">
            <h1
              className="text-xl font-black tracking-tight"
              style={{ color: "var(--app-fg)" }}
            >
              Anotações
            </h1>
            <button
              onClick={() => setIsCreating(true)}
              className="w-10 h-10 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-shadow)] active:scale-95 transition-all flex items-center justify-center"
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 opacity-20"
              size={14}
            />
            <input
              placeholder="Buscar no acervo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-3 rounded-2xl text-xs outline-none bg-white/5 border border-white/5 focus:border-[var(--primary-border)] transition-all"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => setFilterDisciplineId(null)}
              className={`text-[9px] shrink-0 font-black uppercase tracking-widest px-4 py-2 rounded-xl border transition-all ${!filterDisciplineId ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]" : "bg-white/5 text-white/30 border-white/5"}`}
            >
              Todos
            </button>
            {disciplines
              .filter((d: any) =>
                notes.some((n: any) => n.disciplineId === d.id),
              )
              .map((d: any) => (
                <button
                  key={d.id}
                  onClick={() => setFilterDisciplineId(d.id)}
                  className={`text-[9px] shrink-0 font-black uppercase tracking-widest px-4 py-2 rounded-xl border transition-all ${filterDisciplineId === d.id ? "text-white" : "text-white/30 border-white/5"}`}
                  style={{
                    backgroundColor:
                      filterDisciplineId === d.id ? d.color : undefined,
                    borderColor:
                      filterDisciplineId === d.id ? d.color : undefined,
                  }}
                >
                  {d.name.split(" ")[0]}
                </button>
              ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-2 custom-scrollbar pb-20">
          {filteredNotes.map((note) => {
            const disc = disciplines.find(
              (d: any) => d.id === note.disciplineId,
            );
            const isActive = activeNoteId === note.id;
            return (
              <div
                key={note.id}
                onClick={() => setActiveNoteId(note.id)}
                className={`group p-4 rounded-2xl cursor-pointer transition-all border ${isActive ? "bg-[var(--primary-bg-subtle)] border-[var(--primary-border)] shadow-inner" : "border-transparent hover:bg-white/5"}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {disc && (
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: disc.color }}
                    />
                  )}
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-40">
                    {disc?.name || "Geral"}
                  </span>
                  <span className="ml-auto text-[8px] font-black opacity-20">
                    {format(parseISO(note.updatedAt), "dd/MM", {
                      locale: ptBR,
                    })}
                  </span>
                </div>
                <h3
                  className={`text-xs font-black truncate ${isActive ? "text-[var(--primary)]" : "text-white/80"}`}
                >
                  {note.title}
                </h3>
                <p className="text-[10px] mt-1 opacity-30 line-clamp-1 leading-relaxed">
                  {note.content.replace(/<[^>]+>/g, " ").trim() || "Vazio"}
                </p>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-white/5 mt-auto">
          <button
            onClick={() => {
              setIsCreating(true);
              importFileRef.current?.click();
            }}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-white/5 text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-all active:scale-[0.98]"
          >
            <Upload size={14} /> Importar Arquivo
          </button>
        </div>
      </div>

      {/* Main Area / Editor */}
      <main className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden">
        {activeNote ? (
          <>
            <div className="px-4 md:px-8 py-3 md:py-4 border-b border-white/5 flex items-center justify-between gap-2 md:gap-6 backdrop-blur-md">
              <div className="flex-1 flex items-center gap-2 md:gap-4 min-w-0">
                <button
                  onClick={() => setActiveNoteId(null)}
                  className="md:hidden p-3 rounded-xl bg-white/5 text-[var(--primary)] shrink-0"
                >
                  <ChevronLeft size={20} />
                </button>
                <input
                  value={(activeNote as any).title}
                  onChange={(e) => {
                    const newT = e.target.value;
                    upsertNote.mutate({
                      id: (activeNote as any).id,
                      disciplineId: (activeNote as any).disciplineId,
                      topicId: (activeNote as any).topicId ?? undefined,
                      title: newT,
                      content: editorContent,
                    });
                  }}
                  className="bg-transparent border-none outline-none w-full text-base md:text-2xl font-black tracking-tight text-[var(--app-fg)]"
                />
              </div>

              <div className="flex items-center gap-2 md:gap-3 shrink-0">
                <div className="hidden xs:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/5">
                  {isDirty ? (
                    <Clock size={12} className="text-amber-500 animate-pulse" />
                  ) : (
                    <Check size={12} className="text-[var(--accent-green)]" />
                  )}
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-40">
                    {isDirty ? "..." : "Ok"}
                  </span>
                </div>
                <button
                  onClick={handleGenerateFlashcards}
                  disabled={generateFlashcardsMut.isPending}
                  className="p-3.5 md:px-4 md:py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-shadow)] active:scale-90 transition-all"
                >
                  <Sparkles size={18} />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Excluir anotação?"))
                      deleteNote.mutate({ id: (activeNote as any).id });
                  }}
                  className="p-3.5 rounded-xl hover:bg-rose-500/10 text-white/20 hover:text-rose-500 transition-all active:scale-90"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <RichEditor
                key={(activeNote as any).id}
                value={editorContent}
                onChange={handleEditorChange}
                onAiAction={handleAiAction}
                placeholder="Comece a escrever..."
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 text-center">
            <div className="relative mb-10">
              <div className="absolute inset-0 bg-[var(--primary)] blur-3xl opacity-10 animate-pulse" />
              <div className="relative p-10 rounded-[3.5rem] bg-white/[0.02] border border-white/5 shadow-2xl">
                <FileText size={64} className="text-white/10" />
              </div>
            </div>
            <div className="space-y-4 mb-10 max-w-xs mx-auto">
              <h2
                className="text-2xl md:text-3xl font-black tracking-tight"
                style={{ color: "var(--app-fg)" }}
              >
                Sua Biblioteca Mental
              </h2>
              <p className="text-xs md:text-sm opacity-30 leading-relaxed">
                Organize seus conhecimentos em resumos ricos e deixe a IA
                transformar tudo em flashcards automaticamente.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-[280px] sm:max-w-none justify-center">
              <button
                onClick={() => setIsCreating(true)}
                className="px-8 py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest shadow-2xl shadow-[var(--primary-shadow)] hover:brightness-110 active:scale-95 transition-all"
              >
                + Nova Anotação
              </button>
              <button
                onClick={() => {
                  setIsCreating(true);
                  importFileRef.current?.click();
                }}
                className="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 font-black text-xs uppercase tracking-widest opacity-60 hover:opacity-100 transition-all"
              >
                <Upload size={14} className="inline mr-2" /> Importar
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Creation Modal */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-lg">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-[var(--card-bg)] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-6 md:p-10 space-y-8">
                <div className="flex items-center justify-between">
                  <h2
                    className="text-2xl font-black tracking-tight"
                    style={{ color: "var(--app-fg)" }}
                  >
                    Novo Documento
                  </h2>
                  <button
                    onClick={() => setIsCreating(false)}
                    className="p-3 rounded-2xl bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-500 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">
                      Título do Resumo
                    </label>
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Ex: Controle de Constitucionalidade"
                      className="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-sm outline-none focus:border-[var(--primary-border)] transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">
                        Disciplina
                      </label>
                      <select
                        value={newDisciplineId}
                        onChange={(e) =>
                          setNewDisciplineId(e.target.value as any)
                        }
                        className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-[11px] font-bold outline-none focus:border-[var(--primary-border)] appearance-none cursor-pointer"
                      >
                        <option value="">Selecionar...</option>
                        {disciplines.map((d: any) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">
                        Tema Relacionado
                      </label>
                      <select
                        value={newTopicId}
                        onChange={(e) => setNewTopicId(e.target.value as any)}
                        disabled={!newDisciplineId}
                        className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-[11px] font-bold outline-none focus:border-[var(--primary-border)] appearance-none disabled:opacity-20 cursor-pointer"
                      >
                        <option value="">Nenhum</option>
                        {allTopics
                          .filter(
                            (t: any) =>
                              t.disciplineId === Number(newDisciplineId),
                          )
                          .map((t: any) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleCreate}
                    disabled={!newTitle.trim() || !newDisciplineId}
                    className="w-full py-5 rounded-[1.5rem] bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest shadow-2xl shadow-[var(--primary-shadow)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-20 disabled:grayscale"
                  >
                    Criar Documento
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <input
        ref={importFileRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        className="hidden"
        onChange={handleImportFile}
      />
    </div>
  );
}
