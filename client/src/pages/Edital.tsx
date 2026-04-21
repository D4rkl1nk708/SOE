import { useEffect, useRef, useState, Fragment } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FileSpreadsheet, Upload, Save, Search,
  ChevronDown, ChevronUp, CheckCircle2, Circle,
  CalendarDays, X, Settings2, Info, Pencil, Trash2,
  BookOpen, TrendingUp, ChevronRight, Plus, HelpCircle
} from "lucide-react";
import * as XLSX from "xlsx";


type CycleType = "numbered" | "weekdays";

type CycleConfig = {
  type: CycleType;
  count: number;
  selectedDays?: number[];
  assignments?: { cycleKey: string; disciplineId: number }[];
};

const WEEKDAY_FULL  = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const createId = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

function getCycleLabel(config: CycleConfig, index: number): string {
  if (config.type === "numbered") return `Ciclo ${index + 1}`;
  const days = config.selectedDays && config.selectedDays.length > 0 ? config.selectedDays : [1,2,3,4,5];
  return WEEKDAY_FULL[days[index % days.length]] ?? `Ciclo ${index + 1}`;
}

function getCycleKeys(config: CycleConfig): string[] {
  const count = config.count || 5;
  return Array.from({ length: count }, (_, i) => {
    if (config.type === "numbered") return `ciclo-${i + 1}`;
    const days = config.selectedDays && config.selectedDays.length > 0 ? config.selectedDays : [1,2,3,4,5];
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
    if (!map[r.discipline]) map[r.discipline] = { name: r.discipline, topics: [] };
    if (r.isHeader) map[r.discipline].header = r;
    else map[r.discipline].topics.push(r);
  }
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
}

function hitColor(acerto?: number): string {
  if (acerto === undefined || acerto === null || isNaN(acerto)) return "var(--muted-text)";
  if (acerto >= 0.75) return "var(--accent-green)";
  if (acerto >= 0.5) return "var(--accent-amber)";
  return "var(--accent-red, #dc2626)";
}

function parseXlsxRows(wb: any): EditalTopico[] {
  const rows: EditalTopico[] = [];
  const sheetNames = wb.SheetNames.filter((n: string) => n !== "CONTROLE");

  for (const sheetName of sheetNames) {
    const ws = wb.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (!data || data.length === 0) continue;

    // Row 0 is the header row for this discipline
    const headerRow = data[0];
    if (!headerRow) continue;

    // Detect column positions
    const headerStr = headerRow.map((c: any) => String(c || "").toLowerCase());
    const idxIndice = headerStr.findIndex((h: string) => h.includes("índice") || h.includes("indice") || h.includes("index"));
    const idxQtd = headerStr.findIndex((h: string) => h.includes("quantidade") || h.includes("qtd"));
    const idxPct = headerStr.findIndex((h: string) => h.includes("porcentagem") || h.includes("percent") || h.includes("%"));
    const idxAcerto = 0; // first col is acerto
    const idxRevisar = headerStr.findIndex((h: string) => h.includes("revisar"));
    const idxAvancar = headerStr.findIndex((h: string) => h.includes("avan"));
    const idxDiscursiva = headerStr.findIndex((h: string) => h.includes("discursiva"));

    // Row 0 is header for the discipline itself
    const discName = idxIndice >= 0 && data[1]?.[idxIndice]
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
      acerto: discAcerto != null && !isNaN(Number(discAcerto)) ? Number(discAcerto) : undefined,
      quantidade: discQtd != null ? Number(discQtd) : undefined,
      incidencia: 1,
    });

    // Rows 1+ are topics
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
        acerto: acertoVal != null && !isNaN(Number(acertoVal)) ? Number(acertoVal) : undefined,
        quantidade: qtdVal != null && !isNaN(Number(qtdVal)) ? Number(qtdVal) : undefined,
        incidencia: pctVal != null && !isNaN(Number(pctVal)) ? Number(pctVal) : undefined,
        revisar: revisarVal === "X" || revisarVal === true,
        avancar: avancarVal === "X" || avancarVal === true,
        discursiva: discursivaVal === "X" || discursivaVal === true,
      });
    }
  }
  return rows;
}

