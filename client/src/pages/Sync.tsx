import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import {
  QrCode, Smartphone, Monitor, RefreshCw, Download,
  Upload, CheckCircle2, Wifi, AlertCircle, Clock, Database,
  Camera, ArrowDownToLine, ArrowUpFromLine, X, RotateCw,
  Cloud, HardDrive, ShieldCheck, Share2, Info, ChevronRight,
  Zap, Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";

const isAndroid = Capacitor.isNativePlatform();
const isDesktop = !isAndroid;

// ── QR Code generator (utility remains the same, styling improved) ───────────
async function getQRDataURL(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if ((window as any).QRCode) { buildQR(text, resolve, reject); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    script.onload = () => buildQR(text, resolve, reject);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}
function buildQR(text: string, resolve: (s: string) => void, reject: (e: any) => void) {
  const div = document.createElement("div");
  div.style.display = "none";
  document.body.appendChild(div);
  try {
    new (window as any).QRCode(div, { 
      text, 
      width: 240, 
      height: 240, 
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: (window as any).QRCode.CorrectLevel.M 
    });
    setTimeout(() => {
      const canvas = div.querySelector("canvas");
      const img = div.querySelector("img");
      document.body.removeChild(div);
      resolve(canvas?.toDataURL("image/png") || img?.src || "");
    }, 200);
  } catch (e) { document.body.removeChild(div); reject(e); }
}

// ── Native barcode scanner ───────────────────────────────────────────────────
async function scanQRNative(): Promise<string | null> {
  try {
    const { BarcodeScanner, BarcodeFormat } = await import("@capacitor-mlkit/barcode-scanning");

    try {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
        toast("Instalando módulo de scanner...", { duration: 4000 });
        return null;
      }
    } catch (_) {}

    let granted = false;
    try {
      const { camera: status } = await BarcodeScanner.checkPermissions();
      if (status === "granted" || status === "limited") {
        granted = true;
      } else if (status === "denied") {
        toast.error("Permissão de câmera bloqueada. Habilite nas configurações.");
        return null;
      } else {
        const { camera: newStatus } = await BarcodeScanner.requestPermissions();
        granted = newStatus === "granted" || newStatus === "limited";
      }
    } catch (_) {
      try {
        const { camera } = await BarcodeScanner.requestPermissions();
        granted = camera === "granted" || camera === "limited";
      } catch (e) {}
    }

    if (!granted) {
      toast.error("Câmera não autorizada.");
      return null;
    }

    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.QrCode],
    });

    return barcodes.length > 0 ? barcodes[0].rawValue ?? null : null;
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes("cancel") || msg.includes("Cancel") || msg.includes("dismiss")) return null;
    toast.error("Erro no scanner: " + msg);
    return null;
  }
}

type SyncInfo = { ips: string[]; port: number };
type BackupEntry = { name: string; date: string };

