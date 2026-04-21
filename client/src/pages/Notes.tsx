import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  FileText, Plus, Search, Trash2, ChevronRight, ChevronDown,
  Bold, Italic, Underline, List, ListOrdered, Highlighter,
  AlignLeft, AlignCenter, AlignRight, Minus, BookOpen, Tag,
  Save, Clock, FolderOpen, X, PenLine, ImagePlus, Upload, FileUp,
  Link as LinkIcon, Wand2,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNotes, useNoteFilters, useNoteCreation, useFileImport, type Note, type Discipline, type Topic } from "@/hooks/useNotes";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Google Docs / DOCX Importer ───────────────────────────────────────────────

// Parse DOCX natively without external deps — reads word/document.xml from the zip
async function importDocxFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const uint8 = new Uint8Array(arrayBuffer);

        // DOCX is a ZIP — find word/document.xml manually
        const text = await extractDocxText(uint8);
        resolve(text);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Minimal ZIP parser to extract word/document.xml from a DOCX buffer
async function extractDocxText(data: Uint8Array): Promise<string> {
  // Use DecompressionStream if available (modern browsers/Electron)
  // Otherwise fall back to text extraction via regex on raw XML bytes

  try {
    // Try to find the local file entry for word/document.xml in the ZIP
    const target = "word/document.xml";
    const targetBytes = new TextEncoder().encode(target);

    // ZIP local file header signature: PK\x03\x04
    let i = 0;
    while (i < data.length - 4) {
      if (data[i] === 0x50 && data[i+1] === 0x4b && data[i+2] === 0x03 && data[i+3] === 0x04) {
        // Local file header found
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

          if (compMethod === 0) {
            // Stored (no compression)
            xmlText = new TextDecoder("utf-8").decode(compData);
          } else if (compMethod === 8) {
            // Deflate — use DecompressionStream
            const ds = new DecompressionStream("deflate-raw");
            const writer = ds.writable.getWriter();
            const readr = ds.readable.getReader();
            writer.write(compData);
            writer.close();
            const chunks: Uint8Array[] = [];
            while (true) {
              const { done, value } = await readr.read();
              if (done) break;
              chunks.push(value);
            }
            const total = chunks.reduce((s, c) => s + c.length, 0);
            const merged = new Uint8Array(total);
            let off = 0;
            for (const c of chunks) { merged.set(c, off); off += c.length; }
            xmlText = new TextDecoder("utf-8").decode(merged);
          }

          return xmlToHtml(xmlText);
        }

        i = dataStart + Math.max(compSize, 0);
      } else {
        i++;
      }
    }
    return "<p>Não foi possível extrair o conteúdo do arquivo Word. Tente salvar como .txt ou .html e importar novamente.</p>";
  } catch {
    return "<p>Erro ao ler o arquivo Word.</p>";
  }
}

// Convert DOCX XML to basic HTML
function xmlToHtml(xml: string): string {
  // Remove XML namespaces for easier parsing
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

  // Extract only text content — remove remaining XML tags
  let html = stripped
    .replace(/<[^>]+>/g, "")    // remove leftover tags
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => `<p>${l}</p>`)
    .join("\n");

  return html || "<p></p>";
}

