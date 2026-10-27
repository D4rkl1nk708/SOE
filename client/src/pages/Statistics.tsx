import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  TrendingUp,
  BookOpen,
  CheckCircle2,
  Target,
  Clock,
  Zap,
  Share2,
  Calendar,
  Brain,
  AlertCircle,
  Sparkles,
  Lightbulb,
  Printer,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { ShareProgress } from "@/components/ShareProgress";
import { AIAnalysis } from "@/components/AIAnalysis";
import { StudyHeatmap } from "@/components/StudyHeatmap";
import { PeakHoursChart } from "@/components/PeakHoursChart";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";

export default function Statistics() {
  const { data: stats, isLoading } = trpc.dashboard.getStats.useQuery();
  const { data: mockExams } = trpc.mockExam.list.useQuery();
  const { data: revisions } = trpc.revision.list.useQuery({ completed: false });
  const { data: completedRevisions } = trpc.revision.list.useQuery({
    completed: true,
  });

  const [showShare, setShowShare] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiDiscipline, setAiDiscipline] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const utils = trpc.useUtils();
  const getInsightMut = trpc.mentor.getStatsInsight.useMutation();

  const apiKey = (stats?.settings as any)?.aiApiKey ?? "";

  const resetAllStats = trpc.topic.resetAllStats.useMutation({
    onSuccess: () => {
      import("sonner").then(({ toast }) =>
        toast.success("Estatísticas zeradas!"),
      );
      utils.dashboard.getStats.invalidate();
      utils.topic.list.invalidate();
      setResetConfirm(false);
    },
    onError: (err) =>
      import("sonner").then(({ toast }) => toast.error(err.message)),
  });

  useEffect(() => {
    if (stats && apiKey && !aiInsight && !loadingInsight) {
      setLoadingInsight(true);
      getInsightMut.mutate(
        { apiKey, provider: (stats.settings as any)?.aiProvider ?? "gemini" },
        {
          onSuccess: (res) => setAiInsight(res.insight),
          onSettled: () => setLoadingInsight(false),
        },
      );
    }
  }, [!!stats, !!apiKey]);

  if (isLoading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );

  const disciplineStats = (stats?.disciplineStats || []) as any[];

  const resolvedOf = (d: any) =>
    Math.max(
      Number(d.performance?.questionsResolved) || 0,
      (Number(d.performance?.correctCount) || 0) +
        (Number(d.performance?.errorCount) || 0),
    );

  const disciplineRows = disciplineStats.map((d) => {
    const resolved = resolvedOf(d);
    const correct = Number(d.performance?.correctCount) || 0;
    const errors = Math.max(0, resolved - correct);
    return {
      ...d,
      resolved,
      correct,
      errors,
      accuracy: resolved > 0 ? Math.round((correct / resolved) * 100) : 0,
    };
  });

  const totalQuestions = disciplineRows.reduce((acc, d) => acc + d.resolved, 0);
  const totalCorrect = disciplineRows.reduce((acc, d) => acc + d.correct, 0);
  const totalErrors = disciplineRows.reduce((acc, d) => acc + d.errors, 0);
  const overallAccuracy =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const totalStudyTime = disciplineRows.reduce(
    (acc, d) => acc + (d.studyTimeSeconds || 0),
    0,
  );
  const sessionLogs = (stats?.settings as any)?.studySessionLog || [];

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60);
    return h === 0 ? `${m}min` : `${h}h${m > 0 ? m + "m" : ""}`;
  };

  // "Top performance" com amostra minúscula é ruído (1/1 = 100%). Só entra no
  // ranking quem tem pelo menos 10 questões; se ninguém tiver, usa todos e
  // avisa na interface.
  const MIN_SAMPLE = 10;
  const rankedWithSample = disciplineRows
    .filter((d) => d.resolved >= MIN_SAMPLE)
    .sort((a, b) => b.accuracy - a.accuracy || b.resolved - a.resolved);
  const rankedAll = disciplineRows
    .filter((d) => d.resolved > 0)
    .sort((a, b) => b.accuracy - a.accuracy || b.resolved - a.resolved);
  const topRanked = rankedWithSample.length > 0 ? rankedWithSample : rankedAll;
  const topSampleNote =
    rankedWithSample.length > 0
      ? `Amostra mínima de ${MIN_SAMPLE} questões`
      : "Amostra pequena: interprete com cautela";

  const studyTimeData = [...disciplineRows]
    .filter((d) => (d.studyTimeSeconds || 0) > 0)
    .sort((a, b) => (b.studyTimeSeconds || 0) - (a.studyTimeSeconds || 0))
    .slice(0, 7)
    .map((d) => ({
      name: d.name.length > 14 ? d.name.slice(0, 13) + "…" : d.name,
      horas: Math.round(((d.studyTimeSeconds || 0) / 3600) * 10) / 10,
      color: d.color,
    }));

  const accuracyData = topRanked.slice(0, 8).map((d) => ({
    name: d.name.length > 14 ? d.name.slice(0, 13) + "…" : d.name,
    acerto: d.accuracy,
    amostra: d.resolved,
    color: d.color,
  }));

  const examChartData = (mockExams || [])
    .filter((e) => Number(e.totalQuestions) > 0)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((e) => {
      const date = new Date(e.date);
      if (Number.isNaN(date.getTime())) return null;
      return {
        data: format(date, "dd/MM"),
        acerto: Math.round(
          (Number(e.correct) / Number(e.totalQuestions)) * 100,
        ),
      };
    })
    .filter(Boolean) as { data: string; acerto: number }[];

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const allRevisions = [
    ...(revisions || []),
    ...(completedRevisions || []),
  ] as any[];
  const activeRevisions = allRevisions.filter((r) => !r.ignored);
  const completedCount = activeRevisions.filter((r) => r.completed).length;
  const dueCount = activeRevisions.filter(
    (r) => !r.completed && r.scheduledDate <= todayStr,
  ).length;
  const completionRate =
    completedCount + dueCount > 0
      ? Math.round((completedCount / (completedCount + dueCount)) * 100)
      : 0;

  const weekStartStr = format(
    new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    "yyyy-MM-dd",
  );
  const weekLogs = (sessionLogs as any[]).filter(
    (l) => l?.date && l.date >= weekStartStr,
  );
  const weekMinutes = weekLogs.reduce(
    (acc, l) => acc + (Number(l.durationMin) || 0),
    0,
  );
  const weekWeight = weekLogs.reduce(
    (acc, l) => acc + (Number(l.durationMin) || 1),
    0,
  );
  const weekAccuracy =
    weekWeight > 0
      ? Math.round(
          weekLogs.reduce((acc, l) => {
            const raw = Number(l.accuracy) || 0;
            const normalized = raw <= 1 ? raw * 100 : raw;
            return acc + normalized * (Number(l.durationMin) || 1);
          }, 0) / weekWeight,
        )
      : 0;

  const sampleRows = rankedWithSample.length > 0 ? rankedWithSample : rankedAll;
  const strongest = sampleRows[0];
  const weakest = [...sampleRows].sort(
    (a, b) => a.accuracy - b.accuracy || b.resolved - a.resolved,
  )[0];
  const priority = [...sampleRows].sort((a, b) => {
    const score = (d: any) => (100 - d.accuracy) * Math.log10(d.resolved + 10);
    return score(b) - score(a);
  })[0];

  const insightHtml = aiInsight
    ? aiInsight
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-primary">$1</strong>')
        .replace(/\n/g, "<br/>")
    : "";

  const CT = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="px-3 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-2xl bg-card border border-border">
        <p className="mb-1 text-foreground">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {p.value}
            {p.unit || ""}
          </p>
        ))}
      </div>
    );
  };

  return (
    <PageShell
      eyebrow="Diagnóstico"
      title="Estatísticas"
      description="Métricas reais, lacunas e prioridades — sem inflar amostras pequenas."
      metrics={[
        {
          label: "Estudo Total",
          value: formatTime(totalStudyTime),
          sub: "tempo acumulado",
          icon: Clock,
        },
        {
          label: "Aproveitamento",
          value: `${overallAccuracy}%`,
          sub: "acurácia ponderada",
          icon: Target,
          color: "var(--accent-green)",
        },
        {
          label: "Questões",
          value: totalQuestions,
          sub: `${totalErrors} erros no total`,
          icon: CheckCircle2,
        },
        {
          label: "Revisões",
          value: completedCount,
          sub: `${completionRate}% das vencidas`,
          icon: Zap,
          color: "var(--accent-amber)",
        },
      ]}
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => window.print()}
            className="h-9 px-4 rounded-md text-[10px] font-bold uppercase tracking-widest print:hidden"
            title="Exportar como PDF ou Imprimir Relatório"
          >
            <Printer className="w-3.5 h-3.5 mr-2" /> Imprimir / PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowShare(true)}
            className="h-9 px-4 rounded-md text-[10px] font-bold uppercase tracking-widest"
          >
            <Share2 className="w-3.5 h-3.5 mr-2" /> Compartilhar
          </Button>
          {!resetConfirm ? (
            <button
              onClick={() => setResetConfirm(true)}
              className="w-9 h-9 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive transition-all"
              title="Zerar estatísticas"
            >
              <AlertCircle size={16} />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setResetConfirm(false)}
                className="h-9 px-3 text-[10px] font-bold uppercase"
              >
                Voltar
              </Button>
              <Button
                variant="destructive"
                onClick={() => resetAllStats.mutate()}
                disabled={resetAllStats.isPending}
                className="h-9 px-4 text-[10px] font-bold uppercase"
              >
                Zerar Tudo
              </Button>
            </div>
          )}
        </>
      }
    >
      {/* ── Cabeçalho exclusivo para Impressão / PDF ────────────────────────── */}
      <div className="print-only border-b border-gray-300 pb-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900">
              SOE Estudos
            </h1>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Relatório Executivo de Desempenho & Analytics
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>Gerado em: {format(new Date(), "dd/MM/yyyy HH:mm")}</p>
            <p>
              Total de Questões: {totalQuestions} | Acurácia Geral:{" "}
              {overallAccuracy}%
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {aiInsight && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-md flex items-center gap-6 relative overflow-hidden bg-primary/[0.03] border border-primary/20"
          >
            <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center flex-shrink-0 text-white shadow-sm">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary/60 mb-1">
                Destaque do Mentor IA
              </p>
              <p
                className="text-sm font-bold leading-relaxed text-foreground/80"
                dangerouslySetInnerHTML={{ __html: insightHtml }}
              />
            </div>
            <Sparkles className="absolute -right-2 -bottom-2 w-16 h-16 opacity-5 rotate-12 text-primary" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="soe-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <Lightbulb className="w-4 h-4 text-accent-amber" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">
            Leitura rápida
          </h2>
        </div>
        {sampleRows.length === 0 ? (
          <p className="text-xs font-semibold text-muted-foreground opacity-60">
            Resolva algumas questões para o SOE identificar padrões e
            prioridades.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-md bg-secondary/20 border border-border/50">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-50 mb-1">
                Mais consistente
              </p>
              <p className="text-sm font-bold text-accent-green truncate">
                {strongest?.name || "—"}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground">
                {strongest
                  ? `${strongest.accuracy}% de acerto em ${strongest.resolved} questões`
                  : "Sem dados suficientes"}
              </p>
            </div>
            <div className="p-4 rounded-md bg-secondary/20 border border-border/50">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-50 mb-1">
                Maior lacuna
              </p>
              <p className="text-sm font-bold text-accent-red truncate">
                {weakest?.name || "—"}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground">
                {weakest
                  ? `${weakest.accuracy}% de acerto em ${weakest.resolved} questões`
                  : "Sem dados suficientes"}
              </p>
            </div>
            <div className="p-4 rounded-md bg-secondary/20 border border-border/50">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-50 mb-1">
                Prioridade agora
              </p>
              <p className="text-sm font-bold text-accent-amber truncate">
                {priority?.name || "—"}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground">
                {priority
                  ? `${priority.errors} erros em ${priority.resolved} questões`
                  : "Sem dados suficientes"}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="soe-card p-6">
            <div className="flex items-center gap-3 mb-8">
              <Calendar className="w-4 h-4 text-primary" />
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">
                Análise de Consistência
              </h2>
            </div>
            <div className="space-y-10">
              <StudyHeatmap logs={sessionLogs} />
              <div className="pt-8 border-t border-border/30">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
                    Performance por Faixa Horária
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-[9px] font-bold uppercase text-muted-foreground opacity-40">
                      Taxa de Acerto
                    </span>
                  </div>
                </div>
                <PeakHoursChart logs={sessionLogs} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="soe-card p-6">
              <div className="flex items-center gap-3 mb-6">
                <Clock className="w-4 h-4 text-primary" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest">
                  Carga Horária
                </h2>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={studyTimeData}
                    layout="vertical"
                    margin={{ left: 20, right: 20 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{
                        fontSize: 9,
                        fontWeight: 700,
                        fill: "var(--muted-foreground)",
                      }}
                      width={70}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<CT />}
                      cursor={{ fill: "var(--secondary)", opacity: 0.2 }}
                    />
                    <Bar dataKey="horas" radius={[0, 2, 2, 0]} unit="h">
                      {studyTimeData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          fillOpacity={0.8}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="soe-card p-6">
              <div className="flex items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                  <Target className="w-4 h-4 text-accent-green" />
                  <h2 className="text-[10px] font-bold uppercase tracking-widest">
                    Acurácia por disciplina
                  </h2>
                </div>
                <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground opacity-40 text-right">
                  {topSampleNote}
                </span>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={accuracyData}
                    margin={{ top: 0, right: 10, left: -25, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="name"
                      tick={{
                        fontSize: 8,
                        fontWeight: 700,
                        fill: "var(--muted-foreground)",
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{
                        fontSize: 8,
                        fontWeight: 700,
                        fill: "var(--muted-foreground)",
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<CT />}
                      cursor={{ fill: "var(--secondary)", opacity: 0.2 }}
                    />
                    <Bar dataKey="acerto" radius={[2, 2, 0, 0]} unit="%">
                      {accuracyData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          fillOpacity={0.8}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="soe-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest">
                Evolução em Simulados
              </h2>
            </div>
            {examChartData.length > 0 ? (
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={examChartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--border)"
                      opacity={0.3}
                    />
                    <XAxis
                      dataKey="data"
                      tick={{
                        fontSize: 9,
                        fontWeight: 700,
                        fill: "var(--muted-foreground)",
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{
                        fontSize: 9,
                        fontWeight: 700,
                        fill: "var(--muted-foreground)",
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CT />} />
                    <Line
                      type="monotone"
                      dataKey="acerto"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "var(--primary)" }}
                      unit="%"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest opacity-20">
                Nenhum simulado
              </div>
            )}
          </div>

          <div className="soe-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <Zap className="w-4 h-4 text-accent-amber" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest">
                Comprometimento
              </h2>
            </div>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
                    Revisões
                  </span>
                  <span className="text-[11px] font-bold tabular-nums text-foreground">
                    {completionRate}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000 bg-accent-amber"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-md bg-secondary/30 border border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2
                    size={14}
                    className="text-accent-green opacity-60"
                  />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/70">
                    Sessões (7d)
                  </span>
                </div>
                <span className="text-xs font-bold text-accent-green">
                  {weekLogs.length}
                </span>
              </div>

              <div className="p-4 rounded-md bg-secondary/30 border border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock size={14} className="text-primary opacity-60" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/70">
                    Tempo (7d)
                  </span>
                </div>
                <span className="text-xs font-bold text-primary">
                  {formatTime(weekMinutes * 60)}
                </span>
              </div>

              <div className="p-4 rounded-md bg-secondary/30 border border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap size={14} className="text-accent-amber opacity-60" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/70">
                    Sequência
                  </span>
                </div>
                <span className="text-xs font-bold text-accent-amber">
                  {(stats as any)?.settings?.studyStreak?.current || 0} dias
                </span>
              </div>

              <div className="p-4 rounded-md bg-secondary/30 border border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Target size={14} className="text-accent-green opacity-60" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/70">
                    Acurácia (7d)
                  </span>
                </div>
                <span className="text-xs font-bold text-accent-green">
                  {weekAccuracy}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {disciplineStats.length > 0 && (
        <div className="soe-card p-6">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">
              Relatório por Disciplina
            </h3>
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-40">
              {disciplineStats.length} Matérias
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...disciplineStats]
              .sort(
                (a, b) =>
                  (b.performance?.questionsResolved || 0) -
                  (a.performance?.questionsResolved || 0),
              )
              .map((d) => {
                const acc = d.performance?.accuracy ?? null;
                const acColor =
                  acc === null
                    ? "var(--muted-foreground)"
                    : acc >= 75
                      ? "var(--accent-green)"
                      : acc >= 50
                        ? "var(--accent-amber)"
                        : "var(--accent-red)";
                return (
                  <div
                    key={d.disciplineId}
                    className="flex items-center gap-4 px-4 py-3 rounded-md bg-secondary/10 border border-border/50 group hover:border-primary/30 transition-all"
                  >
                    <div
                      className="w-1 h-8 rounded-full flex-shrink-0"
                      style={{ background: d.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate text-foreground/80">
                        {d.name}
                      </p>
                      <p className="text-[9px] font-bold text-muted-foreground opacity-40 uppercase">
                        {d.performance?.questionsResolved || 0} questões
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {acc !== null && (
                        <p
                          className="text-[11px] font-bold tabular-nums"
                          style={{ color: acColor }}
                        >
                          {acc}%
                        </p>
                      )}
                      <button
                        onClick={() => {
                          setAiDiscipline({ id: d.disciplineId, name: d.name });
                          setShowAI(true);
                        }}
                        className="w-8 h-8 rounded-md flex items-center justify-center bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
                      >
                        <Brain size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {showShare && <ShareProgress onClose={() => setShowShare(false)} />}
      {showAI && (
        <AIAnalysis
          open={showAI}
          onClose={() => {
            setShowAI(false);
            setAiDiscipline(null);
          }}
          disciplineId={aiDiscipline?.id}
          disciplineName={aiDiscipline?.name}
        />
      )}
    </PageShell>
  );
}

function Loader2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v4" />
      <path d="m16.2 7.8 2.9-2.9" />
      <path d="M18 12h4" />
      <path d="m16.2 16.2 2.9 2.9" />
      <path d="M12 18v4" />
      <path d="m4.9 19.1 2.9-2.9" />
      <path d="M2 12h4" />
      <path d="m4.9 4.9 2.9 2.9" />
    </svg>
  );
}
