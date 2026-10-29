import { useState, useEffect, useRef } from "react";
import {
  History as HistoryIcon,
  Palette,
  Settings,
  User,
  LogOut,
  FileText,
  Search,
  Bell,
  ExternalLink,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Sun,
  Moon,
  Check,
  Minimize2,
  XCircle,
  ChevronRight,
  Cloud,
  Cpu,
  Layout,
  Smartphone,
  Database,
  Zap,
  ShieldCheck,
  Camera,
  Target,
  Info,
  Download,
  RefreshCw,
  Monitor,
} from "lucide-react";
import History from "./History";
import { useTheme, COLOR_THEMES, ColorTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  douGetConfig,
  douSaveConfig,
  douCheckNow,
  DEFAULT_INTERVAL_MINUTES,
} from "@/hooks/useDiarioOficial";
import { toast } from "sonner";
import Revisions from "./Revisions";
import { motion, AnimatePresence } from "framer-motion";

type Tab = "history" | "settings" | "dou" | "revisions" | "about";

declare const __APP_VERSION__: string;

const isElectronApp =
  typeof window !== "undefined" && !!(window as any).electron?.tray;
const isElectron =
  typeof window !== "undefined" && !!(window as any).electron?.dou;
const isAndroid =
  typeof window !== "undefined" &&
  (window as any).Capacitor?.isNativePlatform?.();

