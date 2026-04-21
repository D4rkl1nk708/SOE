/**
 * Hook principal do Dashboard.
 * Extrai toda a lógica de negócio, estado e mutações do componente Dashboard.tsx,
 * deixando o arquivo de página responsável apenas pela renderização.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ErrorOrigin = "attention" | "forgetting" | "theory" | "trap";

export interface TopicForQ {
  id: number;
  name: string;
  performance?: {
    correctCount: number;
    errorCount: number;
    questionsResolved: number;
    accuracy: number;
  };
  studyDate?: string;
  completedRevisions?: number;
  studyTimeSeconds?: number;
}

export interface DisciplineStat {
  disciplineId: number;
  name: string;
  color: string;
  topicCount: number;
  studyTimeSeconds: number;
  performance?: {
    questionsResolved: number;
    accuracy: number;
    correctCount: number;
    errorCount: number;
  };
  topics: TopicForQ[];
}

// ─── Utilitários puros (sem side effects) ────────────────────────────────────

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [removed] = copy.splice(from, 1);
  copy.splice(to, 0, removed);
  return copy;
}

export function formatStudyTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Hook: Exames ─────────────────────────────────────────────────────────────

export function useExams() {
  const utils = trpc.useUtils();
  const { data: exams = [] } = trpc.exam.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [examDateInput, setExamDateInput] = useState("");
  const [examNameInput, setExamNameInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const save = trpc.exam.upsert.useMutation({
    onSuccess: () => {
      toast.success(editingId ? "Prova atualizada!" : "Prova adicionada!");
      utils.exam.list.invalidate();
      setDialogOpen(false);
      setExamNameInput("");
      setExamDateInput("");
      setEditingId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = trpc.exam.delete.useMutation({
    onSuccess: () => { utils.exam.list.invalidate(); toast.success("Prova removida."); },
    onError: (err) => toast.error(err.message),
  });

  const openCreate = useCallback(() => {
    setExamDateInput("");
    setExamNameInput("");
    setEditingId(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((exam: { id: string; name: string; date: string }) => {
    setExamNameInput(exam.name);
    setExamDateInput(exam.date);
    setEditingId(exam.id);
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!examNameInput.trim() || !examDateInput) {
      toast.error("Preencha nome e data da prova.");
      return;
    }
    save.mutate({ id: editingId ?? undefined, name: examNameInput.trim(), date: examDateInput });
  }, [examNameInput, examDateInput, editingId, save]);

  return {
    exams,
    dialogOpen, setDialogOpen,
    examDateInput, setExamDateInput,
    examNameInput, setExamNameInput,
    editingId,
    openCreate, openEdit,
    handleSave,
    handleRemove: (id: string) => remove.mutate({ id }),
    isSaving: save.isPending,
  };
}

// ─── Hook: Configurações de Cronograma ───────────────────────────────────────

export function useScheduleSettings(onSuccess?: () => void) {
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [testIntervalInput, setTestIntervalInput] = useState("");
  const [revisionIntervalInput, setRevisionIntervalInput] = useState("");
  const [revisionSecondPhaseInput, setRevisionSecondPhaseInput] = useState("");

  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Configurações salvas!");
      setScheduleDialogOpen(false);
      onSuccess?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSaveSchedule = useCallback(() => {
    const testInterval = parseInt(testIntervalInput, 10);
    const revisionInterval = parseInt(revisionIntervalInput, 10);
    const revisionSecondPhase = parseInt(revisionSecondPhaseInput, 10);
    if (isNaN(testInterval) || isNaN(revisionInterval) || isNaN(revisionSecondPhase)) {
      toast.error("Preencha todos os campos com valores válidos.");
      return;
    }
    updateSettings.mutate({
      testIntervalDays: testInterval,
      revisionIntervalDays: revisionInterval,
      revisionSecondPhaseDays: revisionSecondPhase,
    });
  }, [testIntervalInput, revisionIntervalInput, revisionSecondPhaseInput, updateSettings]);

  return {
    scheduleDialogOpen, setScheduleDialogOpen,
    testIntervalInput, setTestIntervalInput,
    revisionIntervalInput, setRevisionIntervalInput,
    revisionSecondPhaseInput, setRevisionSecondPhaseInput,
    handleSaveSchedule,
    isSaving: updateSettings.isPending,
  };
}

// ─── Hook: Importação TEC ─────────────────────────────────────────────────────

export function useTecImport() {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Fila de erros TEC para classificação após importação
  const [errorQueue, setErrorQueue] = useState<{ topicId: number; topicName: string; newErrors: number }[]>([]);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [currentErrorIndex, setCurrentErrorIndex] = useState(0);
  const [currentOrigin, setCurrentOrigin] = useState<ErrorOrigin | null>(null);

  const importTec = trpc.import.tecConcursos.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || `${data.updatedCount} tema(s) atualizado(s)!`);
      utils.dashboard.getStats.invalidate();
      setIsImporting(false);
      setDialogOpen(false);
      const queue = data.topicsWithNewErrors ?? [];
      if (queue.length > 0) {
        setErrorQueue(queue);
        setCurrentErrorIndex(0);
        setCurrentOrigin(null);
        setErrorDialogOpen(true);
      }
    },
    onError: (err) => { toast.error(err.message); setIsImporting(false); },
  });

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      if (!base64) { toast.error("Erro ao ler arquivo"); setIsImporting(false); return; }
      importTec.mutate({ base64, fileName: file.name });
    };
    reader.onerror = () => { toast.error("Erro ao ler arquivo"); setIsImporting(false); };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [importTec]);

  return {
    fileInputRef,
    dialogOpen, setDialogOpen,
    isImporting,
    handleFileUpload,
    errorQueue,
    errorDialogOpen, setErrorDialogOpen,
    currentErrorIndex, setCurrentErrorIndex,
    currentOrigin, setCurrentOrigin,
  };
}

// ─── Hook: Registro de Questões ───────────────────────────────────────────────

export function useQuestionsDialog() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<TopicForQ | null>(null);
  const [correctInput, setCorrectInput] = useState("");
  const [wrongInput, setWrongInput] = useState("");
  const [mode, setMode] = useState<"add" | "set">("add");
  const [errorOrigin, setErrorOrigin] = useState<ErrorOrigin | null>(null);

  const setPerformance = trpc.topic.setPerformance.useMutation({
    onSuccess: () => {
      toast.success("Questões salvas!");
      utils.dashboard.getStats.invalidate();
      setOpen(false);
      setCorrectInput("");
      setWrongInput("");
    },
    onError: (err) => toast.error(err.message),
  });

  const openDialog = useCallback((topic: TopicForQ) => {
    setSelectedTopic(topic);
    setMode("add");
    setCorrectInput("");
    setWrongInput("");
    setErrorOrigin(null);
    setOpen(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!selectedTopic) return;
    const c = parseInt(correctInput, 10) || 0;
    const w = parseInt(wrongInput, 10) || 0;
    if (c < 0 || w < 0) { toast.error("Valores não podem ser negativos."); return; }
    const finalC = mode === "add" ? (selectedTopic.performance?.correctCount ?? 0) + c : c;
    const finalW = mode === "add" ? (selectedTopic.performance?.errorCount ?? 0) + w : w;
    const originFields = finalW > 0 && errorOrigin ? {
      errorByAttention: errorOrigin === "attention" ? finalW : undefined,
      errorByForgetting: errorOrigin === "forgetting" ? finalW : undefined,
      errorByTheory: errorOrigin === "theory" ? finalW : undefined,
      errorByTrap: errorOrigin === "trap" ? finalW : undefined,
    } : {};
    setPerformance.mutate({ topicId: selectedTopic.id, correctCount: finalC, errorCount: finalW, ...originFields });
  }, [selectedTopic, correctInput, wrongInput, mode, errorOrigin, setPerformance]);

  return {
    open, setOpen,
    selectedTopic,
    correctInput, setCorrectInput,
    wrongInput, setWrongInput,
    mode, setMode,
    errorOrigin, setErrorOrigin,
    openDialog,
    handleSave,
    isSaving: setPerformance.isPending,
  };
}

// ─── Hook: Reordenação de Disciplinas e Tópicos ───────────────────────────────

export function useDragReorder(initialStats: DisciplineStat[]) {
  const [orderedStats, setOrderedStats] = useState<DisciplineStat[]>(initialStats);
  const [draggingDisciplineId, setDraggingDisciplineId] = useState<number | null>(null);
  const [draggingTopic, setDraggingTopic] = useState<{ disciplineId: number; topicId: number } | null>(null);

  const reorderDisciplines = trpc.discipline.reorder.useMutation();
  const reorderTopics = trpc.topic.reorder.useMutation();

  useEffect(() => { setOrderedStats(initialStats); }, [initialStats]);

  const handleDropDiscipline = useCallback((targetId: number) => {
    if (!draggingDisciplineId || draggingDisciplineId === targetId) return;
    const from = orderedStats.findIndex((d) => d.disciplineId === draggingDisciplineId);
    const to = orderedStats.findIndex((d) => d.disciplineId === targetId);
    if (from < 0 || to < 0) return;
    const reordered = moveItem(orderedStats, from, to);
    setOrderedStats(reordered);
    setDraggingDisciplineId(null);
    reorderDisciplines.mutate({ orderedIds: reordered.map((d) => d.disciplineId) });
  }, [draggingDisciplineId, orderedStats, reorderDisciplines]);

  const handleDropTopic = useCallback((disciplineId: number, targetTopicId: number) => {
    if (!draggingTopic || draggingTopic.disciplineId !== disciplineId || draggingTopic.topicId === targetTopicId) return;
    const di = orderedStats.findIndex((d) => d.disciplineId === disciplineId);
    if (di < 0) return;
    const topics = [...(orderedStats[di].topics ?? [])];
    const from = topics.findIndex((t) => t.id === draggingTopic.topicId);
    const to = topics.findIndex((t) => t.id === targetTopicId);
    if (from < 0 || to < 0) return;
    const reordered = moveItem(topics, from, to);
    const newStats = [...orderedStats];
    newStats[di] = { ...newStats[di], topics: reordered };
    setOrderedStats(newStats);
    setDraggingTopic(null);
    reorderTopics.mutate({ disciplineId, orderedIds: reordered.map((t) => t.id) });
  }, [draggingTopic, orderedStats, reorderTopics]);

  return {
    orderedStats,
    draggingDisciplineId, setDraggingDisciplineId,
    draggingTopic, setDraggingTopic,
    handleDropDiscipline,
    handleDropTopic,
  };
}

// ─── Hook: Widgets personalizados ─────────────────────────────────────────────

export function useDashboardWidgets(settings: Record<string, unknown> | null | undefined) {
  const [extraWidgets, setExtraWidgets] = useState<string[]>([]);
  const updateSettings = trpc.auth.updateSettings.useMutation();

  useEffect(() => {
    const cfg = settings?.dashboardConfig as { extraWidgets?: string[] } | undefined;
    if (cfg?.extraWidgets) setExtraWidgets(cfg.extraWidgets);
  }, [settings]);

  const saveExtraWidgets = useCallback((ew: string[]) => {
    setExtraWidgets(ew);
    updateSettings.mutate({ dashboardConfig: { extraWidgets: ew } });
  }, [updateSettings]);

  const toggleExtra = useCallback((id: string) => {
    setExtraWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      updateSettings.mutate({ dashboardConfig: { extraWidgets: next } });
      return next;
    });
  }, [updateSettings]);

  const showExtra = useCallback((id: string) => extraWidgets.includes(id), [extraWidgets]);

  return { extraWidgets, saveExtraWidgets, toggleExtra, showExtra };
}

// ─── Hook: Edição de tempo de estudo ─────────────────────────────────────────

export function useTimeEdit() {
  const utils = trpc.useUtils();
  const [dialog, setDialog] = useState<{ topicId: number; topicName: string; hours: number; minutes: number } | null>(null);

  const update = trpc.topic.update.useMutation({
    onSuccess: () => {
      utils.dashboard.getStats.invalidate();
      toast.success("Tempo atualizado!");
      setDialog(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = useCallback(() => {
    if (!dialog) return;
    const seconds = dialog.hours * 3600 + dialog.minutes * 60;
    update.mutate({ id: dialog.topicId, studyTimeSeconds: seconds });
  }, [dialog, update]);

  return { dialog, setDialog, handleSave, isSaving: update.isPending };
}
