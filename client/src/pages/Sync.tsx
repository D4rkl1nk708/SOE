import QRCode from "qrcode";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import {
  QrCode,
  Smartphone,
  Monitor,
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  Wifi,
  AlertCircle,
  Clock,
  Database,
  Camera,
  ArrowDownToLine,
  ArrowUpFromLine,
  X,
  RotateCw,
  Cloud,
  HardDrive,
  ShieldCheck,
  Share2,
  Info,
  ChevronRight,
  Zap,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";

const isAndroid = Capacitor.isNativePlatform();
const isDesktop = !isAndroid;

// ── QR Code generator (Fast, 100% offline via local qrcode library) ───────────
async function getQRDataURL(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: 280,
      margin: 1,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    });
  } catch (e) {
    console.warn("Direct QRCode error, falling back to canvas:", e);
    return new Promise((resolve, reject) => {
      if ((window as any).QRCode) {
        buildQR(text, resolve, reject);
        return;
      }
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      script.onload = () => buildQR(text, resolve, reject);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
}
function buildQR(
  text: string,
  resolve: (s: string) => void,
  reject: (e: any) => void,
) {
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
      correctLevel: (window as any).QRCode.CorrectLevel.M,
    });
    setTimeout(() => {
      const canvas = div.querySelector("canvas");
      const img = div.querySelector("img");
      document.body.removeChild(div);
      resolve(canvas?.toDataURL("image/png") || img?.src || "");
    }, 200);
  } catch (e) {
    document.body.removeChild(div);
    reject(e);
  }
}

