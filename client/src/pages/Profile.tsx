import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  History as HistoryIcon, Palette, Settings, User, LogOut, FileText, 
  Search, Bell, ExternalLink, CheckCircle2, Loader2, AlertCircle, 
  Sun, Moon, Check, Minimize2, XCircle, ChevronRight, Cloud, 
  Cpu, Layout, Smartphone, Database, Zap, ShieldCheck
} from "lucide-react";
import History from "./History";
import { useTheme, COLOR_THEMES, ColorTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { douGetConfig, douSaveConfig, douCheckNow, DEFAULT_INTERVAL_MINUTES } from "@/hooks/useDiarioOficial";
import { toast } from "sonner";
import Revisions from "./Revisions";
import { motion, AnimatePresence } from "framer-motion";

type Tab = "history" | "settings" | "dou" | "revisions";

const isElectronApp = typeof window !== "undefined" && !!(window as any).electron?.tray;
const isElectron = typeof window !== "undefined" && !!(window as any).electron?.dou;
const isAndroid  = typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.();

function SettingsTab() {
  const { theme, toggleTheme, colorTheme, setColorTheme } = useTheme();
  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(true);

  useEffect(() => {
    if (isElectronApp) {
      (window as any).electron.tray.getPreference().then((val: boolean) => setMinimizeToTray(val));
    }
  }, []);

  const handleTrayToggle = async (value: boolean) => {
    setMinimizeToTray(value);
    if (isElectronApp) {
      await (window as any).electron.tray.setPreference(value);
      toast.success(value ? "App irá minimizar para a bandeja ao fechar." : "App irá encerrar ao fechar a janela.");
    }
  };

  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<"gemini" | "openai" | "claude">("gemini");
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupDir, setAutoBackupDir] = useState("");

  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const updateSettings = trpc.v10.updateV10Settings.useMutation({
    onSuccess: () => toast.success("Configuração salva com sucesso."),
    onError: (e) => toast.error("Falha ao salvar: " + e.message)
  });

  useEffect(() => {
    if (stats?.settings) {
      const s = stats.settings as any;
      setApiKey(s.aiApiKey || "");
      setProvider(s.aiProvider || "gemini");
      setAutoBackupEnabled(s.autoBackupEnabled || false);
      setAutoBackupDir(s.autoBackupDir || "");
    }
  }, [stats?.settings]);

  const handleSaveAI = () => updateSettings.mutate({ aiApiKey: apiKey, aiProvider: provider });
  const handleSaveSync = () => updateSettings.mutate({ autoBackupEnabled, autoBackupDir });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Visual Mode Selection */}
      <div className="soe-card p-6 space-y-6">
        <div className="flex items-center gap-3">
            <Palette size={18} className="text-[var(--primary)]" />
            <h3 className="font-black text-sm uppercase tracking-widest" style={{ color: "var(--app-fg)" }}>Visual & Interface</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {(["light", "dark"] as const).map(m => (
            <button key={m} onClick={() => { if (theme !== m) toggleTheme(); }}
              className={`group flex items-center gap-4 p-5 rounded-2xl border-2 transition-all ${theme === m ? 'bg-[var(--primary-bg-subtle)] border-[var(--primary)]' : 'bg-white/5 border-white/5 opacity-50'}`}>
              <div className={`p-3 rounded-xl ${theme === m ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-white/10 text-white/40'}`}>
                {m === "light" ? <Sun size={20} /> : <Moon size={20} />}
              </div>
              <div className="text-left">
                <p className={`font-black text-xs uppercase tracking-widest ${theme === m ? 'text-[var(--primary)]' : 'text-white/40'}`}>
                    Modo {m === "light" ? "Claro" : "Escuro"}
                </p>
                <p className="text-[10px] opacity-40">Tema do Sistema</p>
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-4 pt-4 border-t border-white/5">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Esquema de Cores</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(Object.entries(COLOR_THEMES) as [ColorTheme, any][]).map(([key, cfg]) => {
                const color = theme === "dark" ? cfg.dark : cfg.light;
                const selected = colorTheme === key;
                return (
                  <button key={key} onClick={() => setColorTheme(key)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${selected ? 'bg-white/5' : 'bg-transparent border-white/5 opacity-40 hover:opacity-100'}`}
                    style={{ borderColor: selected ? color : undefined }}>
                    <div className="w-4 h-4 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-[10px] font-black uppercase tracking-widest truncate">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
        </div>
      </div>

      {/* AI Configuration */}
      <div className="soe-card p-6 space-y-6">
        <div className="flex items-center gap-3">
            <Cpu size={18} className="text-[var(--primary)]" />
            <h3 className="font-black text-sm uppercase tracking-widest" style={{ color: "var(--app-fg)" }}>Motor de Inteligência Artificial</h3>
        </div>
        
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Provedor Principal</label>
                    <select value={provider} onChange={(e) => setProvider(e.target.value as any)}
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/5 text-xs outline-none">
                        <option value="gemini">Google Gemini</option>
                        <option value="openai">OpenAI (GPT)</option>
                        <option value="claude">Anthropic (Claude)</option>
                    </select>
                </div>
                <div className="flex items-end">
                    <button onClick={handleSaveAI} disabled={updateSettings.isPending}
                            className="w-full py-3 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-[10px] uppercase tracking-widest shadow-lg shadow-[var(--primary-shadow)] transition-all active:scale-95">
                        {updateSettings.isPending ? "Salvando..." : "Confirmar Motor"}
                    </button>
                </div>
            </div>

            <div className="space-y-1.5">
                <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Chaves de API (Rotação Automática)</label>
                    {apiKey.split(/[,\s;]+/).filter(Boolean).length > 0 && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent-green)]">
                        {apiKey.split(/[,\s;]+/).filter(Boolean).length} Ativas
                      </span>
                    )}
                </div>
                <textarea value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                          placeholder={`Uma chave por linha para o ${provider}...`}
                          rows={3} className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/5 text-[11px] font-mono outline-none resize-none focus:border-[var(--primary-border)] transition-all" />
            </div>
        </div>
      </div>

      {/* Cloud Sync */}
      <div className="soe-card p-6 space-y-6">
        <div className="flex items-center gap-3">
            <Cloud size={18} className="text-[var(--primary)]" />
            <h3 className="font-black text-sm uppercase tracking-widest" style={{ color: "var(--app-fg)" }}>Sincronização Invisível</h3>
        </div>
        
        <div className="space-y-4">
            <p className="text-xs opacity-50 leading-relaxed">
                Espelhamento automático do banco de dados em pastas do Google Drive ou Dropbox Desktop.
            </p>
            
            <label className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${autoBackupEnabled ? 'bg-white/5 border-[var(--primary-border)]' : 'bg-transparent border-white/5 opacity-50'}`}>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${autoBackupEnabled ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-white/10 text-white/30'}`}>
                        <ShieldCheck size={16} />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest">Ativar Espelhamento Real-time</span>
                </div>
                <input type="checkbox" checked={autoBackupEnabled} onChange={(e) => setAutoBackupEnabled(e.target.checked)} className="hidden" />
                <div className={`w-10 h-5 rounded-full p-1 transition-all ${autoBackupEnabled ? 'bg-[var(--primary)]' : 'bg-white/10'}`}>
                    <div className={`w-3 h-3 rounded-full bg-white transition-all ${autoBackupEnabled ? 'ml-5' : 'ml-0'}`} />
                </div>
            </label>

            {autoBackupEnabled && (
                <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Caminho da Pasta Nuvem</label>
                        <div className="flex gap-2">
                            <input type="text" value={autoBackupDir} onChange={(e) => setAutoBackupDir(e.target.value)}
                                   placeholder="Ex: C:\Users\SeuNome\Google Drive\SOE_Sync"
                                   className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/5 text-xs outline-none focus:border-[var(--primary-border)]" />
                            <button onClick={handleSaveSync} className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] font-black uppercase tracking-widest transition-all">
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* OS Integration */}
      {isElectronApp && (
        <div className="soe-card p-6 space-y-6">
            <div className="flex items-center gap-3">
                <Layout size={18} className="text-[var(--primary)]" />
                <h3 className="font-black text-sm uppercase tracking-widest" style={{ color: "var(--app-fg)" }}>Sistema Operacional</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => handleTrayToggle(true)}
                    className={`flex flex-col items-start gap-4 p-5 rounded-2xl border-2 transition-all text-left ${minimizeToTray ? 'bg-white/5 border-[var(--primary)]' : 'bg-transparent border-white/5 opacity-50'}`}>
                    <Minimize2 size={24} className={minimizeToTray ? 'text-[var(--primary)]' : 'text-white/20'} />
                    <div>
                        <p className="font-black text-xs uppercase tracking-widest">Minimizar Tray</p>
                        <p className="text-[10px] opacity-40">Mantém em background</p>
                    </div>
                </button>
                <button onClick={() => handleTrayToggle(false)}
                    className={`flex flex-col items-start gap-4 p-5 rounded-2xl border-2 transition-all text-left ${!minimizeToTray ? 'bg-white/5 border-[var(--primary)]' : 'bg-transparent border-white/5 opacity-50'}`}>
                    <XCircle size={24} className={!minimizeToTray ? 'text-[var(--primary)]' : 'text-white/20'} />
                    <div>
                        <p className="font-black text-xs uppercase tracking-widest">Encerrar Janela</p>
                        <p className="text-[10px] opacity-40">Fecha o app no X</p>
                    </div>
                </button>
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
  const [lastResult, setLastResult] = useState<{ total: number; newCount: number; searchURL: string } | null>(null);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    douGetConfig().then(cfg => {
      setName(cfg.name); setInputValue(cfg.name);
      setIntervalMinutes(cfg.intervalMinutes || 60); setLastCheck(cfg.lastCheck);
      setLoading(false);
    });
  }, []);

  const saved = name.length >= 3;

  async function handleSave() {
    const trimmed = inputValue.trim();
    if (trimmed.length < 5) { toast.error("Digite seu nome completo."); return; }
    await douSaveConfig({ name: trimmed, intervalMinutes });
    setName(trimmed); toast.success("Monitoramento configurado!");
  }

  async function handleCheckNow() {
    if (!saved) return;
    setChecking(true);
    try {
      const result = await douCheckNow();
      setLastResult(result); setLastCheck(new Date().toISOString());
      if (result.newCount > 0) toast.success(`${result.newCount} novas publicações!`);
      else toast.info("Nenhuma novidade no DOU.");
    } catch { toast.error("Erro na consulta."); }
    finally { setChecking(false); }
  }

  if (loading) return <div className="p-12 text-center opacity-30 font-black uppercase text-[10px] tracking-widest">Verificando status de monitoramento...</div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="soe-card p-8 space-y-8">
          <div className="flex items-center gap-4">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <FileText className="w-8 h-8 text-[var(--primary)]" />
              </div>
              <div className="flex-1">
                  <h3 className="text-xl font-black" style={{ color: "var(--app-fg)" }}>Sentinela do Diário Oficial</h3>
                  <p className="text-xs opacity-50">O SOE monitora publicações da União em busca do seu nome.</p>
              </div>
              {saved && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20">
                      <Zap size={14} className="animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Monitorando</span>
                  </div>
              )}
          </div>

          <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Nome Completo para Busca</label>
              <div className="flex gap-3">
                  <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)}
                         placeholder="Ex: João Da Silva Pereira"
                         className="flex-1 px-5 py-4 rounded-2xl bg-white/5 border border-white/5 text-sm font-bold outline-none focus:border-[var(--primary-border)] transition-all" />
                  <button onClick={handleSave} className="px-8 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)] active:scale-95 transition-all">
                      Salvar
                  </button>
              </div>
          </div>

          <div className="space-y-4">
              <div className="flex items-center justify-between ml-1">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Frequência de Verificação</label>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--primary)]">{intervalMinutes < 60 ? `${intervalMinutes}m` : `${intervalMinutes/60}h`}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                  {INTERVAL_PRESETS.map(p => (
                      <button key={p.value} onClick={() => { setIntervalMinutes(p.value); if(saved) douSaveConfig({intervalMinutes: p.value}); }}
                              className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${intervalMinutes === p.value ? 'bg-white/10 border-[var(--primary-border)] text-white' : 'bg-transparent border-white/5 text-white/20 hover:bg-white/5'}`}>
                          {p.label}
                      </button>
                  ))}
              </div>
          </div>
      </div>

      {saved && (
          <div className="soe-card p-8 space-y-6">
              <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <HistoryIcon size={18} className="text-[var(--primary)]" />
                      <h3 className="font-black text-sm uppercase tracking-widest" style={{ color: "var(--app-fg)" }}>Último Checkpoint</h3>
                  </div>
                  {lastCheck && <span className="text-[10px] font-black uppercase tracking-widest opacity-30">{new Date(lastCheck).toLocaleString()}</span>}
              </div>

              {lastResult && (
                  <div className={`p-6 rounded-2xl border-2 flex items-center justify-between ${lastResult.newCount > 0 ? 'bg-[var(--accent-green)]/10 border-[var(--accent-green)]/20' : 'bg-white/5 border-white/5'}`}>
                      <div>
                          <p className="text-xs font-black uppercase tracking-widest opacity-40">Status do Diário</p>
                          <p className="text-lg font-black" style={{ color: "var(--app-fg)" }}>
                            {lastResult.total === 0 ? "Sem registros" : `${lastResult.total} ocorrências encontradas`}
                          </p>
                      </div>
                      {lastResult.newCount > 0 && <span className="px-4 py-2 rounded-xl bg-[var(--accent-green)] text-white font-black text-[10px] uppercase tracking-widest animate-pulse">Novo!</span>}
                  </div>
              )}

              <div className="flex gap-3">
                  <button onClick={handleCheckNow} disabled={checking}
                          className="flex-1 py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)] flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50">
                      {checking ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                      {checking ? "Varrendo Diários..." : "Verificar Agora"}
                  </button>
                  <a href={`https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(`"${name}"`)}&s=todos&exactDate=all&sortType=0`}
                     target="_blank" rel="noopener noreferrer"
                     className="px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-white/40 hover:text-white transition-all flex items-center justify-center">
                      <ExternalLink size={18} />
                  </a>
              </div>
          </div>
      )}
    </div>
  );
}

export default function Profile() {
  const [, navigate] = useLocation();
  const hash = window.location.hash.replace("#", "") as Tab;
  const [tab, setTab] = useState<Tab>(["dou", "settings", "history", "revisions"].includes(hash) ? hash as Tab : "dou");
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { logout } = useAuth();

  const TABS = [
    { id: "dou" as Tab,        label: "Monitor DOU", icon: FileText },
    { id: "settings" as Tab,   label: "Ajustes",    icon: Settings },
    { id: "history" as Tab,    label: "Histórico",   icon: HistoryIcon },
    { id: "revisions" as Tab,  label: "Atividade",   icon: CheckCircle2 },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10 pb-12">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="relative group">
              <div className="absolute inset-0 bg-[var(--primary)] blur-2xl opacity-20 group-hover:opacity-40 transition-opacity" />
              <div className="relative w-20 h-20 rounded-[2.5rem] bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center font-black text-3xl shadow-2xl shadow-[var(--primary-shadow)]">
                {(stats as any)?.userName?.[0]?.toUpperCase() ?? <User className="w-8 h-8" />}
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[var(--accent-green)] border-4 border-[var(--app-bg)] flex items-center justify-center text-white">
                  <ShieldCheck size={12} />
              </div>
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter" style={{ color: "var(--app-fg)" }}>Perfil</h1>
            <p className="text-sm font-medium opacity-50 uppercase tracking-[0.2em] mt-1">Configurações de Identidade & Sistema</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
             <button onClick={logout} className="p-4 rounded-2xl bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/20 transition-all active:scale-95">
                <LogOut size={20} />
             </button>
        </div>
      </div>

      {/* Modern Navigation */}
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-[2rem] bg-white/[0.02] border border-white/5 w-fit">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-3 px-6 py-3.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.1em] transition-all ${active ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xl shadow-[var(--primary-shadow)]' : 'text-white/30 hover:text-white hover:bg-white/5'}`}>
              <Icon size={14} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Dynamic Content */}
      <div className="min-h-[500px]">
        {tab === "dou" && <DiarioOficialTab />}
        {tab === "settings" && <SettingsTab />}
        {tab === "history" && <History />}
        {tab === "revisions" && <Revisions />}
      </div>
    </div>
  );
}
