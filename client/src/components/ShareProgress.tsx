import { useRef, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Share2,
  Download,
  X,
  RefreshCw,
  Sparkles,
  ImageIcon,
} from "lucide-react";
import { useTheme, COLOR_THEMES } from "@/contexts/ThemeContext";

interface ShareProgressProps {
  onClose: () => void;
}

const TEMPLATES = [
  { id: "modern", label: "Moderno" },
  { id: "minimal", label: "Minimalista" },
  { id: "bold", label: "Impactante" },
];

export function ShareProgress({ onClose }: ShareProgressProps) {
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: weekly } = trpc.dashboard.getWeeklyStats.useQuery();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const { colorTheme, darkMode } = useTheme();
  const [template, setTemplate] = useState<"modern" | "minimal" | "bold">(
    "modern",
  );

  // ── helpers ────────────────────────────────────────────────────────
  function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawGlassCard(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    bg: string,
    border: string,
  ) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.15)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
  }

  // ── main generator ──────────────────────────────────────────────────
  const generateImage = async () => {
    if (!stats || !canvasRef.current) return;
    setGenerating(true);

    const canvas = canvasRef.current;
    const W = 1080,
      H = 1350;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    const cfg = COLOR_THEMES[colorTheme];
    const primary = darkMode === "dark" ? cfg.dark : cfg.light;
    const isDark = darkMode === "dark";

    const disciplines = stats.disciplineStats || [];
    const totalQ = disciplines.reduce(
      (s: any, d: any) => s + (d.performance?.questionsResolved || 0),
      0,
    );
    const totalC = disciplines.reduce(
      (s: any, d: any) => s + (d.performance?.correctCount || 0),
      0,
    );
    const accuracy = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0;
    const totalTime = disciplines.reduce(
      (s: any, d: any) => s + (d.studyTimeSeconds || 0),
      0,
    );
    const hours = Math.floor(totalTime / 3600);
    const mins = Math.floor((totalTime % 3600) / 60);

    const textColor = isDark ? "#ffffff" : "#1e293b";
    const subColor = isDark ? "#94a3b8" : "#64748b";

    if (template === "modern") {
      // ── MODERN TEMPLATE ──────────────────────────────────────────────
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, isDark ? "#0a0f1d" : "#f8faff");
      bg.addColorStop(1, isDark ? "#02040a" : "#f1f5f9");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Orbs
      const drawOrb = (x: number, y: number, r: number, op: string) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, primary + op);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      };
      drawOrb(W * 0.8, H * 0.1, 600, "15");
      drawOrb(W * 0.2, H * 0.9, 500, "10");

      // Grid
      ctx.save();
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
      for (let i = 0; i < W; i += 60) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, H);
        ctx.stroke();
      }
      for (let j = 0; j < H; j += 60) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(W, j);
        ctx.stroke();
      }
      ctx.restore();

      // Header
      ctx.fillStyle = primary;
      roundRect(ctx, 64, 64, 80, 80, 24);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "bold 44px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("S", 64 + 40, 64 + 56);
      ctx.textAlign = "left";

      ctx.fillStyle = primary;
      ctx.font = "bold 64px system-ui";
      ctx.fillText("SOE", 164, 110);
      ctx.fillStyle = textColor;
      ctx.font = "300 40px system-ui";
      ctx.fillText("Relatório de Progresso", 164, 155);

      // Date
      ctx.fillStyle = subColor;
      ctx.font = "28px system-ui";
      ctx.fillText(
        new Date().toLocaleDateString("pt-BR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        64,
        210,
      );

      // Main Circle
      const hX = W / 2,
        hY = 480,
        hR = 200;
      ctx.beginPath();
      ctx.arc(hX, hY, hR, 0, Math.PI * 2);
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
      ctx.lineWidth = 30;
      ctx.stroke();

      if (accuracy > 0) {
        ctx.beginPath();
        ctx.arc(
          hX,
          hY,
          hR,
          -Math.PI / 2,
          -Math.PI / 2 + (accuracy / 100) * Math.PI * 2,
        );
        ctx.strokeStyle = primary;
        ctx.lineWidth = 30;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      ctx.textAlign = "center";
      ctx.fillStyle = primary;
      ctx.font = "bold 130px system-ui";
      ctx.fillText(`${accuracy}%`, hX, hY + 45);
      ctx.fillStyle = subColor;
      ctx.font = "34px system-ui";
      ctx.fillText("Aproveitamento Geral", hX, hY + 105);
      ctx.textAlign = "left";

      // Cards
      const cards = [
        {
          l: "Tempo de Estudo",
          v: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
          i: "⏱️",
        },
        { l: "Questões Hoje", v: String(totalQ), i: "📝" },
        { l: "Disciplinas", v: String(disciplines.length), i: "📚" },
        {
          l: "Nesta Semana",
          v: weekly?.thisWeek?.questions
            ? `${weekly.thisWeek.questions} q`
            : "0 q",
          i: "📅",
        },
      ];

      const cW = (W - 128 - 40) / 2,
        cH = 240;
      cards.forEach((c, idx) => {
        const col = idx % 2,
          row = Math.floor(idx / 2);
        const x = 64 + col * (cW + 40),
          y = 780 + row * (cH + 40);
        drawGlassCard(
          ctx,
          x,
          y,
          cW,
          cH,
          32,
          isDark ? "rgba(30,41,59,0.5)" : "rgba(255,255,255,0.8)",
          isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
        );
        ctx.font = "50px system-ui";
        ctx.fillText(c.i, x + 32, y + 80);
        ctx.fillStyle = textColor;
        ctx.font = "bold 56px system-ui";
        ctx.fillText(c.v, x + 32, y + 150);
        ctx.fillStyle = subColor;
        ctx.font = "30px system-ui";
        ctx.fillText(c.l, x + 32, y + 200);
      });

      // Footer removed
    } else if (template === "minimal") {
      // ── MINIMAL TEMPLATE ─────────────────────────────────────────────
      ctx.fillStyle = isDark ? "#0f172a" : "#ffffff";
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = primary;
      ctx.font = "bold 200px system-ui";
      ctx.fillText("SOE", 64, 240);

      ctx.fillStyle = textColor;
      ctx.font = "300 60px system-ui";
      ctx.fillText("Relatório Mensal", 64, 320);

      const items = [
        { l: "Aproveitamento", v: `${accuracy}%` },
        { l: "Total Resolvidas", v: `${totalQ} questões` },
        { l: "Tempo total", v: hours > 0 ? `${hours}h ${mins}m` : `${mins}m` },
      ];

      items.forEach((item, i) => {
        const y = 450 + i * 160;
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
        roundRect(ctx, 64, y, W - 128, 130, 24);
        ctx.fill();
        ctx.fillStyle = primary;
        ctx.font = "bold 64px system-ui";
        ctx.fillText(item.v, 100, y + 85);
        ctx.fillStyle = textColor;
        ctx.font = "300 36px system-ui";
        ctx.textAlign = "right";
        ctx.fillText(item.l, W - 100, y + 80);
        ctx.textAlign = "left";
      });

      // Footer removed
    } else if (template === "bold") {
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.moveTo(0, H * 0.5);
      ctx.lineTo(W, H * 0.3);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.fill();

      ctx.fillStyle = "white";
      ctx.font = "black 160px system-ui";
      ctx.fillText("SOE", 64, 200);

      ctx.font = "bold 320px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${accuracy}%`, W / 2, 600);

      ctx.font = "bold 70px system-ui";
      ctx.fillText("DE APROVEITAMENTO", W / 2, 680);

      const bW = (W - 128 - 40) / 2,
        bH = 240;
      [
        { l: "QUESTÕES", v: String(totalQ) },
        { l: "HORAS", v: `${hours}h` },
      ].forEach((b, i) => {
        const x = 64 + i * (bW + 40);
        ctx.fillStyle = "white";
        roundRect(ctx, x, 780, bW, bH, 40);
        ctx.fill();
        ctx.fillStyle = primary;
        ctx.font = "black 100px system-ui";
        ctx.fillText(b.v, x + bW / 2, 910);
        ctx.font = "bold 34px system-ui";
        ctx.fillText(b.l, x + bW / 2, 970);
      });

      ctx.fillStyle = "white";
      ctx.font = "bold 36px system-ui";
      ctx.fillText("RUMO À APROVAÇÃO 🚀", W / 2, 1150);
    }

    setImageUrl(canvas.toDataURL("image/png"));
    setGenerating(false);
  };

  useEffect(() => {
    if (stats) {
      setImageUrl(null);
      setTimeout(() => generateImage(), 100);
    }
  }, [stats, template, colorTheme, darkMode]);

  const handleDownload = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `soe_progresso_${new Date().toISOString().split("T")[0]}.png`;
    a.click();
  };

  const handleShare = async () => {
    if (!imageUrl) return;
    try {
      const { Capacitor } = await import("@capacitor/core");
      const isNative = Capacitor.isNativePlatform();

      const byteString = atob(imageUrl.split(",")[1]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++)
        ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: "image/png" });

      if (isNative) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const base64 = imageUrl.split(",")[1];
        const fileName = `soe_progresso_${Date.now()}.png`;
        await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Cache,
        });
        const fileUri = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Cache,
        });
        await Share.share({
          title: "Meu progresso no SOE Estudos",
          text: "Confira meu progresso!",
          url: fileUri.uri,
          dialogTitle: "Compartilhar",
        });
        return;
      }

      const file = new File([blob], "soe_progresso.png", { type: "image/png" });
      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ title: "Meu progresso no SOE", files: [file] });
      } else {
        handleDownload();
      }
    } catch (e: any) {
      handleDownload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        className="w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col bg-slate-900 border border-white/10"
        style={{ maxHeight: "95vh" }}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-white/5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="font-black text-lg text-white">
              Compartilhar Progresso
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          <canvas ref={canvasRef} className="hidden" />

          <div className="flex gap-2 p-1 bg-white/5 rounded-2xl">
            {TEMPLATES.map((t: any) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id as any)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${template === t.id ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" : "text-slate-400 hover:text-white"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl overflow-hidden bg-black/40 border border-white/5 relative min-h-[300px] flex items-center justify-center">
            {generating ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-t-transparent border-amber-500 rounded-full animate-spin" />
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                  Criando Obra de Arte...
                </p>
              </div>
            ) : imageUrl ? (
              <img src={imageUrl} alt="Preview" className="w-full h-auto" />
            ) : (
              <div className="text-slate-500 flex flex-col items-center gap-2">
                <ImageIcon className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">Processando dados...</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => {
                setImageUrl(null);
                setTimeout(() => generateImage(), 50);
              }}
              className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/10 text-white transition-all hover:bg-white/10 active:scale-95"
            >
              <RefreshCw className="w-5 h-5 text-amber-400" />
              <span className="text-[10px] font-black uppercase">
                Atualizar
              </span>
            </button>
            <button
              onClick={handleShare}
              disabled={!imageUrl}
              className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-amber-500 text-white transition-all hover:bg-amber-600 active:scale-95 disabled:opacity-50 col-span-1"
            >
              <Share2 className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase">Enviar</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/10 text-white transition-all hover:bg-white/10 active:scale-95"
            >
              <Download className="w-5 h-5 text-amber-400" />
              <span className="text-[10px] font-black uppercase">Salvar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
