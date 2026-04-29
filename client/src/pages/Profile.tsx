import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
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
} from "lucide-react";
import History from "./History";
import { useTheme, COLOR_THEMES, ColorTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  douCheckNow,
  DEFAULT_INTERVAL_MINUTES,
} from "@/hooks/useDiarioOficial";
import { toast } from "sonner";
import Revisions from "./Revisions";
import { motion, AnimatePresence } from "framer-motion";

type Tab = "history" | "settings" | "dou" | "revisions";

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
        className="w-full py-3 rounded-xl bg-white/5 border border-white/5 text-white/40 hover:text-white hover:bg-white/10 font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
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
            className="p-3 rounded-xl bg-black/20 border border-white/5 space-y-2"
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

  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const updateSettings = trpc.v10.updateV10Settings.useMutation({
    onSuccess: () => toast.success("Configuração salva."),
    onError: (e) => toast.error("Falha: " + e.message),
  });

  useEffect(() => {
    if (stats?.settings) {
      const s = stats.settings as any;
      setApiKey(s.aiApiKey || "");
      setProvider(s.aiProvider || "gemini");
      setAutoBackupEnabled(s.autoBackupEnabled || false);
      setAutoBackupDir(s.autoBackupDir || "");
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

  return (
    <div className="space-y-10 py-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Visual & Interface Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="space-y-2">
          <h3 className="font-black text-xs uppercase tracking-[0.3em] text-primary">
            Visual & Interface
          </h3>
          <p className="text-[10px] font-bold text-white/30 uppercase leading-relaxed">
            Customize a experiência visual do seu ecossistema SOE.
          </p>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {(["light", "dark"] as const).map((m: any) => (
              <button
                key={m}
                onClick={() => {
                  if (theme !== m) toggleTheme();
                }}
                className={`flex items-center gap-4 p-6 rounded-3xl border transition-all ${theme === m ? "bg-primary/10 border-primary" : "bg-white/5 border-white/5 opacity-50 hover:opacity-100"}`}
              >
                <div
                  className={`p-3 rounded-2xl ${theme === m ? "bg-primary text-white" : "bg-white/10 text-white/40"}`}
                >
                  {m === "light" ? <Sun size={20} /> : <Moon size={20} />}
                </div>
                <div className="text-left">
                  <p
                    className={`font-black text-[10px] uppercase tracking-widest ${theme === m ? "text-white" : "text-white/40"}`}
                  >
                    Modo {m === "light" ? "Claro" : "Escuro"}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 space-y-6">
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
                      className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${selected ? "bg-primary/5 border-primary shadow-lg shadow-primary/5" : "bg-transparent border-white/5 opacity-40 hover:opacity-100"}`}
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

      <div className="h-px bg-white/5 w-full" />

      {/* AI Intelligence Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="space-y-2">
          <h3 className="font-black text-xs uppercase tracking-[0.3em] text-primary">
            Inteligência Artificial
          </h3>
          <p className="text-[10px] font-bold text-white/30 uppercase leading-relaxed">
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
                className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/5 text-xs font-bold outline-none focus:border-primary transition-all"
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
              className="w-full px-6 py-5 rounded-[2rem] bg-white/5 border border-white/5 text-[11px] font-mono outline-none resize-none focus:border-primary transition-all custom-scrollbar"
            />
          </div>
        </div>
      </div>

      <div className="h-px bg-white/5 w-full" />

      {/* Cloud & System Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="space-y-2">
          <h3 className="font-black text-xs uppercase tracking-[0.3em] text-primary">
            Sistema & Backup
          </h3>
          <p className="text-[10px] font-bold text-white/30 uppercase leading-relaxed">
            Sincronização em nuvem e preferências de execução.
          </p>
        </div>
        <div className="lg:col-span-2 space-y-6">
          {isElectronApp && (
            <label
              className={`flex items-center justify-between p-6 rounded-[2rem] border transition-all cursor-pointer ${minimizeToTray ? "bg-primary/5 border-primary" : "bg-white/5 border-white/5 opacity-50"}`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center ${minimizeToTray ? "bg-primary text-white shadow-lg" : "bg-white/10 text-white/30"}`}
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
                className={`w-12 h-6 rounded-full p-1 transition-all ${minimizeToTray ? "bg-primary" : "bg-white/10"}`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-all ${minimizeToTray ? "ml-6" : "ml-0"}`}
                />
              </div>
            </label>
          )}

          <label
            className={`flex items-center justify-between p-6 rounded-[2rem] border transition-all cursor-pointer ${autoBackupEnabled ? "bg-primary/5 border-primary" : "bg-white/5 border-white/5 opacity-50"}`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center ${autoBackupEnabled ? "bg-primary text-white shadow-lg" : "bg-white/10 text-white/30"}`}
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
              className={`w-12 h-6 rounded-full p-1 transition-all ${autoBackupEnabled ? "bg-primary" : "bg-white/10"}`}
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
                className="flex-1 px-5 py-4 rounded-2xl bg-white/5 border border-white/5 text-xs font-bold outline-none focus:border-primary transition-all"
              />
              <button
                onClick={handleSaveSync}
                className="px-8 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-[9px] font-black uppercase tracking-widest transition-all"
              >
                Salvar
              </button>
            </div>
          )}
        </div>
      </div>
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
  const utils = trpc.useUtils();
  const douConfig = trpc.dou.getConfig.useQuery();
  const saveMutation = trpc.dou.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("Monitoramento configurado!");
      utils.dou.getConfig.invalidate();
    },
    onError: (err) => toast.error("Erro ao salvar: " + err.message),
  });

  useEffect(() => {
    if (douConfig.data) {
      setName(douConfig.data.name);
      setInputValue(douConfig.data.name);
      setIntervalMinutes(douConfig.data.intervalMinutes || 120);
      setLastCheck(douConfig.data.lastCheck);
      setLoading(false);
    }
  }, [douConfig.data]);

  const saved = name.length >= 3;

  async function handleSave() {
    const trimmed = inputValue.trim();
    console.log("[Sentinela] Ativando para:", trimmed);
    if (trimmed.length < 5) {
      toast.error("Digite seu nome completo.");
      return;
    }
    const toastId = toast.loading("Salvando configuração...");
    saveMutation.mutate(
      { name: trimmed, intervalMinutes },
      {
        onSuccess: () => {
          console.log("[Sentinela] Salvo com sucesso");
          toast.dismiss(toastId);
          toast.success("Monitoramento configurado!");
        },
        onError: (e) => {
          console.error("[Sentinela] Erro ao salvar:", e);
          toast.dismiss(toastId);
          toast.error("Erro ao salvar: " + e.message);
        },
      },
    );
    setName(trimmed);
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="space-y-2">
          <h3 className="font-black text-xs uppercase tracking-[0.3em] text-primary">
            Configuração de Busca
          </h3>
          <p className="text-[10px] font-bold text-white/30 uppercase leading-relaxed">
            O SOE monitora automaticamente as publicações da União em busca de
            citações ao seu nome.
          </p>
        </div>
        <div className="lg:col-span-2 space-y-8">
          <div className="p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
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
                  className="flex-1 px-6 h-14 rounded-2xl bg-white/5 border border-white/5 text-sm font-bold outline-none focus:border-primary transition-all shadow-inner"
                />
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="px-10 h-14 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-wait"
                >
                  {saveMutation.isPending ? "Salvando..." : "Ativar"}
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
                {INTERVAL_PRESETS.map((p: any) => (
                  <button
                    key={p.value}
                    onClick={() => {
                      setIntervalMinutes(p.value);
                      if (saved)
                        saveMutation.mutate({ intervalMinutes: p.value });
                    }}
                    className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${intervalMinutes === p.value ? "bg-primary/10 border-primary text-white" : "bg-transparent border-white/5 text-white/20 hover:bg-white/5"}`}
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
          <div className="h-px bg-white/5 w-full" />

          {/* Real-time Status Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="space-y-2">
              <h3 className="font-black text-xs uppercase tracking-[0.3em] text-primary">
                Status em Tempo Real
              </h3>
              <p className="text-[10px] font-bold text-white/30 uppercase leading-relaxed">
                Resultado da última varredura automática realizada pelo sistema.
              </p>
            </div>
            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 space-y-2">
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
                  className={`p-8 rounded-[2rem] border transition-all flex flex-col justify-center ${lastResult?.newCount ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/[0.02] border-white/5"}`}
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
                        : douConfig.data?.results?.length || "---"}
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
                  className="w-16 h-16 rounded-[2rem] bg-white/5 hover:bg-white/10 border border-white/5 text-white/20 hover:text-white transition-all flex items-center justify-center"
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
  const [, navigate] = useLocation();
  const hash = window.location.hash.replace("#", "") as Tab;
  const [tab, setTab] = useState<Tab>(
    ["dou", "settings", "history", "revisions"].includes(hash)
      ? (hash as Tab)
      : "dou",
  );
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { user, logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const updateSettings = trpc.v10.updateV10Settings.useMutation({
    onSuccess: () => {
      toast.success("Foto de perfil atualizada!");
      utils.auth.me.invalidate();
      utils.dashboard.getStats.invalidate();
    },
    onError: (e) => toast.error("Falha ao salvar foto: " + e.message),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      toast.error("A imagem deve ter menos de 1MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      updateSettings.mutate({ profileImage: base64String });
    };
    reader.readAsDataURL(file);
  };

  const TABS = [
    {
      id: "dou" as Tab,
      label: "Sentinela",
      icon: FileText,
      desc: "Monitoramento DOU",
    },
    {
      id: "settings" as Tab,
      label: "Sistema",
      icon: Settings,
      desc: "Ajustes e IA",
    },
    {
      id: "history" as Tab,
      label: "Linha do Tempo",
      icon: HistoryIcon,
      desc: "Progresso",
    },
    {
      id: "revisions" as Tab,
      label: "Atividade",
      icon: CheckCircle2,
      desc: "Log de Estudos",
    },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-12 pb-20 px-4 md:px-0">
      {/* Premium Profile Banner */}
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-[3rem] blur-xl opacity-50 group-hover:opacity-75 transition duration-1000"></div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8 bg-secondary/40 backdrop-blur-md border border-white/5 p-10 rounded-[3rem] overflow-hidden">
          <div className="flex items-center gap-8">
            <div
              className="relative group/avatar cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="absolute inset-0 bg-primary blur-3xl opacity-20 group-hover/avatar:opacity-40 transition-opacity animate-pulse" />
              <div
                className="relative w-24 h-24 rounded-[2.5rem] bg-gradient-to-br from-primary to-purple-600 p-[2px] shadow-2xl group-hover/avatar:scale-105 transition-transform duration-500"
                style={{ boxShadow: "0 0 20px rgba(var(--primary-rgb), 0.3)" }}
              >
                <div className="w-full h-full rounded-[2.4rem] overflow-hidden bg-secondary flex items-center justify-center border border-white/10">
                  {stats?.settings?.profileImage ? (
                    <img
                      src={stats.settings.profileImage}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    (user?.name?.[0]?.toUpperCase() ?? (
                      <User className="w-12 h-12" />
                    ))
                  )}
                </div>

                {/* Camera Overlay */}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity rounded-[2.5rem]">
                  <Camera size={24} className="text-white" />
                </div>
              </div>
              <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-background border-4 border-secondary flex items-center justify-center text-[var(--accent-green)] shadow-xl z-10">
                <ShieldCheck size={18} />
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
            </div>
            <div className="space-y-1">
              <h1 className="text-4xl font-black tracking-tighter leading-tight">
                Olá, {user?.name?.split(" ")[0] ?? "Estudante"}
              </h1>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] text-[9px] font-black uppercase tracking-widest border border-[var(--accent-green)]/20">
                  Membro Premium
                </span>
                <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest">
                  ID: {user?.openId?.slice(0, 8) || "SOE-USER"}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex items-center justify-center gap-3 px-8 h-14 rounded-2xl bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-500 border border-white/5 hover:border-rose-500/20 transition-all active:scale-95 font-black text-[10px] uppercase tracking-widest group"
          >
            <LogOut
              size={18}
              className="group-hover:-translate-x-1 transition-transform"
            />
            <span>Encerrar Sessão</span>
          </button>
        </div>
      </div>

      {/* Elegant Tab Navigation */}
      <div className="flex flex-wrap md:flex-nowrap items-center justify-center bg-secondary/20 p-2 rounded-[2.5rem] border border-white/5 backdrop-blur-sm shadow-inner">
        {TABS.map((t: any) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                window.location.hash = t.id;
              }}
              className={`flex-1 flex items-center justify-center gap-3 py-4 px-6 rounded-full transition-all duration-500 ${active ? "bg-primary text-white shadow-xl shadow-primary/20 scale-105" : "text-white/40 hover:text-white hover:bg-white/5"}`}
            >
              <Icon size={18} className={active ? "animate-pulse" : ""} />
              <div className="text-left hidden sm:block">
                <p className="font-black text-[10px] uppercase tracking-widest leading-none">
                  {t.label}
                </p>
                <p
                  className={`text-[8px] mt-1 hidden md:block ${active ? "text-white/60" : "opacity-30"}`}
                >
                  {t.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Content Viewport */}
      <div className="min-h-[600px] animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="bg-gradient-to-b from-white/[0.02] to-transparent rounded-[3rem] p-1 border-t border-white/5">
          {tab === "dou" && <DiarioOficialTab />}
          {tab === "settings" && <SettingsTab />}
          {tab === "history" && <History />}
          {tab === "revisions" && <Revisions />}
        </div>
      </div>
    </div>
  );
}
