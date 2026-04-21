import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  FileText, Plus, Search, Trash2, ChevronRight, ChevronDown,
  Bold, Italic, Underline, List, ListOrdered, Highlighter,
  AlignLeft, AlignCenter, AlignRight, Minus, BookOpen, Tag,
  Save, Clock, FolderOpen, X, PenLine, ImagePlus, Upload, FileUp,
  Link as LinkIcon, Wand2, Sparkles, History, Layout, Filter,
  Maximize2, Minimize2, MoreHorizontal, GraduationCap
} from "lucide-react";
import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Google Docs / DOCX Importer ───────────────────────────────────────────────
async function importDocxFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const uint8 = new Uint8Array(arrayBuffer);
        const text = await extractDocxText(uint8);
        resolve(text);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function extractDocxText(data: Uint8Array): Promise<string> {
  try {
    const target = "word/document.xml";
    let i = 0;
    while (i < data.length - 4) {
      if (data[i] === 0x50 && data[i+1] === 0x4b && data[i+2] === 0x03 && data[i+3] === 0x04) {
        const compMethod = data[i+8] | (data[i+9] << 8);
        const compSize   = data[i+18] | (data[i+19] << 8) | (data[i+20] << 16) | (data[i+21] << 24);
        const fnLen      = data[i+26] | (data[i+27] << 8);
        const extraLen   = data[i+28] | (data[i+29] << 8);
        const fnStart    = i + 30;
        const fnEnd      = fnStart + fnLen;
        const dataStart  = fnEnd + extraLen;
        const fname = new TextDecoder().decode(data.slice(fnStart, fnEnd));
        if (fname === target) {
          const compData = data.slice(dataStart, dataStart + compSize);
          let xmlText = "";
          if (compMethod === 0) xmlText = new TextDecoder("utf-8").decode(compData);
          else if (compMethod === 8) {
            const ds = new DecompressionStream("deflate-raw");
            const writer = ds.writable.getWriter();
            const readr = ds.readable.getReader();
            writer.write(compData); writer.close();
            const chunks: Uint8Array[] = [];
            while (true) {
              const { done, value } = await readr.read();
              if (done) break; chunks.push(value);
            }
            const total = chunks.reduce((s, c) => s + c.length, 0);
            const merged = new Uint8Array(total);
            let off = 0; for (const c of chunks) { merged.set(c, off); off += c.length; }
            xmlText = new TextDecoder("utf-8").decode(merged);
          }
          return xmlToHtml(xmlText);
        }
        i = dataStart + Math.max(compSize, 0);
      } else i++;
    }
    return "<p>Erro na extração.</p>";
  } catch { return "<p>Erro ao ler Word.</p>"; }
}

function xmlToHtml(xml: string): string {
  const stripped = xml.replace(/<\/?w:([a-zA-Z]+)[^>]*>/g, (_, tag) => {
    const tagLow = tag.toLowerCase();
    if (tagLow === "p") return "\n<p>";
    if (tagLow === "/p") return "</p>";
    if (tagLow === "r") return "";
    if (tagLow === "/r") return "";
    if (tagLow === "t") return "";
    if (tagLow === "/t") return "";
    if (tagLow === "br") return "<br>";
    if (tagLow === "b") return "<strong>";
    if (tagLow === "/b") return "</strong>";
    if (tagLow === "i") return "<em>";
    if (tagLow === "/i") return "</em>";
    if (tagLow === "u") return "<u>";
    if (tagLow === "/u") return "</u>";
    return "";
  });
  return stripped.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').split("\n").map(l => l.trim()).filter(l => l.length > 0).map(l => `<p>${l}</p>`).join("\n") || "<p></p>";
}