// ─── Edital Tab (new rich version) ───────────────────────────────────────────
function EditalTab({ rows, setRows, data }: {
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
  const [filterFlag, setFilterFlag] = useState<"all" | "revisar" | "avancar" | "discursiva" | "sem_acerto">("all");
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTopicText, setEditingTopicText] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveAll = (newRows?: EditalTopico[]) => {
    const toSave = newRows ?? rows;
    updateSettings.mutate({
      editalRows: toSave.map(r => ({
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
    const updated = rows.map(r => r.id === id ? { ...r, completed: !r.completed } : r);
    setRows(updated);
    saveAll(updated);
  };

  const toggleFlag = (id: string, flag: "revisar" | "avancar" | "discursiva") => {
    const updated = rows.map(r => r.id === id ? { ...r, [flag]: !r[flag] } : r);
    setRows(updated);
    saveAll(updated);
  };

  const updateAcerto = (id: string, val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    const updated = rows.map(r => r.id === id ? { ...r, acerto: Math.max(0, Math.min(1, num / 100)) } : r);
    setRows(updated);
    saveAll(updated);
  };

  const startEditTopic = (t: EditalTopico) => {
    setEditingId(t.id);
    setEditingTopicText(t.topic);
  };

  const saveEditTopic = (id: string) => {
    if (!editingTopicText.trim()) return;
    const updated = rows.map(r => r.id === id ? { ...r, topic: editingTopicText.trim() } : r);
    setRows(updated);
    saveAll(updated);
    setEditingId(null);
  };

  const deleteTopic = (id: string) => {
    const updated = rows.filter(r => r.id !== id);
    setRows(updated);
    saveAll(updated);
    toast.success("Tópico removido.");
  };

  const deleteDiscipline = (disciplineName: string) => {
    const updated = rows.filter(r => r.discipline !== disciplineName);
    setRows(updated);
    saveAll(updated);
    toast.success(`Disciplina "${disciplineName}" removida.`);
  };

  const clearAll = () => {
    setRows([]);
    saveAll([]);
    setConfirmClear(false);
    toast.success("Conteúdo programático limpo.");
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
      const discCount = wb.SheetNames.filter((n: string) => n !== "CONTROLE").length;
      toast.success(`${newRows.length} itens importados de ${discCount} disciplinas!`);
    } catch (err) {
      toast.error("Erro ao importar planilha.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const grouped = groupRows(rows);

  // Filter
  const filteredGrouped = grouped.map(g => ({
    ...g,
    topics: g.topics.filter(t => {
      const matchSearch = !search || t.topic.toLowerCase().includes(search.toLowerCase());
      const matchFlag =
        filterFlag === "all" ? true :
        filterFlag === "revisar" ? !!t.revisar :
        filterFlag === "avancar" ? !!t.avancar :
        filterFlag === "discursiva" ? !!t.discursiva :
        filterFlag === "sem_acerto" ? t.acerto === undefined || t.acerto === null :
        true;
      return matchSearch && matchFlag;
    }),
  })).filter(g => g.topics.length > 0 || (!search && filterFlag === "all"));

  const totalTopics = rows.filter(r => !r.isHeader).length;
  const completedTopics = rows.filter(r => !r.isHeader && r.completed).length;
  const revisarCount = rows.filter(r => !r.isHeader && r.revisar).length;
  const avancarCount = rows.filter(r => !r.isHeader && r.avancar).length;

  const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" };

  return (
    <div className="space-y-6">
      {/* Header Imersivo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[var(--primary-bg-subtle)] rounded-2xl border border-[var(--primary-border)]">
            <FileSpreadsheet className="w-6 h-6 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--app-fg)" }}>Conteúdo Programático</h1>
            <p className="text-sm opacity-60">Mapeamento completo do seu edital e evolução por tópico.</p>
          </div>
        </div>
      </div>
      {/* Guide modal */}
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowGuide(false)}>
          <div className="w-full max-w-2xl rounded-2xl overflow-y-auto max-h-[90vh]"
            style={{ background: "var(--app-bg)", border: "1px solid var(--card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between sticky top-0 z-10"
              style={{ borderBottom: "1px solid var(--card-border)", background: "var(--app-bg)" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}>
                  <HelpCircle className="h-4 w-4" style={{ color: "var(--primary)" }} />
                </div>
                <div>
                  <h2 className="font-black text-base" style={{ color: "var(--app-fg)" }}>Como montar sua planilha</h2>
                  <p className="text-xs" style={{ color: "var(--muted-text)" }}>Formato compatível com TEC Concursos</p>
                </div>
              </div>
              <button onClick={() => setShowGuide(false)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: "var(--muted-text)" }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Step 1 — Tabs */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0" style={{ background: "var(--primary)" }}>1</div>
                  <h3 className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Cada disciplina é uma aba separada</h3>
                </div>
                {/* Visual mockup of Excel tabs */}
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
                  <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider" style={{ background: "var(--stat-bg)", borderBottom: "1px solid var(--card-border)", color: "var(--muted-text)" }}>
                    Arquivo: edital_pf_2025.xlsx
                  </div>
                  <div className="p-3 flex flex-wrap gap-2" style={{ background: "var(--app-bg)" }}>
                    {["Português","Dir. Administrativo","Dir. Constitucional","Informática","Raciocínio Lógico"].map((tab, i) => (
                      <div key={tab} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                        style={{
                          background: i === 0 ? "var(--primary)" : "var(--stat-bg)",
                          color: i === 0 ? "white" : "var(--muted-text)",
                          borderColor: i === 0 ? "var(--primary)" : "var(--card-border)",
                        }}>
                        <BookOpen className="h-3 w-3" /> {tab}
                      </div>
                    ))}
                    <div className="flex items-center gap-1 px-2 py-1.5 text-xs" style={{ color: "var(--muted-text)" }}>
                      <Plus className="h-3 w-3" /> mais…
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 — Visual table */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0" style={{ background: "var(--primary)" }}>2</div>
                  <h3 className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Estrutura das colunas dentro de cada aba</h3>
                </div>
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
                  {/* Header row */}
                  <div className="grid text-[11px] font-black uppercase tracking-wider" style={{ gridTemplateColumns: "2rem 2fr 1fr 1fr 1fr 1fr 1fr", background: "var(--stat-bg)", borderBottom: "2px solid var(--primary)" }}>
                    {["#","Índice","Acerto","Quantidade","Porcentagem","Revisar","Avançar"].map((h, i) => (
                      <div key={h} className="px-2 py-2.5 truncate"
                        style={{ color: i >= 5 ? "var(--accent-amber)" : i === 0 ? "var(--muted-text)" : "var(--primary)" }}>
                        {i >= 5 ? "" : ""}{h}
                        {i === 0 ? "" : <span className="ml-1 text-[9px] opacity-50 font-normal">col {String.fromCharCode(64+i)}</span>}
                      </div>
                    ))}
                  </div>
                  {/* Row 2 — discipline summary (highlighted) */}
                  {[
                    { n: "2", idx: "Português (GERAL)", ac: "0.72", qtd: "4820", pct: "1.00", rev: "", av: "", isHeader: true },
                    { n: "3", idx: "Interpretação de Texto", ac: "0.68", qtd: "950", pct: "0.22", rev: "X", av: "" },
                    { n: "4", idx: "Ortografia e Gramática", ac: "0.55", qtd: "620", pct: "0.15", rev: "", av: "X" },
                    { n: "5", idx: "Coesão e Coerência", ac: "0.80", qtd: "410", pct: "0.10", rev: "", av: "" },
                  ].map((row) => (
                    <div key={row.n} className="grid text-[11px] transition-colors"
                      style={{ gridTemplateColumns: "2rem 2fr 1fr 1fr 1fr 1fr 1fr", borderBottom: "1px solid var(--card-border)", background: row.isHeader ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "transparent" }}>
                      <div className="px-2 py-2" style={{ color: "var(--muted-text)", opacity: 0.5 }}>{row.n}</div>
                      <div className="px-2 py-2 font-semibold truncate" style={{ color: row.isHeader ? "var(--primary)" : "var(--app-fg)" }}>
                        {row.isHeader && "⭐ "}{row.idx}
                      </div>
                      <div className="px-2 py-2 font-mono" style={{ color: parseFloat(row.ac) >= 0.7 ? "var(--accent-green)" : parseFloat(row.ac) >= 0.5 ? "var(--accent-amber)" : "var(--accent-red,#dc2626)" }}>
                        {row.ac}
                      </div>
                      <div className="px-2 py-2 font-mono" style={{ color: "var(--muted-text)" }}>{row.qtd}</div>
                      <div className="px-2 py-2 font-mono" style={{ color: "var(--muted-text)" }}>{row.pct}</div>
                      <div className="px-2 py-2 text-center font-bold" style={{ color: "var(--accent-amber)" }}>{row.rev}</div>
                      <div className="px-2 py-2 text-center font-bold" style={{ color: "var(--accent-amber)" }}>{row.av}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-start gap-2 p-2 rounded-lg" style={{ background: "color-mix(in srgb, var(--primary) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 18%, transparent)" }}>
                    <span className="text-base leading-none">⭐</span>
                    <div><p className="font-semibold" style={{ color: "var(--primary)" }}>Linha 2 = Resumo da disciplina</p><p style={{ color: "var(--muted-text)" }}>Acerto médio + total de questões. Acerto = 1.00 (100% do peso).</p></div>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded-lg" style={{ background: "color-mix(in srgb, var(--accent-amber) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-amber) 18%, transparent)" }}>
                    <span className="text-base leading-none"></span>
                    <div><p className="font-semibold" style={{ color: "var(--accent-amber)" }}>Revisar / Avançar / Discursiva</p><p style={{ color: "var(--muted-text)" }}>Escreva X na célula para ativar a flag no tópico.</p></div>
                  </div>
                </div>
              </div>

              {/* Step 3 — TEC tip */}
              <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: "color-mix(in srgb, var(--accent-green) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-green) 20%, transparent)" }}>
                <span className="text-xl leading-none shrink-0 font-bold" style={{color:"var(--accent-amber)"}}>!</span>
                <div className="text-sm">
                  <p className="font-semibold" style={{ color: "var(--accent-green)" }}>Dica: exportar direto do TEC Concursos</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--muted-text)" }}>
                    No site do TEC Concursos, vá em <strong style={{ color: "var(--app-fg)" }}>Estatísticas → Exportar Excel</strong>. O arquivo já vem no formato correto com todas as colunas. Basta fazer o upload aqui!
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6">
              <button onClick={() => setShowGuide(false)}
                className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all hover:opacity-85"
                style={{ background: "var(--primary)" }}>
                Entendido, vou importar!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm clear modal */}
      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)" }}>
          <div className="w-full max-sm rounded-2xl p-6 space-y-4" style={{ background: "var(--card-bg, var(--app-bg))", border: "1px solid var(--card-border)" }}>
            <h3 className="font-black text-base" style={{ color: "var(--app-fg)" }}>Limpar conteúdo?</h3>
            <p className="text-sm" style={{ color: "var(--muted-text)" }}>Isso apaga todos os tópicos. Não pode ser desfeito.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmClear(false)} className="flex-1 py-2 rounded-xl text-sm font-semibold" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}>Cancelar</button>
              <button onClick={clearAll} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--accent-red, #dc2626)" }}>Limpar tudo</button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--muted-text)" }} />
          <input placeholder="Pesquisar tópico..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none" style={inputStyle} />
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        <button onClick={() => setShowGuide(true)} title="Como montar a planilha"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium hover:opacity-80"
          style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--muted-text)" }}>
          <HelpCircle className="h-4 w-4" /> Guia
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={importing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-85"
          style={{ background: "var(--primary)", color: "white" }}>
          <Upload className="h-4 w-4" />{importing ? "Importando..." : "Importar xlsx"}
        </button>
        {rows.length > 0 && (
          <button onClick={() => setConfirmClear(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium hover:opacity-80"
            style={{ background: "var(--stat-bg)", border: "1px solid var(--accent-red, #dc2626)", color: "var(--accent-red, #dc2626)" }}>
            <Trash2 className="h-4 w-4" /> Limpar
          </button>
        )}
      </div>

      {/* Stats bar */}
      {totalTopics > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total de tópicos", value: totalTopics, color: "var(--primary)", icon: BookOpen },
            { label: "Concluídos", value: completedTopics, color: "#10b981", icon: CheckCircle2 },
            { label: "Para revisar", value: revisarCount, color: "#f59e0b", icon: TrendingUp },
            { label: "Para avançar", value: avancarCount, color: "#3b82f6", icon: ChevronRight },
          ].map(s => (
            <div key={s.label} className="soe-card p-5 relative overflow-hidden group">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">{s.label}</p>
                <s.icon className="w-4 h-4 opacity-20 group-hover:opacity-100 transition-opacity" style={{ color: s.color }} />
              </div>
              <p className="text-3xl font-black tabular-nums" style={{ color: s.color }}>{s.value}</p>
              <div className="absolute bottom-0 left-0 h-1 bg-current opacity-10 transition-all group-hover:opacity-30" style={{ width: '100%', color: s.color }} />
            </div>
          ))}
        </div>
      )}

      {/* Filter chips */}
      {totalTopics > 0 && (
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "Todos", null],
            ["revisar", "Revisar", "var(--accent-amber)"],
            ["avancar", "Avançar", "var(--accent-blue, #2563eb)"],
            ["discursiva", "Discursiva", "var(--accent-violet, #7c3aed)"],
            ["sem_acerto", "Sem acerto", "var(--muted-text)"],
          ] as [string, string, string | null][]).map(([val, label, color]) => (
            <button key={val} onClick={() => setFilterFlag(val as any)}
              className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all border ${filterFlag === val ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-lg shadow-[var(--primary-shadow)]' : 'bg-white/5 text-white/30 border-white/5 hover:bg-white/10'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-6 rounded-[2rem] border-2 border-dashed border-white/5 bg-white/[0.02]">
          <div className="w-24 h-24 rounded-3xl bg-[var(--primary-bg-subtle)] flex items-center justify-center border border-[var(--primary-border)] shadow-2xl shadow-[var(--primary-shadow)]">
            <Upload className="h-10 w-10 text-[var(--primary)] animate-bounce" />
          </div>
          <div className="text-center space-y-2">
            <p className="font-black text-2xl" style={{ color: "var(--app-fg)" }}>Sua jornada começa aqui.</p>
            <p className="text-sm max-w-sm opacity-50 mx-auto leading-relaxed">
              Importe sua planilha do TEC Concursos ou siga nosso guia para montar seu mapeamento personalizado.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowGuide(true)}
              className="px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest bg-white/5 hover:bg-white/10 transition-all">
              Ver Guia
            </button>
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-white shadow-lg shadow-[var(--primary-shadow)] transition-all active:scale-95"
              style={{ background: "var(--primary)" }}>
              <Upload className="h-4 w-4" /> Importar Agora
            </button>
          </div>
        </div>
      )}

      {/* Discipline groups */}
      {filteredGrouped.map(group => {
        const isCollapsed = collapsed[group.name];
        const header = group.header;
        const completedInGroup = group.topics.filter(t => t.completed).length;
        const progressPct = group.topics.length > 0 ? Math.round((completedInGroup / group.topics.length) * 100) : 0;

        return (
          <div key={group.name} className="soe-card overflow-hidden group/disc">
            {/* Discipline header */}
            <div
              className="flex items-center gap-4 px-6 py-4 select-none cursor-pointer hover:bg-white/[0.02] transition-colors"
              onClick={() => setCollapsed(c => ({ ...c, [group.name]: !c[group.name] }))}>
              <div className={`p-2 rounded-lg transition-all ${isCollapsed ? 'bg-white/5 text-white/40' : 'bg-[var(--primary-bg-subtle)] text-[var(--primary)]'}`}>
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-black text-lg tracking-tight" style={{ color: "var(--app-fg)" }}>{group.name}</span>
                  {header?.acerto !== undefined && (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: hitColor(header.acerto) }} />
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: hitColor(header.acerto) }}>
                        {Math.round(header.acerto * 100)}% acerto
                      </span>
                    </div>
                  )}
                </div>
                {group.topics.length > 0 && (
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden max-w-[200px]">
                      <div className="h-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary-shadow)] transition-all duration-500" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">{completedInGroup} / {group.topics.length} concluídos</span>
                  </div>
                )}
              </div>
              <button title="Remover disciplina"
                onClick={(e) => { e.stopPropagation(); deleteDiscipline(group.name); }}
                className="p-2 rounded-xl hover:bg-rose-500/10 text-rose-500/20 hover:text-rose-500 transition-all opacity-0 group-hover/disc:opacity-100">
                <Trash2 className="h-5 w-5" />
              </button>
            </div>

            {/* Topics table */}
            {!isCollapsed && group.topics.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ background: "var(--card-bg, var(--app-bg))" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--card-border)", background: "var(--stat-bg)" }}>
                      <th className="text-left px-4 py-2 font-semibold w-6" style={{ color: "var(--muted-text)" }}></th>
                      <th className="text-left px-2 py-2 font-semibold" style={{ color: "var(--muted-text)" }}>Tópico</th>
                      <th className="text-center px-2 py-2 font-semibold whitespace-nowrap" style={{ color: "var(--muted-text)" }}>Questões</th>
                      <th className="text-center px-2 py-2 font-semibold whitespace-nowrap" style={{ color: "var(--muted-text)" }}>Incidência</th>
                      <th className="text-center px-2 py-2 font-semibold whitespace-nowrap" style={{ color: "var(--muted-text)" }}>Acerto</th>
                      <th className="text-center px-2 py-2 font-semibold" style={{ color: "var(--muted-text)" }}>Flags</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.topics.map((t, i) => (
                      <tr key={t.id}
                        className="transition-all hover:bg-white/[0.01]"
                        style={{
                          borderBottom: i < group.topics.length - 1 ? "1px solid var(--card-border)" : "none",
                          opacity: t.completed ? 0.4 : 1,
                          background: t.completed ? "rgba(16, 185, 129, 0.02)" : "transparent",
                        }}>
                        {/* Checkbox */}
                        <td className="px-4 py-2.5">
                          <button onClick={() => toggleCompleted(t.id)}
                            style={{ color: t.completed ? "var(--accent-green)" : "var(--muted-text)" }}>
                            {t.completed ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                          </button>
                        </td>
                        {/* Topic name — inline editable */}
                        <td className="px-2 py-2.5 max-w-xs">
                          {editingId === `name-${t.id}` ? (
                            <input
                              autoFocus
                              defaultValue={editingTopicText}
                              onChange={e => setEditingTopicText(e.target.value)}
                              onBlur={() => saveEditTopic(t.id)}
                              onKeyDown={e => { if (e.key === "Enter") saveEditTopic(t.id); if (e.key === "Escape") setEditingId(null); }}
                              className="w-full px-2 py-1 rounded-lg outline-none text-xs"
                              style={{ background: "var(--input-bg)", border: "1px solid var(--primary)", color: "var(--app-fg)" }}
                            />
                          ) : (
                            <span className={`leading-tight ${t.completed ? "line-through" : ""}`} style={{ color: "var(--app-fg)" }}>
                              {t.topic}
                            </span>
                          )}
                        </td>
                        {/* Quantidade */}
                        <td className="px-2 py-2.5 text-center whitespace-nowrap" style={{ color: "var(--muted-text)" }}>
                          {t.quantidade?.toLocaleString() ?? "—"}
                        </td>
                        {/* Incidência bar */}
                        <td className="px-2 py-2.5 text-center">
                          {t.incidencia !== undefined ? (
                            <div className="flex items-center gap-2 justify-center">
                              <div className="w-12 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                <div className="h-full bg-[var(--primary)] opacity-60" style={{ width: `${Math.round(t.incidencia * 100)}%` }} />
                              </div>
                              <span className="text-[10px] font-black opacity-30">{(t.incidencia * 100).toFixed(0)}%</span>
                            </div>
                          ) : "—"}
                        </td>
                        {/* Acerto — editable */}
                        <td className="px-2 py-2.5 text-center">
                          {editingId === t.id ? (
                            <input type="number" min={0} max={100} step={1}
                              defaultValue={t.acerto !== undefined ? Math.round(t.acerto * 100) : ""}
                              autoFocus
                              onBlur={e => { updateAcerto(t.id, e.target.value); setEditingId(null); }}
                              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingId(null); }}
                              className="w-16 text-center px-2 py-1 rounded-lg outline-none text-xs"
                              style={inputStyle} />
                          ) : (
                            <button onClick={() => setEditingId(t.id)}
                              className="font-bold px-2 py-0.5 rounded-lg transition-all hover:opacity-70"
                              style={{ color: hitColor(t.acerto), background: `${hitColor(t.acerto)}18` }}>
                              {t.acerto !== undefined ? `${Math.round(t.acerto * 100)}%` : "—"}
                            </button>
                          )}
                        </td>
                        {/* Flags */}
                        <td className="px-2 py-2.5">
                          <div className="flex items-center justify-center gap-1.5">
                            {([
                              ["revisar", "R", "var(--accent-amber)", "Revisar"],
                              ["avancar", "A", "var(--accent-blue, #2563eb)", "Avançar"],
                              ["discursiva", "D", "var(--accent-violet, #7c3aed)", "Discursiva"],
                            ] as [keyof EditalTopico, string, string, string][]).map(([flag, letter, color, title]) => (
                              <button key={flag} title={title}
                                onClick={() => toggleFlag(t.id, flag as "revisar" | "avancar" | "discursiva")}
                                className={`w-6 h-6 rounded-lg text-[10px] font-black transition-all flex items-center justify-center border ${t[flag] ? 'text-white shadow-sm' : 'text-white/10 border-white/5 bg-white/[0.02] hover:text-white/30'}`}
                                style={{
                                  backgroundColor: t[flag] ? color : undefined,
                                  borderColor: t[flag] ? color : undefined,
                                }}>
                                {letter}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-1">
                            <button title="Editar nome"
                              onClick={() => { setEditingId(`name-${t.id}`); setEditingTopicText(t.topic); }}
                              className="p-1 rounded-lg hover:opacity-70 transition-all"
                              style={{ color: "var(--muted-text)" }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button title="Remover tópico"
                              onClick={() => deleteTopic(t.id)}
                              className="p-1 rounded-lg hover:opacity-70 transition-all"
                              style={{ color: "var(--accent-red, #dc2626)" }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AssignDropdown({ cycleKey, unassigned, onAssign }: {
  cycleKey: string;
  unassigned: { id: number; name: string; color: string }[];
  onAssign: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  if (unassigned.length === 0) return null;
  return (
    <div className="relative px-2 pb-2">
      <button
        className="w-full text-xs py-1.5 rounded-lg flex items-center justify-center gap-1.5 border border-dashed hover:opacity-70 transition-opacity"
        style={{ color: "var(--primary)", borderColor: "var(--primary)" }}
        onClick={() => setOpen(v => !v)}
      >
        <Plus className="w-3.5 h-3.5" /> Adicionar disciplina
      </button>
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1 rounded-lg shadow-xl z-20 overflow-hidden max-h-48 overflow-y-auto"
          style={{ background: "var(--app-bg)", border: "1px solid var(--card-border)" }}>
          {unassigned.map(d => (
            <button key={d.id} className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:opacity-70 transition-opacity"
              style={{ borderBottom: "1px solid var(--card-border)" }}
              onClick={() => { onAssign(d.id); setOpen(false); }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
              <span style={{ color: "var(--app-fg)" }}>{d.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Discipline Progress Table ────────────────────────────────────────────────
function DisciplineProgressTable({ disciplines, expandedDisc, onExpand }: {
  disciplines: { id: number; name: string; color: string; performance?: any; studyTimeSeconds: number }[];
  expandedDisc: number | null;
  onExpand: (id: number | null) => void;
}) {
  const { data: topicsData } = trpc.topic.list.useQuery(
    { disciplineId: expandedDisc ?? undefined },
    { enabled: !!expandedDisc }
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
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--card-border)", background: "var(--stat-bg)" }}>
        <TrendingUp className="w-4 h-4" style={{ color: "var(--primary)" }} />
        <span className="text-sm font-semibold" style={{ color: "var(--app-fg)" }}>Avanço por Disciplina e Tema</span>
        <span className="text-xs ml-auto" style={{ color: "var(--muted-text)" }}>Clique para expandir temas</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--stat-bg)", borderBottom: "1px solid var(--card-border)" }}>
              <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: "var(--muted-text)" }}>Disciplina / Tema</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold w-[80px]" style={{ color: "var(--muted-text)" }}>Questões</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold w-[70px]" style={{ color: "var(--muted-text)" }}>Acerto</th>
              <th className="px-4 py-2.5 text-xs font-semibold w-[100px]" style={{ color: "var(--muted-text)" }}>Progresso</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold w-[70px]" style={{ color: "var(--muted-text)" }}>Tempo</th>
            </tr>
          </thead>
          <tbody>
            {disciplines.map((disc) => {
              const acc = disc.performance?.accuracy;
              const q = disc.performance?.questionsResolved ?? 0;
              const accColor = acc == null ? "var(--muted-text)" : acc >= 70 ? "var(--accent-green)" : acc >= 50 ? "#f59e0b" : "var(--accent-red)";
              const isExpanded = expandedDisc === disc.id;
              return (
                <Fragment key={disc.id}>
                  <tr className="cursor-pointer hover:opacity-80 transition-opacity" style={{ borderBottom: "1px solid var(--card-border)" }}
                    onClick={() => onExpand(isExpanded ? null : disc.id)}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} style={{ color: "var(--muted-text)" }} />
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: disc.color }} />
                        <span className="font-semibold text-xs" style={{ color: "var(--app-fg)" }}>{disc.name}</span>
                      </div>
                    </td>
                    <td className="text-right px-3 py-2.5 text-xs" style={{ color: "var(--app-fg)" }}>{q > 0 ? q : "—"}</td>
                    <td className="text-right px-3 py-2.5 text-xs font-bold" style={{ color: accColor }}>{acc != null ? `${Math.round(acc)}%` : "—"}</td>
                    <td className="px-4 py-2.5">
                      {acc != null ? (
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--stat-border)" }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(acc, 100)}%`, background: accColor }} />
                        </div>
                      ) : <span className="text-xs" style={{ color: "var(--muted-text)" }}>sem dados</span>}
                    </td>
                    <td className="text-right px-3 py-2.5 text-xs" style={{ color: "var(--muted-text)" }}>{disc.studyTimeSeconds > 0 ? fmtTime(disc.studyTimeSeconds) : "—"}</td>
                  </tr>
                  {isExpanded && topics.length === 0 && (
                    <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                      <td colSpan={5} className="px-10 py-2 text-xs" style={{ color: "var(--muted-text)", background: "var(--stat-bg)" }}>Nenhum tema cadastrado para esta disciplina</td>
                    </tr>
                  )}
                  {isExpanded && topics.map((topic, ti) => {
                    const tacc = topic.performance?.accuracy;
                    const tq = topic.performance?.questionsResolved ?? 0;
                    const tc = tacc == null ? "var(--muted-text)" : tacc >= 70 ? "var(--accent-green)" : tacc >= 50 ? "#f59e0b" : "var(--accent-red)";
                    return (
                      <tr key={`topic-${topic.id}`}
                        style={{ borderBottom: ti < topics.length - 1 ? "1px solid var(--card-border)" : "1px solid var(--card-border)", background: "var(--stat-bg)" }}>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2 pl-7">
                            <BookOpen className="w-3 h-3 flex-shrink-0" style={{ color: disc.color, opacity: 0.7 }} />
                            <span className="text-xs" style={{ color: "var(--muted-text)" }}>{topic.name}</span>
                          </div>
                        </td>
                        <td className="text-right px-3 py-2 text-xs" style={{ color: "var(--muted-text)" }}>{tq > 0 ? tq : "—"}</td>
                        <td className="text-right px-3 py-2 text-xs font-semibold" style={{ color: tc }}>{tacc != null ? `${Math.round(tacc)}%` : "—"}</td>
                        <td className="px-4 py-2">
                          {tacc != null && (
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--stat-border)" }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.min(tacc, 100)}%`, background: tc }} />
                            </div>
                          )}
                        </td>
                        <td className="text-right px-3 py-2 text-xs" style={{ color: "var(--muted-text)" }}>{topic.studyTimeSeconds > 0 ? fmtTime(topic.studyTimeSeconds) : "—"}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Cycle Config Panel ───────────────────────────────────────────────────────
function CycleConfigPanel({ config, onSave, onClose }: {
  config: CycleConfig;
  onSave: (c: CycleConfig) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<CycleType>(config.type);
  const [count, setCount] = useState(config.count);
  const [selectedDays, setSelectedDays] = useState<number[]>(config.selectedDays ?? [1,2,3,4,5]);

  const toggleDay = (day: number) => setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
  const effectiveCount = type === "weekdays" ? selectedDays.length : count;

  const handleSave = () => {
    if (type === "weekdays" && selectedDays.length === 0) { toast.error("Selecione ao menos um dia da semana."); return; }
    onSave({ type, count: effectiveCount, selectedDays: type === "weekdays" ? selectedDays : undefined, assignments: config.assignments });
  };

  return (
    <div className="soe-card p-4 space-y-4" style={{ border: "1px solid var(--primary)" }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: "var(--app-fg)" }}>Configurar Ciclos</span>
        <button onClick={onClose} className="p-1 rounded hover:opacity-60" style={{ color: "var(--muted-text)" }}><X className="w-4 h-4" /></button>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-text)" }}>Tipo de nomenclatura</label>
        <div className="flex gap-2">
          {([["numbered", "Ciclo 1, 2, 3..."], ["weekdays", "Dias da semana"]] as [CycleType, string][]).map(([t, label]) => (
            <button key={t} className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
              style={{ background: type === t ? "var(--primary)" : "var(--stat-bg)", color: type === t ? "white" : "var(--app-fg)", border: `1px solid ${type === t ? "var(--primary)" : "var(--card-border)"}` }}
              onClick={() => setType(t)}>{label}</button>
          ))}
        </div>
      </div>

      {type === "numbered" && (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-text)" }}>
            Número de ciclos: <span style={{ color: "var(--primary)" }}>{count}</span>
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {[2,3,4,5,6,7].map(n => (
              <button key={n} className="w-10 h-10 rounded-full text-sm font-bold transition-all"
                style={{ background: count === n ? "var(--primary)" : "var(--stat-bg)", color: count === n ? "white" : "var(--app-fg)", border: `1px solid ${count === n ? "var(--primary)" : "var(--card-border)"}` }}
                onClick={() => setCount(n)}>{n}</button>
            ))}
          </div>
        </div>
      )}

      {type === "weekdays" && (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-text)" }}>Dias de estudo ({selectedDays.length} selecionados)</label>
          <div className="flex gap-1.5 flex-wrap">
            {[0,1,2,3,4,5,6].map(day => {
              const sel = selectedDays.includes(day);
              return (
                <button key={day} className="w-10 h-10 rounded-full text-xs font-bold transition-all"
                  style={{ background: sel ? "var(--primary)" : "var(--stat-bg)", color: sel ? "white" : "var(--app-fg)", border: `1px solid ${sel ? "var(--primary)" : "var(--card-border)"}` }}
                  onClick={() => toggleDay(day)}>{WEEKDAY_NAMES[day]}</button>
              );
            })}
          </div>
          {selectedDays.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {selectedDays.map((d, i) => (
                <span key={d} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--primary)", color: "white", opacity: 0.9 }}>
                  {i + 1}. {WEEKDAY_FULL[d]}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg p-3" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
        <p className="text-xs font-semibold mb-2" style={{ color: "var(--muted-text)" }}>PRÉVIA</p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: effectiveCount }, (_, i) => (
            <span key={i} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: "var(--card-bg, var(--app-bg))", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}>
              {getCycleLabel({ type, count: effectiveCount, selectedDays }, i)}
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={handleSave} className="gap-2"><Save className="w-4 h-4" /> Salvar</Button>
      </div>
    </div>
  );
}

// ─── Ciclos Tab ───────────────────────────────────────────────────────────────
function CiclosTab({ data }: { data: any }) {
  const utils = trpc.useUtils();
  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => { utils.dashboard.getStats.invalidate(); toast.success("Ciclos salvos!"); },
    onError: (err) => toast.error(err.message),
  });

  const { data: disciplines } = trpc.discipline.list.useQuery();

  const defaultConfig: CycleConfig = { type: "numbered", count: 5, selectedDays: [1,2,3,4,5], assignments: [] };
  const [config, setConfig] = useState<CycleConfig>(defaultConfig);
  const [configOpen, setConfigOpen] = useState(false);
  const [expandedDisc, setExpandedDisc] = useState<number | null>(null);

  useEffect(() => {
    if (data?.settings?.cycleConfig) setConfig(data.settings.cycleConfig as CycleConfig);
  }, [data?.settings?.cycleConfig]);

  const cycleKeys = getCycleKeys(config);
  const assignments: { cycleKey: string; disciplineId: number }[] = config.assignments || [];

  type DisciplineItem = NonNullable<typeof disciplines>[0];

  const getDisciplinesInCycle = (cycleKey: string): DisciplineItem[] =>
    assignments
      .filter(a => a.cycleKey === cycleKey)
      .map(a => disciplines?.find(d => d.id === a.disciplineId))
      .filter((d): d is DisciplineItem => Boolean(d));

  const getAssignedCycleKey = (disciplineId: number) =>
    assignments.find(a => a.disciplineId === disciplineId)?.cycleKey ?? null;

  const assignDiscipline = (disciplineId: number, cycleKey: string | null) => {
    let newAssignments = assignments.filter(a => a.disciplineId !== disciplineId);
    if (cycleKey) newAssignments = [...newAssignments, { cycleKey, disciplineId }];
    const newConfig = { ...config, assignments: newAssignments };
    setConfig(newConfig);
    updateSettings.mutate({ cycleConfig: newConfig });
  };

  const saveCycleConfig = (newConfig: CycleConfig) => {
    const keys = getCycleKeys(newConfig);
    const filtered = (newConfig.assignments || []).filter(a => keys.includes(a.cycleKey));
    const final = { ...newConfig, assignments: filtered };
    setConfig(final);
    setConfigOpen(false);
    updateSettings.mutate({ cycleConfig: final });
  };

  const unassignedDisciplines = (disciplines ?? []).filter(d => !getAssignedCycleKey(d.id));
  const cols = Math.min(cycleKeys.length, cycleKeys.length <= 3 ? cycleKeys.length : cycleKeys.length <= 5 ? Math.ceil(cycleKeys.length / 2) : 3);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-base" style={{ color: "var(--app-fg)" }}>Controle de Ciclos</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-text)" }}>Organize suas disciplinas por ciclo e acompanhe o avanço por tema</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setConfigOpen(v => !v)}>
          <Settings2 className="w-4 h-4" />Configurar
        </Button>
      </div>

      {configOpen && <CycleConfigPanel config={config} onSave={saveCycleConfig} onClose={() => setConfigOpen(false)} />}

      {/* No disciplines warning */}
      {(!disciplines || disciplines.length === 0) && (
        <div className="soe-card p-8 text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--primary)" }} />
          <p className="font-semibold text-sm mb-1" style={{ color: "var(--app-fg)" }}>Nenhuma disciplina cadastrada</p>
          <p className="text-xs" style={{ color: "var(--muted-text)" }}>Cadastre suas disciplinas em "Disciplinas" primeiro para organizar os ciclos.</p>
        </div>
      )}

      {/* Cycles grid */}
      {disciplines && disciplines.length > 0 && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${cycleKeys.length <= 3 ? cycleKeys.length : cycleKeys.length <= 5 ? "2" : "3"}, minmax(0, 1fr))` }}
        >
          {cycleKeys.map((key, idx) => {
            const discsInCycle = getDisciplinesInCycle(key);
            const label = getCycleLabel(config, idx);
            return (
              <div key={key} className="soe-card overflow-visible flex flex-col">
                <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--card-border)", background: "var(--stat-bg)", borderRadius: "inherit" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "var(--primary)", color: "white" }}>
                      {idx + 1}
                    </div>
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--app-fg)" }}>{label}</span>
                  </div>
                  <span className="text-xs flex-shrink-0 ml-1" style={{ color: "var(--muted-text)" }}>{discsInCycle.length}</span>
                </div>
                <div className="flex-1 p-2 space-y-1.5 min-h-[70px]">
                  {discsInCycle.length === 0 && (
                    <div className="flex items-center justify-center h-10 text-xs rounded-lg border-2 border-dashed" style={{ color: "var(--muted-text)", borderColor: "var(--card-border)" }}>
                      Vazio
                    </div>
                  )}
                  {discsInCycle.map((disc) => {
                    const acc = disc.performance?.accuracy;
                    const accColor = acc == null ? "var(--muted-text)" : acc >= 70 ? "var(--accent-green)" : acc >= 50 ? "#f59e0b" : "var(--accent-red)";
                    return (
                      <div key={disc.id}
                        className="rounded-lg px-2.5 py-2 flex items-center gap-2 group"
                        style={{ background: disc.color + "18", border: `1px solid ${disc.color}30` }}
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: disc.color }} />
                        <span className="text-xs font-medium flex-1 truncate" style={{ color: "var(--app-fg)" }}>{disc.name}</span>
                        {acc != null && <span className="text-xs font-bold flex-shrink-0" style={{ color: accColor }}>{Math.round(acc)}%</span>}
                        <button
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          style={{ color: "var(--muted-text)" }}
                          onClick={() => assignDiscipline(disc.id, null)}
                          title="Remover do ciclo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <AssignDropdown cycleKey={key} unassigned={unassignedDisciplines} onAssign={(id) => assignDiscipline(id, key)} />
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned disciplines */}
      {unassignedDisciplines.length > 0 && (
        <div className="soe-card p-3">
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--muted-text)" }}>SEM CICLO ATRIBUÍDO</p>
          <div className="flex flex-wrap gap-1.5">
            {unassignedDisciplines.map(d => (
              <span key={d.id} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg" style={{ background: d.color + "18", border: `1px solid ${d.color}30`, color: "var(--app-fg)" }}>
                <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                {d.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Progress table */}
      <DisciplineProgressTable disciplines={disciplines ?? []} onExpand={setExpandedDisc} expandedDisc={expandedDisc} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
type Tab = "edital" | "ciclos";

export default function Edital() {
  const { data } = trpc.dashboard.getStats.useQuery();
  const [tab, setTab] = useState<Tab>("edital");
  const [rows, setRows] = useState<EditalTopico[]>([]);

  useEffect(() => {
    const saved = (data?.settings?.editalRows as EditalTopico[]) || [];
    setRows(saved);
  }, [data?.settings?.editalRows]);

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight soe-gold-text flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6" />
          Edital & Ciclos
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-text)" }}>
          Gerencie o conteúdo programático e organize seus ciclos de estudo
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
        {([
          ["edital", "Conteúdo Programático", FileSpreadsheet],
          ["ciclos", "Ciclos de Estudo", CalendarDays],
        ] as [Tab, string, any][]).map(([t, label, Icon]) => (
          <button
            key={t}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{ background: tab === t ? "var(--primary)" : "transparent", color: tab === t ? "white" : "var(--muted-text)" }}
            onClick={() => setTab(t)}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{t === "edital" ? "Edital" : "Ciclos"}</span>
          </button>
        ))}
      </div>

      {tab === "edital" && <EditalTab rows={rows} setRows={setRows} data={data} />}
      {tab === "ciclos" && <CiclosTab data={data} />}
    </div>
  );
}