async function importGoogleDocsUrl(url: string): Promise<string> {
  // Extract doc ID from Google Docs URL and convert to export URL
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("URL inválida do Google Docs");
  const docId = match[1];
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=html`;
  // Note: This requires CORS - use a proxy approach or guide user
  throw new Error("GOOGLE_DOCS_EXPORT_URL:" + exportUrl);
}

// ── PDF Importer ──────────────────────────────────────────────────────────────
// Uses PDF.js from CDN to extract text from PDF files without server dependency

async function importPdfFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        // Dynamically load PDF.js from CDN
        if (!(window as typeof window & { pdfjsLib?: unknown }).pdfjsLib) {
          await new Promise<void>((res, rej) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            script.onload = () => res();
            script.onerror = () => rej(new Error("Falha ao carregar PDF.js"));
            document.head.appendChild(script);
          });
          // Set worker
          const pdfjs = (window as typeof window & { pdfjsLib: { GlobalWorkerOptions: { workerSrc: string } } }).pdfjsLib;
          pdfjs.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }

        const pdfjs = (window as typeof window & { pdfjsLib: {
          getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<{
            numPages: number;
            getPage: (n: number) => Promise<{
              getTextContent: () => Promise<{ items: Array<{ str: string; hasEOL?: boolean }> }>;
            }>;
          }> };
        } }).pdfjsLib;

        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const pageTexts: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items
            .map((item) => item.str + (item.hasEOL ? "\n" : ""))
            .join(" ")
            .replace(/ {2,}/g, " ")
            .trim();
          if (pageText) pageTexts.push(pageText);
        }

        const fullText = pageTexts.join("\n\n");
        const html = fullText
          .split("\n\n")
          .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
          .join("\n");

        resolve(html || "<p>PDF sem texto extraível (arquivo digitalizado/imagem).</p>");
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}




function RichEditor({
  value, onChange, placeholder = "Comece a escrever...", onAiAction
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
    if (!text?.trim()) {
      toast.error("Selecione um texto primeiro para usar a IA.");
      return;
    }
    if (onAiAction) {
      const loadingId = toast.loading("A IA está processando...");
      try {
        const result = await onAiAction(action, text);
        document.execCommand("insertText", false, result);
        handleInput();
        toast.dismiss(loadingId);
        toast.success("Texto atualizado com IA!");
      } catch (err: any) {
        toast.dismiss(loadingId);
        toast.error(err.message || "Erro na IA");
      }
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

  // Paste handler for images
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imgItem = items.find(i => i.type.startsWith("image/"));
    if (imgItem) {
      e.preventDefault();
      const file = imgItem.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        document.execCommand("insertImage", false, src);
        handleInput();
      };
      reader.readAsDataURL(file);
    }
  };

  // Drag & drop images
  const handleDrop = (e: React.DragEvent) => {
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        document.execCommand("insertImage", false, src);
        handleInput();
      };
      reader.readAsDataURL(file);
    }
  };

  type ToolbarBtn = { icon: React.ReactNode; cmd: string; val?: string; title: string };
  const toolbar: ToolbarBtn[][] = [
    [
      { icon: <Bold className="h-3.5 w-3.5" />, cmd: "bold", title: "Negrito" },
      { icon: <Italic className="h-3.5 w-3.5" />, cmd: "italic", title: "Itálico" },
      { icon: <Underline className="h-3.5 w-3.5" />, cmd: "underline", title: "Sublinhado" },
      { icon: <Highlighter className="h-3.5 w-3.5" />, cmd: "hiliteColor", val: "#fef08a", title: "Destacar" },
    ],
    [
      { icon: <span className="text-xs font-black">H1</span>, cmd: "formatBlock", val: "H2", title: "Título" },
      { icon: <span className="text-xs font-bold">H2</span>, cmd: "formatBlock", val: "H3", title: "Subtítulo" },
      { icon: <span className="text-xs">¶</span>, cmd: "formatBlock", val: "P", title: "Parágrafo" },
    ],
    [
      { icon: <List className="h-3.5 w-3.5" />, cmd: "insertUnorderedList", title: "Lista" },
      { icon: <ListOrdered className="h-3.5 w-3.5" />, cmd: "insertOrderedList", title: "Lista numerada" },
      { icon: <Minus className="h-3.5 w-3.5" />, cmd: "insertHorizontalRule", title: "Separador" },
    ],
    [
      { icon: <AlignLeft className="h-3.5 w-3.5" />, cmd: "justifyLeft", title: "Esquerda" },
      { icon: <AlignCenter className="h-3.5 w-3.5" />, cmd: "justifyCenter", title: "Centro" },
      { icon: <AlignRight className="h-3.5 w-3.5" />, cmd: "justifyRight", title: "Direita" },
    ],
  ];

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--card-border)", background: "var(--app-bg)" }}>
      <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={insertImage} />
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--card-border)", background: "var(--stat-bg)" }}>
        {toolbar.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <div className="w-px h-4 mx-1.5" style={{ background: "var(--card-border)" }} />}
            {group.map((btn) => (
              <button
                key={btn.cmd + (btn.val ?? "")}
                title={btn.title}
                onMouseDown={(e) => { e.preventDefault(); exec(btn.cmd, btn.val); }}
                className="p-1.5 rounded-md transition-all hover:opacity-60 active:scale-95 min-w-[28px] flex items-center justify-center"
                style={{ color: "var(--app-fg)" }}
              >
                {btn.icon}
              </button>
            ))}
          </div>
        ))}
        {/* Image upload button */}
        <div className="flex items-center gap-0.5">
          <div className="w-px h-4 mx-1.5" style={{ background: "var(--card-border)" }} />
          <button
            title="Inserir imagem (ou arraste/cole)"
            onMouseDown={(e) => { e.preventDefault(); imgInputRef.current?.click(); }}
            className="p-1.5 rounded-md transition-all hover:opacity-60 active:scale-95 min-w-[28px] flex items-center justify-center"
            style={{ color: "var(--app-fg)" }}
          >
            <ImagePlus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Magic AI Button */}
        <div className="relative flex items-center gap-0.5">
          <div className="w-px h-4 mx-1.5" style={{ background: "var(--card-border)" }} />
          <button
            title="Ações de IA"
            onMouseDown={(e) => { e.preventDefault(); setShowAiMenu(!showAiMenu); }}
            className="p-1.5 rounded-md transition-all hover:opacity-60 active:scale-95 min-w-[28px] flex items-center justify-center relative"
            style={{ color: "var(--primary)" }}
          >
            <Wand2 className="h-3.5 w-3.5" />
          </button>
          
          {showAiMenu && (
            <div className="absolute top-full left-0 mt-1 p-1 rounded-xl shadow-lg z-50 flex flex-col gap-1 w-40"
              style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
              {[
                { id: "summarize", label: "Resumir" },
                { id: "improve", label: "Melhorar escrita" },
                { id: "explain", label: "Explicar simples" },
                { id: "autocomplete", label: "Auto-completar" },
              ].map(a => (
                <button key={a.id} onMouseDown={(e) => { e.preventDefault(); handleAiAction(a.id as any); }}
                  className="text-left px-3 py-1.5 text-xs rounded-lg hover:opacity-80 transition-all"
                  style={{ background: "var(--stat-bg)", color: "var(--app-fg)" }}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="relative flex-1 overflow-auto">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleInput}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="w-full h-full min-h-[300px] px-8 py-6 text-sm outline-none leading-7"
          style={{ color: "var(--app-fg)", background: "var(--app-bg)", fontFamily: "var(--font-sans, 'Inter', sans-serif)" }}
          data-placeholder={placeholder}
        />
        <style>{`
          [contenteditable]:empty:before { content: attr(data-placeholder); color: var(--muted-text); pointer-events: none; }
          [contenteditable] h2 { font-size: 1.5em; font-weight: 800; margin: 1em 0 0.4em; border-bottom: 2px solid var(--card-border); padding-bottom: 0.3em; }
          [contenteditable] h3 { font-size: 1.2em; font-weight: 700; margin: 0.8em 0 0.3em; color: var(--primary); }
          [contenteditable] ul { list-style: disc; padding-left: 1.6em; margin: 0.5em 0; }
          [contenteditable] ol { list-style: decimal; padding-left: 1.6em; margin: 0.5em 0; }
          [contenteditable] hr { border: none; border-top: 2px solid var(--card-border); margin: 1.2em 0; }
          [contenteditable] p { margin: 0.3em 0; }
          [contenteditable] b, [contenteditable] strong { font-weight: 700; }
          [contenteditable] mark { background: #fef08a; color: #000; border-radius: 2px; padding: 0 2px; }
          [contenteditable] img { max-width: 100%; height: auto; border-radius: 8px; margin: 0.5em 0; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
          [contenteditable] img:hover { opacity: 0.9; }
        `}</style>
      </div>
    </div>
  );
}

// ── Sidebar tree item ──────────────────────────────────────────────────────────
function SidebarItem({
  label, color, count, active, expanded, hasChildren, onSelect, onToggle,
}: {
  label: string; color?: string; count?: number; active?: boolean;
  expanded?: boolean; hasChildren?: boolean; onSelect: () => void; onToggle?: () => void;
}) {
  return (
    <div onClick={onSelect}
      className="group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-sm"
      style={{
        background: active ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
        color: active ? "var(--primary)" : "var(--app-fg)",
      }}>
      {hasChildren ? (
        <button className="shrink-0 p-0.5" onClick={(e) => { e.stopPropagation(); onToggle?.(); }}>
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--muted-text)" }} />
            : <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--muted-text)" }} />}
        </button>
      ) : <span className="w-5" />}
      {color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />}
      <span className="flex-1 truncate font-medium text-xs">{label}</span>
      {count !== undefined && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{ background: "var(--stat-bg)", color: "var(--muted-text)" }}>{count}</span>
      )}
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
    onSuccess: () => { utils.note.list.invalidate(); },
  });
  const deleteNote = trpc.note.delete.useMutation({
    onSuccess: () => { utils.note.list.invalidate(); toast.success("Anotação excluída."); setActiveNoteId(null); },
  });

  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterDisciplineId, setFilterDisciplineId] = useState<number | null>(null);
  const [expandedDiscs, setExpandedDiscs] = useState<Set<number>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDisciplineId, setNewDisciplineId] = useState<number | "">("");
  const [newTopicId, setNewTopicId] = useState<number | "">("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editorContent, setEditorContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMode, setImportMode] = useState<"file" | "gdocs" | null>(null);
  const [gdocsUrl, setGdocsUrl] = useState("");
  const [importedContent, setImportedContent] = useState("");
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const aiApiKey = (stats?.settings as any)?.aiApiKey ?? "";
  const aiProvider = (stats?.settings as any)?.aiProvider ?? "gemini";

  const processTextMut = trpc.ai.processText.useMutation();
  const handleAiAction = async (action: "summarize" | "improve" | "explain" | "autocomplete", text: string) => {
    if (!aiApiKey) throw new Error("Configure sua API Key da IA no perfil.");
    const res = await processTextMut.mutateAsync({ text, action, apiKey: aiApiKey, provider: aiProvider as any });
    return res.result;
  };

  const generateFlashcardsMut = trpc.ai.generateFlashcardsFromText.useMutation();
  const handleGenerateFlashcards = async () => {
    if (!aiApiKey) { toast.error("Configure sua API Key da IA no perfil."); return; }
    if (!activeNote || !editorContent.trim()) { toast.error("Nenhum texto para gerar."); return; }
    
    // strip html
    const text = editorContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 50) { toast.error("Texto muito curto para gerar flashcards."); return; }

    const loadingId = toast.loading("Lendo seu resumo e gerando flashcards...");
    try {
      const res = await generateFlashcardsMut.mutateAsync({
        text,
        disciplineId: (activeNote as any).disciplineId,
        topicId: (activeNote as any).topicId ?? undefined,
        noteId: (activeNote as any).id,
        apiKey: aiApiKey,
        provider: aiProvider as any
      });
      toast.dismiss(loadingId);
      toast.success(`✨ Mágica! ${res.createdCount} flashcards criados direto na sua aba de Revisão.`);
    } catch (e: any) {
      toast.dismiss(loadingId);
      toast.error(e.message || "Erro ao gerar flashcards.");
    }
  };

  const activeNote = useMemo(() => notes.find((n: any) => n.id === activeNoteId), [notes, activeNoteId]);

  useEffect(() => {
    if (activeNote) { setEditorContent((activeNote as any).content); setIsDirty(false); }
  }, [(activeNote as any)?.id]);

  const handleEditorChange = useCallback((html: string) => {
    setEditorContent(html);
    setIsDirty(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!activeNote) return;
      const n = activeNote as any;
      await upsertNote.mutateAsync({ id: n.id, disciplineId: n.disciplineId, topicId: n.topicId ?? undefined, title: n.title, content: html });
      setIsDirty(false);
      setLastSaved(new Date());
    }, 1500);
  }, [activeNote]);

  const notesByDisc = useMemo(() => {
    const map: Record<number, any[]> = {};
    for (const n of notes as any[]) { if (!map[n.disciplineId]) map[n.disciplineId] = []; map[n.disciplineId].push(n); }
    return map;
  }, [notes]);

  const filteredNotes = useMemo(() => {
    let list = notes as any[];
    if (filterDisciplineId) list = list.filter((n: any) => n.disciplineId === filterDisciplineId);
    if (search) list = list.filter((n: any) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.replace(/<[^>]+>/g, "").toLowerCase().includes(search.toLowerCase())
    );
    return list;
  }, [notes, filterDisciplineId, search]);

  const topicsForNew = (allTopics as any[]).filter((t: any) => t.disciplineId === Number(newDisciplineId));

  const openNote = (id: number) => {
    if (activeNoteId === id) return;
    if (isDirty && activeNote) {
      const n = activeNote as any;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      upsertNote.mutate({ id: n.id, disciplineId: n.disciplineId, topicId: n.topicId ?? undefined, title: n.title, content: editorContent });
    }
    setActiveNoteId(id);
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newDisciplineId) { toast.error("Preencha título e disciplina."); return; }
    const result = await upsertNote.mutateAsync({
      disciplineId: Number(newDisciplineId), topicId: newTopicId ? Number(newTopicId) : undefined,
      title: newTitle.trim(), content: importedContent || "",
    });
    await utils.note.list.invalidate();
    setIsCreating(false); setNewTitle(""); setNewDisciplineId(""); setNewTopicId("");
    setImportedContent(""); setImportMode(null); setGdocsUrl("");
    toast.success(importedContent ? "Anotação importada com sucesso!" : "Anotação criada!");
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      let html = "";
      if (file.name.endsWith(".docx") || file.name.endsWith(".doc")) {
        html = await importDocxFile(file);
        toast.success("Arquivo Word importado! Preencha título e disciplina.");
      } else if (file.name.endsWith(".txt")) {
        const text = await file.text();
        html = `<p>${text.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
        toast.success("Arquivo de texto importado!");
      } else if (file.name.endsWith(".html") || file.name.endsWith(".htm")) {
        html = await file.text();
        // Strip dangerous tags
        html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                   .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
        toast.success("Arquivo HTML importado!");
      } else if (file.name.endsWith(".pdf")) {
        html = await importPdfFile(file);
        toast.success("PDF importado! Preencha título e disciplina.");
      } else {
        toast.error("Formato não suportado. Use .pdf, .docx, .txt ou .html");
        return;
      }
      // Auto-set title from filename
      const titleFromFile = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      setNewTitle(prev => prev || titleFromFile);
      setImportedContent(html);
      setImportMode(null);
    } catch (err: any) {
      toast.error("Erro ao importar arquivo: " + (err?.message || "formato inválido"));
    } finally {
      setIsImporting(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleGdocsImport = async () => {
    if (!gdocsUrl.trim()) return;
    setIsImporting(true);
    try {
      await importGoogleDocsUrl(gdocsUrl);
    } catch (err: any) {
      const msg: string = err?.message || "";
      if (msg.startsWith("GOOGLE_DOCS_EXPORT_URL:")) {
        const exportUrl = msg.replace("GOOGLE_DOCS_EXPORT_URL:", "");
        // Guide user: can't fetch directly due to CORS, but provide link to download HTML
        toast.info("Abra o link abaixo no navegador para baixar o HTML do Google Docs, depois importe o arquivo.", { duration: 8000 });
        window.open(exportUrl, "_blank");
        setImportMode(null);
        setGdocsUrl("");
      } else {
        toast.error(msg || "URL inválida. Use o link de compartilhamento do Google Docs.");
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleRenameTitle = async (note: any, newT: string) => {
    if (!newT.trim()) return;
    await upsertNote.mutateAsync({ id: note.id, disciplineId: note.disciplineId, topicId: note.topicId ?? undefined, title: newT.trim(), content: note.content });
    utils.note.list.invalidate();
  };

  const stripHtml = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  const activeDiscipline = (disciplines as any[]).find((d: any) => d.id === (activeNote as any)?.disciplineId);
  const activeTopic = (allTopics as any[]).find((t: any) => t.id === (activeNote as any)?.topicId);

  if (isLoading) return <div className="p-8 text-center" style={{ color: "var(--muted-text)" }}>Carregando...</div>;

  return (
    <div className="flex h-[calc(100vh-4rem)] -mx-4 -mb-4 overflow-hidden" style={{ background: "var(--app-bg)" }}>

      {/* ── Left panel: list of notes ── */}
      <div className={`${activeNoteId && "hidden md:flex"} flex-col shrink-0 overflow-hidden transition-all`}
        style={{ width: "clamp(240px, 28vw, 320px)", borderRight: "1px solid var(--card-border)", background: "var(--stat-bg)" }}>

        {/* Header */}
        <div className="px-3 pt-3 pb-2 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold" style={{ color: "var(--app-fg)" }}>Anotações</h2>
            <button onClick={() => setIsCreating(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-85 active:scale-95 transition-all"
              style={{ background: "var(--primary)" }}>
              <Plus className="h-3 w-3" /> Novo
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3" style={{ color: "var(--muted-text)" }} />
            <input placeholder="Pesquisar..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }} />
          </div>
          {/* Discipline filter pills */}
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setFilterDisciplineId(null)}
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all"
              style={{
                background: !filterDisciplineId ? "var(--primary)" : "var(--stat-bg)",
                color: !filterDisciplineId ? "white" : "var(--muted-text)",
                border: "1px solid var(--card-border)",
              }}>Todas</button>
            {(disciplines as any[]).filter((d: any) => (notesByDisc[d.id] ?? []).length > 0).map((d: any) => (
              <button key={d.id} onClick={() => setFilterDisciplineId(d.id)}
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all"
                style={{
                  background: filterDisciplineId === d.id ? d.color : "var(--stat-bg)",
                  color: filterDisciplineId === d.id ? "white" : "var(--muted-text)",
                  border: `1px solid ${filterDisciplineId === d.id ? d.color : "var(--card-border)"}`,
                }}>{d.name}</button>
            ))}
          </div>
        </div>

        {/* Note list */}
        <div className="flex-1 overflow-y-auto">
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 px-4">
              <PenLine className="h-8 w-8" style={{ color: "var(--muted-text)", opacity: 0.25 }} />
              <p className="text-xs text-center" style={{ color: "var(--muted-text)" }}>
                {search ? "Nenhum resultado" : "Sem anotações. Crie uma!"}
              </p>
            </div>
          ) : filteredNotes.map((note: any) => {
            const disc = (disciplines as any[]).find((d: any) => d.id === note.disciplineId);
            const isActive = activeNoteId === note.id;
            return (
              <div key={note.id} onClick={() => openNote(note.id)}
                className="px-4 py-3 mx-3 mb-2 cursor-pointer transition-all group rounded-2xl"
                style={{
                  border: `1px solid ${isActive ? "transparent" : "var(--card-border)"}`,
                  background: isActive ? "linear-gradient(135deg, color-mix(in srgb, var(--primary) 15%, transparent) 0%, color-mix(in srgb, var(--primary) 5%, transparent) 100%)" : "var(--app-bg)",
                  boxShadow: isActive ? "0 4px 12px rgba(0,0,0,0.05)" : "none",
                }}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  {disc?.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: disc.color }} />}
                  <span className="text-[10px] font-semibold truncate" style={{ color: disc?.color || "var(--primary)" }}>{disc?.name}</span>
                  <span className="ml-auto text-[9px] shrink-0 opacity-50" style={{ color: "var(--muted-text)" }}>
                    {format(parseISO(note.updatedAt), "dd/MM/yy", { locale: ptBR })}
                  </span>
                </div>
                <p className="font-semibold text-xs truncate" style={{ color: isActive ? "var(--primary)" : "var(--app-fg)" }}>{note.title}</p>
                <p className="text-[10px] mt-0.5 line-clamp-1 opacity-60" style={{ color: "var(--muted-text)" }}>
                  {stripHtml(note.content) || "Documento vazio"}
                </p>
              </div>
            );
          })}
        </div>

        {/* Import button */}
        <div className="p-2 shrink-0" style={{ borderTop: "1px solid var(--card-border)" }}>
          <button onClick={() => { setIsCreating(true); setImportMode("file"); }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-all"
            style={{ color: "var(--muted-text)", border: "1px dashed var(--card-border)" }}>
            <FileUp className="h-3 w-3" /> Importar .pdf / .docx / .txt
          </button>
        </div>
      </div>

      {/* ── Editor pane ── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {activeNote ? (
          <>
            {/* Editor top bar */}
            <div className="px-4 py-2.5 shrink-0 flex items-center gap-3"
              style={{ borderBottom: "1px solid var(--card-border)", background: "var(--stat-bg)" }}>
              <button onClick={() => setActiveNoteId(null)} className="p-1.5 rounded-lg md:hidden" style={{ color: "var(--muted-text)" }}>
                <X className="h-4 w-4" />
              </button>
              <input
                className="flex-1 text-sm font-bold bg-transparent outline-none min-w-0"
                style={{ color: "var(--app-fg)" }}
                value={(activeNote as any).title}
                onChange={e => handleRenameTitle(activeNote, e.target.value)}
                placeholder="Título da anotação"
              />
              <div className="flex items-center gap-2 shrink-0">
                {activeDiscipline && (
                  <span className="hidden md:flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: `${activeDiscipline.color}22`, color: activeDiscipline.color, border: `1px solid ${activeDiscipline.color}44` }}>
                    <BookOpen className="h-3 w-3" /> {activeDiscipline.name}
                  </span>
                )}
                {activeTopic && (
                  <span className="hidden md:flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--muted-text)" }}>
                    <Tag className="h-3 w-3" /> {activeTopic.name}
                  </span>
                )}
                <span className="hidden md:flex items-center gap-1 text-[10px]" style={{ color: "var(--muted-text)" }}>
                  {isDirty
                    ? <><Clock className="h-3 w-3 animate-pulse" style={{ color: "var(--accent-amber)" }} /> Salvando...</>
                    : <><Save className="h-3 w-3" style={{ color: "var(--accent-green)" }} /> {lastSaved ? `Salvo ${format(lastSaved, "HH:mm")}` : "Salvo"}</>}
                </span>
                <button
                  onClick={handleGenerateFlashcards}
                  disabled={generateFlashcardsMut.isPending}
                  title="Gerar Flashcards com IA"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all hover:opacity-80 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, var(--accent-blue) 0%, #7c3aed 100%)", color: "white" }}>
                  <Wand2 className="h-3 w-3" /> Gerar Flashcards
                </button>
                <button
                  onClick={() => { if (confirm(`Excluir "${(activeNote as any).title}"?`)) deleteNote.mutate({ id: (activeNote as any).id }); }}
                  className="p-1.5 rounded-lg transition-all hover:opacity-70"
                  style={{ color: "var(--accent-red, #dc2626)" }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden px-2 py-2">
              <RichEditor
                key={(activeNote as any).id}
                value={editorContent}
                onChange={handleEditorChange}
                placeholder="Comece a escrever... Use a barra acima para formatar texto, inserir listas e imagens."
                onAiAction={handleAiAction}
              />
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center bg-[var(--app-bg)]">
            <div className="p-6 rounded-full" style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 15%, transparent)", boxShadow: "0 8px 32px color-mix(in srgb, var(--primary) 10%, transparent)" }}>
              <BookOpen className="h-10 w-10 mx-auto" style={{ color: "var(--primary)" }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: "var(--app-fg)" }}>Suas Anotações</p>
              <p className="text-sm mt-2 max-w-sm mx-auto leading-relaxed" style={{ color: "var(--muted-text)" }}>Crie resumos ricos com formatações e imagens para organizar seus estudos da melhor forma.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <button onClick={() => setIsCreating(true)}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg, var(--accent-blue) 0%, #7c3aed 100%)" }}>
                <Plus className="h-4 w-4" /> Criar Anotação
              </button>
              <button onClick={() => { setIsCreating(true); setImportMode("file"); }}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold hover:opacity-80 transition-all active:scale-95"
                style={{ border: "1px solid var(--card-border)", color: "var(--app-fg)", background: "var(--stat-bg)" }}>
                <Upload className="h-4 w-4" style={{ color: "var(--muted-text)" }} /> Importar
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Create Note Modal ── */}

      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => { setIsCreating(false); setImportedContent(""); setImportMode(null); }}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            style={{ background: "var(--app-bg)", border: "1px solid var(--card-border)" }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="px-5 pt-5 pb-4 flex items-start justify-between">
              <div>
                <h3 className="font-black text-base" style={{ color: "var(--app-fg)" }}>Nova Anotação</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted-text)" }}>Crie do zero ou importe um arquivo</p>
              </div>
              <button onClick={() => { setIsCreating(false); setImportedContent(""); setImportMode(null); }}
                className="p-1.5 rounded-lg hover:opacity-70 transition-opacity -mt-0.5 -mr-1"
                style={{ color: "var(--muted-text)" }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-3">
              {/* Import source buttons */}
              {!importedContent && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Importar de</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => { setImportMode("file"); importFileRef.current?.click(); }}
                      className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-all active:scale-95"
                      style={{ background: "var(--stat-bg)", border: `1px solid ${importMode === "file" ? "var(--primary)" : "var(--card-border)"}`, color: "var(--app-fg)" }}>
                      <FileUp className="h-4 w-4" style={{ color: "var(--primary)" }} />
                      Word / TXT
                    </button>
                    <button
                      onClick={() => setImportMode(importMode === "gdocs" ? null : "gdocs")}
                      className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-all active:scale-95"
                      style={{ background: "var(--stat-bg)", border: `1px solid ${importMode === "gdocs" ? "#4285f4" : "var(--card-border)"}`, color: "var(--app-fg)" }}>
                      <LinkIcon className="h-4 w-4" style={{ color: "#4285f4" }} />
                      Google Docs
                    </button>
                    <button
                      onClick={() => { setImportMode(null); setImportedContent(""); }}
                      className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-all active:scale-95"
                      style={{ background: "var(--stat-bg)", border: `1px solid ${!importMode && !importedContent ? "var(--accent-green)" : "var(--card-border)"}`, color: "var(--app-fg)" }}>
                      <PenLine className="h-4 w-4" style={{ color: "var(--accent-green)" }} />
                      Em branco
                    </button>
                  </div>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.txt,.html,.htm"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                </div>
              )}

              {/* Google Docs URL input */}
              {importMode === "gdocs" && !importedContent && (
                <div className="space-y-2 rounded-xl p-3" style={{ background: "rgba(66,133,244,0.06)", border: "1px solid rgba(66,133,244,0.2)" }}>
                  <p className="text-xs font-medium" style={{ color: "#4285f4" }}>Google Docs</p>
                  <div className="flex gap-2">
                    <input
                      value={gdocsUrl} onChange={e => setGdocsUrl(e.target.value)}
                      placeholder="https://docs.google.com/document/d/..."
                      className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
                      style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}
                    />
                    <button onClick={handleGdocsImport} disabled={isImporting || !gdocsUrl.trim()}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                      style={{ background: "#4285f4" }}>
                      {isImporting ? "..." : "Ir"}
                    </button>
                  </div>
                  <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>
                    Dica: No Google Docs → Arquivo → Baixar → Página da Web (.html) → importe o arquivo aqui.
                  </p>
                </div>
              )}

              {/* Show imported content indicator */}
              {importedContent && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "var(--accent-green)" }} />
                  <span className="text-xs flex-1" style={{ color: "var(--accent-green)" }}>Arquivo importado e pronto!</span>
                  <button onClick={() => setImportedContent("")} className="p-0.5 hover:opacity-70">
                    <X className="h-3 w-3" style={{ color: "var(--muted-text)" }} />
                  </button>
                </div>
              )}

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Título</label>
                <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCreate()}
                  placeholder="Ex: Remédios Constitucionais"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}
                  onFocus={e => (e.target.style.borderColor = "var(--primary)")}
                  onBlur={e => (e.target.style.borderColor = "var(--card-border)")} />
              </div>

              {/* Disciplina */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Disciplina</label>
                <select value={newDisciplineId} onChange={e => { setNewDisciplineId(e.target.value as any); setNewTopicId(""); }}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: !newDisciplineId ? "var(--muted-text)" : "var(--app-fg)" }}>
                  <option value="" style={{ background: "var(--app-bg)", color: "var(--muted-text)" }}>Selecionar disciplina…</option>
                  {(disciplines as any[]).map((d: any) => (
                    <option key={d.id} value={d.id} style={{ background: "var(--app-bg)", color: "var(--app-fg)" }}>{d.name}</option>
                  ))}
                </select>
              </div>

              {/* Tema opcional */}
              {newDisciplineId && topicsForNew.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Tema <span style={{ opacity: 0.5, fontWeight: 400, textTransform: "none" }}>(opcional)</span></label>
                  <select value={newTopicId} onChange={e => setNewTopicId(e.target.value as any)}
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                    style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}>
                    <option value="" style={{ background: "var(--app-bg)" }}>Sem tema específico</option>
                    {topicsForNew.map((t: any) => (
                      <option key={t.id} value={t.id} style={{ background: "var(--app-bg)", color: "var(--app-fg)" }}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Divider */}
              <div className="h-px" style={{ background: "var(--card-border)" }} />

              {/* Actions */}
              <div className="flex gap-2.5">
                <button onClick={() => { setIsCreating(false); setImportedContent(""); setImportMode(null); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-75"
                  style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}>
                  Cancelar
                </button>
                <button onClick={handleCreate} disabled={!newTitle.trim() || !newDisciplineId}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed"
                  style={{ background: "var(--primary)" }}>
                  {importedContent ? "Importar" : "Criar e abrir"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