async function importPdfFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (!(window as any).pdfjsLib) {
          await new Promise<void>((res, rej) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            script.onload = () => res();
            script.onerror = () => rej(new Error("PDF.js falhou"));
            document.head.appendChild(script);
          });
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pageTexts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((item: any) => item.str + (item.hasEOL ? "\n" : "")).join(" ").replace(/ {2,}/g, " ").trim();
          if (pageText) pageTexts.push(pageText);
        }
        resolve(pageTexts.map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`).join("\n") || "<p>PDF sem texto.</p>");
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ── Rich Editor ──────────────────────────────────────────────────────────────
function RichEditor({
  value, onChange, placeholder = "Comece a escrever seu resumo imersivo...", onAiAction
}: {
  value: string; onChange: (html: string) => void; placeholder?: string;
  onAiAction?: (action: "summarize" | "improve" | "explain" | "autocomplete", text: string) => Promise<string>;
}) {
  const [showAiMenu, setShowAiMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lastHtml = useRef(value);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const handleAiAction = async (action: "summarize" | "improve" | "explain" | "autocomplete") => {
    setShowAiMenu(false);
    const selection = window.getSelection();
    const text = selection?.toString();
    if (!text?.trim()) { toast.error("Selecione um texto para usar a IA."); return; }
    if (onAiAction) {
      const loadingId = toast.loading("Refinando conhecimento...");
      try {
        const result = await onAiAction(action, text);
        document.execCommand("insertText", false, result);
        handleInput();
        toast.dismiss(loadingId);
        toast.success("Texto atualizado!");
      } catch (err: any) { toast.dismiss(loadingId); toast.error(err.message || "Erro IA"); }
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
    if (html !== lastHtml.current) { lastHtml.current = html; onChange(html); }
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

  const toolbar = [
    [
      { icon: <Bold size={14} />, cmd: "bold", title: "Negrito" },
      { icon: <Italic size={14} />, cmd: "italic", title: "Itálico" },
      { icon: <Underline size={14} />, cmd: "underline", title: "Sublinhado" },
      { icon: <Highlighter size={14} />, cmd: "hiliteColor", val: "#fef08a", title: "Destacar" },
    ],
    [
      { icon: <span className="text-[10px] font-black">H1</span>, cmd: "formatBlock", val: "H2", title: "Título" },
      { icon: <span className="text-[10px] font-bold">H2</span>, cmd: "formatBlock", val: "H3", title: "Subtítulo" },
    ],
    [
      { icon: <List size={14} />, cmd: "insertUnorderedList", title: "Lista" },
      { icon: <ListOrdered size={14} />, cmd: "insertOrderedList", title: "Numerada" },
    ],
    [
      { icon: <AlignLeft size={14} />, cmd: "justifyLeft", title: "Esquerda" },
      { icon: <AlignCenter size={14} />, cmd: "justifyCenter", title: "Centro" },
    ],
  ];

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={insertImage} />
      
      {/* Premium Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 px-6 py-3 border-b border-white/5 bg-white/[0.01]">
        {toolbar.map((group, gi) => (
          <Fragment key={gi}>
            {gi > 0 && <div className="w-px h-4 bg-white/5 mx-1" />}
            {group.map((btn) => (
              <button key={btn.cmd + (btn.val ?? "")} title={btn.title}
                onMouseDown={(e) => { e.preventDefault(); exec(btn.cmd, btn.val); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 text-white/40 hover:text-white transition-all active:scale-95">
                {btn.icon}
              </button>
            ))}
          </Fragment>
        ))}
        <div className="w-px h-4 bg-white/5 mx-1" />
        <button onMouseDown={(e) => { e.preventDefault(); imgInputRef.current?.click(); }}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 text-white/40 hover:text-white transition-all">
          <ImagePlus size={14} />
        </button>

        {/* AI Magic Button */}
        <div className="relative ml-auto">
          <button onMouseDown={(e) => { e.preventDefault(); setShowAiMenu(!showAiMenu); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--primary-bg-subtle)] border border-[var(--primary-border)] text-[10px] font-black uppercase tracking-widest text-[var(--primary)] shadow-lg shadow-[var(--primary-shadow)] hover:opacity-80 transition-all">
            <Sparkles size={12} /> Refinar com IA
          </button>
          
          <AnimatePresence>
          {showAiMenu && (
            <div className="absolute top-full right-0 mt-2 p-1.5 rounded-2xl shadow-2xl z-50 flex flex-col gap-1 w-48 bg-[var(--card-bg,var(--app-bg))] border border-white/5 overflow-hidden">
              {[
                { id: "summarize", label: "Resumir Seleção" },
                { id: "improve", label: "Melhorar Escrita" },
                { id: "explain", label: "Simplificar Conceito" },
                { id: "autocomplete", label: "Expandir Ideia" },
              ].map(a => (
                <button key={a.id} onMouseDown={(e) => { e.preventDefault(); handleAiAction(a.id as any); }}
                  className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-white/5 transition-all opacity-60 hover:opacity-100">
                  {a.label}
                </button>
              ))}
            </div>
          )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar px-6 md:px-12 py-8">
        <div
          ref={ref} contentEditable suppressContentEditableWarning
          onInput={handleInput} onKeyDown={handleInput}
          className="w-full h-full min-h-[400px] text-base outline-none leading-loose selection:bg-[var(--primary-bg-subtle)]"
          style={{ color: "var(--app-fg)" }}
          data-placeholder={placeholder}
        />
        <style>{`
          [contenteditable]::selection { background: var(--primary-bg-subtle); color: var(--primary); }
          [contenteditable]:empty:before { content: attr(data-placeholder); color: var(--muted-text); opacity: 0.3; pointer-events: none; }
          [contenteditable] h2 { font-size: 2.2em; font-weight: 950; margin: 1.5em 0 0.5em; color: var(--app-fg); letter-spacing: -0.03em; line-height: 1.1; }
          [contenteditable] h3 { font-size: 1.6em; font-weight: 800; margin: 1.2em 0 0.4em; color: var(--primary); letter-spacing: -0.01em; }
          [contenteditable] p { margin: 1em 0; line-height: 1.8; opacity: 0.8; font-size: 1.05em; }
          [contenteditable] b, [contenteditable] strong { font-weight: 800; color: var(--app-fg); }
          [contenteditable] img { max-width: 100%; border-radius: 2rem; margin: 2.5em 0; box-shadow: 0 30px 60px -12px rgba(0,0,0,0.5); border: 1px solid var(--card-border); transition: transform 0.3s ease; }
          [contenteditable] img:hover { transform: scale(1.01); }
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

  const upsertNote = trpc.note.upsert.useMutation({ onSuccess: () => { utils.note.list.invalidate(); } });
  const deleteNote = trpc.note.delete.useMutation({ onSuccess: () => { utils.note.list.invalidate(); toast.success("Excluído."); setActiveNoteId(null); } });

  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterDisciplineId, setFilterDisciplineId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDisciplineId, setNewDisciplineId] = useState<number | "">("");
  const [newTopicId, setNewTopicId] = useState<number | "">("");
  const [editorContent, setEditorContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importedContent, setImportedContent] = useState("");
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const aiApiKey = (stats?.settings as any)?.aiApiKey ?? "";
  const aiProvider = (stats?.settings as any)?.aiProvider ?? "gemini";

  const processTextMut = trpc.ai.processText.useMutation();
  const handleAiAction = async (action: "summarize" | "improve" | "explain" | "autocomplete", text: string) => {
    if (!aiApiKey) throw new Error("Configure API Keys no Perfil.");
    const res = await processTextMut.mutateAsync({ text, action, apiKey: aiApiKey, provider: aiProvider as any });
    return res.result;
  };

  const generateFlashcardsMut = trpc.ai.generateFlashcardsFromText.useMutation();
  const handleGenerateFlashcards = async () => {
    if (!aiApiKey) { toast.error("Configure API Keys no Perfil."); return; }
    if (!activeNote || !editorContent.trim()) return;
    const text = editorContent.replace(/<[^>]+>/g, " ").trim();
    if (text.length < 50) { toast.error("Texto curto demais."); return; }
    const loadingId = toast.loading("Lendo seu resumo e gerando flashcards...");
    try {
      await generateFlashcardsMut.mutateAsync({ text, disciplineId: (activeNote as any).disciplineId, topicId: (activeNote as any).topicId ?? undefined, noteId: (activeNote as any).id, apiKey: aiApiKey, provider: aiProvider as any });
      toast.dismiss(loadingId);
      toast.success("✨ Mágica! Flashcards gerados na aba de Revisão.");
    } catch (e: any) { toast.dismiss(loadingId); toast.error("Erro na geração."); }
  };

  const activeNote = useMemo(() => notes.find((n: any) => n.id === activeNoteId), [notes, activeNoteId]);

  useEffect(() => {
    if (activeNote) { setEditorContent((activeNote as any).content); setIsDirty(false); }
  }, [(activeNote as any)?.id]);

  const handleEditorChange = useCallback((html: string) => {
    setEditorContent(html); setIsDirty(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!activeNote) return;
      const n = activeNote as any;
      await upsertNote.mutateAsync({ id: n.id, disciplineId: n.disciplineId, topicId: n.topicId ?? undefined, title: n.title, content: html });
      setIsDirty(false); setLastSaved(new Date());
    }, 2000);
  }, [activeNote]);

  const filteredNotes = useMemo(() => {
    let list = notes as any[];
    if (filterDisciplineId) list = list.filter((n: any) => n.disciplineId === filterDisciplineId);
    if (search) list = list.filter((n: any) => n.title.toLowerCase().includes(search.toLowerCase()) || n.content.replace(/<[^>]+>/g, "").toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [notes, filterDisciplineId, search]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newDisciplineId) { toast.error("Preencha o título."); return; }
    const result = await upsertNote.mutateAsync({ disciplineId: Number(newDisciplineId), topicId: newTopicId ? Number(newTopicId) : undefined, title: newTitle.trim(), content: importedContent || "" });
    await utils.note.list.invalidate();
    setIsCreating(false); setNewTitle(""); setNewDisciplineId(""); setNewTopicId(""); setImportedContent("");
    toast.success("Anotação criada!");
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setIsImporting(true);
    try {
      let html = "";
      if (file.name.endsWith(".docx") || file.name.endsWith(".doc")) html = await importDocxFile(file);
      else if (file.name.endsWith(".txt")) html = `<p>${(await file.text()).replace(/\n/g, "<br>")}</p>`;
      else if (file.name.endsWith(".pdf")) html = await importPdfFile(file);
      setNewTitle(file.name.replace(/\.[^/.]+$/, "")); setImportedContent(html);
      toast.success("Importado com sucesso!");
    } catch { toast.error("Erro na importação."); } finally { setIsImporting(false); }
  };

  const activeDiscipline = disciplines.find((d: any) => d.id === (activeNote as any)?.disciplineId);
  const activeTopic = allTopics.find((t: any) => t.id === (activeNote as any)?.topicId);

  return (
    <div className="flex h-[calc(100vh-4rem)] -mx-4 -mb-4 overflow-hidden bg-[var(--app-bg)]">
      {/* Glassmorphism Sidebar */}
      <div className={`${activeNoteId && "hidden md:flex"} flex flex-col w-[320px] shrink-0 border-r border-white/5 bg-white/[0.01] backdrop-blur-3xl`}>
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--app-fg)" }}>Notes</h1>
                <button onClick={() => setIsCreating(true)} className="p-2 rounded-xl bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary-shadow)] active:scale-95 transition-all">
                    <Plus size={18} />
                </button>
            </div>
            
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-20" size={14} />
                <input placeholder="Buscar no acervo..." value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs outline-none bg-white/5 border border-white/5 focus:border-[var(--primary-border)] transition-all" />
            </div>

            <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setFilterDisciplineId(null)}
                    className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${!filterDisciplineId ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white/5 text-white/30 border-white/5'}`}>
                    Todos
                </button>
                {disciplines.filter((d: any) => notes.some((n: any) => n.disciplineId === d.id)).map((d: any) => (
                    <button key={d.id} onClick={() => setFilterDisciplineId(d.id)}
                        className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${filterDisciplineId === d.id ? 'text-white' : 'text-white/30 border-white/5'}`}
                        style={{ backgroundColor: filterDisciplineId === d.id ? d.color : undefined, borderColor: filterDisciplineId === d.id ? d.color : undefined }}>
                        {d.name.split(" ")[0]}
                    </button>
                ))}
            </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-2 custom-scrollbar">
            {filteredNotes.map(note => {
                const disc = disciplines.find((d: any) => d.id === note.disciplineId);
                const isActive = activeNoteId === note.id;
                return (
                    <div key={note.id} onClick={() => setActiveNoteId(note.id)}
                        className={`group p-4 rounded-2xl cursor-pointer transition-all border ${isActive ? 'bg-[var(--primary-bg-subtle)] border-[var(--primary-border)]' : 'border-transparent hover:bg-white/5'}`}>
                        <div className="flex items-center gap-2 mb-2">
                            {disc && <div className="w-1.5 h-1.5 rounded-full" style={{ background: disc.color }} />}
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-40">{disc?.name || "Geral"}</span>
                            <span className="ml-auto text-[8px] font-black opacity-20">{format(parseISO(note.updatedAt), "dd/MM", { locale: ptBR })}</span>
                        </div>
                        <h3 className={`text-xs font-black truncate ${isActive ? 'text-[var(--primary)]' : 'text-white/80'}`}>{note.title}</h3>
                        <p className="text-[10px] mt-1 opacity-30 line-clamp-1 leading-relaxed">{note.content.replace(/<[^>]+>/g, " ").trim() || "Vazio"}</p>
                    </div>
                );
            })}
        </div>

        <div className="p-4 border-t border-white/5">
            <button onClick={() => { setIsCreating(true); importFileRef.current?.click(); }} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/10 text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-all">
                <Upload size={14} /> Importar Arquivo
            </button>
        </div>
      </div>

      {/* Editor Arena */}
      <main className="flex-1 flex flex-col min-w-0 bg-transparent">
        {activeNote ? (
            <>
                {/* Immersive Editor Top Bar */}
                <div className="px-8 py-4 border-b border-white/5 flex items-center justify-between gap-6">
                    <div className="flex-1 flex items-center gap-4 min-w-0">
                        <button onClick={() => setActiveNoteId(null)} className="md:hidden p-2 rounded-xl bg-white/5"><ChevronLeft size={18} /></button>
                        <div className="flex-1 min-w-0">
                            <input value={(activeNote as any).title} onChange={e => {
                                const newT = e.target.value;
                                upsertNote.mutate({ id: (activeNote as any).id, disciplineId: (activeNote as any).disciplineId, topicId: (activeNote as any).topicId ?? undefined, title: newT, content: editorContent });
                            }} className="bg-transparent border-none outline-none w-full text-2xl font-black tracking-tight text-[var(--app-fg)]" />
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
                            {isDirty ? <Clock size={12} className="text-amber-500 animate-pulse" /> : <ShieldCheck size={12} className="text-[var(--accent-green)]" />}
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-40">{isDirty ? "Salvando..." : "Sincronizado"}</span>
                        </div>
                        <button onClick={handleGenerateFlashcards} disabled={generateFlashcardsMut.isPending}
                            className="relative group overflow-hidden px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--accent-blue)] text-white shadow-xl shadow-[var(--primary-shadow)] hover:scale-105 active:scale-95 transition-all">
                            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                            <div className="flex items-center gap-2 relative">
                                <Sparkles size={14} className="animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Gerar Cards</span>
                            </div>
                        </button>
                        <button onClick={() => { if (confirm("Excluir anotação?")) deleteNote.mutate({ id: (activeNote as any).id }); }}
                            className="p-2.5 rounded-xl hover:bg-rose-500/10 text-white/20 hover:text-rose-500 transition-all">
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden">
                    <RichEditor key={(activeNote as any).id} value={editorContent} onChange={handleEditorChange} onAiAction={handleAiAction} />
                </div>
            </>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-10 p-12 text-center">
                <div className="relative">
                    <div className="absolute inset-0 bg-[var(--primary)] blur-3xl opacity-10 animate-pulse" />
                    <div className="relative p-10 rounded-[3rem] bg-white/[0.02] border border-white/5 shadow-2xl">
                        <FileText size={60} className="text-white/10" />
                    </div>
                </div>
                <div className="space-y-3">
                    <h2 className="text-3xl font-black" style={{ color: "var(--app-fg)" }}>Sua Biblioteca Mental</h2>
                    <p className="text-sm opacity-30 max-w-sm mx-auto leading-relaxed">Organize seus conhecimentos em resumos ricos e deixe a IA transformar tudo em flashcards automaticamente.</p>
                </div>
                <div className="flex gap-4">
                    <button onClick={() => setIsCreating(true)} className="px-8 py-4 rounded-2xl bg-[var(--primary)] text-white font-black text-xs uppercase tracking-widest shadow-2xl shadow-[var(--primary-shadow)] hover:opacity-90 active:scale-95 transition-all">
                        + Nova Anotação
                    </button>
                    <button onClick={() => { setIsCreating(true); importFileRef.current?.click(); }} className="px-8 py-4 rounded-2xl bg-white/5 border border-white/5 font-black text-xs uppercase tracking-widest opacity-60 hover:opacity-100 transition-all">
                        <Upload size={14} className="inline mr-2" /> Importar
                    </button>
                </div>
            </div>
        )}
      </main>

      {/* Modal Nova Anotação */}
      {isCreating && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
              <div className="w-full max-w-md bg-[var(--app-bg)] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-8 space-y-6">
                      <div className="flex items-center justify-between">
                          <h2 className="text-xl font-black" style={{ color: "var(--app-fg)" }}>Criar Documento</h2>
                          <button onClick={() => setIsCreating(false)} className="p-2 rounded-xl hover:bg-white/5 opacity-40"><X size={20} /></button>
                      </div>

                      <div className="space-y-4">
                          <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Título</label>
                              <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                                  className="w-full px-4 py-3.5 rounded-2xl bg-white/5 border border-white/5 text-sm outline-none focus:border-[var(--primary-border)] transition-all" />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Disciplina</label>
                                  <select value={newDisciplineId} onChange={e => setNewDisciplineId(e.target.value as any)}
                                      className="w-full px-4 py-3.5 rounded-2xl bg-white/5 border border-white/5 text-xs outline-none">
                                      <option value="">Selecionar...</option>
                                      {disciplines.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                  </select>
                              </div>
                              <div className="space-y-1.5">
                                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Tema (Opcional)</label>
                                  <select value={newTopicId} onChange={e => setNewTopicId(e.target.value as any)} disabled={!newDisciplineId}
                                      className="w-full px-4 py-3.5 rounded-2xl bg-white/5 border border-white/5 text-xs outline-none disabled:opacity-20">
                                      <option value="">Nenhum</option>
                                      {allTopics.filter((t: any) => t.disciplineId === Number(newDisciplineId)).map((t: any) => (
                                          <option key={t.id} value={t.id}>{t.name}</option>
                                      ))}
                                  </select>
                              </div>
                          </div>
                      </div>

                      <div className="flex gap-3 pt-4">
                          <button onClick={() => setIsCreating(false)} className="flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 opacity-40">Cancelar</button>
                          <button onClick={handleCreate} disabled={!newTitle.trim() || !newDisciplineId}
                              className="flex-1 py-4 rounded-2xl bg-[var(--primary)] text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)] transition-all disabled:opacity-20">
                              Criar Documento
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
      <input ref={importFileRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden" onChange={handleImportFile} />
    </div>
  );
}

function ShieldCheck({ size, className, style }: { size?: number, className?: string, style?: any }) {
    return <Check size={size} className={className} style={style} />;
}
