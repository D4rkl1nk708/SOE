import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { initTecBrowserListener } from "@/lib/tecBrowser";
import {
  Globe,
  Settings,
  X,
  ExternalLink,
  Wifi,
  WifiOff,
  RefreshCw,
  Zap,
  RotateCcw,
} from "lucide-react";

export function MobileTecBrowser({ pushToken }: { pushToken: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => {
    try {
      const saved = localStorage.getItem("soe_tec_server_url");
      if (saved && saved.trim()) return saved.trim().replace(/\/$/, "");
    } catch {}
    if (Capacitor.isNativePlatform()) {
      return "http://localhost:3000";
    }
    return "";
  });
  const [useDirectMode, setUseDirectMode] = useState(() => {
    try {
      return localStorage.getItem("soe_tec_direct_mode") === "true";
    } catch {
      return false;
    }
  });
  const [showConfig, setShowConfig] = useState(false);
  const [tempUrl, setTempUrl] = useState(serverUrl);
  const [connStatus, setConnStatus] = useState<
    "checking" | "connected" | "error"
  >("checking");
  const [iframeKey, setIframeKey] = useState(0);

  const effectiveBase = serverUrl.trim().replace(/\/$/, "");

  useEffect(() => {
    const handler = () => setIsOpen(true);
    document.addEventListener("soe-open-mobile-browser", handler);
    return () =>
      document.removeEventListener("soe-open-mobile-browser", handler);
  }, []);

  // Health check para validar se o servidor proxy na porta 3000 está acessível
  useEffect(() => {
    if (!isOpen || useDirectMode) return;
    let cancelled = false;

    const checkServer = async () => {
      setConnStatus("checking");
      const healthUrl = effectiveBase
        ? `${effectiveBase}/api/tec-browser/health`
        : `/api/tec-browser/health`;

      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3500);
        const res = await fetch(healthUrl, { signal: ctrl.signal });
        clearTimeout(tid);
        if (!cancelled) {
          setConnStatus(res.ok ? "connected" : "error");
        }
      } catch {
        if (!cancelled) {
          setConnStatus("error");
        }
      }
    };

    checkServer();
    return () => {
      cancelled = true;
    };
  }, [isOpen, effectiveBase, iframeKey, useDirectMode]);

  // Os eventos do TEC (acertos, erros, caderno, tempo) são gerenciados centralmente por initTecBrowserListener (tecBrowser.ts)

  const forceSync = () => {
    const iframe = document.querySelector(
      'iframe[title="TEC Browser Mobile"]',
    ) as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(
        { type: "SOE_FORCE_SCRAPE", _soe_internal: true },
        "*",
      );
      toast.info("Sincronizando...", { duration: 1000 });
    }
  };

  const handleSaveConfig = () => {
    const clean = tempUrl.trim().replace(/\/$/, "");
    try {
      localStorage.setItem("soe_tec_server_url", clean);
      localStorage.setItem("soe_tec_direct_mode", "false");
    } catch {}
    setServerUrl(clean);
    setUseDirectMode(false);
    setShowConfig(false);
    setIframeKey((k) => k + 1);
    toast.success("Conectando ao servidor SOE...");
  };

  const handleSwitchMode = (direct: boolean) => {
    setUseDirectMode(direct);
    try {
      localStorage.setItem("soe_tec_direct_mode", direct ? "true" : "false");
    } catch {}
    setShowConfig(false);
    setIframeKey((k) => k + 1);
    toast.info(
      direct
        ? "Acessando TEC Concursos diretamente!"
        : "Modo Integrado com SOE ativado!",
    );
  };

  if (!isOpen) return null;

  const proxySrc = useDirectMode
    ? "https://www.tecconcursos.com.br/"
    : effectiveBase
      ? `${effectiveBase}/api/tec-browser/proxy?url=${encodeURIComponent("https://www.tecconcursos.com.br/")}`
      : `/api/tec-browser/proxy?url=${encodeURIComponent("https://www.tecconcursos.com.br/")}`;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in slide-in-from-bottom duration-500">
      {/* Barra superior de controle */}
      <div className="h-16 shrink-0 bg-slate-900 border-b border-white/10 flex items-center justify-between px-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center shrink-0">
            <Zap size={16} className="text-black" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-black uppercase opacity-60">
                Navegador TEC
              </p>
              {useDirectMode ? (
                <span className="px-1.5 py-0.2 rounded text-[8px] bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                  Web Direto
                </span>
              ) : (
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    connStatus === "connected"
                      ? "bg-emerald-400 animate-pulse"
                      : connStatus === "checking"
                        ? "bg-amber-400 animate-pulse"
                        : "bg-red-500"
                  }`}
                  title={
                    connStatus === "connected"
                      ? "Servidor SOE conectado"
                      : connStatus === "checking"
                        ? "Verificando conexão..."
                        : "Servidor SOE não encontrado"
                  }
                />
              )}
            </div>
            <p className="text-xs font-bold text-white">TEC Concursos</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => {
              setTempUrl(serverUrl);
              setShowConfig(!showConfig);
            }}
            className="p-2 sm:p-2.5 bg-white/5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1 text-[11px]"
            title="Opções de Conexão"
          >
            <Settings size={14} />
          </button>
          {!useDirectMode && (
            <button
              onClick={forceSync}
              className="p-2 sm:p-2.5 bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--primary)] hover:text-black transition-all flex items-center gap-1 text-white"
            >
              <RotateCcw size={12} /> Sincronizar
            </button>
          )}
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 sm:p-2.5 px-3 sm:px-4 bg-[var(--primary)] text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-[var(--primary-shadow)] active:scale-95 transition-all"
          >
            Sair
          </button>
        </div>
      </div>

      {/* Banner de aviso se o servidor local estiver desconectado e não estiver no modo direto */}
      {connStatus === "error" && !useDirectMode && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <WifiOff size={14} className="text-amber-400 shrink-0" />
            <span>
              Servidor SOE não respondeu em{" "}
              <b>{effectiveBase || "localhost"}</b>.
            </span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => {
                setTempUrl("http://192.168.0.178:3000");
                try {
                  localStorage.setItem(
                    "soe_tec_server_url",
                    "http://192.168.0.178:3000",
                  );
                } catch {}
                setServerUrl("http://192.168.0.178:3000");
                setIframeKey((k) => k + 1);
                toast.success("Tentando IP do PC (192.168.0.178:3000)...");
              }}
              className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded text-[11px] font-bold text-amber-200"
            >
              Usar IP do PC
            </button>
            <button
              onClick={() => handleSwitchMode(true)}
              className="px-2 py-0.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 rounded text-[11px] font-bold text-blue-200"
            >
              Abrir Direto (Web)
            </button>
          </div>
        </div>
      )}

      {/* Painel de Configuração do Servidor */}
      {showConfig && (
        <div className="bg-slate-900/95 border-b border-white/10 p-4 text-white text-xs space-y-3 animate-in slide-in-from-top duration-200">
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-2">
              <Settings size={14} className="text-[var(--primary)]" />
              Opções de Acesso ao TEC Concursos
            </span>
            <button
              onClick={() => setShowConfig(false)}
              className="text-white/40 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex gap-2 p-1 bg-black/40 rounded-xl border border-white/10">
            <button
              onClick={() => handleSwitchMode(false)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !useDirectMode
                  ? "bg-[var(--primary)] text-black shadow"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Modo Integrado (Proxy SOE)
            </button>
            <button
              onClick={() => handleSwitchMode(true)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                useDirectMode
                  ? "bg-blue-500 text-white shadow"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Modo Direto (tecconcursos.com.br)
            </button>
          </div>

          {!useDirectMode ? (
            <>
              <p className="text-white/60 text-[11px] leading-relaxed">
                No <b>Modo Integrado</b>, as questões e erros são rastreados
                automaticamente via servidor SOE:
                <br />• <b>Wi-Fi (no mesmo roteador):</b> use o IP do seu PC{" "}
                <code>http://192.168.0.178:3000</code> (com{" "}
                <code>npm run dev</code> ativo)
                <br />• <b>USB (com cabo):</b> execute no PC{" "}
                <code>adb reverse tcp:3000 tcp:3000</code> e use{" "}
                <code>http://localhost:3000</code>
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => setTempUrl("http://192.168.0.178:3000")}
                  className="px-2.5 py-1 bg-[var(--primary)]/20 border border-[var(--primary)]/40 hover:bg-[var(--primary)]/30 rounded text-[10px] font-mono text-[var(--primary)] font-bold"
                >
                  192.168.0.178:3000 (Seu PC Wi-Fi)
                </button>
                <button
                  onClick={() => setTempUrl("http://localhost:3000")}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-mono"
                >
                  localhost:3000 (Cabo USB)
                </button>
                <button
                  onClick={() => setTempUrl("http://10.0.2.2:3000")}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-mono"
                >
                  10.0.2.2:3000 (Emulador)
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                  placeholder="http://192.168.0.178:3000"
                  className="flex-1 bg-black/50 border border-white/20 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[var(--primary)]"
                />
                <button
                  onClick={handleSaveConfig}
                  className="px-4 py-2 bg-[var(--primary)] text-black font-bold rounded-lg hover:opacity-90 active:scale-95 transition-all text-xs"
                >
                  Salvar
                </button>
              </div>
            </>
          ) : (
            <p className="text-white/60 text-[11px] leading-relaxed">
              O <b>Modo Direto</b> carrega o site oficial do TEC Concursos
              diretamente pela internet (sem precisar do PC ligado). Ideal para
              estudar na rua ou quando o servidor do SOE estiver offline.
            </p>
          )}
        </div>
      )}

      {/* Frame Principal do TEC Concursos */}
      <div className="flex-1 bg-white relative">
        <iframe
          key={iframeKey}
          name="TEC_MAIN_FRAME"
          src={proxySrc}
          className="w-full h-full border-none"
          title="TEC Browser Mobile"
          allow="clipboard-write; fullscreen"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