function AIHealthCheck({
  apiKey,
  provider,
}: {
  apiKey: string;
  provider: string;
}) {
  const testMut = trpc.mentor.testKey.useMutation();
  const [report, setReport] = useState<any>(null);

  const runTest = () => {
    if (!apiKey) {
      toast.error("Insira uma chave primeiro.");
      return;
    }
    toast.info("Iniciando varredura de modelos...");
    (testMut as any).mutate(
      { apiKey, provider },
      {
        onSuccess: (data: any) => setReport(data),
        onError: (err: any) => toast.error("Falha crítica: " + err.message),
      },
    );
  };

  return (
    <div className="flex-1 space-y-2">
      <button
        onClick={runTest}
        disabled={testMut.isPending}
        className="w-full py-3 rounded-xl bg-secondary/40 border border-border/70 text-muted-foreground hover:text-foreground hover:bg-secondary/60 font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
      >
        {testMut.isPending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Zap size={14} />
        )}
        {testMut.isPending ? "Testando..." : "Testar Saúde da IA"}
      </button>

      <AnimatePresence>
        {report && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="p-3 rounded-xl bg-secondary/30 border border-border/70 space-y-2"
          >
            {report.details.map((d: any, i: number) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono opacity-40">
                    {d.keyPrefix}
                  </span>
                  <span
                    className={`text-[8px] font-black uppercase tracking-widest ${d.status === "ok" ? "text-[var(--accent-green)]" : "text-rose-500"}`}
                  >
                    {d.status === "ok" ? "Ativa" : "Falhou"}
                  </span>
                </div>
                {d.models.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {d.models.map((m: string) => (
                      <span
                        key={m}
                        className="px-1.5 py-0.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] text-[8px] font-bold"
                      >
                        {m.replace("gemini-", "")}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[8px] text-rose-500/60 leading-tight">
                    {d.error?.slice(0, 50)}...
                  </p>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SettingsTab() {
  const { theme, toggleTheme, colorTheme, setColorTheme } = useTheme();
  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(true);

  useEffect(() => {
    if (isElectronApp) {
      (window as any).electron.tray
        .getPreference()
        .then((val: boolean) => setMinimizeToTray(val));
    }
  }, []);

  const handleTrayToggle = async (value: boolean) => {
    setMinimizeToTray(value);
    if (isElectronApp) {
      await (window as any).electron.tray.setPreference(value);
      toast.success(
        value
          ? "App irá minimizar para a bandeja ao fechar."
          : "App irá encerrar ao fechar a janela.",
      );
    }
  };

  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<"gemini" | "openai" | "claude">(
    "gemini",
  );
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupDir, setAutoBackupDir] = useState("");
  const [section, setSection] = useState<
    "appearance" | "ai" | "study" | "data"
  >("appearance");
  const [baseDisciplineIds, setBaseDisciplineIds] = useState<number[]>([]);
  const [scheduler, setScheduler] = useState<"classic" | "fsrs">("classic");
  const [tecCaptureMode, setTecCaptureMode] = useState<
    "manual" | "assisted" | "import"
  >("assisted");
  const [fsrsPreviewOpen, setFsrsPreviewOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"v2" | "classic">("v2");
  const [uiMode, setUiMode] = useState<"focused" | "complete">("focused");
  const { data: disciplines } = trpc.discipline.list.useQuery();
  const fsrsPreview = trpc.study.fsrsPreview.useQuery(
    { days: 30 },
    { enabled: fsrsPreviewOpen },
  );

  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const utils = trpc.useUtils();
  const updateSettings = trpc.v10.updateV10Settings.useMutation({
    onSuccess: () => {
      toast.success("Configuração salva.");
      utils.dashboard.getStats.invalidate();
    },
    onError: (e) => toast.error("Falha: " + e.message),
  });

  useEffect(() => {
    if (stats?.settings) {
      const s = stats.settings as any;
      setApiKey(s.aiApiKey || "");
      setProvider(s.aiProvider || "gemini");
      setAutoBackupEnabled(s.autoBackupEnabled || false);
      setAutoBackupDir(s.autoBackupDir || "");
      setBaseDisciplineIds(
        Array.isArray(s.baseDisciplineIds) ? s.baseDisciplineIds : [],
      );
      setLayoutMode(s.layoutMode === "classic" ? "classic" : "v2");
      setUiMode(s.uiMode === "complete" ? "complete" : "focused");
      setScheduler(s.scheduler === "fsrs" ? "fsrs" : "classic");
      const captureMode =
        s.tecCaptureMode === "manual" || s.tecCaptureMode === "import"
          ? s.tecCaptureMode
          : "assisted";
      setTecCaptureMode(captureMode);
      localStorage.setItem("soe_tec_capture_mode", captureMode);
      if (s.minimizeToTray !== undefined) {
        setMinimizeToTray(s.minimizeToTray);
        if (isElectronApp)
          (window as any).electron.tray.setPreference(s.minimizeToTray);
      }
    }
  }, [stats?.settings]);

  const handleSaveAI = () =>
    updateSettings.mutate({ aiApiKey: apiKey, aiProvider: provider });
  const handleSaveSync = () =>
    updateSettings.mutate({ autoBackupEnabled, autoBackupDir });

  const isFocus = uiMode === "focused";

  return (
    <div className="space-y-6 py-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div
        className={
          isFocus
            ? "grid grid-cols-2 gap-2 lg:grid-cols-4"
            : "flex w-fit flex-wrap gap-1 rounded-lg border border-border bg-secondary/40 p-1"
        }
      >
        {[
          { id: "appearance", label: "Aparência", icon: Palette },
          { id: "ai", label: "Inteligência Artificial", icon: Cpu },
          { id: "study", label: "Estudo", icon: Target },
          { id: "data", label: "Dados & Sync", icon: Database },
        ].map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id as typeof section)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                active
                  ? "border-primary/25 bg-card text-foreground shadow-sm"
                  : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={13} />
              {item.label}
            </button>
          );
        })}
      </div>

      {section === "appearance" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-black text-xs uppercase tracking-[0.3em] text-primary">
              Visual & Interface
            </h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed">
              Customize a experiência visual do seu ecossistema SOE.
            </p>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {(["light", "dark"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    if (theme !== m) toggleTheme();
                  }}
                  className={`flex items-center gap-4 p-6 rounded-3xl border transition-all ${theme === m ? "bg-primary/10 border-primary" : "bg-secondary/40 border-border/70 opacity-50 hover:opacity-100"}`}
                >
                  <div
                    className={`p-3 rounded-2xl ${theme === m ? "bg-primary text-white" : "bg-secondary/60 text-muted-foreground"}`}
                  >
                    {m === "light" ? <Sun size={20} /> : <Moon size={20} />}
                  </div>
                  <div className="text-left">
                    <p
                      className={`font-black text-[10px] uppercase tracking-widest ${theme === m ? "text-white" : "text-muted-foreground"}`}
                    >
                      Modo {m === "light" ? "Claro" : "Escuro"}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Layout size={14} className="text-primary" />
                <p className="text-[10px] font-bold uppercase tracking-wider">
                  Layout da interface
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                O layout focado é o padrão: sidebar curta e ferramentas dentro
                de Estudar. O clássico mantém o menu completo e o Início atual.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  {
                    id: "focused" as const,
                    title: "Novo · focado",
                    desc: "Sidebar curta e hub Estudar.",
                  },
                  {
                    id: "complete" as const,
                    title: "Clássico · completo",
                    desc: "Menu completo, como antes.",
                  },
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => {
                      setUiMode(option.id);
                      localStorage.setItem("soe_nav_mode", option.id);
                      updateSettings.mutate({ uiMode: option.id });
                    }}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      uiMode === option.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          uiMode === option.id ? "bg-primary" : "bg-border"
                        }`}
                      />
                      <span className="text-xs font-semibold">
                        {option.title}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {option.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Layout size={14} className="text-primary" />
                <p className="text-[10px] font-bold uppercase tracking-wider">
                  Layout do Início
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                O layout novo é o padrão. Você pode voltar ao Início antigo
                quando quiser; seus dados não mudam.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  {
                    id: "v2" as const,
                    title: "Layout novo",
                    desc: "Missão guiada, roteiro do dia e atalhos.",
                  },
                  {
                    id: "classic" as const,
                    title: "Layout antigo",
                    desc: "Dashboard atual, com todos os widgets.",
                  },
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => {
                      setLayoutMode(option.id);
                      updateSettings.mutate({ layoutMode: option.id });
                    }}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      layoutMode === option.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          layoutMode === option.id ? "bg-primary" : "bg-border"
                        }`}
                      />
                      <span className="text-xs font-semibold">
                        {option.title}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {option.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-8 rounded-[2rem] bg-secondary/20 border border-border/70 space-y-6">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40">
                Esquema de Cores
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(Object.entries(COLOR_THEMES) as [ColorTheme, any][]).map(
                  ([key, cfg]) => {
                    const color = theme === "dark" ? cfg.dark : cfg.light;
                    const selected = colorTheme === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setColorTheme(key)}
                        className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${selected ? "bg-primary/5 border-primary shadow-lg shadow-primary/5" : "bg-transparent border-border/70 opacity-40 hover:opacity-100"}`}
                      >
                        <div
                          className="w-8 h-8 rounded-full border-2 border-background shadow-xl"
                          style={{ background: color }}
                        />
                        <span className="text-[8px] font-black uppercase tracking-widest truncate">
                          {cfg.label}
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {section === "ai" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-black text-xs uppercase tracking-[0.3em] text-primary">
              Inteligência Artificial
            </h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed">
              Gerencie os motores que alimentam o Mentor e a Mineração.
            </p>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest opacity-30 ml-1">
                  Provedor
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as any)}
                  className="w-full px-5 py-4 rounded-2xl bg-secondary/40 border border-border/70 text-xs font-bold outline-none focus:border-primary transition-all"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="claude">Anthropic (Claude)</option>
                </select>
              </div>
              <div className="flex flex-col justify-end gap-3">
                <button
                  onClick={handleSaveAI}
                  disabled={updateSettings.isPending}
                  className="h-14 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-primary/20 transition-all active:scale-95"
                >
                  {updateSettings.isPending
                    ? "Salvando..."
                    : "Salvar Configuração"}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[9px] font-black uppercase tracking-widest opacity-30">
                  Chaves de API
                </label>
                <AIHealthCheck apiKey={apiKey} provider={provider} />
              </div>
              <textarea
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Insira suas chaves aqui...`}
                rows={4}
                className="w-full px-6 py-5 rounded-[2rem] bg-secondary/40 border border-border/70 text-[11px] font-mono outline-none resize-none focus:border-primary transition-all custom-scrollbar"
              />
            </div>
          </div>
        </div>
      )}

      {section === "study" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-black text-xs uppercase tracking-[0.3em] text-primary">
              Estudo
            </h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed">
              Rotina base, agendamento e captura segura do TEC.
            </p>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Disciplinas da rotina base
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Elas aparecem no plano diário mesmo quando não fazem parte do
                  edital atual.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {((disciplines as any[]) || []).map((discipline: any) => {
                  const checked = baseDisciplineIds.includes(discipline.id);
                  return (
                    <label
                      key={discipline.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-border/70 px-3 py-2.5 hover:bg-secondary/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setBaseDisciplineIds((prev) =>
                            e.target.checked
                              ? [...new Set([...prev, discipline.id])]
                              : prev.filter((id) => id !== discipline.id),
                          )
                        }
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                      <span
                        className="text-xs font-semibold truncate"
                        style={{ color: "var(--app-fg)" }}
                      >
                        {discipline.name}
                      </span>
                    </label>
                  );
                })}
              </div>
              {(!disciplines || (disciplines as any[]).length === 0) && (
                <p className="text-[11px] text-muted-foreground">
                  Cadastre disciplinas primeiro.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Agendador de revisão
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  O 25/50 permanece o padrão. FSRS é experimental e não grava
                  nada sem confirmação.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  onClick={() => setScheduler("classic")}
                  className={`rounded-md border p-3 text-left ${scheduler === "classic" ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <p className="text-xs font-bold">Clássico 25/50</p>
                  <p className="text-[10px] text-muted-foreground">
                    Ativo e recomendado
                  </p>
                </button>
                <button
                  onClick={() => setScheduler("fsrs")}
                  className={`rounded-md border p-3 text-left ${scheduler === "fsrs" ? "border-accent-amber bg-accent-amber/5" : "border-border"}`}
                >
                  <p className="text-xs font-bold">FSRS experimental</p>
                  <p className="text-[10px] text-muted-foreground">
                    Prévia apenas; não altera o calendário
                  </p>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFsrsPreviewOpen((value) => !value)}
                >
                  {fsrsPreviewOpen ? "Fechar prévia" : "Ver prévia FSRS"}
                </Button>
                {scheduler === "fsrs" && fsrsPreviewOpen && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-accent-amber">
                    Nada será aplicado sem confirmação
                  </span>
                )}
              </div>
              {fsrsPreviewOpen && (
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border/60 p-3">
                  {fsrsPreview.isLoading ? (
                    <p className="text-[11px] text-muted-foreground">
                      Calculando...
                    </p>
                  ) : (
                    (fsrsPreview.data?.items || []).map((item: any) => (
                      <div
                        key={item.topicId}
                        className="flex items-center justify-between gap-2 text-[10px]"
                      >
                        <span className="min-w-0 truncate font-semibold">
                          {item.topicName}
                        </span>
                        <span className="whitespace-nowrap text-muted-foreground">
                          {item.suggestedIntervalDays}d · {item.suggestedDate}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Captura TEC
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Modo manual é o mais seguro contra ban. Nada de scraping,
                  busca ou navegação automática.
                </p>
              </div>
              <div className="space-y-2">
                {[
                  {
                    id: "manual",
                    label: "Manual / assistido",
                    desc: "Você registra ou clica no botão do SOE.",
                  },
                  {
                    id: "assisted",
                    label: "Assistido (experimental)",
                    desc: "Lê apenas a resposta já visível; sem navegar.",
                  },
                  {
                    id: "import",
                    label: "Importar relatório",
                    desc: "Copia/exporta o resultado do TEC e importa no SOE.",
                  },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() =>
                      setTecCaptureMode(mode.id as typeof tecCaptureMode)
                    }
                    className={`flex w-full items-start gap-3 rounded-md border p-3 text-left ${tecCaptureMode === mode.id ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <span
                      className={`mt-1 h-2 w-2 rounded-full ${tecCaptureMode === mode.id ? "bg-primary" : "bg-border"}`}
                    />
                    <span>
                      <span className="block text-xs font-bold">
                        {mode.label}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {mode.desc}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={() => {
                localStorage.setItem("soe_tec_capture_mode", tecCaptureMode);
                updateSettings.mutate({
                  baseDisciplineIds,
                  scheduler,
                  tecCaptureMode,
                });
              }}
              disabled={updateSettings.isPending}
              className="h-11 rounded-md text-[10px] font-bold uppercase tracking-widest"
            >
              {updateSettings.isPending
                ? "Salvando..."
                : "Salvar configurações de estudo"}
            </Button>
          </div>
        </div>
      )}

      {section === "data" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-black text-xs uppercase tracking-[0.3em] text-primary">
              Sistema & Backup
            </h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed">
              Sincronização em nuvem e preferências de execução.
            </p>
          </div>
          <div className="lg:col-span-2 space-y-6">
            {isElectronApp && (
              <label
                className={`flex items-center justify-between p-6 rounded-[2rem] border transition-all cursor-pointer ${minimizeToTray ? "bg-primary/5 border-primary" : "bg-secondary/40 border-border/70 opacity-50"}`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center ${minimizeToTray ? "bg-primary text-white shadow-lg" : "bg-secondary/60 text-muted-foreground"}`}
                  >
                    <Minimize2 size={20} />
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase tracking-widest">
                      Execução em Segundo Plano
                    </span>
                    <p className="text-[9px] font-bold opacity-30 uppercase">
                      Minimiza para a bandeja ao fechar
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={minimizeToTray}
                  onChange={(e) => {
                    const val = e.target.checked;
                    handleTrayToggle(val);
                    updateSettings.mutate({ minimizeToTray: val });
                  }}
                  className="hidden"
                />
                <div
                  className={`w-12 h-6 rounded-full p-1 transition-all ${minimizeToTray ? "bg-primary" : "bg-secondary/60"}`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-all ${minimizeToTray ? "ml-6" : "ml-0"}`}
                  />
                </div>
              </label>
            )}

            <label
              className={`flex items-center justify-between p-6 rounded-[2rem] border transition-all cursor-pointer ${autoBackupEnabled ? "bg-primary/5 border-primary" : "bg-secondary/40 border-border/70 opacity-50"}`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center ${autoBackupEnabled ? "bg-primary text-white shadow-lg" : "bg-secondary/60 text-muted-foreground"}`}
                >
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <span className="text-xs font-black uppercase tracking-widest">
                    Backup em Tempo Real
                  </span>
                  <p className="text-[9px] font-bold opacity-30 uppercase">
                    Sincroniza com Google Drive / Dropbox
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                className="hidden"
              />
              <div
                className={`w-12 h-6 rounded-full p-1 transition-all ${autoBackupEnabled ? "bg-primary" : "bg-secondary/60"}`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-all ${autoBackupEnabled ? "ml-6" : "ml-0"}`}
                />
              </div>
            </label>

            {autoBackupEnabled && (
              <div className="flex gap-3 animate-in slide-in-from-left-4 duration-300">
                <input
                  type="text"
                  value={autoBackupDir}
                  onChange={(e) => setAutoBackupDir(e.target.value)}
                  placeholder="Caminho da pasta na nuvem..."
                  className="flex-1 px-5 py-4 rounded-2xl bg-secondary/40 border border-border/70 text-xs font-bold outline-none focus:border-primary transition-all"
                />
                <button
                  onClick={handleSaveSync}
                  className="px-8 rounded-2xl bg-secondary/40 hover:bg-secondary/60 border border-border/70 text-[9px] font-black uppercase tracking-widest transition-all"
                >
                  Salvar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const INTERVAL_PRESETS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hora", value: 60 },
  { label: "4 horas", value: 240 },
];

function DiarioOficialTab() {
  const [name, setName] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [checking, setChecking] = useState(false);
  const [lastResult, setLastResult] = useState<{
    total: number;
    newCount: number;
    searchURL: string;
  } | null>(null);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    douGetConfig().then((cfg) => {
      setName(cfg.name);
      setInputValue(cfg.name);
      setIntervalMinutes(cfg.intervalMinutes || 60);
      setLastCheck(cfg.lastCheck);
      setLoading(false);
    });
  }, []);

  const saved = name.length >= 3;

  async function handleSave() {
    const trimmed = inputValue.trim();
    if (trimmed.length < 5) {
      toast.error("Digite seu nome completo.");
      return;
    }
    await douSaveConfig({ name: trimmed, intervalMinutes });
    setName(trimmed);
    toast.success("Monitoramento configurado!");
  }

  async function handleCheckNow() {
    if (!saved) return;
    setChecking(true);
    try {
      const result = await douCheckNow();
      setLastResult(result);
      setLastCheck(new Date().toISOString());
      if (result.newCount > 0)
        toast.success(`${result.newCount} novas publicações!`);
      else toast.info("Nenhuma novidade no DOU.");
    } catch {
      toast.error("Erro na consulta.");
    } finally {
      setChecking(false);
    }
  }

  if (loading)
    return (
      <div className="p-20 text-center opacity-20 font-black uppercase text-[10px] tracking-[0.5em] animate-pulse">
        Sincronizando Sentinela...
      </div>
    );

  return (
    <div className="space-y-12 py-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Search Configuration Section */}
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-black text-xs uppercase tracking-[0.3em] text-primary">
            Configuração de Busca
          </h3>
          <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed">
            O SOE monitora automaticamente as publicações da União em busca de
            citações ao seu nome.
          </p>
        </div>
        <div className="lg:col-span-2 space-y-8">
          <div className="p-8 rounded-[2.5rem] bg-secondary/20 border border-border/70 space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none select-none">
              <FileText size={120} />
            </div>

            <div className="space-y-4">
              <label className="text-[9px] font-black uppercase tracking-widest opacity-30 ml-1">
                Nome Completo para Monitoramento
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ex: João Da Silva Pereira"
                  className="flex-1 px-6 h-14 rounded-2xl bg-secondary/40 border border-border/70 text-sm font-bold outline-none focus:border-primary transition-all shadow-inner"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  className="relative z-10 px-10 h-14 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-primary/20 active:scale-95 transition-all hover:brightness-110"
                >
                  Ativar
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[9px] font-black uppercase tracking-widest opacity-30">
                  Ciclo de Varredura
                </label>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                  {intervalMinutes < 60
                    ? `${intervalMinutes}m`
                    : `${intervalMinutes / 60}h`}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {INTERVAL_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => {
                      setIntervalMinutes(p.value);
                      if (saved) douSaveConfig({ intervalMinutes: p.value });
                    }}
                    className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${intervalMinutes === p.value ? "bg-primary/10 border-primary text-primary" : "bg-transparent border-border/70 text-muted-foreground/70 hover:bg-secondary/40"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {saved && (
        <>
          <div className="h-px bg-secondary/40 w-full" />

          {/* Real-time Status Section */}
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-black text-xs uppercase tracking-[0.3em] text-primary">
                Status em Tempo Real
              </h3>
              <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed">
                Resultado da última varredura automática realizada pelo sistema.
              </p>
            </div>
            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-8 rounded-[2rem] bg-secondary/20 border border-border/70 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-30 text-primary">
                    Último Checkpoint
                  </p>
                  <p className="text-xl font-black">
                    {lastCheck
                      ? new Date(lastCheck).toLocaleString()
                      : "Aguardando..."}
                  </p>
                </div>
                <div
                  className={`p-8 rounded-[2rem] border transition-all flex flex-col justify-center ${lastResult?.newCount ? "bg-emerald-500/10 border-emerald-500/20" : "bg-secondary/20 border-border/70"}`}
                >
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-30">
                    Ocorrências
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-xl font-black">
                      {lastResult
                        ? lastResult.total === 0
                          ? "Nenhuma"
                          : lastResult.total
                        : "---"}
                    </p>
                    {lastResult?.newCount ? (
                      <span className="px-3 py-1 rounded-full bg-emerald-500 text-white font-black text-[8px] uppercase tracking-widest animate-pulse">
                        Novo!
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleCheckNow}
                  disabled={checking}
                  className="flex-1 h-16 rounded-[2rem] bg-primary text-white font-black text-xs uppercase tracking-[0.25em] shadow-2xl shadow-primary/30 flex items-center justify-center gap-4 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {checking ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <Zap size={20} />
                  )}
                  {checking
                    ? "Varrendo Diários..."
                    : "Forçar Verificação Agora"}
                </button>
                <a
                  href={`https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(`"${name}"`)}&s=todos&exactDate=all&sortType=0`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-16 h-16 rounded-[2rem] bg-secondary/40 hover:bg-secondary/60 border border-border/70 text-muted-foreground/70 hover:text-foreground transition-all flex items-center justify-center"
                >
                  <ExternalLink size={20} />
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Profile() {
  const hash = window.location.hash.replace("#", "") as Tab;
  const [tab, setTab] = useState<Tab>(
    ["history", "revisions", "dou"].includes(hash) ? (hash as Tab) : "settings",
  );

  const [serverHealth, setServerHealth] = useState<{
    status: string;
    version?: string;
    uptimeSeconds?: number;
  } | null>(null);

  const [updateStatus, setUpdateStatus] = useState<{
    loading: boolean;
    message: string;
    tone: "neutral" | "success" | "error";
  }>({ loading: false, message: "", tone: "neutral" });

  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { user, logout } = useAuth();
  const isFocus =
    ((stats?.settings as any)?.uiMode ?? "focused") !== "complete";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const updateSettings = trpc.v10.updateV10Settings.useMutation({
    onSuccess: () => {
      toast.success("Foto de perfil atualizada!");
      utils.auth.me.invalidate();
      utils.dashboard.getStats.invalidate();
    },
    onError: (error) => toast.error("Falha ao salvar foto: " + error.message),
  });

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error("A imagem deve ter menos de 1MB.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      updateSettings.mutate({ profileImage: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (tab !== "about") return;
    let cancelled = false;
    fetch("/api/health")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setServerHealth(data);
      })
      .catch(() => {
        if (!cancelled) setServerHealth(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const TABS: Array<{ id: Tab; label: string; desc: string; icon: any }> = [
    {
      id: "settings",
      label: "Configurações",
      desc: "Aparência, IA e dados",
      icon: Settings,
    },
    {
      id: "history",
      label: "Histórico",
      desc: "Linha do tempo",
      icon: HistoryIcon,
    },
    {
      id: "revisions",
      label: "Atividade",
      desc: "Revisões e log",
      icon: CheckCircle2,
    },
    {
      id: "dou",
      label: "Sentinela DOU",
      desc: "Monitoramento",
      icon: FileText,
    },
    {
      id: "about",
      label: "Sobre",
      desc: "Versão e atualizações",
      icon: Info,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1160px] space-y-5 pb-12">
      {isFocus ? (
        <div className="min-w-0">
          <h1 className="apple-title text-foreground">Mais</h1>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Sua conta, aparência e dados em um só lugar.
          </p>
        </div>
      ) : (
        <PageHeader
          eyebrow="Conta"
          title="Perfil"
          description="Configurações, histórico e monitoramento em um só lugar."
        />
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[252px_1fr]">
        <div className="min-w-0 space-y-4">
          <div className="soe-card flex flex-col gap-3 p-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="group relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border border-border bg-secondary"
                title="Trocar foto"
              >
                {stats?.settings?.profileImage ? (
                  <img
                    src={stats.settings.profileImage}
                    alt="Perfil"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xl font-bold text-muted-foreground">
                    {user?.name?.[0]?.toUpperCase() ?? (
                      <User className="h-7 w-7" />
                    )}
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera size={18} className="text-white" />
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">
                  {user?.name ?? "Estudante"}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email || "Conta local offline"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-[10px] border border-border bg-card text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary/60"
            >
              <LogOut size={14} /> Sair
            </button>
          </div>

          <nav className="soe-card flex gap-1 overflow-x-auto p-2 lg:flex-col">
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setTab(item.id);
                    window.location.hash = item.id;
                  }}
                  className={`flex min-w-[150px] items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors lg:min-w-0 ${
                    active
                      ? "bg-[var(--primary-bg-subtle)] text-primary"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <Icon size={16} className="flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-bold uppercase tracking-wider">
                      {item.label}
                    </span>
                    <span
                      className={`block truncate text-[9px] ${active ? "text-primary-foreground/70" : "opacity-60"}`}
                    >
                      {item.desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {tab === "settings" && <SettingsTab />}
          {tab === "history" && <History />}
          {tab === "revisions" && <Revisions />}
          {tab === "dou" && <DiarioOficialTab />}
          {tab === "about" && (
            <div className="space-y-4">
              <div className="soe-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Info className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">SOE</p>
                    <p className="text-[10px] text-muted-foreground">
                      Versão{" "}
                      {typeof __APP_VERSION__ !== "undefined"
                        ? __APP_VERSION__
                        : "dev"}{" "}
                      ·{" "}
                      {isAndroid
                        ? "Android"
                        : isElectronApp
                          ? "Desktop"
                          : "Web"}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          serverHealth?.status === "ok"
                            ? "bg-emerald-500"
                            : "bg-amber-500"
                        }`}
                      />
                      {serverHealth?.status === "ok"
                        ? `Servidor local online · ${serverHealth.uptimeSeconds ?? 0}s`
                        : "Servidor local não verificado"}
                    </p>
                  </div>
                </div>
                <span className="rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-600">
                  Canal estável
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="soe-card p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Monitor className="h-4 w-4 text-primary" /> Desktop
                  </div>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                    Atualização interna via electron-updater. O app verifica ao
                    abrir e a cada 6 horas. Não abre navegador nem baixa
                    instalador manual.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3 h-8 text-[10px]"
                    disabled={updateStatus.loading}
                    onClick={async () => {
                      const api = (window as any).electron?.updates;
                      if (!api?.check) {
                        setUpdateStatus({
                          loading: false,
                          message:
                            "Verificação disponível apenas no app desktop.",
                          tone: "neutral",
                        });
                        return;
                      }
                      setUpdateStatus({
                        loading: true,
                        message: "Verificando...",
                        tone: "neutral",
                      });
                      const result = await api.check();
                      setUpdateStatus({
                        loading: false,
                        message:
                          result?.status === "ok"
                            ? result.updateAvailable
                              ? `Atualização disponível: ${result.latestVersion}.`
                              : "Você está na versão mais recente."
                            : result?.message || "Não foi possível verificar.",
                        tone:
                          result?.status === "ok"
                            ? "success"
                            : result?.status === "error"
                              ? "error"
                              : "neutral",
                      });
                    }}
                  >
                    <RefreshCw
                      className={`mr-2 h-3.5 w-3.5 ${updateStatus.loading ? "animate-spin" : ""}`}
                    />
                    Verificar atualização
                  </Button>
                  {updateStatus.message && (
                    <p
                      className={`mt-2 text-[9.5px] ${
                        updateStatus.tone === "success"
                          ? "text-emerald-600"
                          : updateStatus.tone === "error"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }`}
                    >
                      {updateStatus.message}
                    </p>
                  )}
                </div>
                <div className="soe-card p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Smartphone className="h-4 w-4 text-primary" /> Android
                  </div>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                    Distribuição por APK, sem Play Store. O Android exige
                    confirmação de instalação para apps fora da loja; o download
                    é feito dentro do app.
                  </p>
                </div>
              </div>

              <div className="soe-card p-4">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Download className="h-4 w-4 text-primary" /> Backup antes de
                  atualizar
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                  Antes de qualquer atualização, exporte o banco em Sync &
                  Backup. O SOE não sobrescreve seus dados durante a troca de
                  versão.
                </p>
                <Button
                  variant="outline"
                  className="mt-3 h-8 text-[10px]"
                  onClick={() => {
                    setTab("settings");
                    window.location.hash = "settings";
                  }}
                >
                  Ir para configurações
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
