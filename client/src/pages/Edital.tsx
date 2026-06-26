import { useEffect, useRef, useState, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FileSpreadsheet,
  Upload,
  Save,
  Search,
  ChevronDown,
  CheckCircle2,
  CalendarDays,
  X,
  Settings2,
  Info,
  Pencil,
  Trash2,
  BookOpen,
  TrendingUp,
  ChevronRight,
  Plus,
  HelpCircle,
  Clock,
  Check,
  FileText,
  Sparkles,
  Wand2,
  UploadCloud,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

type CycleType = "numbered" | "weekdays";
type Tab = "edital" | "ciclos";

type CycleConfig = {
  type: CycleType;
  count: number;
  selectedDays?: number[];
  assignments?: { cycleKey: string; disciplineId: number }[];
};

const WEEKDAY_FULL = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function getCycleLabel(config: CycleConfig, index: number): string {
  if (config.type === "numbered") return `Ciclo ${index + 1}`;
  const days =
    config.selectedDays && config.selectedDays.length > 0
      ? config.selectedDays
      : [1, 2, 3, 4, 5];
  return WEEKDAY_FULL[days[index % days.length]] ?? `Ciclo ${index + 1}`;
}

function getCycleKeys(config: CycleConfig): string[] {
  const count = config.count || 5;
  return Array.from({ length: count }, (_, i) => {
    if (config.type === "numbered") return `ciclo-${i + 1}`;
    const days =
      config.selectedDays && config.selectedDays.length > 0
        ? config.selectedDays
        : [1, 2, 3, 4, 5];
    return `dia-${days[i % days.length]}`;
  });
}

// ─── Types for rich programmatic content ─────────────────────────────────────
type EditalTopico = {
  id: string;
  discipline: string;
  topic: string;
  completed: boolean;
  notes?: string;
  incidencia?: number;
  quantidade?: number;
  acerto?: number;
  revisar?: boolean;
  avancar?: boolean;
  discursiva?: boolean;
  isHeader?: boolean;
};

type GroupedDiscipline = {
  name: string;
  header?: EditalTopico;
  topics: EditalTopico[];
};

function groupRows(rows: EditalTopico[]): GroupedDiscipline[] {
  const map: Record<string, GroupedDiscipline> = {};
  for (const r of rows) {
    if (!map[r.discipline])
      map[r.discipline] = { name: r.discipline, topics: [] };
    if (r.isHeader) map[r.discipline].header = r;
    else map[r.discipline].topics.push(r);
  }
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
}

function hitColor(acerto?: number): string {
  if (acerto === undefined || acerto === null || isNaN(acerto))
    return "var(--muted-foreground)";
  if (acerto >= 0.75) return "var(--accent-green)";
  if (acerto >= 0.5) return "var(--accent-amber)";
  return "var(--accent-red)";
}

function parseXlsxRows(wb: any): EditalTopico[] {
  const rows: EditalTopico[] = [];
  const sheetNames = wb.SheetNames.filter((n: string) => n !== "CONTROLE");

  for (const sheetName of sheetNames) {
    const ws = wb.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
    });
    if (!data || data.length === 0) continue;

    const headerRow = data[0];
    if (!headerRow) continue;

    const headerStr = headerRow.map((c: any) => String(c || "").toLowerCase());
    const idxIndice = headerStr.findIndex(
      (h: string) =>
        h.includes("índice") || h.includes("indice") || h.includes("index"),
    );
    const idxQtd = headerStr.findIndex(
      (h: string) => h.includes("quantidade") || h.includes("qtd"),
    );
    const idxPct = headerStr.findIndex(
      (h: string) =>
        h.includes("porcentagem") || h.includes("percent") || h.includes("%"),
    );
    const idxAcerto = 0;
    const idxRevisar = headerStr.findIndex((h: string) =>
      h.includes("revisar"),
    );
    const idxAvancar = headerStr.findIndex((h: string) => h.includes("avan"));
    const idxDiscursiva = headerStr.findIndex((h: string) =>
      h.includes("discursiva"),
    );

    const discName =
      idxIndice >= 0 && data[1]?.[idxIndice]
        ? String(data[1][idxIndice]).trim()
        : sheetName;

    const discAcerto = data[1]?.[idxAcerto];
    const discQtd = idxQtd >= 0 ? data[1]?.[idxQtd] : null;

    rows.push({
      id: `${sheetName}-header`,
      discipline: sheetName,
      topic: discName,
      completed: false,
      isHeader: true,
      acerto:
        discAcerto != null && !isNaN(Number(discAcerto))
          ? Number(discAcerto)
          : undefined,
      quantidade: discQtd != null ? Number(discQtd) : undefined,
      incidencia: 1,
    });

    for (let i = 2; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      const topicName = idxIndice >= 0 ? row[idxIndice] : null;
      if (!topicName) continue;
      const topicStr = String(topicName).trim();
      if (!topicStr) continue;

      const acertoVal = row[idxAcerto];
      const qtdVal = idxQtd >= 0 ? row[idxQtd] : null;
      const pctVal = idxPct >= 0 ? row[idxPct] : null;
      const revisarVal = idxRevisar >= 0 ? row[idxRevisar] : null;
      const avancarVal = idxAvancar >= 0 ? row[idxAvancar] : null;
      const discursivaVal = idxDiscursiva >= 0 ? row[idxDiscursiva] : null;

      rows.push({
        id: `${sheetName}-${i}`,
        discipline: sheetName,
        topic: topicStr,
        completed: false,
        isHeader: false,
        acerto:
          acertoVal != null && !isNaN(Number(acertoVal))
            ? Number(acertoVal)
            : undefined,
        quantidade:
          qtdVal != null && !isNaN(Number(qtdVal)) ? Number(qtdVal) : undefined,
        incidencia:
          pctVal != null && !isNaN(Number(pctVal)) ? Number(pctVal) : undefined,
        revisar: revisarVal === "X" || revisarVal === true,
        avancar: avancarVal === "X" || avancarVal === true,
        discursiva: discursivaVal === "X" || discursivaVal === true,
      });
    }
  }
  return rows;
}

