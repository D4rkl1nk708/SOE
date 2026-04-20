import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { History as HistoryIcon, Palette, User, LogOut, FileText, Search, Bell, ExternalLink, CheckCircle2, Loader2, AlertCircle, Sun, Moon, Check, Minimize2, XCircle } from "lucide-react";
import History from "./History";
import { useTheme, COLOR_THEMES, ColorTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { douGetConfig, douSaveConfig, douCheckNow, DEFAULT_INTERVAL_MINUTES, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES } from "@/hooks/useDiarioOficial";
import { toast } from "sonner";

type Tab = "history" | "appearance" | "dou";

function SettingsTab() {
  const { theme, toggleTheme, colorTheme, setColorTheme } = useTheme();
  const isElectronApp = typeof window !== "undefined" && !!(window as any).electron?.tray;
  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(true);

  useEffect(() => {
    if (isElectronApp) {
      (window as any).electron.tray.getPreference().then((val: boolean) => setMinimizeToTray(val));
    }
  }, [isElectronApp]);

  const handleTrayToggle = async (value: boolean) => {
    setMinimizeToTray(value);
    if (isElectronApp) {
      await (window as any).electron.tray.setPreference(value);
      toast.success(value ? "App irá minimizar para a bandeja ao fechar." : "App irá encerrar ao fechar a janela.");
    }
  };

  // ── Configurações Gerais ──
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<"gemini" | "openai" | "claude">("gemini");
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupDir, setAutoBackupDir] = useState("");

  const { data: currentUser } = trpc.user.profile.useQuery();
  const updateSettings = trpc.v10.updateV10Settings.useMutation({
    onSuccess: () => toast.success("Configuração salva com sucesso."),
    onError: (e) => toast.error("Falha ao salvar configuração: " + e.message)
  });

  useEffect(() => {
    if (currentUser?.settings) {
      setApiKey(currentUser.settings.aiApiKey || "");
      setProvider(currentUser.settings.aiProvider || "gemini");
      setAutoBackupEnabled(currentUser.settings.autoBackupEnabled || false);
      setAutoBackupDir(currentUser.settings.autoBackupDir || "");
    }
  }, [currentUser]);

  const handleSaveAI = () => {
    updateSettings.mutate({ aiApiKey: apiKey, aiProvider: provider });
  };

  const handleSaveSync = () => {
    updateSettings.mutate({ autoBackupEnabled, autoBackupDir });
  };

  return (
    <div className="space-y-6 max-w-xl">
      {/* Cloud Sync Config */}
      <div className="rounded-2xl p-5 space-y-4" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg, var(--app-bg))" }}>
        <h3 className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Sincronização Nuvem Invisível (Google Drive / Dropbox)</h3>
        <p className="text-xs" style={{ color: "var(--muted-text)" }}>Se você usa o Google Drive/Dropbox para Desktop, cole o caminho da pasta raiz deles aqui. Toda vez que seu SOE salvar no Banco de Dados, ele espelhará um arquivo <code>soe_backup_sync.json</code> lá dentro de forma invisível.</p>
        
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={autoBackupEnabled} onChange={(e) => setAutoBackupEnabled(e.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
            <span className="text-sm font-semibold" style={{ color: "var(--app-fg)" }}>Ativar Auto-Backup Nuvem</span>
          </label>
          
          <div className="flex gap-3">
            <input 
              type="text" 
              value={autoBackupDir}
              onChange={(e) => setAutoBackupDir(e.target.value)}
              placeholder="Ex: C:\Users\SeuNome\Meu Drive\SOE_Database"
              disabled={!autoBackupEnabled}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium outline-none transition-all"
              style={{ background: "var(--stat-bg)", border: "1.5px solid var(--card-border)", color: "var(--app-fg)", opacity: autoBackupEnabled ? 1 : 0.5 }}
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSaveSync}
              disabled={updateSettings.isPending}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)", opacity: updateSettings.isPending ? 0.6 : 1 }}>
              Salvar Diretório
            </button>
          </div>
        </div>
      </div>

      {/* IA Config */}
      <div className="rounded-2xl p-5 space-y-4" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg, var(--app-bg))" }}>
        <h3 className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Inteligência Artificial do SOE</h3>
        <p className="text-xs" style={{ color: "var(--muted-text)" }}>Configure sua chave da OpenAI ou Google Gemini para liberar o Mentor Socrático no TEC Concursos e a Genética de Mnemônicos.</p>
        
        <div className="space-y-3">
          <div className="flex gap-3">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as any)}
              className="px-3 py-2.5 rounded-xl text-sm font-medium outline-none transition-all w-[140px]"
              style={{ background: "var(--stat-bg)", border: "1.5px solid var(--card-border)", color: "var(--app-fg)" }}>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI (ChatGPT)</option>
              <option value="claude">Anthropic (Claude)</option>
            </select>
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Sua API Key do ${provider}`}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium outline-none transition-all"
              style={{ background: "var(--stat-bg)", border: "1.5px solid var(--card-border)", color: "var(--app-fg)" }}
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSaveAI}
              disabled={updateSettings.isPending}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)", opacity: updateSettings.isPending ? 0.6 : 1 }}>
              {updateSettings.isPending ? "Salvando..." : "Salvar Chave"}
            </button>
          </div>
        </div>
      </div>
      {/* Dark/Light mode */}
      <div className="rounded-2xl p-5 space-y-3" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg, var(--app-bg))" }}>
        <h3 className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Modo de exibição</h3>
        <div className="flex gap-3">
          {(["light", "dark"] as const).map(m => (
            <button key={m} onClick={() => { if (theme !== m) toggleTheme(); }}
              className="flex-1 py-3 rounded-xl flex flex-col items-center gap-2 transition-all font-medium text-sm"
              style={{
                border: `2px solid ${theme === m ? "var(--primary)" : "var(--card-border)"}`,
                background: theme === m ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--stat-bg)",
                color: theme === m ? "var(--primary)" : "var(--muted-text)",
              }}>
              {m === "light" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              <span>{m === "light" ? "Claro" : "Escuro"}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Color accent */}
      <div className="rounded-2xl p-5 space-y-4" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg, var(--app-bg))" }}>
        <h3 className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Tema</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.entries(COLOR_THEMES) as [ColorTheme, any][]).map(([key, cfg]) => {
            const color = theme === "dark" ? cfg.dark : cfg.light;
            const selected = colorTheme === key;
            return (
              <button key={key} onClick={() => setColorTheme(key)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                style={{
                  border: `2px solid ${selected ? color : "var(--card-border)"}`,
                  background: selected ? `color-mix(in srgb, ${color} 12%, transparent)` : "var(--stat-bg)",
                }}>
                <div className="w-5 h-5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-sm font-medium" style={{ color: selected ? color : "var(--muted-text)" }}>{cfg.label}</span>
                {selected && <span className="ml-auto text-xs" style={{ color }}><Check className="w-3 h-3" /></span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tray preference (Desktop only) */}
      {isElectronApp && (
        <div className="rounded-2xl p-5 space-y-4" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg, var(--app-bg))" }}>
          <div>
            <h3 className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Comportamento ao fechar (Desktop)</h3>
            <p className="text-xs mt-1" style={{ color: "var(--muted-text)" }}>O que acontece quando você clica no X da janela?</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleTrayToggle(true)}
              className="flex-1 py-3 px-4 rounded-xl flex flex-col items-start gap-1.5 transition-all text-left"
              style={{
                border: `2px solid ${minimizeToTray ? "var(--primary)" : "var(--card-border)"}`,
                background: minimizeToTray ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--stat-bg)",
              }}>
              <Minimize2 className="w-5 h-5" style={{ color: minimizeToTray ? "var(--primary)" : "var(--muted-text)" }} />
              <span className="text-sm font-semibold" style={{ color: minimizeToTray ? "var(--primary)" : "var(--app-fg)" }}>Minimizar para bandeja</span>
              <span className="text-[11px]" style={{ color: "var(--muted-text)" }}>App continua rodando em segundo plano</span>
              {minimizeToTray && <span className="text-xs font-bold" style={{ color: "var(--primary)" }}>Ativo</span>}
            </button>
            <button
              onClick={() => handleTrayToggle(false)}
              className="flex-1 py-3 px-4 rounded-xl flex flex-col items-start gap-1.5 transition-all text-left"
              style={{
                border: `2px solid ${!minimizeToTray ? "var(--primary)" : "var(--card-border)"}`,
                background: !minimizeToTray ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--stat-bg)",
              }}>
              <XCircle className="w-5 h-5" style={{ color: !minimizeToTray ? "var(--primary)" : "var(--muted-text)" }} />
              <span className="text-sm font-semibold" style={{ color: !minimizeToTray ? "var(--primary)" : "var(--app-fg)" }}>Fechar o app</span>
              <span className="text-[11px]" style={{ color: "var(--muted-text)" }}>Encerra completamente ao clicar X</span>
              {!minimizeToTray && <span className="text-xs font-bold" style={{ color: "var(--primary)" }}>Ativo</span>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Aba Diário Oficial ──────────────────────────────────────────────────────
const isElectron = typeof window !== "undefined" && !!(window as any).electron?.dou;
const isAndroid  = typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.();

const INTERVAL_PRESETS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hora", value: 60 },
  { label: "2 horas", value: 120 },
  { label: "4 horas", value: 240 },
  { label: "8 horas", value: 480 },
];

function toTitleCase(str: string) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function DiarioOficialTab() {
  const [name, setName] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(DEFAULT_INTERVAL_MINUTES);
  const [checking, setChecking] = useState(false);
  const [lastResult, setLastResult] = useState<{ total: number; newCount: number; searchURL: string } | null>(null);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    douGetConfig().then(cfg => {
      setName(cfg.name);
      setInputValue(cfg.name);
      setIntervalMinutes(cfg.intervalMinutes || DEFAULT_INTERVAL_MINUTES);
      setLastCheck(cfg.lastCheck);
      setLoading(false);
    });
  }, []);

  const saved = name.length >= 3;

  async function handleSave() {
    const trimmed = toTitleCase(inputValue.trim());
    if (trimmed.length < 5) { toast.error("Digite seu nome completo."); return; }
    await douSaveConfig({ name: trimmed, intervalMinutes });
    setName(trimmed);
    toast.success(isElectron
      ? `Nome salvo! O app monitora o DOU a cada ${intervalMinutes < 60 ? intervalMinutes + " min" : intervalMinutes/60 + "h"}, mesmo com a janela fechada.`
      : `Nome salvo! Monitorando a cada ${intervalMinutes < 60 ? intervalMinutes + " min" : intervalMinutes/60 + "h"}.`
    );
  }

  async function handleIntervalChange(value: number) {
    setIntervalMinutes(value);
    if (saved) await douSaveConfig({ intervalMinutes: value });
  }

  async function handleCheckNow() {
    if (!saved) return;
    setChecking(true);
    try {
      const result = await douCheckNow();
      setLastResult(result);
      setLastCheck(new Date().toISOString());
      if (result.newCount > 0) toast.success(`${result.newCount} nova(s) publicação(ões) encontrada(s)!`);
      else if (result.total > 0) toast.info(`${result.total} resultado(s) encontrado(s), nenhum novo.`);
      else toast.info("Nenhum resultado encontrado no DOU com esse nome.");
    } catch { toast.error("Erro ao consultar o Diário Oficial. Verifique sua conexão."); }
    finally { setChecking(false); }
  }

  const formattedLastCheck = lastCheck
    ? new Date(lastCheck).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  if (loading) return <div className="flex items-center justify-center p-12" style={{ color: "var(--muted-text)" }}>Carregando...</div>;

  return (
    <div className="space-y-5 max-w-xl">

      {/* Card nome */}
      <div className="rounded-2xl p-5 space-y-4" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg, var(--app-bg))" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)" }}>
            <FileText className="w-5 h-5" style={{ color: "var(--primary)" }} />
          </div>
          <div>
            <h3 className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Monitoramento do Diário Oficial</h3>
            <p className="text-xs" style={{ color: "var(--muted-text)" }}>
              {isElectron ? "Ativo em background mesmo com o app fechado (bandeja do sistema)" : isAndroid ? "Notifica em background pelo Android" : "Ativo enquanto o app estiver aberto"}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold" style={{ color: "var(--muted-text)" }}>
            Seu nome completo (como consta em documentos oficiais)
          </label>
          <div className="flex gap-2">
            <input type="text" value={inputValue}
              onChange={e => setInputValue(toTitleCase(e.target.value))}
              placeholder="Ex: João Da Silva Pereira"
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium outline-none transition-all"
              style={{ background: "var(--stat-bg)", border: "1.5px solid var(--card-border)", color: "var(--app-fg)" }}
              onFocus={e => (e.target.style.borderColor = "var(--primary)")}
              onBlur={e => (e.target.style.borderColor = "var(--card-border)")} />
            <button onClick={handleSave}
              className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              Salvar
            </button>
          </div>
        </div>

        {saved && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "var(--primary)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--primary)" }}>
              Monitorando: <strong>{name}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Card intervalo */}
      <div className="rounded-2xl p-5 space-y-4" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg, var(--app-bg))" }}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Frequência de verificação</h3>
          <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}>
            {intervalMinutes < 60 ? `${intervalMinutes} min` : `${intervalMinutes / 60}h`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {INTERVAL_PRESETS.map(p => (
            <button key={p.value} onClick={() => handleIntervalChange(p.value)}
              className="px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
              style={{
                background: intervalMinutes === p.value ? "var(--primary)" : "var(--stat-bg)",
                color: intervalMinutes === p.value ? "var(--primary-foreground)" : "var(--muted-text)",
                border: `1px solid ${intervalMinutes === p.value ? "var(--primary)" : "var(--card-border)"}`,
              }}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-[11px]" style={{ color: "var(--muted-text)" }}>
          {isElectron
            ? "O monitoramento continua mesmo com a janela fechada. O app fica na bandeja do sistema."
            : isAndroid
            ? "Recomendado: 30–60 min para notificações rápidas sem consumir muita bateria."
            : "O app precisa estar aberto para verificar. Recomendado: 2 horas."}
        </p>
      </div>

      {/* Card verificação manual */}
      {saved && (
        <div className="rounded-2xl p-5 space-y-4" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg, var(--app-bg))" }}>
          <h3 className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Verificação manual</h3>
          {formattedLastCheck && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-text)" }}>
              <Bell className="w-3.5 h-3.5" />
              <span>Última verificação: {formattedLastCheck}</span>
            </div>
          )}
          {lastResult && (
            <div className="rounded-xl px-4 py-3 space-y-1" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--app-fg)" }}>
                {lastResult.total === 0 ? "Nenhum resultado encontrado." : `${lastResult.total} resultado(s) encontrado(s) no DOU.`}
              </p>
              {lastResult.newCount > 0 && (
                <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>{lastResult.newCount} novo(s) desde a última verificação!</p>
              )}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleCheckNow} disabled={checking}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-60"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              {checking ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</> : <><Search className="w-4 h-4" /> Verificar agora</>}
            </button>
            <a href={`https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(`"${name}"`)}&s=todos&exactDate=all&sortType=0`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
              style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--muted-text)" }}>
              <ExternalLink className="w-4 h-4" /> Ver no DOU
            </a>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="rounded-2xl p-4 flex gap-3" style={{ background: "color-mix(in srgb, #f59e0b 8%, transparent)", border: "1px solid color-mix(in srgb, #f59e0b 25%, transparent)" }}>
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#f59e0b" }} />
        <p className="text-xs leading-relaxed" style={{ color: "var(--app-fg)" }}>
          {isElectron
            ? "No desktop, o SOE fica rodando na bandeja do sistema e verifica o DOU mesmo com a janela fechada. Você receberá uma notificação do sistema operacional ao detectar publicações novas."
            : isAndroid
            ? "No Android, o monitoramento em background depende das permissões de notificação e bateria. Certifique-se de que o SOE não está na lista de apps com economia de bateria."
            : "No navegador, o monitoramento funciona apenas enquanto o app estiver aberto. Para notificações em background, use a versão desktop ou Android."}
        </p>
      </div>

    </div>
  );
}


export default function Profile() {
  const [, navigate] = useLocation();
  const hash = window.location.hash.replace("#", "") as Tab;
  const [tab, setTab] = useState<Tab>(["history", "appearance", "dou"].includes(hash) ? hash as Tab : "history");
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { logout } = useAuth();
  const [resetConfirm, setResetConfirm] = useState(false);
  const utils = trpc.useUtils();

  const resetAllStats = trpc.topic.resetAllStats.useMutation({
    onSuccess: () => {
      toast.success("Estatísticas zeradas com sucesso.");
      utils.dashboard.getStats.invalidate();
      utils.topic.list.invalidate();
      setResetConfirm(false);
    },
    onError: () => toast.error("Erro ao zerar estatísticas."),
  });

  const TABS = [
    { id: "history" as Tab,    label: "Histórico",      icon: HistoryIcon },
    { id: "appearance" as Tab, label: "Aparência",      icon: Palette },
    { id: "dou" as Tab,        label: "Diário Oficial", icon: FileText },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            {(stats as any)?.userName?.[0]?.toUpperCase() ?? <User className="w-6 h-6" />}
          </div>
          <div>
            <h1 className="text-2xl font-black" style={{ color: "#0071e3" }}>Perfil</h1>
            <p className="text-sm" style={{ color: "var(--muted-text)" }}>Histórico, aparência e sincronização</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={logout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80 active:scale-95"
            style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.2)" }}>
            <LogOut className="w-4 h-4" /> Sair
          </button>
          <span className="text-[10px] font-mono opacity-40" style={{ color: "var(--muted-text)" }}>v3.4.0</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", width: "fit-content" }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: active ? "var(--primary)" : "transparent",
                color: active ? "white" : "var(--muted-text)",
              }}>
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "history" && <History />}
      {tab === "appearance" && <AppearanceTab />}
      {tab === "dou" && <DiarioOficialTab />}

      {/* ── Zona de Perigo ── */}
      <div className="max-w-xl rounded-2xl p-5 space-y-3" style={{ border: "1px solid color-mix(in srgb, #dc2626 30%, transparent)", background: "color-mix(in srgb, #dc2626 4%, transparent)" }}>
        <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: "#dc2626" }}>
          <AlertCircle className="w-4 h-4" /> Zona de Perigo
        </h3>
        <p className="text-sm" style={{ color: "var(--muted-text)" }}>
          Zera todos os contadores de questões, acertos, erros e origens de erro de todos os temas. O tempo de estudo e as revisões <strong>não são afetados</strong>.
        </p>
        {!resetConfirm ? (
          <button onClick={() => setResetConfirm(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{ background: "color-mix(in srgb, #dc2626 12%, transparent)", color: "#dc2626", border: "1px solid color-mix(in srgb, #dc2626 30%, transparent)" }}>
            Zerar todas as estatísticas de questões
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-bold" style={{ color: "#dc2626" }}>Tem certeza? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2">
              <button onClick={() => setResetConfirm(false)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold"
                style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--muted-text)" }}>
                Cancelar
              </button>
              <button onClick={() => resetAllStats.mutate()}
                disabled={resetAllStats.isPending}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: "#dc2626", opacity: resetAllStats.isPending ? 0.6 : 1 }}>
                {resetAllStats.isPending ? "Zerando..." : "Sim, zerar tudo"}
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
