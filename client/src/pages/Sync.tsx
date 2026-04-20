import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import {
  QrCode, Smartphone, Monitor, RefreshCw, Download,
  Upload, CheckCircle2, Wifi, AlertCircle, Clock, Database,
  Camera, ArrowDownToLine, ArrowUpFromLine, X, RotateCw
} from "lucide-react";
import { Button } from "@/components/ui/button";

const isAndroid = Capacitor.isNativePlatform();
const isDesktop = !isAndroid;

// ── QR Code generator ─────────────────────────────────────────────────────
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
    new (window as any).QRCode(div, { text, width: 240, height: 240, correctLevel: (window as any).QRCode.CorrectLevel.M });
    setTimeout(() => {
      const canvas = div.querySelector("canvas");
      const img = div.querySelector("img");
      document.body.removeChild(div);
      resolve(canvas?.toDataURL("image/png") || img?.src || "");
    }, 200);
  } catch (e) { document.body.removeChild(div); reject(e); }
}

// ── Native barcode scanner via @capacitor-mlkit/barcode-scanning ──────────
async function scanQRNative(): Promise<string | null> {
  try {
    const { BarcodeScanner, BarcodeFormat } = await import("@capacitor-mlkit/barcode-scanning");

    // Passo 1: verifica se o modelo MLKit está instalado (necessário em alguns dispositivos)
    try {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
        toast("Instalando módulo de scanner... Tente novamente em instantes.", { duration: 4000 });
        return null;
      }
    } catch (_) {
      // Alguns dispositivos/versões não têm esse método — ignorar e continuar
    }

    // Passo 2: checa e pede permissão de câmera explicitamente
    let granted = false;
    try {
      const { camera: status } = await BarcodeScanner.checkPermissions();
      if (status === "granted" || status === "limited") {
        granted = true;
      } else if (status === "denied") {
        // Já foi negada antes — abre configurações
        toast.error("Permissão de câmera bloqueada. Habilite em: Configurações → Apps → SOE → Permissões → Câmera");
        return null;
      } else {
        // "prompt" ou "prompt-with-rationale" → pede permissão
        const { camera: newStatus } = await BarcodeScanner.requestPermissions();
        granted = newStatus === "granted" || newStatus === "limited";
      }
    } catch (_) {
      // checkPermissions falhou — tenta pedir direto
      try {
        const { camera } = await BarcodeScanner.requestPermissions();
        granted = camera === "granted" || camera === "limited";
      } catch (permErr) {
        console.error("Erro ao pedir permissão:", permErr);
      }
    }

    if (!granted) {
      toast.error("Câmera não autorizada. Acesse: Configurações → Apps → SOE → Permissões → Câmera");
      return null;
    }

    // Passo 3: escaneia
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.QrCode],
    });

    if (barcodes.length > 0) {
      return barcodes[0].rawValue ?? null;
    }
    return null;
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes("cancel") || msg.includes("Cancel") || msg.includes("dismiss")) return null;
    console.error("QR Scan error:", e);
    toast.error("Erro ao abrir câmera: " + msg);
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
  const fileRef = useRef<HTMLInputElement>(null);

  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);

  // ── PC: SSE waiting for Android push ────────────────────────────────
  const [waitingReceive, setWaitingReceive] = useState(false);
  const [received, setReceived] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  // ── Fetch sync info ──────────────────────────────────────────────────
  const fetchSyncInfo = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const res = await fetch("/api/sync/info");
      const data = await res.json();
      setSyncInfo(data);
      // Seleciona o primeiro IP automaticamente se nenhum ainda escolhido
      if (data.ips && data.ips.length > 0) {
        setSelectedIp((prev) => prev || data.ips[0]);
      }
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
  }, []);

  useEffect(() => { if (syncInfo && selectedIp) generateQRs(syncInfo, selectedIp); }, [syncInfo, selectedIp]);

  // ── SSE listener ─────────────────────────────────────────────────────
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
        toast.success("Dados recebidos do Android! Recarregue para ver.");
        fetchBackups();
      }
    };
    es.onerror = () => { setWaitingReceive(false); es.close(); };
  }, [fetchBackups]);

  useEffect(() => () => { sseRef.current?.close(); }, []);

  // ── Helper: HTTP nativo via CapacitorHttp (bypassa CORS e cleartext do WebView) ──
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

  // ── Android: PULL from PC ─────────────────────────────────────────────
  const handlePull = useCallback(async () => {
    setPulling(true);
    try {
      const url = await scanQRNative();
      if (!url) return;
      toast.info("QR lido! Baixando dados do PC...");
      try {
        const res = await nativeFetch(url, {
          method: "GET",
          headers: { "Accept": "application/json" },
          timeoutMs: 15000,
        });
        if (res.status < 200 || res.status >= 300)
          throw new Error(`Servidor respondeu ${res.status}. Verifique se o PC está ligado e na mesma rede.`);
        const json = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
        const { localImportImportBackup } = await import("@/lib/localDb");
        await localImportImportBackup({ json });
        toast.success("Dados sincronizados do PC!");
        setTimeout(() => window.location.reload(), 800);
      } catch (err: any) {
        if (err?.message === "TIMEOUT")
          throw new Error("Timeout ao conectar com o PC. Verifique:\n• PC e celular na mesma rede Wi-Fi\n• Firewall do PC não bloqueando a porta\n• App do PC está aberto");
        throw err;
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (!msg.includes("cancel") && !msg.includes("Cancel")) {
        toast.error("Erro: " + msg);
      }
    } finally { setPulling(false); }
  }, [nativeFetch]);

  // ── Android: PUSH to PC ───────────────────────────────────────────────
  const handlePush = useCallback(async () => {
    setPushing(true);
    try {
      const url = await scanQRNative();
      if (!url) return;
      toast.info("QR lido! Enviando dados para o PC...");
      const { localImportExportBackup } = await import("@/lib/localDb");
      const json = await localImportExportBackup();
      try {
        const res = await nativeFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          data: json,
          timeoutMs: 20000,
        });
        if (res.status < 200 || res.status >= 300)
          throw new Error(`PC respondeu ${res.status}`);
        toast.success("Dados enviados para o PC!");
      } catch (err: any) {
        if (err?.message === "TIMEOUT")
          throw new Error("Timeout ao conectar com o PC. Verifique:\n• PC e celular na mesma rede Wi-Fi\n• Firewall do PC não bloqueando a porta\n• App do PC está aberto");
        throw err;
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (!msg.includes("cancel") && !msg.includes("Cancel")) {
        toast.error("Erro: " + msg);
      }
    } finally { setPushing(false); }
  }, [nativeFetch]);

  // ── Export backup ────────────────────────────────────────────────────
  const handleExportFile = async () => {
    try {
      if (isAndroid) {
        const { localImportExportBackup } = await import("@/lib/localDb");
        const json = await localImportExportBackup();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `soe-backup-${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Backup exportado!");
      } else {
        const { localImportExportBackup } = await import("@/lib/localDb");
        const json = await localImportExportBackup();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `soe-backup-${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Backup exportado!");
      }
    } catch (e: any) {
      toast.error("Erro ao exportar: " + (e?.message || String(e)));
    }
  };

  // ── Import backup from file ──────────────────────────────────────────
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    try {
      const json = await file.text();
      const { localImportImportBackup } = await import("@/lib/localDb");
      await localImportImportBackup({ json });
      toast.success("Backup importado com sucesso!");
      setTimeout(() => window.location.reload(), 800);
    } catch { toast.error("Arquivo JSON inválido"); }
    finally { setImportLoading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  // Each card manages its own flip state independently
  const FlipQRCard = ({ 
    title, subtitle, icon: Icon, iconColor, qrUrl, loading, buttonColor, footerAction
  }: { 
    title: string; subtitle: string; icon: any; iconColor: string; qrUrl: string; loading: boolean;
    buttonColor: string; footerAction?: React.ReactNode;
  }) => {
    const [flipped, setFlipped] = useState(false);

    return (
      <div className="w-full" style={{ perspective: "1000px" }}>
        {/* Flip container */}
        <div style={{
          position: "relative",
          width: "100%",
          height: 340,
          transformStyle: "preserve-3d",
          transition: "transform 0.55s cubic-bezier(0.4, 0.2, 0.2, 1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}>
          {/* FRONT — info + button to reveal */}
          <div style={{
            position: "absolute", inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            borderRadius: 18,
            background: "var(--stat-bg)",
            border: "2px solid var(--card-border)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "24px 20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
              <Icon size={16} style={{ color: iconColor }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: "var(--app-fg)" }}>{title}</span>
            </div>
            <div style={{ width: "100%", border: "2px dashed var(--card-border)", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "40px 16px" }}>
              <QrCode size={40} style={{ color: "var(--muted-text)", opacity: 0.35 }} />
              <p style={{ fontSize: 12, color: "var(--muted-text)", textAlign: "center" }}>{subtitle}</p>
            </div>
            <button
              onClick={() => setFlipped(true)}
              style={{ width: "100%", padding: "10px 0", borderRadius: 12, background: buttonColor, color: "#fff", fontWeight: 600, fontSize: 13, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <RotateCw size={14} /> Revelar QR Code
            </button>
          </div>

          {/* BACK — QR code */}
          <div style={{
            position: "absolute", inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            borderRadius: 18,
            background: "var(--stat-bg)",
            border: "2px solid " + iconColor + "66",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "20px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
              <Icon size={16} style={{ color: iconColor }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: "var(--app-fg)" }}>{title}</span>
            </div>
            {loading ? (
              <div style={{ width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, background: "var(--app-bg)" }}>
                <RefreshCw size={24} style={{ color: "var(--muted-text)" }} className="animate-spin" />
              </div>
            ) : qrUrl ? (
              <div style={{ padding: 10, borderRadius: 14, background: "#ffffff", boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
                <img src={qrUrl} alt="QR Code" style={{ width: 190, height: 190, display: "block" }} />
              </div>
            ) : null}
            {footerAction}
            <button
              onClick={() => setFlipped(false)}
              style={{ width: "100%", padding: "8px 0", borderRadius: 10, background: "transparent", color: "var(--muted-text)", fontWeight: 500, fontSize: 12, border: "1px solid var(--card-border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <X size={13} /> Ocultar QR
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight soe-gold-text flex items-center gap-2">
          <QrCode className="w-6 h-6" /> Sync & Backup
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-text)" }}>
          {isAndroid ? "Sincronize com o PC ou importe um backup" : "Sincronize com o Android e gerencie backups"}
        </p>
      </div>

      {/* ── DESKTOP: Stacked QR Cards ──────────────────────────────────── */}
      {isDesktop && (
        <div className="soe-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Smartphone className="w-4 h-4" style={{ color: "var(--primary)" }} />
            <h2 className="font-semibold" style={{ color: "var(--app-fg)" }}>Sincronizar com Android</h2>
          </div>

          {syncInfo && syncInfo.ips.length > 0 ? (
            <div className="space-y-5">
              <div className="flex items-start gap-2 text-sm" style={{ color: "var(--app-fg)" }}>
                <Wifi className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--accent-green)" }} />
                PC e Android devem estar na <strong>mesma rede Wi-Fi</strong>
              </div>

              {/* Seletor de IP — aparece somente se houver mais de 1 IP */}
              {syncInfo.ips.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium" style={{ color: "var(--muted-text)" }}>
                    IP do PC detectado — se o QR não funcionar, tente outro:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {syncInfo.ips.map(ip => (
                      <button
                        key={ip}
                        onClick={() => setSelectedIp(ip)}
                        className="px-3 py-1 rounded-lg text-xs font-mono transition-opacity"
                        style={{
                          background: selectedIp === ip ? "var(--primary)" : "var(--stat-bg)",
                          color: selectedIp === ip ? "var(--primary-foreground)" : "var(--app-fg)",
                          border: `1px solid ${selectedIp === ip ? "var(--primary)" : "var(--card-border)"}`,
                        }}
                      >
                        {ip}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs" style={{ color: "var(--muted-text)" }}>
                    IP selecionado: <code className="font-mono">{selectedIp}:{syncInfo.port}</code>
                  </p>
                </div>
              )}

              {/* Mostra o IP mesmo quando só há 1 */}
              {syncInfo.ips.length === 1 && (
                <p className="text-xs" style={{ color: "var(--muted-text)" }}>
                  Endereço do PC: <code className="font-mono px-1 py-0.5 rounded" style={{ background: "var(--stat-bg)" }}>{selectedIp}:{syncInfo.port}</code>
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-6 pt-4">
                {/* Flip QR Cards */}
                <div className="flex-1">
                  <FlipQRCard
                    title="PC → Android"
                    subtitle="Clique para ver o QR Code e escaneie no celular para baixar os dados do PC"
                    icon={ArrowDownToLine}
                    iconColor="var(--accent-green)"
                    qrUrl={qrPullUrl}
                    loading={qrLoading}
                    buttonColor="var(--accent-green)"
                  />
                </div>

                <div className="flex-1">
                  <FlipQRCard
                    title="Android → PC"
                    subtitle="Clique para ver o QR Code e escaneie no celular para enviar dados ao PC"
                    icon={ArrowUpFromLine}
                    iconColor="var(--primary)"
                    qrUrl={qrPushUrl}
                    loading={qrLoading}
                    buttonColor="var(--primary)"
                    footerAction={
                      <Button
                        size="sm"
                        variant={received ? "default" : "outline"}
                        onClick={startListening}
                        disabled={waitingReceive}
                        className="gap-2 w-full"
                      >
                        {received ? (
                          <><CheckCircle2 className="w-3.5 h-3.5" /> Dados recebidos!</>
                        ) : waitingReceive ? (
                          <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Aguardando Android...</>
                        ) : (
                          <><RefreshCw className="w-3.5 h-3.5" /> Aguardar envio do Android</>
                        )}
                      </Button>
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end pt-8">
                <Button variant="outline" size="sm" onClick={() => { fetchSyncInfo(); }} className="gap-2">
                  <RefreshCw className="w-3.5 h-3.5" /> Atualizar QRs
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: "var(--stat-bg)" }}>
              <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: "var(--accent-amber)" }} />
              <p className="text-sm" style={{ color: "var(--muted-text)" }}>Nenhuma rede Wi-Fi detectada.</p>
            </div>
          )}
        </div>
      )}

      {/* ── ANDROID: dois botões ────────────────────────────────────── */}
      {isAndroid && (
        <div className="soe-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Monitor className="w-4 h-4" style={{ color: "var(--primary)" }} />
            <h2 className="font-semibold" style={{ color: "var(--app-fg)" }}>Sincronizar com o PC</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: "var(--muted-text)" }}>
            Abra o SOE no PC e vá em Sync & Backup. Dois QR Codes vão aparecer — use o certo para cada direção.
          </p>
          <div className="grid grid-cols-1 gap-3">
            <Button
              onClick={handlePull}
              disabled={pulling || pushing}
              className="w-full gap-2 h-12 text-base font-semibold"
            >
              {pulling ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ArrowDownToLine className="w-5 h-5" />}
              {pulling ? "Baixando dados..." : "Baixar dados do PC"}
            </Button>
            <Button
              variant="outline"
              onClick={handlePush}
              disabled={pulling || pushing}
              className="w-full gap-2 h-12 text-base font-semibold"
            >
              {pushing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ArrowUpFromLine className="w-5 h-5" />}
              {pushing ? "Enviando dados..." : "Enviar dados para o PC"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Backup por arquivo ─────────────────────────────────────── */}
      <div className="soe-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4" style={{ color: "var(--primary)" }} />
          <h2 className="font-semibold" style={{ color: "var(--app-fg)" }}>Backup por arquivo</h2>
        </div>
        <p className="text-sm mb-4" style={{ color: "var(--muted-text)" }}>
          Exporte um arquivo JSON com todos os seus dados. Ideal para mandar por WhatsApp para si mesmo.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExportFile} className="gap-2">
            <Download className="w-4 h-4" /> Exportar JSON
          </Button>
          <label>
            <Button variant="outline" className="gap-2" asChild>
              <span><Upload className="w-4 h-4" />{importLoading ? "Importando..." : "Importar JSON"}</span>
            </Button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
          </label>
        </div>
      </div>

      {/* ── Backups automáticos (PC only) ─────────────────────────── */}
      {isDesktop && (
        <div className="soe-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" style={{ color: "var(--primary)" }} />
              <h2 className="font-semibold" style={{ color: "var(--app-fg)" }}>Backups automáticos</h2>
            </div>
            <Button variant="outline" size="sm" onClick={() => { runAutoBackup(); fetchBackups(); }} className="gap-1.5 text-xs">
              <RefreshCw className="w-3.5 h-3.5" /> Fazer backup agora
            </Button>
          </div>
          <p className="text-sm mb-3" style={{ color: "var(--muted-text)" }}>
            Um backup é salvo automaticamente ao abrir esta página, 1 por dia, máximo 30 dias.
            Localização: <code className="text-xs px-1 py-0.5 rounded" style={{ background: "var(--stat-bg)" }}>userData/data/backups/</code>
          </p>
          {backupLoading ? (
            <p className="text-sm" style={{ color: "var(--muted-text)" }}>Carregando...</p>
          ) : backups.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted-text)" }}>Nenhum backup encontrado ainda.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {backups.map(b => (
                <div key={b.name} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--stat-bg)" }}>
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--accent-green)" }} />
                  <span className="text-sm flex-1" style={{ color: "var(--app-fg)" }}>{b.date}</span>
                  <span className="text-xs" style={{ color: "var(--muted-text)" }}>{b.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
