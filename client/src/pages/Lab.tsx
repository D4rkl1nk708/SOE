import { useState, useCallback, useEffect } from "react";
import {
  Upload,
  FileJson,
  CheckCircle2,
  Loader2,
  Search,
  Download,
  Microscope,
  AlertTriangle,
  Clock,
  XCircle,
  Database,
  ListChecks,
  Play,
  Trash2,
  Cpu,
  Zap,
  Share2,
  FlaskConical,
  Target,
  BarChart3,
  ChevronRight,
  Info,
  Edit2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import MinedResolutionPanel from "./MinedResolutionPanel";
import ReactMarkdown from "react-markdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface QueueItem {
  id: string;
  file: File;
  status: "pending" | "processing" | "completed" | "error";
  error?: string;
}

function QueueItemProgress({ item }: { item: QueueItem }) {
  const { data: progress } = trpc.lab.getProgress.useQuery(
    { fileName: item.file.name },
    {
      enabled: item.status === "processing",
      refetchInterval: 1500,
    },
  );

  const percentage =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {item.status === "processing" ? (
            <Loader2 className="animate-spin text-primary" size={18} />
          ) : item.status === "completed" ? (
            <CheckCircle2 className="text-accent-green" size={18} />
          ) : item.status === "error" ? (
            <XCircle className="text-destructive" size={18} />
          ) : (
            <Clock className="opacity-30" size={18} />
          )}
          <div className="flex flex-col">
            <span className="text-xs font-bold truncate max-w-[150px] md:max-w-[200px]">
              {item.file.name}
            </span>
            {item.status === "processing" && progress && progress.total > 0 && (
              <span className="text-[9px] font-black uppercase text-primary animate-pulse">
                Processando Parte {progress.current}/{progress.total} (
                {percentage}%)
              </span>
            )}
            {item.error && (
              <span className="text-[10px] text-destructive font-medium truncate max-w-[200px]">
                {item.error}
              </span>
            )}
          </div>
        </div>
        <span
          className={`text-[9px] font-black uppercase px-3 py-1 rounded-lg bg-background border border-border shadow-sm ${item.status === "error" ? "text-destructive border-destructive/20 bg-destructive/5" : "opacity-60"}`}
        >
          {item.status}
        </span>
      </div>
      {item.status === "processing" && percentage > 0 && (
        <div className="w-full bg-secondary/50 h-1.5 rounded-full overflow-hidden border border-border/10">
          <div
            className="bg-primary h-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function Lab() {
  const [activeTab, setActiveTab] = useState<"mining" | "library" | "strategy">(
    "mining",
  );
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [previewQuestions, setPreviewQuestions] = useState<{
    questions: any[];
    fileName: string;
  } | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [expandedExam, setExpandedExam] = useState<string | null>(null);
  const [filterTopicId, setFilterTopicId] = useState<number | undefined>();

  // Detectar início automático via URL (Treino de Elite Direto)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("startElite") === "true") {
      const tId = params.get("topicId");
      if (tId) setFilterTopicId(Number(tId));
      setShowPlayer(true);
      setActiveTab("library");
    }
  }, []);

  // States para Estratégia e Busca
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [coverageData, setCoverageData] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [searchResults, setSearchResults] = useState<
    { title: string; url: string }[]
  >([]);
  const [downloadingUrls, setDownloadingUrls] = useState<Set<string>>(
    new Set(),
  );

  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: history, refetch: refetchHistory } =
    trpc.lab.listHistory.useQuery();

  const settings = stats?.settings as any;
  const apiKey = settings?.aiApiKey || "";
  const provider = (settings?.aiProvider as any) || "gemini";

  const processMutation = trpc.lab.processPdf.useMutation();
  const integrateMutation = trpc.lab.integrateExam.useMutation();
  const deleteMutation = trpc.lab.deleteIntegratedExam.useMutation();
  const deleteFileMutation = trpc.lab.deleteMinedFile.useMutation();
  const importJsonMutation = trpc.lab.importJson.useMutation();
  const analyzeTrendMutation = trpc.lab.analyzeBancaTrend.useMutation();
  const mapEditalMutation = trpc.lab.mapToEdital.useMutation();
  const searchOnlineMutation = trpc.lab.searchOnlineExams.useMutation();
  const downloadUrlMutation = trpc.lab.downloadFromUrl.useMutation();
  const renameFileMutation = trpc.lab.renameMinedFile.useMutation();
  const utils = trpc.useUtils();

  const handleDownloadAndMine = async (url: string, title: string) => {
    try {
      setDownloadingUrls((prev) => new Set(prev).add(url));
      toast.info(`Iniciando download de: ${title}`);
      const { base64, fileName } = await downloadUrlMutation.mutateAsync({
        url,
        fileName: `${title}.pdf`,
      });

      const queueId = Math.random().toString(36).substr(2, 9);
      setQueue((prev) => [
        ...prev,
        {
          id: queueId,
          file: { name: fileName } as any,
          status: "processing",
        },
      ]);

      await processMutation.mutateAsync({ base64, fileName, apiKey, provider });

      setQueue((prev) =>
        prev.map((q) => (q.id === queueId ? { ...q, status: "completed" } : q)),
      );
      toast.success(`${title} pronto para mineração!`);
      refetchHistory();
    } catch (err: any) {
      toast.error(`Falha no download: ${err.message}`);
    } finally {
      setDownloadingUrls((prev) => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
    }
  };

  const handleToggleIntegration = async (
    fileName: string,
    currentStatus: boolean,
  ) => {
    try {
      if (currentStatus) await deleteMutation.mutateAsync({ fileName });
      else await integrateMutation.mutateAsync({ fileName });
      toast.success(currentStatus ? "Prova removida" : "Prova integrada");
      refetchHistory();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExportJson = async (fileName: string) => {
    try {
      const data = await (utils.client.lab.getJson as any).query({ fileName });
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
    } catch (err: any) {
      toast.error("Erro ao exportar");
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(",")[1];
        await importJsonMutation.mutateAsync({ base64, fileName: file.name });
        toast.success("JSON Importado");
        refetchHistory();
      } catch (err: any) {
        toast.error(err.message);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleBancaAnalysis = async () => {
    if (selectedExams.length === 0) {
      toast.error("Selecione ao menos uma prova");
      return;
    }
    setIsAnalyzing(true);
    setCoverageData(null);
    try {
      const res = await analyzeTrendMutation.mutateAsync({
        fileNames: selectedExams,
        apiKey,
        provider,
      });
      setAnalysisResult(res.analysis);
      toast.success("Raio-X Gerado com sucesso!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleEditalMapping = async () => {
    if (selectedExams.length !== 1) {
      toast.error("Selecione exatamente uma prova para mapear cobertura");
      return;
    }
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const res = await mapEditalMutation.mutateAsync({
        fileName: selectedExams[0],
        apiKey,
        provider,
      });
      setCoverageData(res);
      toast.success("Mapeamento concluído!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    const processNext = async () => {
      const nextItem = queue.find((item) => item.status === "pending");
      if (!nextItem || queue.some((item) => item.status === "processing"))
        return;
      setQueue((prev) =>
        prev.map((q) =>
          q.id === nextItem.id ? { ...q, status: "processing" } : q,
        ),
      );
      try {
        const base64 = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve((r.result as string).split(",")[1]);
          r.readAsDataURL(nextItem.file);
        });
        const result = await processMutation.mutateAsync({
          base64,
          fileName: nextItem.file.name,
          apiKey,
          provider,
        });

        setPreviewQuestions({
          questions: result.questions,
          fileName: result.fileName,
        });

        setQueue((prev) =>
          prev.map((q) =>
            q.id === nextItem.id ? { ...q, status: "completed" } : q,
          ),
        );
        refetchHistory();
      } catch (err: any) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === nextItem.id
              ? { ...q, status: "error", error: err.message }
              : q,
          ),
        );
      }
    };
    processNext();
  }, [queue, apiKey, provider, processMutation, refetchHistory]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!apiKey) {
      toast.error("Configure sua API Key");
      return;
    }
    setQueue((prev) => [
      ...prev,
      ...files
        .filter((f) => f.type === "application/pdf")
        .map((f) => ({
          id: Math.random().toString(36).substr(2, 9),
          file: f,
          status: "pending" as const,
        })),
    ]);
  };

  const [miningSubTab, setMiningSubTab] = useState<"discovery" | "pdf">("pdf");

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-20 pt-10 px-4">
      {showPlayer && (
        <MinedResolutionPanel
          topicId={filterTopicId}
          onClose={() => {
            setShowPlayer(false);
            setFilterTopicId(undefined);
          }}
        />
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary/50 border border-primary/20">
            <FlaskConical size={14} className="text-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
              SOE Intelligent Mining
            </span>
          </div>
          <h1 className="text-6xl font-black tracking-tighter leading-none">
            Laboratório de <span className="text-primary/80">Provas</span>
          </h1>
          <p className="text-muted-foreground text-sm max-w-xl opacity-60">
            Sua central privada de mineração e estruturação de dados acadêmicos
            com Inteligência Artificial.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-secondary/30 p-1.5 rounded-[1.5rem] border border-border">
          <button
            onClick={() => setActiveTab("mining")}
            className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "mining" ? "bg-background text-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"}`}
          >
            Minerar
          </button>
          <button
            onClick={() => setActiveTab("library")}
            className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "library" ? "bg-background text-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"}`}
          >
            Biblioteca
          </button>
          <button
            onClick={() => setActiveTab("strategy")}
            className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "strategy" ? "bg-background text-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"}`}
          >
            Estratégia
          </button>
        </div>
      </div>

      {activeTab === "mining" && (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 px-4">
          {/* Sub-abas de Mineração */}
          <div className="flex items-center gap-6 border-b border-border pb-4 mb-4">
            <button
              onClick={() => setMiningSubTab("discovery")}
              className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all ${miningSubTab === "discovery" ? "text-primary border-b-2 border-primary pb-4 -mb-[18px]" : "opacity-40 hover:opacity-100"}`}
            >
              Descoberta Online
            </button>
            <button
              onClick={() => setMiningSubTab("pdf")}
              className={`text-[11px] font-black uppercase tracking-[0.2em] transition-all ${miningSubTab === "pdf" ? "text-primary border-b-2 border-primary pb-4 -mb-[18px]" : "opacity-40 hover:opacity-100"}`}
            >
              Minerador de PDFs (Cursos/Provas)
            </button>
          </div>

          {miningSubTab === "discovery" && (
            <div className="space-y-10">
              {/* Filtro Avançado de Descoberta */}
              <div className="soe-card p-10 rounded-[4rem] bg-primary/5 border-primary/20 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 ml-4">
                      Banca Examinadora
                    </label>
                    <input
                      type="text"
                      id="search-banca"
                      placeholder="Ex: FGV, FCC, CEBRASPE"
                      className="w-full h-14 px-6 rounded-2xl bg-background border-border text-xs font-bold focus:border-primary transition-all"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 ml-4">
                      Cargo ou Área
                    </label>
                    <input
                      type="text"
                      id="search-cargo"
                      placeholder="Ex: Auditor de Controle Externo"
                      className="w-full h-14 px-6 rounded-2xl bg-background border-border text-xs font-bold focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 ml-4">
                      Ano
                    </label>
                    <select
                      id="search-ano"
                      className="w-full h-14 px-6 rounded-2xl bg-background border-border text-xs font-bold focus:border-primary transition-all appearance-none"
                    >
                      <option>2024</option>
                      <option>2023</option>
                      <option>2022</option>
                      <option>2021</option>
                      <option>Todos</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-primary/10">
                  <p className="text-[10px] text-muted-foreground opacity-60 italic flex items-center gap-2">
                    <Zap size={12} className="text-primary" />A IA vasculha
                    portais de concursos para encontrar PDFs oficiais.
                  </p>
                  <button
                    onClick={async () => {
                      const banca = (
                        document.getElementById(
                          "search-banca",
                        ) as HTMLInputElement
                      ).value;
                      const cargo = (
                        document.getElementById(
                          "search-cargo",
                        ) as HTMLInputElement
                      ).value;
                      const ano = (
                        document.getElementById(
                          "search-ano",
                        ) as HTMLSelectElement
                      ).value;

                      if (!banca || !cargo) {
                        toast.error("Preencha ao menos a Banca e o Cargo");
                        return;
                      }

                      setIsAnalyzing(true);
                      setSearchResults([]);
                      toast.info(`Localizando provas no servidor...`);

                      try {
                        const results = await searchOnlineMutation.mutateAsync({
                          banca,
                          cargo,
                          ano,
                        });
                        if (results && results.length > 0) {
                          setSearchResults(results as any);
                          toast.success(`Encontrei ${results.length} provas.`);
                        } else {
                          toast.error(
                            "Nenhuma prova encontrada com esses critérios.",
                          );
                        }
                      } catch (err: any) {
                        toast.error("Erro na busca remota.");
                      } finally {
                        setIsAnalyzing(false);
                      }
                    }}
                    disabled={isAnalyzing}
                    className="h-14 px-12 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Search size={16} />
                    )}
                    Localizar Provas
                  </button>
                </div>
              </div>

              {/* Lista de Resultados da Busca */}
              {searchResults.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in zoom-in-95 duration-500">
                  {searchResults.map((res, i) => (
                    <div
                      key={i}
                      className="soe-card p-6 flex items-center justify-between bg-secondary/30 border-primary/20 rounded-[2rem]"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-primary/10 text-primary">
                          <FileJson size={20} />
                        </div>
                        <div className="space-y-0.5">
                          <h5 className="text-[11px] font-black uppercase tracking-tight truncate max-w-[200px]">
                            {res.title}
                          </h5>
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] text-primary hover:underline truncate max-w-[200px] block"
                          >
                            {res.url}
                          </a>
                        </div>
                      </div>
                      {downloadingUrls.has(res.url) ? (
                        <div className="flex flex-col items-end gap-2 px-6">
                          <Loader2
                            size={20}
                            className="animate-spin text-primary"
                          />
                          <span className="text-[8px] font-black uppercase text-primary animate-pulse">
                            Processando
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            handleDownloadAndMine(res.url, res.title)
                          }
                          className="h-10 px-6 rounded-xl bg-primary text-white text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                        >
                          Baixar e Minerar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {miningSubTab === "pdf" && (
            <div className="space-y-10 animate-in zoom-in-95 duration-500">
              {/* Main Upload Area Premium */}
              <div className="relative h-80 rounded-[4rem] border-2 border-dashed border-border overflow-hidden bg-secondary/5 group transition-all hover:border-primary/40">
                <div className="absolute inset-0 opacity-[0.03] grid grid-cols-10 gap-12 p-12 pointer-events-none select-none">
                  {Array.from({ length: 60 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      {i % 4 === 0 ? (
                        <FileJson size={24} />
                      ) : i % 4 === 1 ? (
                        <Database size={24} />
                      ) : i % 4 === 2 ? (
                        <Microscope size={24} />
                      ) : (
                        <Zap size={24} />
                      )}
                    </div>
                  ))}
                </div>

                <div className="relative h-full flex flex-col items-center justify-center gap-8">
                  <div className="w-28 h-28 rounded-[2.5rem] bg-secondary/80 backdrop-blur border border-border flex items-center justify-center text-primary shadow-2xl group-hover:scale-110 transition-transform duration-500">
                    <Upload size={44} strokeWidth={1} />
                  </div>
                  <div className="text-center space-y-3">
                    <h2 className="text-3xl font-black uppercase tracking-[0.25em] text-foreground">
                      Extração de PDF
                    </h2>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-40 max-w-sm mx-auto">
                      Gran, Estratégia, Editais e Materiais Próprios
                    </p>
                  </div>
                </div>
                <input
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="soe-card p-10 flex items-center gap-8 bg-secondary/10 border-border/50 group hover:border-primary/30 transition-all rounded-[3rem]">
                  <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Cpu size={32} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase tracking-widest">
                      Varredura Seletiva
                    </h4>
                    <p className="text-[11px] text-muted-foreground opacity-50 leading-relaxed">
                      O SOE lê o material e pergunta se você deseja minerar as
                      questões encontradas.
                    </p>
                  </div>
                </div>

                <div className="soe-card p-10 flex items-center gap-8 bg-secondary/10 border-border/50 group hover:border-primary/30 transition-all rounded-[3rem]">
                  <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Share2 size={32} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase tracking-widest">
                      Multi-Plataforma
                    </h4>
                    <p className="text-[11px] text-muted-foreground opacity-50 leading-relaxed">
                      Inteligência adaptada para os layouts mutáveis dos grandes
                      cursinhos.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {queue.length > 0 && (
            <div className="soe-card p-10 space-y-8 animate-in zoom-in-95 duration-500 rounded-[3rem]">
              <div className="flex items-center justify-between border-b border-border pb-6">
                <h5 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 opacity-50">
                  <Clock size={16} /> Fila de Trabalho ({queue.length})
                </h5>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-6 rounded-3xl bg-secondary/30 border border-border"
                  >
                    <QueueItemProgress item={item} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "library" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center mb-8">
            {history && history.some((h: any) => h.isIntegrated) ? (
              <button
                onClick={() => setShowPlayer(true)}
                className="btn-apple-primary flex items-center gap-3 h-12 px-8 rounded-2xl shadow-xl shadow-primary/20 text-xs font-black uppercase tracking-widest transition-all hover:scale-105"
              >
                <Play size={16} fill="white" /> Iniciar Treino de Elite
              </button>
            ) : (
              <div />
            )}

            <div className="relative h-12">
              <input
                type="file"
                accept=".json"
                onChange={handleImportJson}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              <button className="flex items-center gap-2 h-full px-6 rounded-2xl bg-secondary hover:bg-muted transition-colors text-xs font-black uppercase tracking-widest border border-border">
                <Database size={16} /> Importar JSON
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {!history || history.length === 0 ? (
              <div className="col-span-full py-20 text-center opacity-30">
                <Search size={48} className="mx-auto mb-4" />
                <p className="text-xs font-black uppercase tracking-widest">
                  Biblioteca Vazia
                </p>
              </div>
            ) : (
              history.map((exam: any, idx: number) => (
                <div key={idx} className="flex flex-col gap-3">
                  <div
                    className={`soe-card p-8 rounded-[2.5rem] transition-all ${expandedExam === exam.name ? "ring-2 ring-primary border-primary/50" : "hover:border-primary/30"}`}
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div
                        className="w-12 h-12 rounded-2xl bg-secondary text-primary cursor-pointer flex items-center justify-center shadow-inner"
                        onClick={() =>
                          setExpandedExam(
                            expandedExam === exam.name ? null : exam.name,
                          )
                        }
                      >
                        <FileJson size={24} />
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end gap-1 mr-2">
                          <span className="text-[8px] font-black uppercase opacity-30">
                            Integração
                          </span>
                          <button
                            onClick={() =>
                              handleToggleIntegration(
                                exam.name,
                                exam.isIntegrated,
                              )
                            }
                            className={`relative w-9 h-5 rounded-full transition-all duration-300 ${exam.isIntegrated ? "bg-[var(--primary)]" : "bg-border/50"}`}
                          >
                            <div
                              className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-300 ${exam.isIntegrated ? "left-5" : "left-1"}`}
                            />
                          </button>
                        </div>
                        <button
                          onClick={() => handleExportJson(exam.name)}
                          className="p-2.5 rounded-xl hover:bg-secondary text-muted-foreground transition-colors"
                        >
                          <Download size={18} />
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm("Deseja apagar este arquivo?")) {
                              await deleteFileMutation.mutateAsync({
                                fileName: exam.name,
                              });
                              toast.success("Apagado");
                              refetchHistory();
                            }
                          }}
                          className="p-2.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    <div
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedExam(
                          expandedExam === exam.name ? null : exam.name,
                        )
                      }
                    >
                      <div className="flex items-center gap-2 group/title">
                        <h4 className="text-base font-black truncate leading-tight tracking-tight">
                          {exam.name.replace("questoes_", "").split("_")[0]}
                        </h4>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const currentName = exam.name
                              .replace("questoes_", "")
                              .split("_")[0];
                            const newName = prompt(
                              "Novo nome para o arquivo:",
                              currentName,
                            );
                            if (newName && newName.trim() !== "") {
                              try {
                                await renameFileMutation.mutateAsync({
                                  oldFileName: exam.name,
                                  newName: newName,
                                });
                                toast.success("Renomeado!");
                                refetchHistory();
                              } catch (err: any) {
                                toast.error("Erro ao renomear: " + err.message);
                              }
                            }
                          }}
                          className="p-1.5 rounded-lg opacity-0 group-hover/title:opacity-100 hover:bg-secondary text-primary transition-all"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                      <div className="flex items-center gap-3 mt-3">
                        <span className="text-[10px] font-bold opacity-30">
                          {exam.date}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-border" />
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                          {exam.questionCount} Questões
                        </span>
                      </div>
                    </div>
                  </div>

                  {expandedExam === exam.name && (
                    <div className="animate-in slide-in-from-top-2 duration-300 px-4">
                      <div className="soe-card bg-secondary/20 rounded-[2rem] max-h-72 overflow-y-auto p-6 space-y-4 shadow-inner">
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] border-b border-border pb-3">
                          Conteúdo Extraído
                        </p>
                        {exam.questions.map((q: any, qIdx: number) => (
                          <div
                            key={qIdx}
                            className="space-y-1.5 pb-2 border-b border-border/30 last:border-0"
                          >
                            <p className="text-[11px] font-medium leading-relaxed opacity-70 line-clamp-2">
                              {q.statement}
                            </p>
                            <span className="text-[9px] font-black text-primary uppercase tracking-widest">
                              {q.subject}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "strategy" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in slide-in-from-bottom-4 duration-500">
          {/* Menu Lateral de Seleção */}
          <div className="lg:col-span-4 space-y-8">
            <div className="soe-card p-8 rounded-[3rem] space-y-6">
              <div className="space-y-2 border-b border-border pb-4">
                <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <Target size={18} className="text-primary" /> Seleção de
                  Fontes
                </h3>
                <p className="text-[10px] text-muted-foreground opacity-60">
                  Escolha as provas para análise estratégica.
                </p>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto no-scrollbar">
                {history?.map((exam) => (
                  <button
                    key={exam.name}
                    onClick={() => {
                      if (selectedExams.includes(exam.name))
                        setSelectedExams(
                          selectedExams.filter((e) => e !== exam.name),
                        );
                      else setSelectedExams([...selectedExams, exam.name]);
                    }}
                    className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between ${selectedExams.includes(exam.name) ? "bg-primary/10 border-primary text-primary" : "bg-secondary/20 border-border/50 text-muted-foreground hover:bg-secondary"}`}
                  >
                    <span className="text-[11px] font-bold truncate max-w-[200px]">
                      {exam.name.replace("questoes_", "").split("_")[0]}
                    </span>
                    {selectedExams.includes(exam.name) && (
                      <CheckCircle2 size={14} />
                    )}
                  </button>
                ))}
              </div>

              <div className="pt-4 grid grid-cols-1 gap-3">
                <button
                  onClick={handleBancaAnalysis}
                  disabled={selectedExams.length === 0 || isAnalyzing}
                  className="w-full h-14 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 flex items-center justify-center gap-3 disabled:opacity-20 active:scale-95 transition-all"
                >
                  {isAnalyzing ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <BarChart3 size={16} />
                  )}
                  Raio-X da Banca
                </button>
                <button
                  onClick={handleEditalMapping}
                  disabled={selectedExams.length !== 1 || isAnalyzing}
                  className="w-full h-14 rounded-2xl bg-secondary border border-border text-foreground text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 disabled:opacity-20 active:scale-95 transition-all"
                >
                  {isAnalyzing ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Target size={16} />
                  )}
                  Mapear Edital
                </button>
              </div>
            </div>

            <div className="soe-card p-8 bg-primary/5 border-primary/10 rounded-[3rem] space-y-4">
              <div className="flex items-center gap-3 text-primary">
                <Info size={18} />
                <h5 className="text-[10px] font-black uppercase tracking-widest">
                  Dica Estratégica
                </h5>
              </div>
              <p className="text-[11px] opacity-60 leading-relaxed italic">
                "O Raio-X funciona melhor com 3 ou mais provas da mesma banca.
                Para o Mapeamento de Edital, selecione apenas a prova que deseja
                analisar a cobertura."
              </p>
            </div>
          </div>

          {/* Área de Resultados */}
          <div className="lg:col-span-8">
            <div className="soe-card p-12 rounded-[4rem] min-h-[600px] bg-secondary/5 border-border/50 relative overflow-hidden">
              {!analysisResult && !coverageData && !isAnalyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20 text-center p-20 space-y-6">
                  <div className="w-20 h-20 rounded-full border-4 border-dashed border-muted-foreground flex items-center justify-center">
                    <Zap size={32} />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-black uppercase tracking-widest">
                      Painel de Inteligência
                    </h4>
                    <p className="text-xs font-medium">
                      Selecione provas e execute uma análise para ver os dados
                      estratégicos.
                    </p>
                  </div>
                </div>
              )}

              {isAnalyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-6 bg-background/50 backdrop-blur-sm z-10">
                  <Loader2 className="animate-spin text-primary" size={48} />
                  <p className="text-xs font-black uppercase tracking-widest animate-pulse">
                    Cruzando Dados com IA...
                  </p>
                </div>
              )}

              {coverageData && (
                <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500">
                  <div className="flex items-center gap-3 border-b border-border pb-6 mb-8">
                    <div className="p-3 rounded-2xl bg-secondary text-primary">
                      <Target size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-black uppercase tracking-tight m-0">
                        Cobertura de Edital
                      </h2>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest m-0 opacity-40">
                        Mapeamento de Conteúdo Programático
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-4xl font-black text-primary m-0 tabular-nums">
                        {coverageData.coveragePercentage}
                      </p>
                      <p className="text-[9px] font-black uppercase tracking-widest m-0 opacity-40">
                        Taxa de Cobertura
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {coverageData.mappedItems?.map((item: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-6 rounded-3xl bg-secondary/20 border border-border group hover:bg-primary/5 transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-[10px] font-black border border-border group-hover:bg-primary group-hover:text-white transition-all">
                            {i + 1}
                          </div>
                          <span className="text-xs font-bold">
                            {item.topic}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-background border border-border text-[10px] font-black uppercase tracking-widest opacity-60">
                          {item.questionsCount} Questões
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Raio-X de Tendência (Design Premium) */}
      {analysisResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-500">
          <div
            className="absolute inset-0 bg-background/60 backdrop-blur-3xl"
            onClick={() => setAnalysisResult(null)}
          />

          <div className="relative w-full max-w-5xl max-h-[90vh] bg-secondary/80 border border-white/10 rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-in slide-in-from-bottom-10 duration-700">
            {/* Header Elegante */}
            <div className="px-12 py-10 flex items-center justify-between border-b border-white/5 bg-gradient-to-r from-primary/10 to-transparent">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-[1.5rem] bg-primary flex items-center justify-center shadow-[0_0_30px_rgba(var(--primary-rgb),0.3)]">
                  <BarChart3 size={32} className="text-white" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-black uppercase tracking-tight leading-none">
                      Raio-X Estratégico
                    </h2>
                    <span className="px-3 py-1 rounded-full bg-primary/20 text-[8px] font-black uppercase tracking-[0.2em] text-primary border border-primary/20">
                      CONFIDENCIAL
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.4em] opacity-50">
                    Inteligência Competitiva de Dados
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAnalysisResult(null)}
                className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group"
              >
                <XCircle
                  size={24}
                  className="opacity-30 group-hover:opacity-100 transition-opacity"
                />
              </button>
            </div>

            {/* Corpo do Relatório com Renderização de Tabelas */}
            <div className="flex-1 overflow-y-auto p-12 md:px-20 custom-scrollbar bg-gradient-to-b from-transparent to-black/20">
              <div className="prose prose-invert max-w-none">
                <div className="text-foreground/80 leading-relaxed font-medium selection:bg-primary/40">
                  <ReactMarkdown
                    components={{
                      h1: ({ node, ...props }) => (
                        <h1
                          className="text-4xl font-black mb-10 border-b border-white/10 pb-4 text-white"
                          {...props}
                        />
                      ),
                      h2: ({ node, ...props }) => (
                        <h2
                          className="text-2xl font-black mt-12 mb-6 text-primary flex items-center gap-3 before:w-1 before:h-6 before:bg-primary before:rounded-full"
                          {...props}
                        />
                      ),
                      h3: ({ node, ...props }) => (
                        <h3
                          className="text-lg font-black mt-8 mb-4 text-white/90"
                          {...props}
                        />
                      ),
                      p: ({ node, ...props }) => (
                        <p
                          className="text-sm leading-8 mb-6 opacity-70"
                          {...props}
                        />
                      ),
                      table: ({ node, ...props }) => (
                        <div className="my-10 overflow-hidden rounded-3xl border border-white/5 bg-black/20 shadow-inner">
                          <table
                            className="w-full text-left border-collapse"
                            {...props}
                          />
                        </div>
                      ),
                      thead: ({ node, ...props }) => (
                        <thead className="bg-primary/10" {...props} />
                      ),
                      th: ({ node, ...props }) => (
                        <th
                          className="p-5 text-[10px] font-black uppercase tracking-widest text-primary border-b border-white/5"
                          {...props}
                        />
                      ),
                      td: ({ node, ...props }) => (
                        <td
                          className="p-5 text-xs border-b border-white/5 opacity-70"
                          {...props}
                        />
                      ),
                      strong: ({ node, ...props }) => (
                        <strong
                          className="font-black text-primary/90"
                          {...props}
                        />
                      ),
                      ul: ({ node, ...props }) => (
                        <ul
                          className="space-y-4 my-6 list-none p-0"
                          {...props}
                        />
                      ),
                      li: ({ node, ...props }) => (
                        <li
                          className="flex items-start gap-3 text-sm opacity-70 before:w-1.5 before:h-1.5 before:bg-primary before:rounded-full before:mt-2 before:shrink-0"
                          {...props}
                        />
                      ),
                    }}
                  >
                    {analysisResult}
                  </ReactMarkdown>
                </div>
              </div>
            </div>

            {/* Footer de Assinatura */}
            <div className="px-12 py-8 border-t border-white/5 bg-black/40 flex justify-between items-center">
              <div className="flex items-center gap-8">
                <div className="space-y-1">
                  <p className="text-[8px] font-black uppercase tracking-widest opacity-30">
                    Gerado pelo Sistema
                  </p>
                  <p className="text-[10px] font-bold tabular-nums">
                    {new Date().toLocaleDateString()} •{" "}
                    {new Date().toLocaleTimeString()}
                  </p>
                </div>
                <div className="w-px h-8 bg-white/5" />
                <div className="space-y-1">
                  <p className="text-[8px] font-black uppercase tracking-widest opacity-30">
                    Fontes Analisadas
                  </p>
                  <p className="text-[10px] font-bold">
                    {selectedExams.length} Provas Mineradas
                  </p>
                </div>
              </div>

              <button
                onClick={() => window.print()}
                className="btn-apple-primary h-12 px-8 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-xl shadow-primary/20"
              >
                <Download size={16} /> Exportar Dossiê
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Revisão de Questões Mineradas */}
      <Dialog
        open={!!previewQuestions}
        onOpenChange={() => setPreviewQuestions(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden flex flex-col rounded-[3rem] border-primary/20">
          <DialogHeader className="p-8 bg-primary/5 border-b border-primary/10 shrink-0">
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
              <Cpu className="text-primary" /> Mineração Concluída
            </DialogTitle>
            <DialogDescription className="text-xs font-bold opacity-60">
              A IA identificou {previewQuestions?.questions.length} questões no
              seu material. Deseja integrá-las à sua base de dados?
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-8 space-y-8">
              {previewQuestions?.questions.map((q, idx) => (
                <div
                  key={idx}
                  className="soe-card p-6 bg-secondary/20 border-border/50 rounded-[2rem] space-y-4"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <Badge
                        variant="outline"
                        className="text-[9px] font-black uppercase tracking-widest bg-primary/10 text-primary border-primary/20"
                      >
                        {q.subject || "Sem Matéria"}
                      </Badge>
                      <h4 className="text-[10px] font-black uppercase opacity-30">
                        {q.topic || "Assunto Geral"}
                      </h4>
                    </div>
                    <Badge className="bg-accent-green/20 text-accent-green border-accent-green/30 text-[10px] font-bold">
                      Gabarito: {q.correctAnswer}
                    </Badge>
                  </div>

                  <p className="text-sm font-medium leading-relaxed opacity-80">
                    {q.statement}
                  </p>

                  <div className="grid grid-cols-1 gap-2 pl-4 border-l-2 border-primary/20">
                    {Array.isArray(q.alternatives)
                      ? q.alternatives.map((alt: any, altIdx: number) => (
                          <div
                            key={altIdx}
                            className="text-xs opacity-60 flex gap-2"
                          >
                            <span className="font-black text-primary">
                              {alt.letter})
                            </span>
                            <span>{alt.text}</span>
                          </div>
                        ))
                      : Object.entries(q.alternatives || {}).map(
                          ([letter, text]) => (
                            <div
                              key={letter}
                              className="text-xs opacity-60 flex gap-2"
                            >
                              <span className="font-black text-primary">
                                {letter})
                              </span>
                              <span>{String(text)}</span>
                            </div>
                          ),
                        )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-8 border-t border-border bg-background flex justify-end gap-4 shrink-0 relative z-50">
            <button
              onClick={() => setPreviewQuestions(null)}
              className="px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-secondary active:scale-95 transition-all cursor-pointer"
            >
              Descartar
            </button>
            <button
              onClick={async () => {
                try {
                  if (!previewQuestions) return;
                  await integrateMutation.mutateAsync({
                    fileName: previewQuestions.fileName,
                  });
                  toast.success("Questões integradas com sucesso!");
                  setPreviewQuestions(null);
                  refetchHistory();
                } catch (err: any) {
                  toast.error("Falha na integração: " + err.message);
                }
              }}
              disabled={integrateMutation.isPending}
              className="px-12 py-3 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {integrateMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin" size={14} />
                  Integrando...
                </>
              ) : (
                "Confirmar e Adicionar ao Banco"
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