export default function Sync() {
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const [selectedIp, setSelectedIp] = useState<string>("");
  const [qrPullUrl, setQrPullUrl] = useState<string>("");
  const [qrPushUrl, setQrPushUrl] = useState<string>("");
  const [qrLoading, setQrLoading] = useState(false);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [driveUrl, setDriveUrl] = useState("");
  const [linkImportLoading, setLinkImportLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);

  const [waitingReceive, setWaitingReceive] = useState(false);
  const [received, setReceived] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  const fetchSyncInfo = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const res = await fetch("/api/sync/info");
      const data = await res.json();
      setSyncInfo(data);
      if (data.ips && data.ips.length > 0) setSelectedIp((prev) => prev || data.ips[0]);
    } catch {}
  }, []);

  const generateQRs = useCallback(async (info: SyncInfo, ip: string) => {
    if (!info || !ip) return;
    setQrLoading(true);
    try {
      const base = `http://${ip}:${info.port}`;
      const [pull, push] = await Promise.all([
        getQRDataURL(`${base}/api/sync/export`),
        getQRDataURL(`${base}/api/sync/receive`),
      ]);
      setQrPullUrl(pull);
      setQrPushUrl(push);
    } catch { toast.error("Erro ao gerar QR Codes"); }
    finally { setQrLoading(false); }
  }, []);

  const runAutoBackup = useCallback(async () => {
    if (!isDesktop) return;
    try { await fetch("/api/backup/auto", { method: "POST" }); } catch {}
  }, []);

  const fetchBackups = useCallback(async () => {
    if (!isDesktop) return;
    setBackupLoading(true);
    try {
      const res = await fetch("/api/backup/list");
      const data = await res.json();
      setBackups(data.backups || []);
    } catch {} finally { setBackupLoading(false); }
  }, []);

  useEffect(() => {
    fetchSyncInfo();
    fetchBackups();
    runAutoBackup();
  }, [fetchSyncInfo, fetchBackups, runAutoBackup]);

  useEffect(() => { if (syncInfo && selectedIp) generateQRs(syncInfo, selectedIp); }, [syncInfo, selectedIp, generateQRs]);

  const startListening = useCallback(() => {
    sseRef.current?.close();
    setWaitingReceive(true);
    setReceived(false);
    const es = new EventSource("/api/sync/receive-listen");
    sseRef.current = es;
    es.onmessage = (e) => {
      if (e.data === "received") {
        setReceived(true);
        setWaitingReceive(false);
        es.close();
        toast.success("Dados recebidos do Android!");
        fetchBackups();
      }
    };
    es.onerror = () => { setWaitingReceive(false); es.close(); };
  }, [fetchBackups]);

  useEffect(() => () => { sseRef.current?.close(); }, []);

  const nativeFetch = useCallback(async (
    url: string,
    options: { method?: string; headers?: Record<string, string>; data?: any; timeoutMs?: number }
  ): Promise<{ status: number; data: any }> => {
    const { CapacitorHttp } = await import("@capacitor/core");
    const timeoutMs = options.timeoutMs ?? 20000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs);
      CapacitorHttp.request({
        url,
        method: options.method || "GET",
        headers: options.headers || {},
        data: options.data,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      })
        .then((res: any) => { clearTimeout(timer); resolve({ status: res.status, data: res.data }); })
        .catch((err: any) => { clearTimeout(timer); reject(err); });
    });
  }, []);

  const handlePull = useCallback(async () => {
    setPulling(true);
    try {
      const url = await scanQRNative();
      if (!url) return;
      toast.info("Conectando ao PC...");
      const res = await nativeFetch(url, { method: "GET", headers: { "Accept": "application/json" }, timeoutMs: 15000 });
      if (res.status < 200 || res.status >= 300) throw new Error("Erro de conexão");
      const json = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      const { localImportImportBackup } = await import("@/lib/localDb");
      await localImportImportBackup({ json });
      toast.success("Dados sincronizados!");
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) {
      toast.error(e.message || "Erro na sincronização");
    } finally { setPulling(false); }
  }, [nativeFetch]);

  const handlePush = useCallback(async () => {
    setPushing(true);
    try {
      const url = await scanQRNative();
      if (!url) return;
      toast.info("Enviando dados...");
      const { localImportExportBackup } = await import("@/lib/localDb");
      const json = await localImportExportBackup();
      const res = await nativeFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, data: json, timeoutMs: 20000 });
      if (res.status < 200 || res.status >= 300) throw new Error("PC recusou conexão");
      toast.success("Enviado com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro no envio");
    } finally { setPushing(false); }
  }, [nativeFetch]);

  const handleExportFile = async () => {
    try {
      const { localImportExportBackup } = await import("@/lib/localDb");
      const json = await localImportExportBackup();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `soe-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup pronto!");
    } catch (e: any) { toast.error("Erro ao exportar"); }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    try {
      const json = await file.text();
      const { localImportImportBackup } = await import("@/lib/localDb");
      await localImportImportBackup({ json });
      toast.success("Importado!");
      setTimeout(() => window.location.reload(), 800);
    } catch { toast.error("Arquivo inválido"); }
    finally { setImportLoading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const handleImportFromLink = async () => {
    if (!driveUrl) return;
    setLinkImportLoading(true);
    try {
      let fileId = "";
      const m1 = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const m2 = driveUrl.match(/id=([a-zA-Z0-9_-]+)/);
      fileId = m1 ? m1[1] : (m2 ? m2[1] : "");
      if (!fileId) throw new Error("Link inválido");

      const res = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`);
      if (!res.ok) throw new Error("Acesso negado ao arquivo");
      const json = await res.text();
      const { localImportImportBackup } = await import("@/lib/localDb");
      await localImportImportBackup({ json });
      toast.success("Sincronizado com a nuvem!");
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) { toast.error(e.message); }
    finally { setLinkImportLoading(false); setDriveUrl(""); }
  };

  const FlipQRCard = ({ 
    title, subtitle, icon: Icon, iconColor, qrUrl, loading, footerAction
  }: { 
    title: string; subtitle: string; icon: any; iconColor: string; qrUrl: string; loading: boolean;
    footerAction?: React.ReactNode;
  }) => {
    const [flipped, setFlipped] = useState(false);
    return (
      <div className="w-full" style={{ perspective: "1000px" }}>
        <div style={{
          position: "relative", width: "100%", height: 380,
          transformStyle: "preserve-3d",
          transition: "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}>
          {/* FRONT */}
          <div className="soe-card absolute inset-0 backface-hidden p-6 flex flex-col items-center justify-between border-2 border-transparent hover:border-[var(--primary-border)] transition-colors">
            <div className="flex items-center gap-2.5 w-full">
              <div className="p-2 rounded-lg" style={{ background: `${iconColor}15` }}>
                <Icon size={18} style={{ color: iconColor }} />
              </div>
              <span className="font-black text-sm uppercase tracking-wider" style={{ color: "var(--app-fg)" }}>{title}</span>
            </div>
            <div className="w-full flex-1 my-4 rounded-2xl border-2 border-dashed border-white/5 flex flex-col items-center justify-center p-4 bg-white/[0.01]">
              <div className="relative">
                <QrCode size={40} className="text-white/10" />
                <Zap size={14} className="absolute -top-1 -right-1 text-[var(--primary)] animate-pulse" />
              </div>
              <p className="text-[10px] text-white/40 text-center mt-3 leading-relaxed">{subtitle}</p>
            </div>
            <button
              onClick={() => setFlipped(true)}
              className="w-full py-3 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest shadow-lg shadow-[var(--primary-shadow)] hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              <RotateCw size={14} /> Revelar QR Code
            </button>
          </div>

          {/* BACK */}
          <div className="soe-card absolute inset-0 backface-hidden p-6 flex flex-col items-center justify-between rotate-y-180" 
               style={{ borderColor: `${iconColor}40`, background: "var(--stat-bg)" }}>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5">
                <Icon size={18} style={{ color: iconColor }} />
                <span className="font-black text-sm uppercase tracking-wider" style={{ color: "var(--app-fg)" }}>{title}</span>
              </div>
              <button onClick={() => setFlipped(false)} className="p-1.5 rounded-lg hover:bg-white/5 text-white/20 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center w-full p-2">
              {loading ? (
                <RefreshCw size={28} className="text-[var(--primary)] animate-spin opacity-40" />
              ) : qrUrl ? (
                <div className="p-2 bg-white rounded-xl shadow-2xl">
                  <img src={qrUrl} alt="QR" className="w-40 h-40 md:w-44 md:h-44 block object-contain" />
                </div>
              ) : (
                <AlertCircle size={28} className="text-rose-500/40" />
              )}
            </div>
            <div className="w-full space-y-3">
              {footerAction}
              <p className="text-[10px] text-center uppercase tracking-widest opacity-30 font-black">Escaneie com o App Mobile</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header Imersivo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[var(--primary-bg-subtle)] rounded-2xl border border-[var(--primary-border)] shadow-xl shadow-[var(--primary-shadow)]">
            <RefreshCw className="w-6 h-6 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--app-fg)" }}>Sync & Backup</h1>
            <p className="text-sm opacity-60">Sincronização em tempo real e segurança de dados.</p>
          </div>
        </div>
        
        {/* Connection Status Badge */}
        <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/5 border border-white/5">
          <div className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
            {isDesktop ? "Terminal Host Ativo" : "Cliente Mobile Conectado"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 px-2">
        {/* Left Column: QR & Sync */}
        <div className="lg:col-span-8 space-y-8">
          <div className="soe-card p-8 relative overflow-hidden">
             {/* Background decorative icon */}
            <Smartphone className="absolute -right-8 -bottom-8 w-48 h-48 opacity-[0.02] -rotate-12 pointer-events-none" />
            
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-[var(--primary-bg-subtle)] flex items-center justify-center">
                <Wifi className="w-5 h-5 text-[var(--primary)]" />
              </div>
              <div>
                <h2 className="text-xl font-black" style={{ color: "var(--app-fg)" }}>Sincronização Direta</h2>
                <p className="text-xs opacity-50">Transfira dados instantaneamente via Wi-Fi.</p>
              </div>
            </div>

            {isDesktop ? (
              <div className="space-y-8">
                {syncInfo && syncInfo.ips.length > 0 ? (
                  <>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-4">
                      <Globe className="w-5 h-5 text-[var(--accent-blue, #3b82f6)]" />
                      <div className="flex-1">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Endereço Local</p>
                        <code className="text-sm font-black">{selectedIp}:{syncInfo.port}</code>
                      </div>
                      {syncInfo.ips.length > 1 && (
                        <div className="flex gap-1.5">
                          {syncInfo.ips.map(ip => (
                            <button key={ip} onClick={() => setSelectedIp(ip)}
                                    className={`w-2 h-2 rounded-full transition-all ${selectedIp === ip ? 'bg-[var(--primary)] scale-125' : 'bg-white/10'}`} />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FlipQRCard
                        title="Baixar para Mobile"
                        subtitle="Transfere os dados do PC para o seu celular."
                        icon={ArrowDownToLine}
                        iconColor="var(--accent-green)"
                        qrUrl={qrPullUrl}
                        loading={qrLoading}
                      />
                      <FlipQRCard
                        title="Enviar para o PC"
                        subtitle="Envia o progresso do celular para este computador."
                        icon={ArrowUpFromLine}
                        iconColor="var(--primary)"
                        qrUrl={qrPushUrl}
                        loading={qrLoading}
                        footerAction={
                          <button
                            onClick={startListening}
                            disabled={waitingReceive}
                            className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${received ? 'bg-[var(--accent-green)] text-white border-[var(--accent-green)]' : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10'}`}>
                            {received ? "✓ Recebido" : waitingReceive ? "Aguardando..." : "Escutar Android"}
                          </button>
                        }
                      />
                    </div>
                  </>
                ) : (
                  <div className="p-12 text-center bg-white/5 rounded-[2rem] border-2 border-dashed border-white/10">
                    <Wifi size={40} className="mx-auto mb-4 opacity-20" />
                    <p className="text-sm font-bold opacity-40">Sem rede Wi-Fi detectada.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm opacity-50 leading-relaxed mb-6">
                  Abra o Dashboard no seu PC e aponte a câmera para os QR Codes.
                </p>
                <div className="grid gap-4">
                  <button onClick={handlePull} disabled={pulling}
                    className="group relative flex items-center justify-between p-6 rounded-[2rem] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xl shadow-[var(--primary-shadow)] active:scale-[0.98] transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[var(--primary-foreground)]/20 flex items-center justify-center">
                        {pulling ? <RefreshCw className="animate-spin" /> : <ArrowDownToLine />}
                      </div>
                      <div className="text-left">
                        <p className="font-black text-lg">Baixar do PC</p>
                        <p className="text-xs opacity-70">Importar dados do computador</p>
                      </div>
                    </div>
                    <ChevronRight className="opacity-40 group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button onClick={handlePush} disabled={pushing}
                    className="group relative flex items-center justify-between p-6 rounded-[2rem] bg-white/5 border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[var(--primary-bg-subtle)] flex items-center justify-center text-[var(--primary)]">
                        {pushing ? <RefreshCw className="animate-spin" /> : <ArrowUpFromLine />}
                      </div>
                      <div className="text-left">
                        <p className="font-black text-lg" style={{ color: "var(--app-fg)" }}>Enviar ao PC</p>
                        <p className="text-xs opacity-50">Sincronizar progresso atual</p>
                      </div>
                    </div>
                    <ChevronRight className="opacity-20 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* Cloud Restoration */}
          <div className="soe-card p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                <Cloud className="w-5 h-5 text-sky-500" />
              </div>
              <div>
                <h2 className="text-xl font-black" style={{ color: "var(--app-fg)" }}>Restauração em Nuvem</h2>
                <p className="text-xs opacity-50">Importe backups compartilhados via link.</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Cole o link do Google Drive aqui..."
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
                className="flex-1 px-5 py-4 rounded-2xl text-sm outline-none transition-all focus:ring-2 focus:ring-sky-500/50"
                style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}
              />
              <button onClick={handleImportFromLink} disabled={linkImportLoading || !driveUrl}
                className="px-6 rounded-2xl bg-sky-500 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-sky-500/20 hover:opacity-90 transition-all flex items-center gap-2">
                {linkImportLoading ? <RefreshCw className="animate-spin w-4 h-4" /> : <Download className="w-4 h-4" />}
                Importar
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2 opacity-30">
              <ShieldCheck size={14} />
              <p className="text-[10px] font-bold uppercase tracking-tighter">Conexão Segura SSL</p>
            </div>
          </div>
        </div>

        {/* Right Column: Files & Automation */}
        <div className="lg:col-span-4 space-y-8">
          {/* File Backup */}
          <div className="soe-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-amber)]/10 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-[var(--accent-amber)]" />
              </div>
              <h2 className="font-black text-sm uppercase tracking-wider" style={{ color: "var(--app-fg)" }}>Arquivo Local</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleExportFile}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all">
                <Share2 className="text-[var(--primary)]" />
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Exportar</span>
              </button>
              <label className="cursor-pointer">
                <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all">
                  <Upload className="text-[var(--accent-green)]" />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{importLoading ? "Carregando" : "Importar"}</span>
                </div>
                <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
              </label>
            </div>
          </div>

          {/* Automated Backups List (PC) */}
          {isDesktop && (
            <div className="soe-card p-6 flex flex-col h-full max-h-[500px]">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--primary-bg-subtle)] flex items-center justify-center">
                    <Clock className="w-5 h-5 text-[var(--primary)]" />
                  </div>
                  <h2 className="font-black text-sm uppercase tracking-wider" style={{ color: "var(--app-fg)" }}>Histórico</h2>
                </div>
                <button onClick={() => { runAutoBackup(); fetchBackups(); }}
                        className="p-2 rounded-lg hover:bg-white/5 text-white/30 transition-colors">
                  <RotateCw size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {backupLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
                  ))
                ) : backups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 opacity-20">
                    <Info size={32} />
                    <p className="text-xs font-bold mt-2">Sem backups</p>
                  </div>
                ) : (
                  backups.map(b => (
                    <div key={b.name} className="group flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-all">
                      <div className="w-8 h-8 rounded-lg bg-[var(--accent-green)]/10 flex items-center justify-center text-[var(--accent-green)]">
                        <ShieldCheck size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40">{b.date}</p>
                        <p className="text-xs font-bold truncate" style={{ color: "var(--app-fg)" }}>{b.name}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="mt-6 pt-6 border-t border-white/5">
                <p className="text-[9px] font-black uppercase tracking-widest opacity-20 text-center leading-relaxed">
                  Backups retidos por 30 dias<br />em ./userData/data/backups
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
