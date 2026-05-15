import { useState, useCallback, useEffect } from "react";
import {
  Upload,
  FileJson,
  CheckCircle2,
  Loader2,
  Search,
  Download,
  Microscope,
  Clock,
  XCircle,
  Database,
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
  Sparkles,
  ChevronLeft,
  Lightbulb,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
            <CheckCircle2 className="text-emerald-500" size={18} />
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
              <span className="text-[9px] font-bold uppercase text-primary animate-pulse tracking-wider">
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
          className={cn(
            "text-[9px] font-bold uppercase px-2 py-0.5 rounded-md border tracking-wider",
            item.status === "error"
              ? "text-destructive border-destructive/20 bg-destructive/5"
              : "bg-secondary/50 border-border opacity-60",
          )}
        >
          {item.status}
        </span>
      </div>
      {item.status === "processing" && percentage > 0 && (
        <div className="w-full bg-secondary/50 h-1 rounded-full overflow-hidden">
          <div
            className="bg-primary h-full transition-all duration-700 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

type Tab = "mining" | "library" | "strategy" | "mirror";

export default function Lab() {
  const [activeTab, setActiveTab] = useState<Tab>("mining");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [previewQuestions, setPreviewQuestions] = useState<{
    questions: any[];
    fileName: string;
  } | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [expandedExam, setExpandedExam] = useState<string | null>(null);
  const [filterTopicId, setFilterTopicId] = useState<number | undefined>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("startElite") === "true") {
      const tId = params.get("topicId");
      if (tId) setFilterTopicId(Number(tId));
      setShowPlayer(true);
      setActiveTab("library");
    }
  }, []);

  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [mirrorSession, setMirrorSession] = useState<any>(null);
  const [mirrorCurrentIdx, setMirrorCurrentIdx] = useState(0);
  const [mirrorAnswers, setMirrorAnswers] = useState<Record<number, string>>(
    {},
  );
  const [mirrorConfirmed, setMirrorConfirmed] = useState(false);
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
  const generateMirrorMutation =
    trpc.mentor.generateMaliciousMock.useMutation();
  const { data: confusions, refetch: refetchConfusions } =
    trpc.mentor.getConceptConfusions.useQuery();
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

  const tabs = [
    { id: "mining", label: "Minerar", icon: FlaskConical },
    { id: "library", label: "Biblioteca", icon: Database },
    { id: "strategy", label: "Estratégia", icon: BarChart3 },
    { id: "mirror", label: "Banca Mirror", icon: Target },
  ];

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

      <div className="flex flex-col gap-8">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-primary/10 border border-primary/20">
            <FlaskConical size={14} className="text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
              SOE Intelligent Mining
            </span>
          </div>
          <h1 className="text-5xl font-bold tracking-tight leading-none text-foreground">
            Laboratório de <span className="text-primary">Provas</span>
          </h1>
          <p className="text-muted-foreground text-sm max-w-xl leading-relaxed">
            Sua central privada de mineração e estruturação de dados acadêmicos
            com Inteligência Artificial integrada.
          </p>
        </div>

        {/* Tab Navigation (Linear) */}
        <div className="flex items-center gap-8 border-b border-border">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={cn(
                  "flex items-center gap-2 pb-4 -mb-[1px] text-[11px] font-bold uppercase tracking-wider transition-all relative",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100",
                )}
              >
                <Icon size={14} />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="lab-tab-active"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "mining" && (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-6 border-b border-border/50 pb-4">
            <button
              onClick={() => setMiningSubTab("discovery")}
              className={cn(
                "text-[10px] font-bold uppercase tracking-wider transition-all relative",
                miningSubTab === "discovery"
                  ? "text-primary"
                  : "text-muted-foreground opacity-60 hover:opacity-100",
              )}
            >
              Descoberta Online
              {miningSubTab === "discovery" && (
                <div className="absolute -bottom-4 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
            <button
              onClick={() => setMiningSubTab("pdf")}
              className={cn(
                "text-[10px] font-bold uppercase tracking-wider transition-all relative",
                miningSubTab === "pdf"
                  ? "text-primary"
                  : "text-muted-foreground opacity-60 hover:opacity-100",
              )}
            >
              Minerador de PDFs
              {miningSubTab === "pdf" && (
                <div className="absolute -bottom-4 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          </div>

          {miningSubTab === "discovery" && (
            <div className="space-y-8">
              <div className="soe-card p-8 bg-secondary/20 border-border space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60 ml-1">
                      Banca Examinadora
                    </label>
                    <input
                      type="text"
                      id="search-banca"
                      placeholder="Ex: FGV, CEBRASPE"
                      className="w-full h-10 px-4 rounded-md bg-background border border-border text-sm font-semibold focus:border-primary transition-all outline-none"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60 ml-1">
                      Cargo ou Área
                    </label>
                    <input
                      type="text"
                      id="search-cargo"
                      placeholder="Ex: Auditor de Controle Externo"
                      className="w-full h-10 px-4 rounded-md bg-background border border-border text-sm font-semibold focus:border-primary transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60 ml-1">
                      Ano
                    </label>
                    <select
                      id="search-ano"
                      className="w-full h-10 px-4 rounded-md bg-background border border-border text-sm font-semibold focus:border-primary transition-all outline-none"
                    >
                      <option>2024</option>
                      <option>2023</option>
                      <option>2022</option>
                      <option>2021</option>
                      <option>Todos</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-border/50">
                  <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-2">
                    <Zap size={12} className="text-primary" /> IA vasculha bases
                    oficiais para localizar arquivos PDF.
                  </p>
                  <Button
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
                      toast.info(`Localizando provas...`);

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
                          toast.error("Nenhuma prova encontrada.");
                        }
                      } catch (err: any) {
                        toast.error("Erro na busca remota.");
                      } finally {
                        setIsAnalyzing(false);
                      }
                    }}
                    disabled={isAnalyzing}
                    className="h-10 px-8 rounded-md bg-primary font-bold text-[10px] uppercase tracking-wider"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="animate-spin mr-2" size={14} />
                    ) : (
                      <Search size={14} className="mr-2" />
                    )}
                    Localizar Provas
                  </Button>
                </div>
              </div>

              {searchResults.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {searchResults.map((res, i) => (
                    <div
                      key={i}
                      className="soe-card p-4 flex items-center justify-between bg-secondary/10 border-border"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-2.5 rounded-md bg-primary/10 text-primary shrink-0">
                          <FileJson size={18} />
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-[11px] font-bold uppercase tracking-tight truncate">
                            {res.title}
                          </h5>
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] text-primary hover:underline truncate block opacity-70"
                          >
                            {res.url}
                          </a>
                        </div>
                      </div>
                      <div className="shrink-0 ml-4">
                        {downloadingUrls.has(res.url) ? (
                          <div className="flex items-center gap-2 px-4 py-2">
                            <Loader2
                              size={14}
                              className="animate-spin text-primary"
                            />
                            <span className="text-[9px] font-bold uppercase text-primary animate-pulse tracking-wider">
                              Processando
                            </span>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() =>
                              handleDownloadAndMine(res.url, res.title)
                            }
                            className="h-8 px-4 rounded-md text-[9px] font-bold uppercase tracking-wider"
                          >
                            Baixar e Minerar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {miningSubTab === "pdf" && (
            <div className="space-y-10">
              <div className="relative h-64 rounded-lg border-2 border-dashed border-border overflow-hidden bg-secondary/5 group hover:border-primary/40 transition-all flex flex-col items-center justify-center gap-6">
                <div className="w-20 h-20 rounded-xl bg-background border border-border flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500 shadow-sm">
                  <Upload size={32} />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold uppercase tracking-wider text-foreground">
                    Extração de PDF
                  </h2>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-40">
                    Clique ou arraste Editais, Provas e Materiais
                  </p>
                </div>
                <input
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="soe-card p-6 flex items-center gap-6 bg-secondary/10 border-border/50 group hover:border-primary/30 transition-all">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Cpu size={24} />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-foreground">
                      Varredura Seletiva
                    </h4>
                    <p className="text-[11px] text-muted-foreground opacity-70 leading-relaxed">
                      O SOE lê o material e identifica questões, leis e temas
                      automaticamente via IA.
                    </p>
                  </div>
                </div>

                <div className="soe-card p-6 flex items-center gap-6 bg-secondary/10 border-border/50 group hover:border-primary/30 transition-all">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Share2 size={24} />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-foreground">
                      Multi-Plataforma
                    </h4>
                    <p className="text-[11px] text-muted-foreground opacity-70 leading-relaxed">
                      Compatível com layouts do Gran, Estratégia, Tec e outros
                      grandes portais.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {queue.length > 0 && (
            <div className="soe-card p-8 space-y-6 bg-card border-border">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <h5 className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 opacity-50">
                  <Clock size={14} /> Fila de Trabalho ({queue.length})
                </h5>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="p-5 rounded-md bg-secondary/30 border border-border"
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
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center">
            {history && history.some((h: any) => h.isIntegrated) ? (
              <Button
                onClick={() => setShowPlayer(true)}
                className="h-10 px-8 rounded-md font-bold text-[10px] uppercase tracking-wider"
              >
                <Play size={14} className="mr-2 fill-current" /> Iniciar Treino
                de Elite
              </Button>
            ) : (
              <div />
            )}

            <div className="relative h-10">
              <input
                type="file"
                accept=".json"
                onChange={handleImportJson}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              <Button
                variant="outline"
                className="h-full px-6 rounded-md text-[10px] font-bold uppercase tracking-wider bg-secondary/50"
              >
                <Database size={14} className="mr-2 opacity-60" /> Importar JSON
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {!history || history.length === 0 ? (
              <div className="col-span-full py-20 text-center opacity-30 flex flex-col items-center gap-4">
                <Search size={40} />
                <p className="text-[10px] font-bold uppercase tracking-widest">
                  Biblioteca Vazia
                </p>
              </div>
            ) : (
              history.map((exam: any, idx: number) => (
                <div key={idx} className="flex flex-col gap-3">
                  <div
                    className={cn(
                      "soe-card p-6 transition-all relative group",
                      expandedExam === exam.name
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/50",
                    )}
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div
                        className="w-10 h-10 rounded-md bg-secondary text-primary cursor-pointer flex items-center justify-center border border-border/50"
                        onClick={() =>
                          setExpandedExam(
                            expandedExam === exam.name ? null : exam.name,
                          )
                        }
                      >
                        <FileJson size={20} />
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[8px] font-bold uppercase opacity-30 tracking-wider">
                            Integração
                          </span>
                          <button
                            onClick={() =>
                              handleToggleIntegration(
                                exam.name,
                                exam.isIntegrated,
                              )
                            }
                            className={cn(
                              "relative w-8 h-4 rounded-full transition-all duration-300",
                              exam.isIntegrated ? "bg-primary" : "bg-border/50",
                            )}
                          >
                            <div
                              className={cn(
                                "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-300",
                                exam.isIntegrated ? "left-4.5" : "left-0.5",
                              )}
                            />
                          </button>
                        </div>
                        <button
                          onClick={() => handleExportJson(exam.name)}
                          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground opacity-60 hover:opacity-100 transition-all"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm("Deseja apagar este arquivo?")) {
                              await deleteFileMutation.mutateAsync({
                                fileName: exam.name,
                              });
                              toast.success("Arquivo apagado");
                              refetchHistory();
                            }
                          }}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div
                      className="cursor-pointer space-y-1.5"
                      onClick={() =>
                        setExpandedExam(
                          expandedExam === exam.name ? null : exam.name,
                        )
                      }
                    >
                      <div className="flex items-center gap-2 group/title">
                        <h4 className="text-sm font-bold truncate leading-tight tracking-tight text-foreground">
                          {exam.name.replace("questoes_", "").split("_")[0]}
                        </h4>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const currentName = exam.name
                              .replace("questoes_", "")
                              .split("_")[0];
                            const newName = prompt("Novo nome:", currentName);
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
                          className="p-1 rounded-md opacity-0 group-hover/title:opacity-100 hover:bg-secondary text-primary transition-all"
                        >
                          <Edit2 size={10} />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-muted-foreground opacity-40 tabular-nums">
                          {exam.date}
                        </span>
                        <span className="w-0.5 h-0.5 rounded-full bg-border" />
                        <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                          {exam.questionCount} Questões
                        </span>
                      </div>
                    </div>
                  </div>

                  {expandedExam === exam.name && (
                    <div className="px-2 animate-in slide-in-from-top-2 duration-300">
                      <div className="soe-card bg-secondary/20 rounded-md max-h-64 overflow-y-auto p-4 space-y-3 shadow-inner custom-scrollbar border-border/40">
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border/30 pb-2">
                          Conteúdo Extraído
                        </p>
                        {exam.questions.map((q: any, qIdx: number) => (
                          <div
                            key={qIdx}
                            className="space-y-1 pb-2 border-b border-border/20 last:border-0"
                          >
                            <p className="text-[11px] font-medium leading-relaxed opacity-70 line-clamp-2">
                              {q.statement}
                            </p>
                            <span className="text-[9px] font-bold text-primary uppercase tracking-wider">
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in slide-in-from-bottom-4 duration-500">
          <div className="lg:col-span-4 space-y-6">
            <div className="soe-card p-6 bg-card border-border space-y-6">
              <div className="space-y-1 border-b border-border/50 pb-4">
                <h3 className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 text-foreground">
                  <Target size={16} className="text-primary" /> Fontes de
                  Análise
                </h3>
                <p className="text-[10px] text-muted-foreground opacity-60">
                  Escolha os materiais para o Raio-X.
                </p>
              </div>

              <div className="space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
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
                    className={cn(
                      "w-full p-3 rounded-md border text-left transition-all flex items-center justify-between group",
                      selectedExams.includes(exam.name)
                        ? "bg-primary/5 border-primary text-primary"
                        : "bg-secondary/20 border-border/50 text-muted-foreground hover:bg-secondary/40",
                    )}
                  >
                    <span className="text-[11px] font-bold truncate max-w-[180px]">
                      {exam.name.replace("questoes_", "").split("_")[0]}
                    </span>
                    {selectedExams.includes(exam.name) && (
                      <CheckCircle2 size={12} className="shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              <div className="pt-4 space-y-3">
                <Button
                  onClick={handleBancaAnalysis}
                  disabled={selectedExams.length === 0 || isAnalyzing}
                  className="w-full h-11 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  {isAnalyzing ? (
                    <Loader2 className="animate-spin mr-2" size={14} />
                  ) : (
                    <BarChart3 size={14} className="mr-2" />
                  )}
                  Raio-X da Banca
                </Button>
                <Button
                  variant="outline"
                  onClick={handleEditalMapping}
                  disabled={selectedExams.length !== 1 || isAnalyzing}
                  className="w-full h-11 rounded-md text-[10px] font-bold uppercase tracking-widest bg-secondary/30"
                >
                  {isAnalyzing ? (
                    <Loader2 className="animate-spin mr-2" size={14} />
                  ) : (
                    <Target size={14} className="mr-2" />
                  )}
                  Mapear Edital
                </Button>
              </div>
            </div>

            <div className="soe-card p-6 bg-primary/5 border-primary/10 space-y-3">
              <div className="flex items-center gap-2 text-primary opacity-70">
                <Info size={16} />
                <h5 className="text-[10px] font-bold uppercase tracking-widest">
                  Dica Estratégica
                </h5>
              </div>
              <p className="text-[11px] text-foreground/60 leading-relaxed italic">
                O Raio-X identifica padrões recorrentes na banca. O Mapeamento
                de Edital verifica quais temas estão cobertos no material.
              </p>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="soe-card p-10 min-h-[500px] bg-secondary/5 border-border relative overflow-hidden flex flex-col items-center justify-center">
              {!analysisResult && !coverageData && !isAnalyzing && (
                <div className="flex flex-col items-center justify-center opacity-20 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-muted-foreground flex items-center justify-center">
                    <Zap size={24} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[11px] font-bold uppercase tracking-widest">
                      Painel de Inteligência
                    </h4>
                    <p className="text-[10px] font-medium">
                      Execute uma análise para visualizar os dados.
                    </p>
                  </div>
                </div>
              )}

              {isAnalyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm z-10 gap-4">
                  <Loader2 className="animate-spin text-primary" size={32} />
                  <p className="text-[10px] font-bold uppercase tracking-widest animate-pulse opacity-60">
                    Processando Inteligência de Dados...
                  </p>
                </div>
              )}

              {coverageData && (
                <div className="w-full space-y-8 animate-in fade-in zoom-in-95 duration-500">
                  <div className="flex items-center gap-4 border-b border-border/50 pb-6">
                    <div className="p-3 rounded-md bg-primary/10 text-primary border border-primary/20">
                      <Target size={20} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold uppercase tracking-tight text-foreground m-0">
                        Cobertura de Edital
                      </h2>
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest m-0 opacity-40">
                        Mapeamento Programático
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-4xl font-bold text-primary m-0 tabular-nums leading-none">
                        {coverageData.coveragePercentage}
                      </p>
                      <p className="text-[8px] font-bold uppercase tracking-widest m-0 opacity-40">
                        Taxa Geral
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {coverageData.mappedItems?.map((item: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-4 rounded-md bg-secondary/20 border border-border/50 hover:bg-primary/5 transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-bold text-muted-foreground opacity-30 tabular-nums">
                            {(i + 1).toString().padStart(2, "0")}
                          </span>
                          <span className="text-xs font-bold text-foreground/80">
                            {item.topic}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[9px] font-bold uppercase tracking-wider bg-background border-border/50 text-muted-foreground opacity-60"
                        >
                          {item.questionsCount} QUESTÕES
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "mirror" && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          {!mirrorSession ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 space-y-6">
                <div className="soe-card p-10 bg-primary/[0.02] border-primary/20 flex flex-col gap-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                    <Sparkles size={120} />
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="p-3.5 rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                      <Zap size={24} />
                    </div>
                    <div className="space-y-0.5">
                      <h2 className="text-2xl font-bold uppercase tracking-tight text-foreground">
                        Banca Mirror
                      </h2>
                      <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">
                        Simulados Inéditos de Pontos Cegos
                      </p>
                    </div>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground max-w-2xl italic border-l-2 border-primary/30 pl-6 py-2">
                    "O examinador foca em suas confusões conceituais. O Banca
                    Mirror detecta erros recorrentes (ex: Anulação vs Revogação)
                    e gera desafios maldosos para forçar o domínio da exceção."
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {confusions && confusions.length > 0 ? (
                    confusions.map((c: any) => (
                      <div
                        key={c.id}
                        className="soe-card p-6 flex flex-col justify-between hover:border-primary/40 transition-all group bg-card border-border"
                      >
                        <div className="space-y-4">
                          <div className="flex items-center justify-between border-b border-border/30 pb-3">
                            <Badge
                              variant="outline"
                              className="text-[9px] font-bold uppercase tracking-widest border-primary/30 text-primary bg-primary/5"
                            >
                              {c.occurrences} Erros Críticos
                            </Badge>
                            <span className="text-[9px] opacity-40 font-bold tabular-nums">
                              {new Date(c.detectedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 py-2">
                            <div className="flex flex-col flex-1 gap-0.5">
                              <span className="text-[8px] font-bold uppercase opacity-30 tracking-wider">
                                Conceito A
                              </span>
                              <span className="text-xs font-bold text-primary truncate">
                                {c.conceptA}
                              </span>
                            </div>
                            <div className="w-px h-6 bg-border/50 shrink-0" />
                            <div className="flex flex-col flex-1 text-right gap-0.5">
                              <span className="text-[8px] font-bold uppercase opacity-30 tracking-wider">
                                Conceito B
                              </span>
                              <span className="text-xs font-bold text-destructive truncate">
                                {c.conceptB}
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed bg-secondary/30 p-3 rounded-md border border-border/30 italic">
                            {c.explanation}
                          </p>
                        </div>
                        <Button
                          onClick={async () => {
                            if (!apiKey)
                              return toast.error("Configure sua API Key.");
                            toast.promise(
                              generateMirrorMutation.mutateAsync({
                                conceptA: c.conceptA,
                                conceptB: c.conceptB,
                                explanation: c.explanation,
                                apiKey,
                                provider: provider as any,
                              }),
                              {
                                loading:
                                  "O examinador está preparando as armadilhas...",
                                success: (data) => {
                                  setMirrorSession(data);
                                  setMirrorCurrentIdx(0);
                                  setMirrorAnswers({});
                                  setMirrorConfirmed(false);
                                  return "Simulado gerado!";
                                },
                                error: "Falha ao gerar desafio.",
                              },
                            );
                          }}
                          className="mt-6 w-full h-10 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all bg-secondary/50 hover:bg-primary hover:text-white"
                        >
                          <Play size={14} className="mr-2 fill-current" /> Gerar
                          Desafio Inédito
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full py-16 soe-card border-dashed flex flex-col items-center justify-center opacity-30 space-y-4">
                      <Target size={40} />
                      <p className="text-[10px] font-bold uppercase tracking-widest">
                        Nenhum ponto cego crítico detectado
                      </p>
                      <p className="text-[10px] max-w-xs text-center leading-relaxed font-medium">
                        Continue minerando e resolvendo questões para que eu
                        identifique suas confusões conceituais.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-4 space-y-6">
                <div className="soe-card p-6 bg-card border-border space-y-6">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 text-foreground">
                    <Sparkles size={16} className="text-primary" /> Gerador
                    Customizado
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">
                        Conceito A
                      </label>
                      <input
                        id="manualA"
                        className="w-full px-4 py-2.5 rounded-md bg-secondary/30 border border-border/50 text-sm font-semibold outline-none focus:border-primary transition-all"
                        placeholder="Ex: Atos Vinculados"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">
                        Conceito B
                      </label>
                      <input
                        id="manualB"
                        className="w-full px-4 py-2.5 rounded-md bg-secondary/30 border border-border/50 text-sm font-semibold outline-none focus:border-primary transition-all"
                        placeholder="Ex: Atos Discricionários"
                      />
                    </div>
                    <Button
                      onClick={() => {
                        const a = (
                          document.getElementById("manualA") as HTMLInputElement
                        ).value;
                        const b = (
                          document.getElementById("manualB") as HTMLInputElement
                        ).value;
                        if (!a || !b)
                          return toast.error("Preencha ambos os conceitos.");
                        if (!apiKey)
                          return toast.error("Configure sua API Key.");

                        toast.promise(
                          generateMirrorMutation.mutateAsync({
                            conceptA: a,
                            conceptB: b,
                            explanation: `O aluno deseja focar na diferenciação estratégica entre ${a} e ${b}.`,
                            apiKey,
                            provider: provider as any,
                          }),
                          {
                            loading: "Criando simulado customizado...",
                            success: (data) => {
                              setMirrorSession(data);
                              setMirrorCurrentIdx(0);
                              setMirrorAnswers({});
                              setMirrorConfirmed(false);
                              return "Desafio pronto!";
                            },
                            error: "Erro ao gerar.",
                          },
                        );
                      }}
                      className="w-full h-11 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                      <Zap size={14} className="mr-2" /> Criar Desafio Agora
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-8 pb-20">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setMirrorSession(null)}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all"
                >
                  <ChevronLeft size={16} /> Voltar ao Laboratório
                </button>
                <div className="flex items-center gap-4">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-40 tabular-nums">
                    Questão {mirrorCurrentIdx + 1} /{" "}
                    {mirrorSession.questions.length}
                  </span>
                  <div className="w-40 h-1 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{
                        width: `${((mirrorCurrentIdx + 1) / mirrorSession.questions.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="soe-card p-12 space-y-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-[0.02] pointer-events-none">
                  <Target size={120} />
                </div>

                <div className="space-y-4">
                  <Badge
                    variant="outline"
                    className="bg-primary/5 text-primary border-primary/20 text-[9px] font-bold uppercase px-3 py-1 rounded-md tracking-wider"
                  >
                    {mirrorSession.mockTitle}
                  </Badge>
                  <h3 className="text-2xl font-bold leading-relaxed text-foreground tracking-tight">
                    {mirrorSession.questions[mirrorCurrentIdx].statement}
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {mirrorSession.questions[mirrorCurrentIdx].alternatives.map(
                    (alt: any) => {
                      const isSelected =
                        mirrorAnswers[mirrorCurrentIdx] === alt.letter;
                      const isCorrect =
                        alt.letter ===
                        mirrorSession.questions[mirrorCurrentIdx].correctAnswer;
                      let style =
                        "bg-secondary/10 border-border hover:bg-secondary/30";
                      if (mirrorConfirmed) {
                        if (isCorrect)
                          style =
                            "bg-emerald-500/10 border-emerald-500 text-emerald-500";
                        else if (isSelected)
                          style =
                            "bg-destructive/10 border-destructive text-destructive";
                        else style = "opacity-40 border-border/50";
                      } else if (isSelected) {
                        style = "bg-primary/10 border-primary text-primary";
                      }

                      return (
                        <button
                          key={alt.letter}
                          disabled={mirrorConfirmed}
                          onClick={() =>
                            setMirrorAnswers({
                              ...mirrorAnswers,
                              [mirrorCurrentIdx]: alt.letter,
                            })
                          }
                          className={cn(
                            "p-5 rounded-md border-2 text-left transition-all flex items-start gap-4",
                            style,
                          )}
                        >
                          <span className="w-8 h-8 rounded-md bg-background flex items-center justify-center font-bold text-xs shrink-0 border border-border">
                            {alt.letter}
                          </span>
                          <span className="text-sm font-semibold leading-relaxed pt-1 flex-1">
                            {alt.text}
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>

                {mirrorConfirmed &&
                  mirrorSession.questions[mirrorCurrentIdx].hint && (
                    <div className="p-5 rounded-md bg-amber-500/5 border border-amber-500/20 flex gap-4 animate-in slide-in-from-top-2">
                      <Lightbulb
                        className="text-amber-500 shrink-0"
                        size={20}
                      />
                      <p className="text-xs italic text-foreground/80 leading-relaxed font-medium">
                        <span className="font-bold text-amber-500 uppercase text-[9px] tracking-wider block mb-1">
                          Feedback do Mentor
                        </span>
                        {mirrorSession.questions[mirrorCurrentIdx].hint}
                      </p>
                    </div>
                  )}

                <div className="pt-6">
                  {!mirrorConfirmed ? (
                    <Button
                      onClick={() => setMirrorConfirmed(true)}
                      disabled={!mirrorAnswers[mirrorCurrentIdx]}
                      className="w-full h-12 rounded-md font-bold text-[11px] uppercase tracking-widest transition-all"
                    >
                      Confirmar Resposta
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (
                          mirrorCurrentIdx <
                          mirrorSession.questions.length - 1
                        ) {
                          setMirrorCurrentIdx(mirrorCurrentIdx + 1);
                          setMirrorConfirmed(false);
                        } else {
                          toast.success("Maldade Concluída!");
                          setMirrorSession(null);
                          refetchConfusions();
                        }
                      }}
                      className="w-full h-12 rounded-md font-bold text-[11px] uppercase tracking-widest transition-all border border-border"
                    >
                      {mirrorCurrentIdx < mirrorSession.questions.length - 1
                        ? "Próxima Questão"
                        : "Finalizar Simulado"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {analysisResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setAnalysisResult(null)}
          />
          <div className="relative w-full max-w-5xl max-h-[90vh] bg-card border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
            <div className="px-8 py-6 flex items-center justify-between border-b border-border bg-secondary/20">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center">
                  <BarChart3 size={24} className="text-primary-foreground" />
                </div>
                <div className="space-y-0.5">
                  <h2 className="text-xl font-bold uppercase tracking-tight text-foreground">
                    Raio-X Estratégico
                  </h2>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">
                    Análise de Dados Competitivos
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAnalysisResult(null)}
                className="w-10 h-10 rounded-full hover:bg-secondary flex items-center justify-center transition-all"
              >
                <XCircle size={20} className="opacity-30 hover:opacity-100" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-card/50">
              <div className="prose prose-invert max-w-none">
                <div className="text-foreground/90 leading-relaxed font-medium selection:bg-primary/20">
                  <ReactMarkdown
                    components={{
                      h1: ({ ...props }) => (
                        <h1
                          className="text-3xl font-bold mb-8 border-b border-border pb-4 text-foreground"
                          {...props}
                        />
                      ),
                      h2: ({ ...props }) => (
                        <h2
                          className="text-xl font-bold mt-10 mb-5 text-primary flex items-center gap-2 border-l-4 border-primary pl-4"
                          {...props}
                        />
                      ),
                      h3: ({ ...props }) => (
                        <h3
                          className="text-lg font-bold mt-8 mb-4 text-foreground/90"
                          {...props}
                        />
                      ),
                      p: ({ ...props }) => (
                        <p
                          className="text-sm leading-relaxed mb-6 opacity-80"
                          {...props}
                        />
                      ),
                      table: ({ ...props }) => (
                        <div className="my-8 overflow-hidden rounded-md border border-border bg-secondary/10">
                          <table
                            className="w-full text-left border-collapse"
                            {...props}
                          />
                        </div>
                      ),
                      thead: ({ ...props }) => (
                        <thead className="bg-secondary/30" {...props} />
                      ),
                      th: ({ ...props }) => (
                        <th
                          className="p-4 text-[10px] font-bold uppercase tracking-widest text-primary border-b border-border"
                          {...props}
                        />
                      ),
                      td: ({ ...props }) => (
                        <td
                          className="p-4 text-xs border-b border-border/50 opacity-80 tabular-nums"
                          {...props}
                        />
                      ),
                      strong: ({ ...props }) => (
                        <strong className="font-bold text-primary" {...props} />
                      ),
                      ul: ({ ...props }) => (
                        <ul
                          className="space-y-3 my-6 list-none p-0"
                          {...props}
                        />
                      ),
                      li: ({ ...props }) => (
                        <li
                          className="flex items-start gap-3 text-sm opacity-80 before:w-1.5 before:h-1.5 before:bg-primary before:rounded-full before:mt-2 before:shrink-0"
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

            <div className="px-8 py-5 border-t border-border bg-secondary/20 flex justify-between items-center">
              <div className="flex items-center gap-6">
                <div className="space-y-0.5">
                  <p className="text-[8px] font-bold uppercase tracking-widest opacity-40">
                    Data do Relatório
                  </p>
                  <p className="text-[10px] font-bold tabular-nums">
                    {new Date().toLocaleDateString()}
                  </p>
                </div>
                <div className="w-px h-6 bg-border" />
                <div className="space-y-0.5">
                  <p className="text-[8px] font-bold uppercase tracking-widest opacity-40">
                    Materiais
                  </p>
                  <p className="text-[10px] font-bold">
                    {selectedExams.length} Fontes
                  </p>
                </div>
              </div>
              <Button
                onClick={() => window.print()}
                className="h-10 px-6 rounded-md text-[10px] font-bold uppercase tracking-widest"
              >
                <Download size={14} className="mr-2" /> Exportar Dossiê
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={!!previewQuestions}
        onOpenChange={() => setPreviewQuestions(null)}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] p-0 overflow-hidden flex flex-col rounded-lg border-border">
          <DialogHeader className="p-6 bg-secondary/30 border-b border-border shrink-0">
            <DialogTitle className="text-xl font-bold uppercase tracking-tight flex items-center gap-3">
              <Cpu className="text-primary" /> Extração Concluída
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold opacity-60">
              Identificamos {previewQuestions?.questions.length} questões
              estruturadas. Deseja integrá-las?
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 bg-card">
            <div className="p-6 space-y-6">
              {previewQuestions?.questions.map((q, idx) => (
                <div
                  key={idx}
                  className="soe-card p-5 bg-secondary/10 border-border rounded-md space-y-4"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <Badge
                        variant="outline"
                        className="text-[9px] font-bold uppercase tracking-wider bg-primary/5 text-primary border-primary/20"
                      >
                        {q.subject || "Sem Matéria"}
                      </Badge>
                      <h4 className="text-[10px] font-bold uppercase opacity-40 tracking-wider block">
                        {q.topic || "Assunto Geral"}
                      </h4>
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] font-bold rounded-sm">
                      Gabarito: {q.correctAnswer}
                    </Badge>
                  </div>

                  <p className="text-sm font-semibold leading-relaxed text-foreground/80">
                    {q.statement}
                  </p>

                  <div className="grid grid-cols-1 gap-1.5 pl-4 border-l-2 border-primary/20">
                    {Array.isArray(q.alternatives)
                      ? q.alternatives.map((alt: any, altIdx: number) => (
                          <div
                            key={altIdx}
                            className="text-xs opacity-70 flex gap-2 font-medium"
                          >
                            <span className="font-bold text-primary">
                              {alt.letter})
                            </span>
                            <span>{alt.text}</span>
                          </div>
                        ))
                      : Object.entries(q.alternatives || {}).map(
                          ([letter, text]) => (
                            <div
                              key={letter}
                              className="text-xs opacity-70 flex gap-2 font-medium"
                            >
                              <span className="font-bold text-primary">
                                {letter})
                              </span>
                              <span>{text as any}</span>
                            </div>
                          ),
                        )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="p-4 bg-secondary/30 border-t border-border gap-2">
            <Button
              variant="outline"
              onClick={() => setPreviewQuestions(null)}
              className="h-10 px-6 rounded-md font-bold text-[10px] uppercase tracking-widest"
            >
              Descartar
            </Button>
            <Button
              onClick={() => setPreviewQuestions(null)}
              className="h-10 px-8 rounded-md font-bold text-[10px] uppercase tracking-widest"
            >
              Confirmar Integração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
