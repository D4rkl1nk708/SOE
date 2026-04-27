/**
 * Hook principal de Notas.
 * Extrai toda a lógica de negócio, estado e mutações do componente Notes.tsx.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Note {
  id: number;
  disciplineId: number;
  topicId?: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: number;
  disciplineId: number;
  name: string;
}

export interface Discipline {
  id: number;
  name: string;
  color: string;
}

type ImportMode = "file" | "gdocs" | null;

// ─── Hook: Auto-save com debounce ─────────────────────────────────────────────

export function useAutoSave(note: Note | undefined, onSave: (content: string) => Promise<void>, delayMs = 1500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const schedule = useCallback((content: string) => {
    setIsDirty(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (!note) return;
      await onSave(content);
      setIsDirty(false);
      setLastSaved(new Date());
    }, delayMs);
  }, [note, onSave, delayMs]);

  const flush = useCallback((content: string) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (isDirty && note) {
      onSave(content).then(() => { setIsDirty(false); setLastSaved(new Date()); });
    }
  }, [isDirty, note, onSave]);

  // Cleanup on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { isDirty, setIsDirty, lastSaved, schedule, flush };
}

// ─── Hook: Importação de arquivos ─────────────────────────────────────────────

async function importDocxFile(file: File): Promise<string> {
  // Delegamos ao handler original em Notes.tsx — aqui só organizamos o fluxo
  const text = await file.text();
  return `<p>${text.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
}

export function useFileImport() {
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>(null);
  const [gdocsUrl, setGdocsUrl] = useState("");
  const [importedContent, setImportedContent] = useState("");

  const reset = useCallback(() => {
    setImportedContent("");
    setImportMode(null);
    setGdocsUrl("");
  }, []);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, setTitle: (t: string) => void) => {
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
        let raw = await file.text();
        raw = raw.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                 .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
        html = raw;
        toast.success("Arquivo HTML importado!");
      } else {
        toast.error("Formato não suportado. Use .docx, .txt ou .html");
        return;
      }
      const titleFromFile = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      setTitle(titleFromFile);
      setImportedContent(html);
      setImportMode(null);
    } catch (err: unknown) {
      toast.error("Erro ao importar arquivo: " + (err instanceof Error ? err.message : "formato inválido"));
    } finally {
      setIsImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }, []);

  const handleImportGdocs = useCallback(async (url: string) => {
    if (!url.trim()) { toast.error("Cole a URL do Google Docs."); return; }
    setIsImporting(true);
    try {
      const exportUrl = url.replace(/\/edit.*$/, "/export?format=html");
      const resp = await fetch(exportUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      let html = await resp.text();
      html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                 .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
      setImportedContent(html);
      setImportMode(null);
      setGdocsUrl("");
      toast.success("Google Doc importado com sucesso!");
    } catch (err: unknown) {
      toast.error("Erro ao importar Google Doc: " + (err instanceof Error ? err.message : "verifique as permissões do documento"));
    } finally {
      setIsImporting(false);
    }
  }, []);

  return {
    importFileRef, isImporting, importMode, setImportMode,
    gdocsUrl, setGdocsUrl, importedContent, setImportedContent,
    handleImportFile, handleImportGdocs, reset,
  };
}

// ─── Hook: Filtros e busca de notas ──────────────────────────────────────────

export function useNoteFilters(notes: Note[]) {
  const [search, setSearch] = useState("");
  const [filterDisciplineId, setFilterDisciplineId] = useState<number | null>(null);

  const notesByDisc = useMemo(() => {
    const map: Record<number, Note[]> = {};
    for (const n of notes) {
      if (!map[n.disciplineId]) map[n.disciplineId] = [];
      map[n.disciplineId].push(n);
    }
    return map;
  }, [notes]);

  const filteredNotes = useMemo(() => {
    let list = notes;
    if (filterDisciplineId) list = list.filter((n) => n.disciplineId === filterDisciplineId);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) => n.title.toLowerCase().includes(q) || n.content.replace(/<[^>]+>/g, "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [notes, filterDisciplineId, search]);

  return { search, setSearch, filterDisciplineId, setFilterDisciplineId, notesByDisc, filteredNotes };
}

// ─── Hook: Criação de notas ───────────────────────────────────────────────────

export function useNoteCreation(topics: Topic[]) {
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDisciplineId, setNewDisciplineId] = useState<number | "">("");
  const [newTopicId, setNewTopicId] = useState<number | "">("");

  const topicsForNew = useMemo(
    () => topics.filter((t) => t.disciplineId === Number(newDisciplineId)),
    [topics, newDisciplineId]
  );

  const reset = useCallback(() => {
    setIsCreating(false);
    setNewTitle("");
    setNewDisciplineId("");
    setNewTopicId("");
  }, []);

  return {
    isCreating, setIsCreating,
    newTitle, setNewTitle,
    newDisciplineId, setNewDisciplineId,
    newTopicId, setNewTopicId,
    topicsForNew,
    reset,
  };
}

// ─── Hook principal: useNotes ─────────────────────────────────────────────────

export function useNotes() {
  const utils = trpc.useUtils();
  const { data: rawNotes = [], isLoading } = trpc.note.list.useQuery();
  const { data: disciplines = [] } = trpc.discipline.list.useQuery();
  const { data: topicsData } = trpc.topic.list.useQuery({});
  const allTopics: Topic[] = (topicsData as { topics?: Topic[] })?.topics ?? [];

  const notes = rawNotes as Note[];

  const upsertNote = trpc.note.upsert.useMutation({
    onSuccess: () => utils.note.list.invalidate(),
  });
  const deleteNote = trpc.note.delete.useMutation({
    onSuccess: () => {
      utils.note.list.invalidate();
      toast.success("Documento excluído.");
      setActiveNoteId(null);
    },
  });

  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [expandedDiscs, setExpandedDiscs] = useState<Set<number>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editorContent, setEditorContent] = useState("");

  const activeNote = useMemo(() => notes.find((n) => n.id === activeNoteId), [notes, activeNoteId]);

  // Sync editor content when active note changes
  useEffect(() => {
    if (activeNote) { setEditorContent(activeNote.content); }

  const saveNote = useCallback(async (content: string) => {
    if (!activeNote) return;
    await upsertNote.mutateAsync({
      id: activeNote.id,
      disciplineId: activeNote.disciplineId,
      topicId: activeNote.topicId ?? undefined,
      title: activeNote.title,
      content,
    });
  }, [activeNote, upsertNote]);

  const autoSave = useAutoSave(activeNote, saveNote);

  const handleEditorChange = useCallback((html: string) => {
    setEditorContent(html);
    autoSave.schedule(html);
  }, [autoSave]);

  const openNote = useCallback((id: number) => {
    if (activeNoteId === id) return;
    // Flush pending save before switching notes
    autoSave.flush(editorContent);
    setActiveNoteId(id);
  }, [activeNoteId, autoSave, editorContent]);

  const handleCreate = useCallback(async (
    disciplineId: number,
    topicId: number | undefined,
    title: string,
    content: string,
    onReset: () => void
  ) => {
    if (!title.trim() || !disciplineId) { toast.error("Preencha título e disciplina."); return; }
    await upsertNote.mutateAsync({ disciplineId, topicId, title: title.trim(), content });
    await utils.note.list.invalidate();
    onReset();
    toast.success(content ? "Documento importado com sucesso!" : "Documento criado!");
  }, [upsertNote, utils]);

  const handleDelete = useCallback((id: number) => {
    deleteNote.mutate({ id });
  }, [deleteNote]);

  const handleManualSave = useCallback(() => {
    autoSave.flush(editorContent);
    toast.success("Salvo!");
  }, [autoSave, editorContent]);

  const toggleDisc = useCallback((id: number) => {
    setExpandedDiscs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  return {
    notes,
    disciplines: disciplines as Discipline[],
    allTopics,
    isLoading,
    activeNote,
    activeNoteId,
    setActiveNoteId,
    openNote,
    handleCreate,
    handleDelete,
    handleManualSave,
    editorContent,
    handleEditorChange,
    isDirty: autoSave.isDirty,
    lastSaved: autoSave.lastSaved,
    expandedDiscs,
    toggleDisc,
    sidebarOpen,
    setSidebarOpen,
    isSaving: upsertNote.isPending,
  };
}
