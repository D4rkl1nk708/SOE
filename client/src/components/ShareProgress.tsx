import { useRef, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Share2, Download, X, RefreshCw, Sparkles, ImageIcon } from "lucide-react";
import { useTheme, COLOR_THEMES } from "@/contexts/ThemeContext";

interface ShareProgressProps {
  onClose: () => void;
}

const TEMPLATES = [
  { id: "modern", label: "Moderno" },
  { id: "minimal", label: "Minimalista" },
  { id: "bold",    label: "Impactante" },
];

export function ShareProgress({ onClose }: ShareProgressProps) {
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: weekly } = trpc.dashboard.getWeeklyStats.useQuery();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const { colorTheme, darkMode } = useTheme();
  const [template, setTemplate] = useState<"modern" | "minimal" | "bold">("modern");

  // ── helpers ────────────────────────────────────────────────────────
  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawGlassCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, bg: string, border: string) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
  }

  // ── main generator ──────────────────────────────────────────────────
  const generateImage = async () => {
    if (!stats || !canvasRef.current) return;
    setGenerating(true);

    const canvas = canvasRef.current;
    const W = 1080, H = 1350; // 4:5 ratio — perfect for Instagram/redes
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    const cfg = COLOR_THEMES[colorTheme];
    const primary = darkMode === "dark" ? cfg.dark : cfg.light;
    const isDark = darkMode === "dark";

    const disciplines = stats.disciplineStats || [];
    const totalQ = disciplines.reduce((s, d) => s + (d.performance?.questionsResolved || 0), 0);
    const totalC = disciplines.reduce((s, d) => s + (d.performance?.correctCount || 0), 0);
    const accuracy = totalQ > 0 ? Math.round(totalC / totalQ * 100) : 0;
    const totalTime = disciplines.reduce((s, d) => s + (d.studyTimeSeconds || 0), 0);
    const hours = Math.floor(totalTime / 3600);
    const mins = Math.floor((totalTime % 3600) / 60);

    if (template === "modern") {
      // ── MODERN TEMPLATE ──────────────────────────────────────────────
      // Deep gradient background
      const bg = ctx.createLinearGradient(0, 0, W, H);
      if (isDark) {
        bg.addColorStop(0, "#080c14");
        bg.addColorStop(0.4, "#0d1220");
        bg.addColorStop(1, "#060a10");
      } else {
        bg.addColorStop(0, "#f0f4ff");
        bg.addColorStop(0.5, "#e8eeff");
        bg.addColorStop(1, "#f5f0ff");
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Glowing orbs
      const orb1 = ctx.createRadialGradient(900, 200, 0, 900, 200, 500);
      orb1.addColorStop(0, primary + (isDark ? "22" : "18"));
      orb1.addColorStop(1, "transparent");
      ctx.fillStyle = orb1; ctx.fillRect(0, 0, W, H);

      const orb2 = ctx.createRadialGradient(150, 1200, 0, 150, 1200, 400);
      orb2.addColorStop(0, primary + (isDark ? "1a" : "14"));
      orb2.addColorStop(1, "transparent");
      ctx.fillStyle = orb2; ctx.fillRect(0, 0, W, H);

      const orb3 = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 600);
      orb3.addColorStop(0, primary + "08");
      orb3.addColorStop(1, "transparent");
      ctx.fillStyle = orb3; ctx.fillRect(0, 0, W, H);

      // Top accent bar with gradient
      const barGrad = ctx.createLinearGradient(0, 0, W, 0);
      barGrad.addColorStop(0, primary);
      barGrad.addColorStop(0.5, primary + "cc");
      barGrad.addColorStop(1, primary + "44");
      ctx.fillStyle = barGrad;
      ctx.fillRect(0, 0, W, 8);

      // Decorative line pattern (subtle)
      ctx.save();
      ctx.globalAlpha = 0.03;
      ctx.strokeStyle = isDark ? "#ffffff" : "#000000";
      ctx.lineWidth = 1;
      for (let i = 0; i < W; i += 80) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
      }
      ctx.restore();

      const textColor = isDark ? "#f1f5f9" : "#0f172a";
      const subColor = isDark ? "#94a3b8" : "#64748b";
      const cardBg = isDark ? "rgba(15,23,42,0.7)" : "rgba(255,255,255,0.75)";
      const cardBorder = isDark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.25)";

      // Logo + brand header
      ctx.save();
      ctx.fillStyle = primary;
      roundRect(ctx, 64, 52, 72, 72, 20);
      ctx.fill();
      // Book icon
      ctx.strokeStyle = isDark ? "#0a0a0a" : "#ffffff";
      ctx.lineWidth = 3;
      ctx.strokeRect(64 + 18, 52 + 16, 36, 40);
      ctx.beginPath(); ctx.moveTo(64 + 36, 52 + 16); ctx.lineTo(64 + 36, 52 + 56); ctx.stroke();
      ctx.restore();

      ctx.fillStyle = primary;
      ctx.font = "bold 62px system-ui, -apple-system, sans-serif";
      ctx.fillText("SOE", 160, 95);

      ctx.fillStyle = textColor;
      ctx.font = "bold 40px system-ui";
      ctx.fillText("Estudos para Concursos", 160, 140);

      ctx.fillStyle = subColor;
      ctx.font = "30px system-ui";
      const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      ctx.fillText(today, 64, 175);

      // Divider
      const divGrad = ctx.createLinearGradient(64, 0, W - 64, 0);
      divGrad.addColorStop(0, primary);
      divGrad.addColorStop(0.6, primary + "66");
      divGrad.addColorStop(1, "transparent");
      ctx.fillStyle = divGrad;
      ctx.fillRect(64, 200, W - 128, 2);

      // HERO STAT — Accuracy circle
      const heroX = W / 2, heroY = 370, heroR = 140;
      // Outer glow
      ctx.save();
      ctx.shadowColor = primary;
      ctx.shadowBlur = 40;
      ctx.beginPath(); ctx.arc(heroX, heroY, heroR, 0, Math.PI * 2);
      ctx.strokeStyle = primary + "33"; ctx.lineWidth = 20; ctx.stroke();
      ctx.restore();
      // Track
      ctx.beginPath(); ctx.arc(heroX, heroY, heroR, 0, Math.PI * 2);
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
      ctx.lineWidth = 16; ctx.stroke();
      // Progress arc
      if (accuracy > 0) {
        const startA = -Math.PI / 2;
        const endA = startA + (accuracy / 100) * Math.PI * 2;
        const arcGrad = ctx.createLinearGradient(heroX - heroR, heroY, heroX + heroR, heroY);
        arcGrad.addColorStop(0, primary);
        arcGrad.addColorStop(1, primary + "bb");
        ctx.beginPath(); ctx.arc(heroX, heroY, heroR, startA, endA);
        ctx.strokeStyle = arcGrad; ctx.lineWidth = 16;
        ctx.lineCap = "round"; ctx.stroke();
      }
      // Center text
      ctx.fillStyle = primary;
      ctx.font = `bold 88px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${accuracy}%`, heroX, heroY + 22);
      ctx.fillStyle = subColor;
      ctx.font = "28px system-ui";
      ctx.fillText("de Aproveitamento", heroX, heroY + 65);
      ctx.fillStyle = textColor;
      ctx.font = "bold 24px system-ui";
      ctx.fillText(`${totalQ.toLocaleString("pt-BR")} questões resolvidas`, heroX, heroY + 108);
      ctx.textAlign = "left";

      // 4 stat cards
      const stats4 = [
        { label: "Horas de Estudo", value: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`, icon: "clock", color: "#8b5cf6" },
        { label: "Disciplinas", value: String(disciplines.length), icon: "book", color: "#6366f1" },
        { label: "Esta Semana", value: weekly?.thisWeek?.questions ? String(weekly.thisWeek.questions) : "0", icon: "calendar", color: "#0ea5e9" },
        { label: "Acerto Semanal", value: weekly?.thisWeek?.questions ? `${Math.round((weekly.thisWeek.correct || 0) / weekly.thisWeek.questions * 100)}%` : "—", icon: "target", color: "#10b981" },
      ];
      const cW = (W - 128 - 24) / 2;
      const cH = 180;
      stats4.forEach((s, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = 64 + col * (cW + 24), y = 560 + row * (cH + 20);
        drawGlassCard(ctx, x, y, cW, cH, 24, cardBg, cardBorder);
        // Color accent bar at top
        const topGrad = ctx.createLinearGradient(x, y, x + cW, y);
        topGrad.addColorStop(0, s.color);
        topGrad.addColorStop(1, s.color + "44");
        ctx.fillStyle = topGrad;
        roundRect(ctx, x + 16, y + 14, cW - 32, 5, 3); ctx.fill();

        ctx.font = "48px serif";
        ctx.fillText(s.icon, x + 20, y + 80);
        ctx.fillStyle = s.color;
        ctx.font = `bold 56px system-ui`;
        ctx.fillText(s.value, x + 76, y + 85);
        ctx.fillStyle = subColor;
        ctx.font = "24px system-ui";
        ctx.fillText(s.label, x + 20, y + 148);
      });

      // Top disciplines section
      const topDiscs = [...disciplines]
        .filter(d => d.studyTimeSeconds > 0)
        .sort((a, b) => b.studyTimeSeconds - a.studyTimeSeconds)
        .slice(0, 3);

      if (topDiscs.length > 0) {
        const secY = 1000;
        ctx.fillStyle = textColor;
        ctx.font = "bold 32px system-ui";
        ctx.fillText("Top disciplinas estudadas", 64, secY);

        topDiscs.forEach((d, i) => {
          const y = secY + 24 + i * 74;
          const frac = d.studyTimeSeconds / topDiscs[0].studyTimeSeconds;
          const barMax = W - 200;

          // Bar background
          ctx.fillStyle = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
          roundRect(ctx, 64, y, barMax, 52, 12); ctx.fill();

          // Bar fill
          const barFill = ctx.createLinearGradient(64, y, 64 + barMax * frac, y);
          barFill.addColorStop(0, d.color || primary);
          barFill.addColorStop(1, (d.color || primary) + "77");
          ctx.fillStyle = barFill;
          roundRect(ctx, 64, y, Math.max(barMax * frac, 60), 52, 12); ctx.fill();

          // Discipline name
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 24px system-ui";
          const name = d.name.length > 22 ? d.name.slice(0, 21) + "…" : d.name;
          ctx.fillText(name, 84, y + 33);
          // Time
          const dH = Math.floor(d.studyTimeSeconds / 3600);
          const dM = Math.floor((d.studyTimeSeconds % 3600) / 60);
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.font = "22px system-ui";
          ctx.textAlign = "right";
          ctx.fillText(dH > 0 ? `${dH}h ${dM}m` : `${dM}min`, 64 + barMax - 12, y + 33);
          ctx.textAlign = "left";
        });
      }

      // Footer
      const fY = H - 80;
      const footerGrad = ctx.createLinearGradient(0, fY - 20, 0, H);
      footerGrad.addColorStop(0, "transparent");
      footerGrad.addColorStop(1, isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.08)");
      ctx.fillStyle = footerGrad;
      ctx.fillRect(0, fY - 20, W, H - fY + 20);

      ctx.fillStyle = primary;
      ctx.font = "bold 26px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("SOE Estudos", W / 2 - 30, H - 38);
      ctx.fillStyle = subColor;
      ctx.font = "24px system-ui";
      ctx.fillText(" • Prepare-se para passar", W / 2 + 60, H - 38);
      ctx.textAlign = "left";
    }

    else if (template === "minimal") {
      // ── MINIMAL TEMPLATE ─────────────────────────────────────────────
      ctx.fillStyle = isDark ? "#09090b" : "#fafafa";
      ctx.fillRect(0, 0, W, H);

      // Single accent stripe left side
      ctx.fillStyle = primary;
      ctx.fillRect(0, 0, 12, H);

      const textColor = isDark ? "#fafafa" : "#09090b";
      const subColor = isDark ? "#71717a" : "#71717a";

      // Header
      ctx.fillStyle = primary;
      ctx.font = "900 100px system-ui";
      ctx.fillText("SOE", 80, 160);
      ctx.fillStyle = textColor;
      ctx.font = "300 40px system-ui";
      ctx.fillText("Relatório de Progresso", 80, 210);

      // Date
      ctx.fillStyle = subColor;
      ctx.font = "28px system-ui";
      const today = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
      ctx.fillText(today, 80, 258);

      // Big number hero
      ctx.fillStyle = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
      roundRect(ctx, 64, 300, W - 128, 340, 28); ctx.fill();

      ctx.fillStyle = primary;
      ctx.font = `900 220px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${accuracy}%`, W / 2, 515);
      ctx.fillStyle = subColor;
      ctx.font = "32px system-ui";
      ctx.fillText("de aproveitamento geral", W / 2, 580);
      ctx.textAlign = "left";

      // Horizontal stats
      const hStats = [
        { label: "Questões", value: totalQ.toLocaleString("pt-BR") },
        { label: "Horas", value: hours > 0 ? `${hours}h` : `${mins}m` },
        { label: "Disciplinas", value: String(disciplines.length) },
      ];
      const hW = (W - 128 - 40) / 3;
      hStats.forEach((s, i) => {
        const x = 64 + i * (hW + 20);
        // Top border accent
        ctx.fillStyle = primary;
        ctx.fillRect(x, 680, hW, 4);
        ctx.fillStyle = textColor;
        ctx.font = `bold 72px system-ui`;
        ctx.fillText(s.value, x, 775);
        ctx.fillStyle = subColor;
        ctx.font = "28px system-ui";
        ctx.fillText(s.label, x, 815);
      });

      // Discipline bars
      ctx.fillStyle = textColor;
      ctx.font = "bold 28px system-ui";
      ctx.fillText("DISCIPLINAS", 64, 890);

      const topDiscs = [...disciplines].filter(d => d.studyTimeSeconds > 0)
        .sort((a, b) => b.studyTimeSeconds - a.studyTimeSeconds).slice(0, 5);

      topDiscs.forEach((d, i) => {
        const y = 920 + i * 70;
        const frac = d.studyTimeSeconds / (topDiscs[0]?.studyTimeSeconds || 1);
        const barW = (W - 200) * frac;
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
        ctx.fillRect(64, y + 8, W - 128, 32);
        ctx.fillStyle = d.color || primary;
        ctx.fillRect(64, y + 8, Math.max(barW, 40), 32);
        ctx.fillStyle = textColor;
        ctx.font = "bold 22px system-ui";
        ctx.fillText(d.name.length > 28 ? d.name.slice(0, 27) + "…" : d.name, 72, y + 31);
      });

      // Footer line
      ctx.fillStyle = primary;
      ctx.fillRect(64, H - 80, W - 128, 2);
      ctx.fillStyle = subColor;
      ctx.font = "24px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("soe-estudos.app • Feito para quem quer passar", W / 2, H - 40);
      ctx.textAlign = "left";
    }

    else if (template === "bold") {
      // ── BOLD TEMPLATE ────────────────────────────────────────────────
      // Full primary color background
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, primary);
      bg.addColorStop(0.6, primary + "dd");
      bg.addColorStop(1, isDark ? "#000000" : "#1e293b");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Geometric shapes
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(W + 100, -100, 500, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-100, H + 100, 400, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 550, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      const light = "#ffffff";
      const muted = "rgba(255,255,255,0.65)";

      // Brand
      ctx.fillStyle = light;
      ctx.font = "900 90px system-ui";
      ctx.fillText("SOE", 72, 140);
      ctx.font = "300 38px system-ui";
      ctx.globalAlpha = 0.8;
      ctx.fillText("Estudos para Concursos", 72, 185);
      ctx.globalAlpha = 1;

      // BIG accuracy
      ctx.font = "900 260px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.textAlign = "center";
      ctx.fillText(`${accuracy}%`, W / 2, 530);

      ctx.font = "900 200px system-ui";
      ctx.fillStyle = light;
      ctx.fillText(`${accuracy}%`, W / 2, 510);

      ctx.font = "bold 38px system-ui";
      ctx.fillStyle = muted;
      ctx.fillText("de aproveitamento", W / 2, 570);
      ctx.textAlign = "left";

      // White cards
      const wStats = [
        { label: "Questões", value: totalQ.toLocaleString("pt-BR"), emoji: "" },
        { label: "Horas", value: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`, emoji: "⏱️" },
        { label: "Disciplinas", value: String(disciplines.length), emoji: "" },
        { label: "Semana", value: weekly?.thisWeek?.questions ? String(weekly.thisWeek.questions) + " q" : "0 q", emoji: "" },
      ];
      const wCw = (W - 128 - 36) / 2;
      const wCh = 200;
      wStats.forEach((s, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = 64 + col * (wCw + 36), y = 630 + row * (wCh + 20);
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 20;
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        roundRect(ctx, x, y, wCw, wCh, 24); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, wCw, wCh, 24); ctx.stroke();

        ctx.font = "52px serif"; ctx.fillText(s.emoji, x + 22, y + 66);
        ctx.fillStyle = light; ctx.font = "bold 62px system-ui";
        ctx.fillText(s.value, x + 22, y + 148);
        ctx.fillStyle = muted; ctx.font = "28px system-ui";
        ctx.fillText(s.label, x + 22, y + 186);
      });

      // Top disciplines
      const topDiscs = [...disciplines].filter(d => d.studyTimeSeconds > 0)
        .sort((a, b) => b.studyTimeSeconds - a.studyTimeSeconds).slice(0, 3);
      if (topDiscs.length > 0) {
        ctx.fillStyle = muted; ctx.font = "bold 28px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Top: " + topDiscs.map(d => d.name.length > 14 ? d.name.slice(0, 13) + "…" : d.name).join(" · "), W / 2, 1090);
        ctx.textAlign = "left";
      }

      // Footer
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(0, H - 90, W, 90);
      ctx.fillStyle = muted; ctx.font = "26px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("SOE Estudos • Prepare-se para passar", W / 2, H - 36);
      ctx.textAlign = "left";
    }

    setImageUrl(canvas.toDataURL("image/png"));
    setGenerating(false);
  };

  useEffect(() => {
    if (stats) {
      setImageUrl(null);
      setTimeout(() => generateImage(), 50);
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
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: "image/png" });

      if (isNative) {
        // On Android/Capacitor: save file then share via Capacitor Share
        try {
          const { Filesystem, Directory } = await import("@capacitor/filesystem");
          const { Share } = await import("@capacitor/share");
          const base64 = imageUrl.split(",")[1];
          const fileName = `soe_progresso_${Date.now()}.png`;
          await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
          const fileUri = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
          await Share.share({
            title: "Meu progresso no SOE Estudos",
            text: "Confira meu progresso nos estudos!",
            url: fileUri.uri,
            dialogTitle: "Compartilhar progresso",
          });
          return;
        } catch {
          // fallback to download if share fails
          handleDownload();
          return;
        }
      }

      // Web: try native share with file
      const file = new File([blob], "soe_progresso.png", { type: "image/png" });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: "Meu progresso no SOE Estudos", text: "Confira meu progresso nos estudos!", files: [file] });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "Meu progresso no SOE Estudos", text: "Confira meu progresso nos estudos!" });
        return;
      }
      handleDownload();
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      handleDownload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4" style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: "var(--app-bg)", border: "1px solid var(--card-border)", maxHeight: "95vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--card-border)", background: "var(--stat-bg)" }}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" style={{ color: "var(--primary)" }} />
            <h2 className="font-bold text-base" style={{ color: "var(--app-fg)" }}>Compartilhar Progresso</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-opacity hover:opacity-60">
            <X className="w-4 h-4" style={{ color: "var(--muted-text)" }} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="p-4 space-y-4">
            {/* Hidden canvas */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Template picker */}
            <div className="flex gap-2">
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setTemplate(t.id as any)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: template === t.id ? "var(--primary)" : "var(--stat-bg)",
                    color: template === t.id ? "white" : "var(--muted-text)",
                    border: `1px solid ${template === t.id ? "var(--primary)" : "var(--card-border)"}`,
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Preview */}
            <div className="rounded-2xl overflow-hidden relative" style={{ border: "1px solid var(--card-border)", minHeight: 200, background: "var(--stat-bg)" }}>
              {generating ? (
                <div className="flex flex-col items-center justify-center h-52 gap-3">
                  <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
                  <p className="text-xs" style={{ color: "var(--muted-text)" }}>Gerando imagem...</p>
                </div>
              ) : imageUrl ? (
                <img src={imageUrl} alt="Preview do progresso" className="w-full rounded-2xl" />
              ) : (
                <div className="flex flex-col items-center justify-center h-52 gap-2">
                  <ImageIcon className="w-10 h-10" style={{ color: "var(--muted-text)", opacity: 0.3 }} />
                  <p className="text-sm" style={{ color: "var(--muted-text)" }}>Carregando dados...</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => { setImageUrl(null); setTimeout(() => generateImage(), 50); }}
                disabled={generating}
                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl font-medium text-xs transition-all active:scale-95 disabled:opacity-50"
                style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}>
                <RefreshCw className={`w-5 h-5 ${generating ? "animate-spin" : ""}`} style={{ color: "var(--primary)" }} />
                Atualizar
              </button>

              <button onClick={handleShare} disabled={!imageUrl || generating}
                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl font-semibold text-xs transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: !imageUrl || generating ? "var(--stat-bg)" : "var(--primary)",
                  border: "1px solid var(--card-border)",
                  color: !imageUrl || generating ? "var(--muted-text)" : "white",
                }}>
                <Share2 className="w-5 h-5" />
                Compartilhar
              </button>

              <button onClick={handleDownload} disabled={!imageUrl}
                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl font-medium text-xs transition-all active:scale-95 disabled:opacity-50"
                style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}>
                <Download className="w-5 h-5" style={{ color: "var(--primary)" }} />
                Baixar
              </button>
            </div>

            <p className="text-xs text-center" style={{ color: "var(--muted-text)" }}>
              3 layouts para escolher • Perfeito para Instagram, WhatsApp e redes sociais
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