// ─── Edital Tab ─────────────────────────────────────────────────────────────
function EditalTab({
  rows,
  setRows,
}: {
  rows: EditalTopico[];
  setRows: React.Dispatch<React.SetStateAction<EditalTopico[]>>;
  data: any;
}) {
  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => toast.success("Edital salvo!"),
    onError: (err) => toast.error(err.message),
  });

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [filterFlag, setFilterFlag] = useState<
    "all" | "revisar" | "avancar" | "discursiva" | "sem_acerto"
  >("all");
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTopicText, setEditingTopicText] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: disciplines } = trpc.discipline.list.useQuery();
  const utils = trpc.useUtils();

  const [studyModal, setStudyModal] = useState<{
    open: boolean;
    topic: EditalTopico | null;
  }>({
    open: false,
    topic: null,
  });

  const [studyForm, setStudyForm] = useState({
    disciplineId: 0,
    studyDate: new Date().toISOString().split("T")[0],
    studyTimeMinutes: 60,
  });

  const createTopic = trpc.topic.create.useMutation({
    onSuccess: () => {
      toast.success("Estudo registrado!");
      setStudyModal({ open: false, topic: null });
      utils.topic.list.invalidate();
      utils.dashboard.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const openRegisterStudy = (t: EditalTopico) => {
    const disc = disciplines?.find(
      (d) => d.name.toLowerCase() === t.discipline.toLowerCase(),
    );
    setStudyForm({
      disciplineId: disc?.id || 0,
      studyDate: new Date().toISOString().split("T")[0],
      studyTimeMinutes: 60,
    });
    setStudyModal({ open: true, topic: t });
  };

  const handleRegisterStudy = () => {
    if (!studyForm.disciplineId || !studyModal.topic) {
      toast.error("Selecione a disciplina");
      return;
    }
    createTopic.mutate({
      name: studyModal.topic.topic,
      disciplineId: studyForm.disciplineId,
      studyDate: studyForm.studyDate,
      studyTimeSeconds: studyForm.studyTimeMinutes * 60,
    });
  };

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [iaForm, setIaForm] = useState({
    role: "",
    text: "",
    file: null as File | null,
  });
  const [manualForm, setManualForm] = useState({ discipline: "", topics: "" });

  const parseEditalAi = trpc.edital.parseEdital.useMutation({
    onSuccess: (data) => {
      const updated = [...rows, ...data];
      setRows(updated);
      saveAll(updated);
      setImportModalOpen(false);
      setIaForm({ role: "", text: "", file: null });
      toast.success(`${data.length} tópicos extraídos!`);
    },
    onError: (err) => toast.error(err.message),
  });

  const quickAddManual = trpc.edital.quickAddManual.useMutation({
    onSuccess: (data) => {
      const updated = [...rows, ...data];
      setRows(updated);
      saveAll(updated);
      setImportModalOpen(false);
      setManualForm({ discipline: "", topics: "" });
      toast.success(`${data.length} tópicos adicionados!`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleAiSubmit = async () => {
    if (!iaForm.role) return toast.error("Informe o cargo.");
    if (!iaForm.text && !iaForm.file)
      return toast.error("Forneça texto ou PDF.");

    let pdfBase64: string | undefined;
    if (iaForm.file) {
      const reader = new FileReader();
      pdfBase64 = await new Promise((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(iaForm.file!);
      });
    }

    parseEditalAi.mutate({
      role: iaForm.role,
      text: iaForm.text,
      pdfBase64,
    });
  };

  const handleManualSubmit = () => {
    if (!manualForm.discipline || !manualForm.topics)
      return toast.error("Preencha todos os campos.");
    quickAddManual.mutate({
      discipline: manualForm.discipline,
      topicsText: manualForm.topics,
    });
  };

  const saveAll = (newRows?: EditalTopico[]) => {
    const toSave = newRows ?? rows;
    updateSettings.mutate({
      editalRows: toSave.map((r) => ({
        id: r.id,
        discipline: r.discipline,
        topic: r.topic,
        completed: !!r.completed,
        notes: r.notes || "",
        incidencia: r.incidencia,
        quantidade: r.quantidade,
        acerto: r.acerto,
        revisar: r.revisar,
        avancar: r.avancar,
        discursiva: r.discursiva,
        isHeader: r.isHeader,
      })),
    });
  };

  const toggleCompleted = (id: string) => {
    const updated = rows.map((r) =>
      r.id === id ? { ...r, completed: !r.completed } : r,
    );
    setRows(updated);
    saveAll(updated);
  };

  const toggleFlag = (
    id: string,
    flag: "revisar" | "avancar" | "discursiva",
  ) => {
    const updated = rows.map((r) =>
      r.id === id ? { ...r, [flag]: !r[flag] } : r,
    );
    setRows(updated);
    saveAll(updated);
  };

  const updateAcerto = (id: string, val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    const updated = rows.map((r) =>
      r.id === id ? { ...r, acerto: Math.max(0, Math.min(1, num / 100)) } : r,
    );
    setRows(updated);
    saveAll(updated);
  };

  const saveEditTopic = (id: string) => {
    if (!editingTopicText.trim()) return;
    const updated = rows.map((r) =>
      r.id === id ? { ...r, topic: editingTopicText.trim() } : r,
    );
    setRows(updated);
    saveAll(updated);
    setEditingId(null);
  };

  const deleteTopic = (id: string) => {
    const updated = rows.filter((r) => r.id !== id);
    setRows(updated);
    saveAll(updated);
  };

  const deleteDiscipline = (disciplineName: string) => {
    const updated = rows.filter((r) => r.discipline !== disciplineName);
    setRows(updated);
    saveAll(updated);
    toast.success(`Disciplina removida.`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const newRows = parseXlsxRows(wb);
      setRows(newRows);
      saveAll(newRows);
      toast.success(`Itens importados com sucesso!`);
    } catch (err) {
      toast.error("Erro ao importar planilha.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const grouped = groupRows(rows);

  const filteredGrouped = grouped
    .map((g) => ({
      ...g,
      topics: g.topics.filter((t) => {
        const matchSearch =
          !search || t.topic.toLowerCase().includes(search.toLowerCase());
        const matchFlag =
          filterFlag === "all"
            ? true
            : filterFlag === "revisar"
              ? !!t.revisar
              : filterFlag === "avancar"
                ? !!t.avancar
                : filterFlag === "discursiva"
                  ? !!t.discursiva
                  : filterFlag === "sem_acerto"
                    ? t.acerto === undefined || t.acerto === null
                    : true;
        return matchSearch && matchFlag;
      }),
    }))
    .filter((g) => g.topics.length > 0 || (!search && filterFlag === "all"));

  const toggleCollapse = (name: string) => {
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Conteúdo Programático
            </h1>
            <p className="text-[11px] font-medium text-muted-foreground opacity-60 uppercase tracking-wider">
              Mapeamento de Edital e Desempenho
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-9 px-4 rounded-md text-[10px] font-bold uppercase tracking-wider bg-secondary/50"
            onClick={() => setShowGuide(true)}
          >
            <HelpCircle size={14} className="mr-2" /> Guia
          </Button>
          <Button
            className="h-9 px-6 rounded-md text-[10px] font-bold uppercase tracking-wider"
            onClick={() => setImportModalOpen(true)}
          >
            <Plus size={14} className="mr-2" /> Importar Conteúdo (IA)
          </Button>
        </div>
      </div>

      {showGuide && (
        <Dialog open={showGuide} onOpenChange={setShowGuide}>
          <DialogContent className="max-w-2xl rounded-lg border-border bg-card p-0 overflow-hidden">
            <DialogHeader className="p-6 border-b border-border bg-secondary/30">
              <DialogTitle className="text-lg font-bold">
                Guia de Organização
              </DialogTitle>
              <DialogDescription className="text-xs">
                Como estruturar seu material para importação perfeita.
              </DialogDescription>
            </DialogHeader>
            <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                  <CheckCircle2 size={14} /> 1. Disciplinas por Abas
                </h4>
                <p className="text-sm opacity-70 leading-relaxed">
                  No Excel, cada disciplina deve ser uma aba (Sheet) separada. A
                  IA identificará o nome da matéria pelo nome da aba.
                </p>
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                  <CheckCircle2 size={14} /> 2. Colunas Padrão (TEC)
                </h4>
                <p className="text-sm opacity-70 leading-relaxed">
                  A primeira coluna deve ser o **% de Acerto**. A coluna de
                  **Índice** deve conter os nomes dos tópicos.
                </p>
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                  <CheckCircle2 size={14} /> 3. Importação via IA
                </h4>
                <p className="text-sm opacity-70 leading-relaxed">
                  Você pode simplesmente colar o texto do edital oficial ou
                  subir o PDF. Nossa IA vai estruturar as matérias e tópicos
                  para você automaticamente.
                </p>
              </div>
            </div>
            <DialogFooter className="p-4 bg-secondary/30 border-t border-border">
              <Button
                onClick={() => setShowGuide(false)}
                className="h-10 px-8 rounded-md font-bold text-[10px] uppercase tracking-wider"
              >
                Entendi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {rows.length === 0 ? (
        <div className="soe-card flex flex-col items-center justify-center py-24 px-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary/30">
            <Upload size={32} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">Sua jornada começa aqui.</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Importe sua planilha do TEC Concursos ou utilize nossa IA para
              mapear o conteúdo do seu edital automaticamente.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowGuide(true)}
              className="h-11 rounded-md px-8 text-[10px] font-bold uppercase tracking-widest"
            >
              Ver Guia
            </Button>
            <Button
              onClick={() => setImportModalOpen(true)}
              className="h-11 rounded-md px-10 text-[10px] font-bold uppercase tracking-widest"
            >
              Importar Agora
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-40 group-focus-within:opacity-100 transition-opacity" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar tópico..."
                className="w-full h-10 pl-10 pr-4 rounded-md bg-secondary/50 border border-border text-sm font-medium outline-none focus:border-primary transition-all"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
              {[
                { id: "all", label: "Tudo" },
                { id: "sem_acerto", label: "Sem Dados" },
                { id: "revisar", label: "Revisar" },
                { id: "avancar", label: "Avançar" },
                { id: "discursiva", label: "Discursiva" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterFlag(f.id as any)}
                  className={cn(
                    "h-10 px-4 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border",
                    filterFlag === f.id
                      ? "bg-primary text-white border-primary"
                      : "bg-secondary/30 border-border/50 text-muted-foreground hover:bg-secondary/50",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {filteredGrouped.map((group) => (
              <div key={group.name} className="soe-card overflow-hidden">
                <div
                  className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-secondary/20 transition-all border-b border-border/30"
                  onClick={() => toggleCollapse(group.name)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-1.5 h-6 rounded-full bg-primary" />
                    <div>
                      <h3 className="text-sm font-bold text-foreground">
                        {group.name}
                      </h3>
                      <p className="text-[10px] font-bold text-muted-foreground opacity-40 uppercase tracking-widest">
                        {group.topics.length} tópicos •{" "}
                        {Math.round(
                          (group.topics.filter((t) => t.completed).length /
                            group.topics.length) *
                            100,
                        ) || 0}
                        % concluído
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDiscipline(group.name);
                      }}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronDown
                      size={16}
                      className={cn(
                        "text-muted-foreground transition-transform duration-300",
                        collapsed[group.name] ? "-rotate-90" : "",
                      )}
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {!collapsed[group.name] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <table className="w-full text-left">
                        <thead className="bg-secondary/20 border-b border-border/20 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                          <tr>
                            <th className="px-5 py-3 w-10">Status</th>
                            <th className="px-5 py-3">Tópico</th>
                            <th className="px-5 py-3 text-right">Acerto</th>
                            <th className="px-5 py-3 text-center">Foco</th>
                            <th className="px-5 py-3 w-32">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                          {group.topics.map((t) => (
                            <tr
                              key={t.id}
                              className="hover:bg-secondary/10 transition-colors group/row"
                            >
                              <td className="px-5 py-4">
                                <button
                                  onClick={() => toggleCompleted(t.id)}
                                  className={cn(
                                    "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                                    t.completed
                                      ? "bg-primary border-primary text-white"
                                      : "bg-background border-border/50 text-transparent hover:border-primary/50",
                                  )}
                                >
                                  <Check size={12} strokeWidth={4} />
                                </button>
                              </td>
                              <td className="px-5 py-4">
                                {editingId === t.id ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      autoFocus
                                      value={editingTopicText}
                                      onChange={(e) =>
                                        setEditingTopicText(e.target.value)
                                      }
                                      onKeyDown={(e) =>
                                        e.key === "Enter" && saveEditTopic(t.id)
                                      }
                                      className="flex-1 h-8 bg-background border border-primary rounded px-2 text-xs font-medium outline-none"
                                    />
                                    <button
                                      onClick={() => saveEditTopic(t.id)}
                                      className="p-1 rounded bg-primary text-white"
                                    >
                                      <Check size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <span
                                    className={cn(
                                      "text-xs font-semibold text-foreground/80",
                                      t.completed && "opacity-40 line-through",
                                    )}
                                  >
                                    {t.topic}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <div className="flex items-center justify-end gap-3">
                                  <span
                                    className="text-[10px] font-bold tabular-nums"
                                    style={{ color: hitColor(t.acerto) }}
                                  >
                                    {t.acerto !== undefined
                                      ? `${Math.round(t.acerto * 100)}%`
                                      : "—"}
                                  </span>
                                  <input
                                    type="number"
                                    className="w-10 h-7 bg-secondary/50 border border-border/30 rounded text-[10px] font-bold text-center outline-none focus:border-primary md:opacity-0 md:group-hover/row:opacity-100 opacity-100 transition-opacity"
                                    placeholder="%"
                                    onChange={(e) =>
                                      updateAcerto(t.id, e.target.value)
                                    }
                                  />
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <div className="flex items-center justify-center gap-1.5">
                                  {[
                                    {
                                      id: "revisar",
                                      label: "R",
                                      color: "var(--accent-amber)",
                                    },
                                    {
                                      id: "avancar",
                                      label: "A",
                                      color: "var(--primary)",
                                    },
                                    {
                                      id: "discursiva",
                                      label: "D",
                                      color: "var(--accent-green)",
                                    },
                                  ].map((flag) => (
                                    <button
                                      key={flag.id}
                                      onClick={() =>
                                        toggleFlag(t.id, flag.id as any)
                                      }
                                      className={cn(
                                        "w-6 h-6 rounded-md text-[9px] font-black border transition-all",
                                        t[flag.id as keyof EditalTopico]
                                          ? "text-white border-transparent"
                                          : "bg-background border-border/30 text-muted-foreground opacity-30 hover:opacity-100",
                                      )}
                                      style={{
                                        background: t[
                                          flag.id as keyof EditalTopico
                                        ]
                                          ? flag.color
                                          : undefined,
                                      }}
                                    >
                                      {flag.label}
                                    </button>
                                  ))}
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-2 md:opacity-0 md:group-hover/row:opacity-100 opacity-100 transition-opacity">
                                  <button
                                    onClick={() => openRegisterStudy(t)}
                                    className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-all"
                                    title="Estudar Agora"
                                  >
                                    <Clock size={14} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingId(t.id);
                                      setEditingTopicText(t.topic);
                                    }}
                                    className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground transition-all"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={() => deleteTopic(t.id)}
                                    className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-all"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Register Study Modal */}
      <Dialog
        open={studyModal.open}
        onOpenChange={(o) => !o && setStudyModal({ open: false, topic: null })}
      >
        <DialogContent className="rounded-lg border-border bg-card p-6 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Registrar Estudo
            </DialogTitle>
            <DialogDescription className="text-xs">
              Inicie uma sessão de estudo para este tópico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                Disciplina
              </label>
              <Select
                value={String(studyForm.disciplineId)}
                onValueChange={(v) =>
                  setStudyForm({ ...studyForm, disciplineId: Number(v) })
                }
              >
                <SelectTrigger className="h-10 rounded-md bg-secondary/50 border-border font-bold text-xs">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="rounded-md border-border bg-card">
                  {disciplines?.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                Tópico
              </label>
              <div className="p-3 bg-secondary/30 rounded-md border border-border/50 text-xs font-bold text-muted-foreground">
                {studyModal.topic?.topic}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                  Data
                </label>
                <input
                  type="date"
                  value={studyForm.studyDate}
                  onChange={(e) =>
                    setStudyForm({ ...studyForm, studyDate: e.target.value })
                  }
                  className="w-full h-10 px-3 rounded-md bg-secondary/50 border-border text-xs font-bold [color-scheme:dark]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                  Tempo (Min)
                </label>
                <input
                  type="number"
                  value={studyForm.studyTimeMinutes}
                  onChange={(e) =>
                    setStudyForm({
                      ...studyForm,
                      studyTimeMinutes: Number(e.target.value),
                    })
                  }
                  className="w-full h-10 px-3 rounded-md bg-secondary/50 border-border text-xs font-bold"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleRegisterStudy}
              disabled={createTopic.isPending}
              className="w-full h-11 rounded-md font-bold text-[11px] uppercase tracking-widest"
            >
              {createTopic.isPending
                ? "Processando..."
                : "Iniciar e Agendar Revisões"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="max-w-2xl rounded-lg border-border bg-card p-0 overflow-hidden">
          <DialogHeader className="p-6 border-b border-border bg-secondary/30">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                <Wand2 size={20} />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">
                  Importar Conteúdo
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Alimente seu edital usando IA ou colando seu material.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <Tabs defaultValue="ia" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-secondary/30 h-12 p-1 rounded-none border-b border-border">
              <TabsTrigger
                value="ia"
                className="text-[10px] font-bold uppercase tracking-wider"
              >
                Extrair via IA
              </TabsTrigger>
              <TabsTrigger
                value="manual"
                className="text-[10px] font-bold uppercase tracking-wider"
              >
                Manual
              </TabsTrigger>
              <TabsTrigger
                value="xlsx"
                className="text-[10px] font-bold uppercase tracking-wider"
              >
                Planilha
              </TabsTrigger>
            </TabsList>
            <div className="p-8">
              <TabsContent
                value="ia"
                className="space-y-6 animate-in fade-in slide-in-from-bottom-2"
              >
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                      Cargo Pretendido
                    </label>
                    <input
                      placeholder="Ex: Auditor da Receita Federal"
                      value={iaForm.role}
                      onChange={(e) =>
                        setIaForm({ ...iaForm, role: e.target.value })
                      }
                      className="w-full h-10 px-4 rounded-md bg-secondary/30 border border-border text-sm font-bold outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                        Arquivo PDF
                      </label>
                      <label className="flex flex-col items-center justify-center h-32 rounded-md border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                        <UploadCloud size={24} className="mb-2 opacity-30" />
                        <span className="text-[10px] font-bold opacity-60">
                          {iaForm.file ? iaForm.file.name : "Subir PDF"}
                        </span>
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={(e) =>
                            setIaForm({
                              ...iaForm,
                              file: e.target.files?.[0] || null,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                        Texto do Edital
                      </label>
                      <Textarea
                        placeholder="Cole aqui..."
                        value={iaForm.text}
                        onChange={(e) =>
                          setIaForm({ ...iaForm, text: e.target.value })
                        }
                        className="h-32 rounded-md bg-secondary/30 border-border text-xs resize-none"
                      />
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleAiSubmit}
                  disabled={parseEditalAi.isPending}
                  className="w-full h-12 rounded-md font-bold text-[11px] uppercase tracking-widest"
                >
                  {parseEditalAi.isPending
                    ? "Processando..."
                    : "Extrair Estrutura com IA"}
                </Button>
              </TabsContent>
              <TabsContent
                value="manual"
                className="space-y-6 animate-in fade-in slide-in-from-bottom-2"
              >
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                      Nome da Disciplina
                    </label>
                    <input
                      placeholder="Ex: Português"
                      value={manualForm.discipline}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          discipline: e.target.value,
                        })
                      }
                      className="w-full h-10 px-4 rounded-md bg-secondary/30 border border-border text-sm font-bold outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                      Tópicos (um por linha)
                    </label>
                    <Textarea
                      placeholder="Ex:&#10;Interpretação de Texto&#10;Sintaxe..."
                      value={manualForm.topics}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, topics: e.target.value })
                      }
                      className="h-40 rounded-md bg-secondary/30 border-border text-xs resize-none"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleManualSubmit}
                  disabled={quickAddManual.isPending}
                  className="w-full h-12 rounded-md font-bold text-[11px] uppercase tracking-widest"
                >
                  {quickAddManual.isPending
                    ? "Adicionando..."
                    : "Criar Disciplina e Tópicos"}
                </Button>
              </TabsContent>
              <TabsContent
                value="xlsx"
                className="py-12 flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-2"
              >
                <div className="w-20 h-20 rounded-full bg-secondary/30 flex items-center justify-center border border-border">
                  <UploadCloud size={32} className="opacity-20" />
                </div>
                <div className="text-center space-y-2">
                  <h4 className="text-sm font-bold">
                    Importação Legada (Excel)
                  </h4>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Use este método se você já possui a planilha estruturada do
                    TEC Concursos.
                  </p>
                </div>
                <Button
                  onClick={() => fileRef.current?.click()}
                  variant="outline"
                  className="h-10 px-8 rounded-md font-bold text-[10px] uppercase tracking-widest"
                >
                  {importing ? "Importando..." : "Selecionar .XLSX"}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls"
                  onChange={handleImport}
                />
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Cycle Components ────────────────────────────────────────────────────────
function AssignDropdown({
  unassigned,
  onAssign,
}: {
  cycleKey: string;
  unassigned: { id: number; name: string; color: string }[];
  onAssign: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  if (unassigned.length === 0) return null;
  return (
    <div className="relative px-2 pb-2">
      <button
        className="w-full text-[9px] font-bold uppercase tracking-wider py-2 rounded-md border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus className="w-3.5 h-3.5" /> Adicionar
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-md shadow-2xl z-20 overflow-hidden max-h-48 overflow-y-auto bg-card border border-border">
          {unassigned.map((d) => (
            <button
              key={d.id}
              className="w-full text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-tight flex items-center gap-2 hover:bg-secondary/50 transition-colors border-b border-border last:border-0"
              onClick={() => {
                onAssign(d.id);
                setOpen(false);
              }}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: d.color }}
              />
              <span className="text-foreground">{d.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DisciplineProgressTable({
  disciplines,
  expandedDisc,
  onExpand,
}: {
  disciplines: {
    id: number;
    name: string;
    color: string;
    performance?: any;
    studyTimeSeconds: number;
  }[];
  expandedDisc: number | null;
  onExpand: (id: number | null) => void;
}) {
  const { data: topicsData } = trpc.topic.list.useQuery(
    { disciplineId: expandedDisc ?? undefined },
    { enabled: !!expandedDisc },
  );
  const topics = topicsData?.topics ?? [];

  if (disciplines.length === 0) return null;

  const fmtTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h${m > 0 ? m + "m" : ""}`;
    return `${m}min`;
  };

  return (
    <div className="soe-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-secondary/20 flex items-center gap-3">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground">
          Acompanhamento de Progresso
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/10 border-b border-border/50 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            <tr>
              <th className="text-left px-5 py-3">Disciplina / Tema</th>
              <th className="text-right px-3 py-3 w-[100px]">Questões</th>
              <th className="text-right px-3 py-3 w-[80px]">Acerto</th>
              <th className="px-5 py-3 w-[120px]">Evolução</th>
              <th className="text-right px-5 py-3 w-[100px]">Tempo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {disciplines.map((disc) => {
              const acc = disc.performance?.accuracy;
              const q = disc.performance?.questionsResolved ?? 0;
              const isExpanded = expandedDisc === disc.id;
              return (
                <Fragment key={disc.id}>
                  <tr
                    className="cursor-pointer hover:bg-secondary/10 transition-colors"
                    onClick={() => onExpand(isExpanded ? null : disc.id)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ChevronRight
                          className={cn(
                            "w-3.5 h-3.5 transition-transform duration-300 opacity-30",
                            isExpanded && "rotate-90 opacity-100 text-primary",
                          )}
                        />
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: disc.color }}
                        />
                        <span className="font-bold text-xs">{disc.name}</span>
                      </div>
                    </td>
                    <td className="text-right px-3 py-3 text-[10px] font-bold tabular-nums">
                      {q > 0 ? q : "—"}
                    </td>
                    <td
                      className="text-right px-3 py-3 text-[10px] font-black tabular-nums"
                      style={{
                        color: hitColor(acc != null ? acc / 100 : undefined),
                      }}
                    >
                      {acc != null ? `${Math.round(acc)}%` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {acc != null && (
                        <div className="h-1.5 rounded-full bg-secondary/50 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{
                              width: `${acc}%`,
                              background: hitColor(acc / 100),
                            }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="text-right px-5 py-3 text-[10px] font-bold text-muted-foreground">
                      {disc.studyTimeSeconds > 0
                        ? fmtTime(disc.studyTimeSeconds)
                        : "—"}
                    </td>
                  </tr>
                  {isExpanded && (
                    <>
                      {topics.length === 0 && (
                        <tr className="bg-secondary/5">
                          <td
                            colSpan={5}
                            className="px-12 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-30"
                          >
                            Nenhum tema registrado
                          </td>
                        </tr>
                      )}
                      {topics.map((topic) => (
                        <tr
                          key={topic.id}
                          className="bg-secondary/5 group/topic hover:bg-secondary/10 transition-colors"
                        >
                          <td className="px-12 py-2">
                            <div className="flex items-center gap-3">
                              <BookOpen
                                className="w-3 h-3 opacity-20"
                                style={{ color: disc.color }}
                              />
                              <span className="text-[11px] font-medium text-foreground/60">
                                {topic.name}
                              </span>
                            </div>
                          </td>
                          <td className="text-right px-3 py-2 text-[9px] font-bold tabular-nums opacity-40">
                            {topic.performance?.questionsResolved || "—"}
                          </td>
                          <td
                            className="text-right px-3 py-2 text-[9px] font-bold tabular-nums"
                            style={{
                              color: hitColor(
                                topic.performance?.accuracy != null
                                  ? topic.performance.accuracy / 100
                                  : undefined,
                              ),
                            }}
                          >
                            {topic.performance?.accuracy != null
                              ? `${Math.round(topic.performance.accuracy)}%`
                              : "—"}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      ))}
                    </>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CycleConfigPanel({
  config,
  onSave,
  onClose,
}: {
  config: CycleConfig;
  onSave: (c: CycleConfig) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<CycleType>(config.type);
  const [count, setCount] = useState(config.count);
  const [selectedDays, setSelectedDays] = useState<number[]>(
    config.selectedDays ?? [1, 2, 3, 4, 5],
  );

  const toggleDay = (day: number) =>
    setSelectedDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort(),
    );

  const effectiveCount = type === "weekdays" ? selectedDays.length : count;

  return (
    <div className="soe-card p-6 space-y-6 border-primary/30 bg-primary/[0.02]">
      <div className="flex items-center justify-between border-b border-border/50 pb-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">
          Configurações do Ciclo
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-secondary text-muted-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
            Tipo de Nomenclatura
          </label>
          <div className="flex gap-2 p-1 bg-secondary/30 rounded-lg">
            {(["numbered", "weekdays"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "flex-1 h-9 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                  type === t
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "numbered" ? "Numérico (1, 2...)" : "Dias da Semana"}
              </button>
            ))}
          </div>
        </div>

        {type === "numbered" ? (
          <div className="space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
              Número de Slots: {count}
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={cn(
                    "w-9 h-9 rounded-md text-xs font-bold transition-all border",
                    count === n
                      ? "bg-primary border-primary text-white"
                      : "bg-secondary/30 border-border/50 text-muted-foreground hover:border-primary/50",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
              Dias de Estudo
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "w-9 h-9 rounded-md text-[9px] font-bold uppercase transition-all border",
                    selectedDays.includes(day)
                      ? "bg-primary border-primary text-white"
                      : "bg-secondary/30 border-border/50 text-muted-foreground",
                  )}
                >
                  {WEEKDAY_NAMES[day]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 flex justify-end gap-3 border-t border-border/50 mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="h-9 px-6 rounded-md font-bold text-[10px] uppercase tracking-wider"
        >
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onSave({
              type,
              count: effectiveCount,
              selectedDays: type === "weekdays" ? selectedDays : undefined,
              assignments: config.assignments,
            })
          }
          className="h-9 px-8 rounded-md font-bold text-[10px] uppercase tracking-wider"
        >
          Salvar Configuração
        </Button>
      </div>
    </div>
  );
}

function CiclosTab({ data }: { data: any }) {
  const utils = trpc.useUtils();
  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => {
      utils.dashboard.getStats.invalidate();
      toast.success("Ciclos salvos!");
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: disciplines } = trpc.discipline.list.useQuery();

  const defaultConfig: CycleConfig = {
    type: "numbered",
    count: 5,
    selectedDays: [1, 2, 3, 4, 5],
    assignments: [],
  };
  const [config, setConfig] = useState<CycleConfig>(defaultConfig);
  const [configOpen, setConfigOpen] = useState(false);
  const [expandedDisc, setExpandedDisc] = useState<number | null>(null);

  const optimizeCycle = trpc.edital.optimizeCycle.useMutation({
    onSuccess: (suggestions) => {
      const newConfig = { ...config, assignments: suggestions };
      setConfig(newConfig);
      updateSettings.mutate({ cycleConfig: newConfig });
      toast.success("Otimizado estrategicamente!");
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (data?.settings?.cycleConfig)
      setConfig(data.settings.cycleConfig as CycleConfig);
  }, [data?.settings?.cycleConfig]);

  const cycleKeys = getCycleKeys(config);
  const assignments: { cycleKey: string; disciplineId: number }[] =
    config.assignments || [];

  const getDisciplinesInCycle = (cycleKey: string) =>
    assignments
      .filter((a) => a.cycleKey === cycleKey)
      .map((a) => disciplines?.find((d) => d.id === a.disciplineId))
      .filter(Boolean);

  const assignDiscipline = (disciplineId: number, cycleKey: string | null) => {
    let newAssignments = assignments.filter(
      (a) => a.disciplineId !== disciplineId,
    );
    if (cycleKey)
      newAssignments = [...newAssignments, { cycleKey, disciplineId }];
    const newConfig = { ...config, assignments: newAssignments };
    setConfig(newConfig);
    updateSettings.mutate({ cycleConfig: newConfig });
  };

  const unassignedDisciplines = (disciplines ?? []).filter(
    (d) => !assignments.some((a) => a.disciplineId === d.id),
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Ciclos de Estudo
            </h2>
            <p className="text-[11px] font-medium text-muted-foreground opacity-60 uppercase tracking-wider">
              Planejamento e Otimização de Carga
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-9 px-4 rounded-md text-[10px] font-bold uppercase tracking-wider bg-secondary/50 border-primary/20 text-primary"
            onClick={() => {
              if (!disciplines?.length)
                return toast.error("Cadastre disciplinas primeiro.");
              optimizeCycle.mutate({
                disciplines: disciplines.map((d) => ({
                  id: d.id,
                  name: d.name,
                  accuracy: d.performance?.accuracy ?? null,
                  questionsResolved: d.performance?.questionsResolved ?? 0,
                  studyTimeSeconds: d.studyTimeSeconds,
                })),
                cycleLength: cycleKeys.length,
              });
            }}
            disabled={optimizeCycle.isPending}
          >
            <Sparkles
              size={14}
              className={cn("mr-2", optimizeCycle.isPending && "animate-pulse")}
            />{" "}
            {optimizeCycle.isPending ? "Otimizando..." : "Otimizar via IA"}
          </Button>
          <Button
            variant="outline"
            className="h-9 px-4 rounded-md text-[10px] font-bold uppercase tracking-wider bg-secondary/50"
            onClick={() => setConfigOpen(!configOpen)}
          >
            <Settings2 size={14} className="mr-2" /> Configurar
          </Button>
        </div>
      </div>

      {configOpen && (
        <CycleConfigPanel
          config={config}
          onSave={(c) => {
            setConfig(c);
            setConfigOpen(false);
            updateSettings.mutate({ cycleConfig: c });
          }}
          onClose={() => setConfigOpen(false)}
        />
      )}

      {disciplines && disciplines.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="soe-card p-5 border-l-2 border-primary bg-primary/[0.02]">
            <div className="flex items-center gap-2 mb-2 opacity-60">
              <TrendingUp size={14} />
              <span className="text-[9px] font-bold uppercase tracking-widest">
                Carga por Slot
              </span>
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {data?.settings?.dailyGoalMinutes
                ? Math.round(
                    data.settings.dailyGoalMinutes / (cycleKeys.length || 1),
                  )
                : 0}
              <span className="text-xs font-bold text-muted-foreground ml-2 opacity-40">
                MIN / DIA
              </span>
            </p>
          </div>
          <div className="soe-card p-5 border-l-2 border-emerald-500 bg-emerald-500/[0.02]">
            <div className="flex items-center gap-2 mb-2 opacity-60">
              <CheckCircle2 size={14} />
              <span className="text-[9px] font-bold uppercase tracking-widest">
                Saúde do Ciclo
              </span>
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {Math.round(
                (assignments.length / (disciplines?.length || 1)) * 100,
              )}
              %
              <span className="text-xs font-bold text-muted-foreground ml-2 opacity-40">
                COBERTURA
              </span>
            </p>
          </div>
          <div className="soe-card p-5 border-l-2 border-amber-500 bg-amber-500/[0.02]">
            <div className="flex items-center gap-2 mb-2 opacity-60">
              <Clock size={14} />
              <span className="text-[9px] font-bold uppercase tracking-widest">
                Próximo Slot
              </span>
            </div>
            <p className="text-sm font-bold truncate">
              {getDisciplinesInCycle(cycleKeys[0])?.[0]?.name || "Não definido"}
            </p>
          </div>
        </div>
      )}

      <div
        className={cn(
          "grid gap-6",
          cycleKeys.length <= 3
            ? "grid-cols-1 md:grid-cols-3"
            : "grid-cols-1 md:grid-cols-3 lg:grid-cols-4",
        )}
      >
        {cycleKeys.map((key, idx) => {
          const discs = getDisciplinesInCycle(key);
          const label = getCycleLabel(config, idx);
          return (
            <div key={key} className="soe-card flex flex-col min-h-[180px]">
              <div className="px-4 py-3 border-b border-border bg-secondary/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-md bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-tight text-foreground/80">
                    {label}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="text-[9px] border-border/50 opacity-40"
                >
                  {discs.length}
                </Badge>
              </div>
              <div className="p-3 flex-1 space-y-2">
                {discs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full py-4 opacity-10 border-2 border-dashed border-border rounded-md">
                    <Plus size={20} />
                  </div>
                )}
                {discs.map((disc: any) => (
                  <div
                    key={disc.id}
                    className="group relative px-3 py-2 rounded-md border border-border/40 bg-secondary/10 flex items-center justify-between overflow-hidden"
                    style={{ borderLeft: `3px solid ${disc.color}` }}
                  >
                    <span className="text-[11px] font-bold truncate pr-6">
                      {disc.name}
                    </span>
                    <button
                      onClick={() => assignDiscipline(disc.id, null)}
                      className="absolute right-1 p-1 rounded-md bg-card border border-border md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity hover:text-destructive"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
              <AssignDropdown
                cycleKey={key}
                unassigned={unassignedDisciplines}
                onAssign={(id) => assignDiscipline(id, key)}
              />
            </div>
          );
        })}
      </div>

      {unassignedDisciplines.length > 0 && (
        <div className="soe-card p-4 bg-secondary/10 border-dashed">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-60 mb-3 ml-1">
            Disciplinas sem Ciclo
          </p>
          <div className="flex flex-wrap gap-2">
            {unassignedDisciplines.map((d) => (
              <div
                key={d.id}
                className="px-3 py-1.5 rounded-md border border-border/50 bg-card text-[10px] font-bold flex items-center gap-2"
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: d.color }}
                />
                {d.name}
              </div>
            ))}
          </div>
        </div>
      )}

      <DisciplineProgressTable
        disciplines={disciplines ?? []}
        onExpand={setExpandedDisc}
        expandedDisc={expandedDisc}
      />
    </div>
  );
}

export default function Edital() {
  const { data } = trpc.dashboard.getStats.useQuery();
  const [tab, setTab] = useState<Tab>("edital");
  const [rows, setRows] = useState<EditalTopico[]>([]);

  useEffect(() => {
    const saved = (data?.settings?.editalRows as EditalTopico[]) || [];
    setRows(saved);
  }, [data?.settings?.editalRows]);

  const tabs = [
    { id: "edital", label: "Conteúdo Programático", icon: FileSpreadsheet },
    { id: "ciclos", label: "Ciclos de Estudo", icon: CalendarDays },
  ];

  return (
    <div className="w-full space-y-10 pb-10">
      <div className="flex items-center gap-8 border-b border-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={cn(
                "flex items-center gap-2 pb-4 -mb-[1px] text-[11px] font-bold uppercase tracking-wider transition-all relative",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100",
              )}
            >
              <Icon size={14} />
              {t.label}
              {isActive && (
                <motion.div
                  layoutId="edital-tab-active"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full"
                />
              )}
            </button>
          );
        })}
      </div>

      {tab === "edital" && (
        <EditalTab rows={rows} setRows={setRows} data={data} />
      )}
      {tab === "ciclos" && <CiclosTab data={data} />}
    </div>
  );
}