// ── Native barcode scanner ───────────────────────────────────────────────────
async function scanQRNative(): Promise<string | null> {
  try {
    const { BarcodeScanner, BarcodeFormat } =
      await import("@capacitor-mlkit/barcode-scanning");

    try {
      const { available } =
        await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
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
        toast.error(
          "Permissão de câmera bloqueada. Habilite nas configurações.",
        );
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

    return barcodes.length > 0 ? (barcodes[0].rawValue ?? null) : null;
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (
      msg.includes("cancel") ||
      msg.includes("Cancel") ||
      msg.includes("dismiss")
    )
      return null;
    toast.error("Erro no scanner: " + msg);
    return null;
  }
}

type SyncInfo = {
  ips: string[];
  port: number;
  details?: Array<{
    address: string;
    name: string;
    isVirtual: boolean;
    isRecommended: boolean;
  }>;
};
type BackupEntry = {
  name: string;
  date: string;
  source?: string;
  size?: number;
};

export default function Sync() {
  const trpcUtils = trpc.useUtils();
  const { data: dataHealth } = trpc.study.dataHealth.useQuery();
  const [lastSync, setLastSync] = useState<any>(() => {
    try {
      return JSON.parse(localStorage.getItem("soe_last_sync_stats") || "null");
    } catch {
      return null;
    }
  });

  const recordSyncStats = (stats: any, direction: "pull" | "push") => {
    if (!stats) return;
    const record = {
      ...stats,
      direction,
      at: new Date().toISOString(),
    };
    setLastSync(record);
    try {
      localStorage.setItem("soe_last_sync_stats", JSON.stringify(record));
    } catch {}
  };
  const importBackupMutation = trpc.import.importBackup.useMutation();
  const importLocalMutation = trpc.import.importLocalBackup.useMutation();
  const deleteLocalMutation = trpc.import.deleteLocalBackup.useMutation();
  const syncToSupabaseMutation = trpc.import.syncToSupabase.useMutation();
  const pullFromSupabaseMutation = trpc.import.pullFromSupabase.useMutation();
  const syncLocalBackupToSupabaseMutation =
    trpc.import.syncLocalBackupToSupabase.useMutation();

  const { data: cloudSyncData, refetch: checkCloudSync } =
    trpc.import.checkSync.useQuery(undefined, {
      enabled: isDesktop,
    });
  const { data: syncHistory, refetch: refetchHistory } =
    trpc.import.getSyncHistory.useQuery(undefined, {
      enabled: isDesktop,
    });

  const [pullingCloud, setPullingCloud] = useState(false);
  const [pushingCloud, setPushingCloud] = useState(false);
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  const fetchSyncInfo = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const res = await fetch("/api/sync/info");
      const data = await res.json();
      setSyncInfo(data);
      if (data.ips && data.ips.length > 0) {
        const recommended = data.details?.find(
          (d: any) =>
            d.isRecommended && !d.isVirtual && !d.address.startsWith("172."),
        )?.address;
        const nonVirtual = data.details?.find(
          (d: any) => !d.isVirtual && !d.address.startsWith("172."),
        )?.address;
        const lan192 = data.ips.find((ip: string) => ip.startsWith("192.168."));
        const lan10 = data.ips.find((ip: string) => ip.startsWith("10."));
        setSelectedIp(
          (prev) =>
            prev || recommended || nonVirtual || lan192 || lan10 || data.ips[0],
        );
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
    } catch {
      toast.error("Erro ao gerar QR Codes");
    } finally {
      setQrLoading(false);
    }
  }, []);

  const runAutoBackup = useCallback(async () => {
    if (!isDesktop) return;
    try {
      await fetch("/api/backup/auto", { method: "POST" });
    } catch {}
  }, []);

  const fetchBackups = useCallback(async () => {
    if (!isDesktop) return;
    setBackupLoading(true);
    try {
      const res = await fetch("/api/backup/list");
      const data = await res.json();
      setBackups(data.backups || []);
    } catch {
    } finally {
      setBackupLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSyncInfo();
    fetchBackups();
    runAutoBackup();
  }, [fetchSyncInfo, fetchBackups, runAutoBackup]);

  useEffect(() => {
    if (syncInfo && selectedIp) generateQRs(syncInfo, selectedIp);
  }, [syncInfo, selectedIp, generateQRs]);

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
    es.onerror = () => {
      setWaitingReceive(false);
      es.close();
    };
  }, [fetchBackups]);

  useEffect(
    () => () => {
      sseRef.current?.close();
    },
    [],
  );

  const nativeFetch = useCallback(
    async (
      url: string,
      options: {
        method?: string;
        headers?: Record<string, string>;
        data?: any;
        timeoutMs?: number;
      },
    ): Promise<{ status: number; data: any }> => {
      const { CapacitorHttp } = await import("@capacitor/core");
      const timeoutMs = options.timeoutMs ?? 120000;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                "TIMEOUT: O PC não respondeu em " +
                  Math.round(timeoutMs / 1000) +
                  "s. Verifique se ambos estão no mesmo Wi-Fi e se o app SOE está aberto no computador.",
              ),
            ),
          timeoutMs,
        );
        CapacitorHttp.request({
          url,
          method: options.method || "GET",
          headers: options.headers || {},
          data: options.data,
          connectTimeout: timeoutMs,
          readTimeout: timeoutMs,
        })
          .then((res: any) => {
            clearTimeout(timer);
            resolve({ status: res.status, data: res.data });
          })
          .catch((err: any) => {
            clearTimeout(timer);
            const msg = err?.message || String(err);
            const lower = msg.toLowerCase();
            if (lower.includes("timeout") || lower.includes("timed out")) {
              reject(
                new Error(
                  "TIMEOUT: O PC demorou a responder. Verifique se ambos estão no mesmo Wi-Fi e se o IP correto (192.168.x.x) foi selecionado no PC.",
                ),
              );
            } else if (
              lower.includes("refused") ||
              lower.includes("econnrefused") ||
              lower.includes("failed to connect")
            ) {
              reject(
                new Error(
                  "Conexão recusada pelo PC. Verifique se o aplicativo SOE está aberto no computador e no mesmo Wi-Fi.",
                ),
              );
            } else {
              reject(err);
            }
          });
      });
    },
    [],
  );

  const [delta, setDelta] = useState<{ local: any; remote: any } | null>(null);
  const [syncProgress, setSyncProgress] = useState<{
    active: boolean;
    percent: number;
    title: string;
    description: string;
  } | null>(null);

  const confirmImport = async (json: string, forceOverwrite = false) => {
    const { localImportImportBackup, localImportExportBackup } =
      await import("@/lib/localDb");
    await localImportImportBackup({ json, forceOverwrite });
    toast.success("Dados sincronizados com sucesso!");
    setTimeout(() => window.location.reload(), 2000);
  };

  const handlePull = useCallback(async () => {
    setPulling(true);
    try {
      const url = await scanQRNative();
      if (!url) return;

      // Teste rápido de ping antes de transferir
      const baseMatch = url.match(/^(https?:\/\/[^\/]+)/);
      const pingUrl = baseMatch ? `${baseMatch[1]}/api/sync/ping` : null;
      if (pingUrl) {
        try {
          await nativeFetch(pingUrl, { method: "GET", timeoutMs: 6000 });
        } catch {
          throw new Error(
            `Não foi possível conectar ao PC (${baseMatch?.[1]}). Verifique se o computador e o celular estão no mesmo Wi-Fi e se o SOE está aberto no PC.`,
          );
        }
      }

      setSyncProgress({
        active: true,
        percent: 15,
        title: "Conectando ao PC...",
        description: "Estabelecendo comunicação segura via rede Wi-Fi/local",
      });

      const res = await nativeFetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        timeoutMs: 120000,
      });
      if (res.status < 200 || res.status >= 300) {
        const errDetail =
          res.data?.message ||
          res.data?.error ||
          `Erro de resposta do PC (HTTP ${res.status})`;
        throw new Error(errDetail);
      }

      setSyncProgress({
        active: true,
        percent: 45,
        title: "Processando e Mesclando Dados...",
        description:
          "Unificando questões, revisões, matérias e conversas de IA",
      });

      const json =
        typeof res.data === "string" ? res.data : JSON.stringify(res.data);

      const { localImportImportBackup, localImportExportBackup } =
        await import("@/lib/localDb");
      recordSyncStats((res.data as any)?.stats, "pull");
      await localImportImportBackup({ json });

      setSyncProgress({
        active: true,
        percent: 75,
        title: "Sincronizando de volta ao PC...",
        description:
          "Garantindo 100% de paridade bidirecional em ambos os lados",
      });

      // Sincroniza de volta para o PC automaticamente para paridade imediata
      try {
        const mergedJson = await localImportExportBackup();
        const pushUrl = url.replace("/export", "/receive");
        await nativeFetch(pushUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          data: mergedJson,
          timeoutMs: 120000,
        });
      } catch (pushErr) {
        console.warn("Could not sync back to PC:", pushErr);
      }

      setSyncProgress({
        active: true,
        percent: 100,
        title: "Sincronização 100% Concluída!",
        description: "Todos os dados foram unificados no PC e no celular",
      });

      toast.success("Sincronização concluída com sucesso!");
      setTimeout(() => window.location.reload(), 2000);
    } catch (e: any) {
      setSyncProgress(null);
      toast.error(e.message || "Erro na sincronização");
    } finally {
      setPulling(false);
    }
  }, [nativeFetch]);

  const handlePush = useCallback(async () => {
    setPushing(true);
    try {
      const url = await scanQRNative();
      if (!url) return;

      // Teste rápido de ping antes de transferir dados grandes
      const baseMatch = url.match(/^(https?:\/\/[^\/]+)/);
      const pingUrl = baseMatch ? `${baseMatch[1]}/api/sync/ping` : null;
      if (pingUrl) {
        try {
          await nativeFetch(pingUrl, { method: "GET", timeoutMs: 6000 });
        } catch {
          throw new Error(
            `Não foi possível conectar ao PC (${baseMatch?.[1]}). Verifique se o computador e o celular estão no mesmo Wi-Fi e se o SOE está aberto no PC.`,
          );
        }
      }

      setSyncProgress({
        active: true,
        percent: 20,
        title: "Empacotando Dados do Celular...",
        description: "Lendo matérias, temas, erros, conversas e estatísticas",
      });

      const { localImportExportBackup, localImportImportBackup } =
        await import("@/lib/localDb");
      const json = await localImportExportBackup();

      setSyncProgress({
        active: true,
        percent: 50,
        title: "Transmitindo ao PC...",
        description: "Enviando dados para o computador via rede local",
      });

      const res = await nativeFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: json,
        timeoutMs: 120000,
      });
      if (res.status < 200 || res.status >= 300) {
        const errDetail =
          res.data?.message ||
          res.data?.error ||
          (res.status === 413
            ? "O envio ultrapassa o limite máximo de 1 GB. Reduza os dados antes de sincronizar."
            : `Erro retornado pelo PC (HTTP ${res.status})`);
        throw new Error(errDetail);
      }

      setSyncProgress({
        active: true,
        percent: 80,
        title: "Gravando Paridade no Celular...",
        description: "Atualizando este dispositivo com a mescla final do PC",
      });

      // Se o PC devolveu o banco completo mesclado, salva no celular para paridade total!
      let respData = res.data;
      if (typeof respData === "string") {
        try {
          respData = JSON.parse(respData);
        } catch {}
      }
      recordSyncStats(respData?.stats, "push");
      if (respData?.database) {
        await localImportImportBackup({
          json:
            typeof respData.database === "string"
              ? respData.database
              : JSON.stringify(respData.database),
          forceOverwrite: true,
        });
      }

      setSyncProgress({
        active: true,
        percent: 100,
        title: "Sincronização 100% Concluída!",
        description: "Celular e PC estão com dados exatamente iguais",
      });

      toast.success("Dados enviados e sincronizados em ambos!");
      setTimeout(() => window.location.reload(), 2000);
    } catch (e: any) {
      setSyncProgress(null);
      toast.error(e.message || "Erro no envio");
    } finally {
      setPushing(false);
    }
  }, [nativeFetch]);

  const handleExportFile = async () => {
    try {
      let json = "";
      if (isDesktop) {
        json = await trpcUtils.import.exportBackup.fetch();
      } else {
        const { localImportExportBackup } = await import("@/lib/localDb");
        json = await localImportExportBackup();
      }

      // Validação dura: nunca deixa baixar um backup vazio.
      let parsedBackup: any = null;
      try {
        parsedBackup = JSON.parse(json);
      } catch {
        throw new Error("O backup gerado não é um JSON válido.");
      }
      const users = Array.isArray(parsedBackup?.users)
        ? parsedBackup.users.length
        : 0;
      const disciplines = Array.isArray(parsedBackup?.disciplines)
        ? parsedBackup.disciplines.length
        : 0;
      const topics = Array.isArray(parsedBackup?.topics)
        ? parsedBackup.topics.length
        : 0;
      const errors = Array.isArray(parsedBackup?.questionErrors)
        ? parsedBackup.questionErrors.length
        : 0;
      if (users === 0 && disciplines === 0 && topics === 0 && errors === 0) {
        throw new Error(
          "O backup veio vazio. O banco deste dispositivo pode estar sem dados; abra o sistema no desktop e exporte de lá.",
        );
      }
      const fileName = `soe-backup-${new Date().toISOString().split("T")[0]}.json`;

      // No Android/APK nativo: Abre o compartilhador do sistema (WhatsApp, Drive, Email, Arquivos)
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");

        await Filesystem.writeFile({
          path: fileName,
          data: json,
          directory: Directory.Cache,
          encoding: "utf8" as any,
        });

        const fileUri = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Cache,
        });

        await Share.share({
          title: "Exportar Banco de Dados SOE",
          text: "Backup do banco de dados do SOE Concursos.",
          url: fileUri.uri,
          dialogTitle: "Salvar ou compartilhar backup",
        });
        toast.success("Opções de compartilhamento abertas!");
        return;
      }

      // No navegador com suporte a Web Share API
      const blob = new Blob([json], { type: "application/json" });
      const file = new File([blob], fileName, { type: "application/json" });

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: "Backup do SOE Concursos",
          files: [file],
        });
        return;
      }

      // Download direto padrão para Desktop
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Backup baixado: ${disciplines} disciplinas, ${topics} temas, ${errors} erros.`,
      );
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (
        msg.includes("cancel") ||
        msg.includes("dismiss") ||
        msg.includes("abort")
      ) {
        return;
      }
      toast.error("Erro ao exportar: " + msg);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    try {
      const json = await file.text();
      if (isDesktop) {
        await importBackupMutation.mutateAsync({ json, fileName: file.name });
      } else {
        const { localImportImportBackup } = await import("@/lib/localDb");
        await localImportImportBackup({ json });
      }
      toast.success("Banco de dados importado com sucesso!");
      refetchHistory();
      setTimeout(() => window.location.reload(), 5000);
    } catch (err: any) {
      toast.error(err.message || "Arquivo inválido ou vazio");
    } finally {
      setImportLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleImportFromLink = async () => {
    if (!driveUrl) return;
    setLinkImportLoading(true);
    try {
      let fileId = "";
      const m1 = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const m2 = driveUrl.match(/id=([a-zA-Z0-9_-]+)/);
      fileId = m1 ? m1[1] : m2 ? m2[1] : "";
      if (!fileId) throw new Error("Link inválido");

      const res = await fetch(
        `https://drive.google.com/uc?export=download&id=${fileId}`,
      );
      if (!res.ok) throw new Error("Acesso negado ao arquivo");
      const json = await res.text();
      const { localImportImportBackup } = await import("@/lib/localDb");
      await localImportImportBackup({ json });
      toast.success("Sincronizado com a nuvem!");
      setTimeout(() => window.location.reload(), 5000);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLinkImportLoading(false);
      setDriveUrl("");
    }
  };

  const FlipQRCard = ({
    title,
    subtitle,
    icon: Icon,
    iconColor,
    qrUrl,
    loading,
    footerAction,
  }: {
    title: string;
    subtitle: string;
    icon: any;
    iconColor: string;
    qrUrl: string;
    loading: boolean;
    footerAction?: React.ReactNode;
  }) => {
    return (
      <div className="soe-card p-6 flex flex-col items-center justify-between border-2 border-transparent hover:border-[var(--primary-border)] transition-all min-h-[420px]">
        {/* Top Header */}
        <div className="flex items-center justify-between w-full mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="p-2 rounded-lg"
              style={{ background: `${iconColor}15` }}
            >
              <Icon size={18} style={{ color: iconColor }} />
            </div>
            <span
              className="font-black text-sm uppercase tracking-wider"
              style={{ color: "var(--app-fg)" }}
            >
              {title}
            </span>
          </div>
          <span className="text-[9px] uppercase tracking-widest font-black text-[var(--primary)] bg-[var(--primary)]/10 px-2 py-0.5 rounded-full border border-[var(--primary)]/20">
            Pronto para leitura
          </span>
        </div>

        {/* QR Code Center Display */}
        <div className="flex-1 flex flex-col items-center justify-center w-full my-2">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <RefreshCw
                size={36}
                className="text-[var(--primary)] animate-spin opacity-50"
              />
              <span className="text-[10px] uppercase font-bold tracking-widest text-white/50">
                Gerando QR Code...
              </span>
            </div>
          ) : qrUrl ? (
            <div className="p-3 bg-white rounded-2xl shadow-2xl border-4 border-white/90 animate-in zoom-in-95 duration-300">
              <img
                src={qrUrl}
                alt={title}
                className="w-44 h-44 md:w-48 md:h-48 block object-contain"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-rose-500/70 p-6 rounded-2xl border border-rose-500/20 bg-rose-500/5">
              <AlertCircle size={32} />
              <span className="text-[10px] uppercase font-bold tracking-widest text-center">
                Aguardando conexão com a rede...
              </span>
            </div>
          )}
        </div>

        {/* Instructions & Subtitle */}
        <p className="text-[11px] text-center opacity-60 max-w-xs my-2 font-medium leading-relaxed">
          {subtitle}
        </p>

        {/* Action Button & Instructions Footer */}
        <div className="w-full space-y-2 mt-2">
          {footerAction}
          <p className="text-[9px] text-center uppercase tracking-widest opacity-40 font-black">
            Aponte a câmera do celular no app SOE
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 pb-12">
      <PageHeader
        eyebrow="Continuidade"
        title="Sync & Backup"
        description="Transfira entre desktop e celular, exporte arquivos e mantenha cópias de segurança."
        actions={
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/40 border border-border/70">
            <div className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-pulse" />
            <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">
              {isDesktop ? "Terminal host ativo" : "Cliente mobile"}
            </span>
          </div>
        }
      />

      {dataHealth && (
        <div className="grid grid-cols-2 gap-3 px-2 lg:grid-cols-4">
          <div className="soe-card flex items-center gap-3 p-3">
            <ShieldCheck
              className={`h-5 w-5 flex-shrink-0 ${dataHealth.healthy ? "text-emerald-500" : "text-amber-500"}`}
            />
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                Estado dos dados
              </p>
              <p className="text-[12px] font-semibold">
                {dataHealth.healthy ? "Consistente" : "Revisar"}
              </p>
            </div>
          </div>
          <div className="soe-card p-3">
            <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
              Disciplinas duplicadas
            </p>
            <p className="text-[16px] font-semibold tabular-nums">
              {dataHealth.duplicateDisciplines}
            </p>
          </div>
          <div className="soe-card p-3">
            <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
              Tópicos órfãos
            </p>
            <p className="text-[16px] font-semibold tabular-nums">
              {dataHealth.orphanTopics}
            </p>
          </div>
          <div className="soe-card p-3">
            <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
              Revisões órfãs
            </p>
            <p className="text-[16px] font-semibold tabular-nums">
              {dataHealth.orphanRevisions}
            </p>
          </div>
        </div>
      )}

      {lastSync && (
        <div className="soe-card mx-2 flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
              Última sincronização
            </p>
            <p className="mt-0.5 text-[10.5px]">
              {lastSync.direction === "pull"
                ? "Recebida do PC"
                : "Enviada ao PC"}{" "}
              · {new Date(lastSync.at).toLocaleString("pt-BR")}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-[9px] text-muted-foreground">
            <span>
              <b className="text-foreground">
                {lastSync.disciplinesCount ?? 0}
              </b>{" "}
              disciplinas
            </span>
            <span>
              <b className="text-foreground">{lastSync.topicsCount ?? 0}</b>{" "}
              tópicos
            </span>
            <span>
              <b className="text-foreground">
                {lastSync.questionErrorsCount ?? 0}
              </b>{" "}
              erros
            </span>
            <span>
              <b className="text-foreground">{lastSync.revisionsCount ?? 0}</b>{" "}
              revisões
            </span>
            {typeof lastSync.overlapDisciplines === "number" && (
              <span className="text-[8.5px]">
                sobreposições: {lastSync.overlapDisciplines} disc ·{" "}
                {lastSync.overlapTopics} tóp · {lastSync.overlapErrors} err
              </span>
            )}
          </div>
        </div>
      )}

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
                <h2
                  className="text-xl font-black"
                  style={{ color: "var(--app-fg)" }}
                >
                  Sincronização Direta
                </h2>
                <p className="text-xs opacity-50">
                  Transfira dados instantaneamente via Wi-Fi.
                </p>
              </div>
            </div>

            {isDesktop ? (
              <div className="space-y-8">
                {syncInfo && syncInfo.ips.length > 0 ? (
                  <>
                    <div className="p-6 rounded-2xl bg-gradient-to-br from-[var(--primary-bg-subtle)]/30 to-transparent border border-[var(--primary-border)] flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Globe className="w-6 h-6 text-[var(--primary)]" />
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-widest opacity-40 mb-1">
                              Endereço de Rede
                            </p>
                            <code className="text-lg font-black">
                              {selectedIp}:{syncInfo.port}
                            </code>
                          </div>
                        </div>
                        {(() => {
                          const currentDetail = syncInfo.details?.find(
                            (d) => d.address === selectedIp,
                          );
                          const isVirt =
                            currentDetail?.isVirtual ||
                            selectedIp.startsWith("172.");
                          return isVirt ? (
                            <span className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              ⚠️ Virtual (WSL)
                            </span>
                          ) : (
                            <span className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              ✓ Wi-Fi Física
                            </span>
                          );
                        })()}
                      </div>

                      {syncInfo.ips.length > 1 && (
                        <div className="pt-3 border-t border-border/70">
                          <p className="text-[10px] uppercase font-bold opacity-40 mb-2">
                            Placas de rede disponíveis:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {syncInfo.ips.map((ip) => {
                              const detail = syncInfo.details?.find(
                                (d) => d.address === ip,
                              );
                              const isVirt =
                                detail?.isVirtual || ip.startsWith("172.");
                              const isSelected = selectedIp === ip;
                              return (
                                <button
                                  key={ip}
                                  onClick={() => setSelectedIp(ip)}
                                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all border flex items-center gap-2 ${
                                    isSelected
                                      ? "bg-[var(--primary)] text-white border-transparent shadow-sm"
                                      : "bg-secondary/40 text-white/70 border-border hover:bg-secondary/60"
                                  }`}
                                >
                                  <span className="font-mono">{ip}</span>
                                  {isVirt ? (
                                    <span className="text-[9px] opacity-70">
                                      Virtual
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-emerald-400">
                                      Recomendado
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {(() => {
                        const currentDetail = syncInfo.details?.find(
                          (d) => d.address === selectedIp,
                        );
                        const isVirt =
                          currentDetail?.isVirtual ||
                          selectedIp.startsWith("172.");
                        if (!isVirt) return null;
                        return (
                          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                            <strong>⚠️ Aviso:</strong> Este IP é virtual
                            (WSL/Hyper-V). O celular não conseguirá conectar.
                            Selecione o IP da sua placa Wi-Fi física (geralmente
                            192.168.x.x).
                          </div>
                        );
                      })()}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FlipQRCard
                        title="PC → Celular"
                        subtitle="Escaneie no celular para receber dados do PC"
                        icon={ArrowDownToLine}
                        iconColor="var(--accent-green)"
                        qrUrl={qrPullUrl}
                        loading={qrLoading}
                      />
                      <FlipQRCard
                        title="Celular → PC"
                        subtitle="Escaneie no celular para enviar dados ao PC"
                        icon={ArrowUpFromLine}
                        iconColor="var(--primary)"
                        qrUrl={qrPushUrl}
                        loading={qrLoading}
                        footerAction={
                          <button
                            onClick={startListening}
                            disabled={waitingReceive}
                            className={`w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all border ${received ? "bg-[var(--accent-green)] text-white border-[var(--accent-green)]" : "bg-secondary/40 text-muted-foreground border-border/70 hover:bg-secondary/60"}`}
                          >
                            {received
                              ? "✓ Dados recebidos"
                              : waitingReceive
                                ? "Aguardando envio..."
                                : "Modo de recebimento"}
                          </button>
                        }
                      />
                    </div>

                    <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200">
                      <strong>💡 Dica:</strong> Após escanear e completar a
                      transferência, ambos os dispositivos terão os dados
                      sincronizados automaticamente. Não é necessário fazer nos
                      dois sentidos.
                    </div>
                  </>
                ) : (
                  <div className="p-12 text-center bg-secondary/40 rounded-[2rem] border-2 border-dashed border-border">
                    <Wifi size={40} className="mx-auto mb-4 opacity-20" />
                    <p className="text-sm font-bold opacity-40">
                      Nenhuma rede Wi-Fi detectada.
                    </p>
                    <p className="text-xs opacity-30 mt-2">
                      Verifique se o PC está conectado à rede.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200">
                  <strong>📱 Como sincronizar:</strong> Abra o SOE no PC, vá em
                  Sync & Backup, e escaneie o QR Code desejado com a câmera
                  deste celular.
                </div>

                <div className="grid gap-4">
                  <button
                    onClick={handlePull}
                    disabled={pulling}
                    className="group relative flex items-center justify-between p-6 rounded-[2rem] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xl shadow-[var(--primary-shadow)] active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[var(--primary-foreground)]/20 flex items-center justify-center">
                        {pulling ? (
                          <RefreshCw className="animate-spin" />
                        ) : (
                          <Camera />
                        )}
                      </div>
                      <div className="text-left">
                        <p className="font-black text-lg">Receber do PC</p>
                        <p className="text-xs opacity-70">
                          Escaneie o QR Code "PC → Celular" no PC
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="opacity-40 group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button
                    onClick={handlePush}
                    disabled={pushing}
                    className="group relative flex items-center justify-between p-6 rounded-[2rem] bg-secondary/40 border border-border hover:bg-secondary/60 active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[var(--primary-bg-subtle)] flex items-center justify-center text-[var(--primary)]">
                        {pushing ? (
                          <RefreshCw className="animate-spin" />
                        ) : (
                          <Camera />
                        )}
                      </div>
                      <div className="text-left">
                        <p
                          className="font-black text-lg"
                          style={{ color: "var(--app-fg)" }}
                        >
                          Enviar ao PC
                        </p>
                        <p className="text-xs opacity-50">
                          Escaneie o QR Code "Celular → PC" no PC
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="opacity-20 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="soe-card p-5">
            <div className="mb-3 flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-accent-green" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest">
                Saúde dos dados
              </h2>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                  dataHealth?.healthy
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-amber-500/10 text-amber-500"
                }`}
              >
                {dataHealth?.healthy ? "Consistente" : "Revisar"}
              </span>
            </div>
            {dataHealth?.healthy ? (
              <p className="text-[11px] text-muted-foreground">
                Nenhuma duplicata ou referência órfã encontrada.
              </p>
            ) : (
              <div className="space-y-1 text-[10px] text-muted-foreground">
                {dataHealth && (
                  <>
                    <p>
                      {dataHealth.duplicateDisciplines} disciplinas duplicadas
                    </p>
                    <p>{dataHealth.duplicateTopics} tópicos duplicados</p>
                    <p>{dataHealth.orphanTopics} tópicos sem disciplina</p>
                    <p>{dataHealth.orphanRevisions} revisões sem tópico</p>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowAdvanced((value) => !value)}
            className="soe-card flex w-full items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <Cloud className="h-5 w-5 text-sky-500" />
              <div>
                <p className="text-xs font-bold">Opções avançadas de nuvem</p>
                <p className="text-[10px] text-muted-foreground">
                  Importar backup por link do Google Drive.
                </p>
              </div>
            </div>
            <ChevronRight
              size={16}
              className={`text-muted-foreground transition-transform ${showAdvanced ? "rotate-90" : ""}`}
            />
          </button>

          {/* Cloud Restoration */}
          {showAdvanced && (
            <div className="soe-card p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-sky-500" />
                </div>
                <div>
                  <h2
                    className="text-xl font-black"
                    style={{ color: "var(--app-fg)" }}
                  >
                    Backup em Nuvem
                  </h2>
                  <p className="text-xs opacity-50">
                    Compartilhe ou restaure backups via Google Drive e outros
                    serviços.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Cole o link do Google Drive..."
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    className="flex-1 px-5 py-4 rounded-2xl text-sm outline-none transition-all focus:ring-2 focus:ring-sky-500/50"
                    style={{
                      background: "var(--input-bg)",
                      border: "1px solid var(--card-border)",
                      color: "var(--app-fg)",
                    }}
                  />
                  <button
                    onClick={handleImportFromLink}
                    disabled={linkImportLoading || !driveUrl}
                    className="px-6 rounded-2xl bg-sky-500 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-sky-500/20 hover:opacity-90 transition-all flex items-center gap-2"
                  >
                    {linkImportLoading ? (
                      <RefreshCw className="animate-spin w-4 h-4" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Importar
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-secondary/40 border border-border/70 text-xs opacity-60">
                  <p className="mb-2">
                    💡 <strong>Alternativas de compartilhamento:</strong>
                  </p>
                  <ul className="space-y-1 ml-4 list-disc">
                    <li>
                      Use o botão "Exportar" abaixo para salvar o arquivo JSON
                    </li>
                    <li>
                      No Android, o compartilhador do sistema permite enviar
                      para WhatsApp, Email, Google Drive, etc.
                    </li>
                    <li>
                      No PC, o arquivo é baixado diretamente para sua pasta
                      Downloads
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Files & Automation */}
        <div className="lg:col-span-4 space-y-8">
          {/* File Backup */}
          <div className="soe-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-amber)]/10 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-[var(--accent-amber)]" />
              </div>
              <h2
                className="font-black text-sm uppercase tracking-wider"
                style={{ color: "var(--app-fg)" }}
              >
                Arquivo Local
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleExportFile}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-secondary/40 border border-border/70 hover:bg-secondary/60 transition-all"
              >
                <Share2 className="text-[var(--primary)]" />
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                  Exportar
                </span>
              </button>
              <label className="cursor-pointer">
                <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-secondary/40 border border-border/70 hover:bg-secondary/60 transition-all">
                  <Upload className="text-[var(--accent-green)]" />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                    {importLoading ? "Carregando" : "Importar"}
                  </span>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImportFile}
                />
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
                  <h2
                    className="font-black text-sm uppercase tracking-wider"
                    style={{ color: "var(--app-fg)" }}
                  >
                    Histórico
                  </h2>
                </div>
                <button
                  onClick={() => {
                    runAutoBackup();
                    fetchBackups();
                    checkCloudSync();
                    refetchHistory();
                  }}
                  className="p-2 rounded-lg hover:bg-secondary/40 text-muted-foreground transition-colors"
                >
                  <RotateCw size={16} />
                </button>
              </div>

              {cloudSyncData?.hasNewerOnline && (
                <div className="mb-4 p-3 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Globe size={14} className="text-[var(--primary)]" />
                    <span className="text-xs font-bold text-[var(--primary)]">
                      Nuvem tem dados mais recentes!
                    </span>
                  </div>
                  <button
                    disabled={pullingCloud}
                    onClick={async () => {
                      setPullingCloud(true);
                      try {
                        await pullFromSupabaseMutation.mutateAsync();
                        toast.success("Dados puxados da nuvem!");
                        setTimeout(() => window.location.reload(), 800);
                      } catch (e: any) {
                        toast.error(e.message || "Erro ao puxar dados");
                      } finally {
                        setPullingCloud(false);
                      }
                    }}
                    className="py-2 text-[10px] font-black uppercase tracking-widest bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:brightness-110 disabled:opacity-50"
                  >
                    {pullingCloud ? "Baixando..." : "Puxar da Nuvem"}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <button
                  disabled={pushingCloud}
                  onClick={async () => {
                    setPushingCloud(true);
                    try {
                      await syncToSupabaseMutation.mutateAsync();
                      toast.success("Dados enviados para nuvem!");
                      checkCloudSync();
                    } catch (e: any) {
                      toast.error(e.message || "Erro ao sincronizar");
                    } finally {
                      setPushingCloud(false);
                    }
                  }}
                  className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest bg-secondary/40 hover:bg-secondary/60 text-white rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <Cloud size={14} />
                  {pushingCloud ? "Enviando..." : "Salvar na Nuvem"}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {backupLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-14 rounded-xl bg-secondary/40 animate-pulse"
                    />
                  ))
                ) : backups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 opacity-20">
                    <Info size={32} />
                    <p className="text-xs font-bold mt-2">Sem backups</p>
                  </div>
                ) : (
                  backups.map((b) => (
                    <div
                      key={b.name}
                      className="group flex items-center gap-4 p-4 rounded-xl bg-secondary/20 border border-border/70 hover:bg-secondary/40 transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[var(--accent-green)]/10 flex items-center justify-center text-[var(--accent-green)]">
                        <ShieldCheck size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center justify-between">
                          <span>{b.date}</span>
                          {b.size !== undefined && (
                            <span className="text-[9px] text-[var(--accent-green)]">
                              {(b.size / 1024).toFixed(1)} KB
                              {b.size > 1024 * 1024 &&
                                ` (${(b.size / (1024 * 1024)).toFixed(1)} MB)`}
                            </span>
                          )}
                        </p>
                        <p
                          className="text-xs font-bold truncate"
                          style={{ color: "var(--app-fg)" }}
                          title={b.name}
                        >
                          {b.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={async () => {
                            if (
                              !confirm(
                                "Restaurar este backup? Os dados atuais serão apagados.",
                              )
                            )
                              return;
                            try {
                              toast.info(
                                "Iniciando restauração do histórico...",
                              );
                              await importLocalMutation.mutateAsync({
                                name: b.name,
                                source: b.source,
                              });
                              toast.success("Backup restaurado!");
                              setTimeout(() => window.location.reload(), 800);
                            } catch (e: any) {
                              toast.error(e.message);
                            }
                          }}
                          className="p-1.5 hover:bg-secondary/60 rounded-md text-white/70"
                          title="Importar"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={async () => {
                            if (
                              !confirm(
                                "Sincronizar este arquivo de backup específico com a nuvem? Isso substituirá o backup atual na nuvem.",
                              )
                            )
                              return;
                            try {
                              await syncLocalBackupToSupabaseMutation.mutateAsync(
                                { name: b.name, source: b.source },
                              );
                              toast.success("Arquivo enviado para nuvem!");
                              checkCloudSync();
                            } catch (e: any) {
                              toast.error(e.message);
                            }
                          }}
                          className="p-1.5 hover:bg-[var(--primary)]/20 rounded-md text-[var(--primary)]"
                          title="Sincronizar com Nuvem"
                        >
                          <Cloud size={14} />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm("Excluir este backup local?")) return;
                            try {
                              await deleteLocalMutation.mutateAsync({
                                name: b.name,
                                source: b.source,
                              });
                              toast.success("Excluído!");
                              fetchBackups();
                            } catch (e: any) {
                              toast.error(e.message);
                            }
                          }}
                          className="p-1.5 hover:bg-red-500/20 rounded-md text-red-400"
                          title="Excluir"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}

                {/* Operations History */}
                {syncHistory && syncHistory.length > 0 && (
                  <div className="mt-8 space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40 px-2">
                      Ações Recentes
                    </h3>
                    {syncHistory.map((h, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.01] border border-border/70"
                      >
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center ${h.type === "upload" ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-400"}`}
                        >
                          {h.type === "upload" ? (
                            <ArrowUpFromLine size={10} />
                          ) : (
                            <ArrowDownToLine size={10} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold truncate">
                            {h.fileName ||
                              (h.type === "upload" ? "Upload" : "Download")}
                          </p>
                          <p className="text-[9px] opacity-30 uppercase">
                            {new Date(h.date).toLocaleString("pt-BR")}
                          </p>
                        </div>
                        <div
                          className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${h.status === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}
                        >
                          {h.status === "success" ? "OK" : "Erro"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 pt-6 border-t border-border/70">
                <p className="text-[9px] font-black uppercase tracking-widest opacity-20 text-center leading-relaxed">
                  Backups retidos por 30 dias
                  <br />
                  em ./userData/data/backups
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delta Comparison Modal */}
      <AnimatePresence>
        {delta && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="soe-card max-w-lg w-full p-8 space-y-8 shadow-[0_0_50px_rgba(var(--primary-rgb),0.3)]"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-500/20 rounded-2xl border border-amber-500/30">
                  <ShieldCheck className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <h2
                    className="text-xl font-black uppercase tracking-widest"
                    style={{ color: "var(--app-fg)" }}
                  >
                    Conflito de Dados
                  </h2>
                  <p className="text-xs opacity-50">
                    Detectamos volumes diferentes de estudo.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-secondary/40 border border-border/70">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-2">
                    Seu Dispositivo
                  </p>
                  <p
                    className="text-lg font-black"
                    style={{ color: "var(--app-fg)" }}
                  >
                    {delta.local.revisions} Revisões
                  </p>
                  <p className="text-[10px] opacity-40">
                    {delta.local.topics} Tópicos
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-[var(--primary)]/10 border border-[var(--primary)]/20">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--primary)] mb-2">
                    Backup Remoto
                  </p>
                  <p className="text-lg font-black text-[var(--primary)]">
                    {delta.remote.revisions} Revisões
                  </p>
                  <p className="text-[10px] text-[var(--primary)] opacity-60">
                    {delta.remote.topics} Tópicos
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => confirmImport(delta.remote.json)}
                  className="w-full py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)] active:scale-95 transition-all"
                >
                  Substituir pelos dados do PC
                </button>
                <button
                  onClick={() => setDelta(null)}
                  className="w-full py-4 rounded-2xl bg-secondary/40 text-muted-foreground font-black text-xs uppercase tracking-widest hover:text-foreground transition-all"
                >
                  Cancelar Importação
                </button>
              </div>

              <p className="text-[9px] text-center opacity-30 leading-relaxed uppercase tracking-tighter">
                Atenção: Ao confirmar, os dados locais deste celular serão
                APAGADOS
                <br />e substituídos integralmente pelo conteúdo do backup.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Modal de Progresso com Porcentagem em Tempo Real */}
      <AnimatePresence>
        {syncProgress && syncProgress.active && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="w-full max-w-md p-6 rounded-3xl bg-[#12141a] border border-border shadow-2xl space-y-6 text-white"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)]">
                    <RefreshCw
                      className={`w-5 h-5 ${syncProgress.percent < 100 ? "animate-spin" : ""}`}
                    />
                  </div>
                  <div>
                    <h3 className="text-base font-black tracking-tight">
                      {syncProgress.title}
                    </h3>
                    <p className="text-xs opacity-60">
                      {syncProgress.description}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-[var(--primary)] font-mono">
                    {syncProgress.percent}%
                  </span>
                </div>
              </div>

              {/* Barra de Progresso Animada */}
              <div className="h-3 w-full bg-secondary/60 rounded-full overflow-hidden p-0.5 border border-border/70">
                <motion.div
                  className="h-full bg-gradient-to-r from-[var(--primary)] to-emerald-400 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${syncProgress.percent}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>

              {/* Checklist de Itens Sincronizados */}
              <div className="space-y-2 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">
                  Status da Unificação de Dados
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    "Disciplinas & Temas",
                    "Questões Resolvidas",
                    "Caderno de Erros",
                    "Calendário & Revisões",
                    "Anotações & Flashcards",
                    "Conversas de IA & Editais",
                  ].map((item, idx) => {
                    const isDone =
                      syncProgress.percent >= 25 + idx * 12 ||
                      syncProgress.percent === 100;
                    return (
                      <div
                        key={item}
                        className={`p-2 rounded-xl flex items-center gap-2 border transition-all ${
                          isDone
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : "bg-secondary/40 border-border/70 opacity-40"
                        }`}
                      >
                        <CheckCircle2
                          size={14}
                          className={isDone ? "text-emerald-400" : "opacity-30"}
                        />
                        <span className="text-[11px] font-semibold truncate">
                          {item}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-secondary/40 border border-border/70 text-[11px] opacity-60 text-center">
                {syncProgress.percent < 100
                  ? "Não feche o aplicativo durante a sincronização..."
                  : "✓ Concluído! Recarregando para aplicar novos dados..."}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
