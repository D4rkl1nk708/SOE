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

export default function Statistics() {
  const { data: stats, isLoading } = trpc.dashboard.getStats.useQuery();
  const { data: weekly } = trpc.dashboard.getWeeklyStats.useQuery();
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
  const totalQuestions = disciplineStats.reduce(
    (acc, d) => acc + (d.performance?.questionsResolved || 0),
    0,
  );
  const totalCorrect = disciplineStats.reduce(
    (acc, d) => acc + (d.performance?.correctCount || 0),
    0,
  );
  const overallAccuracy =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const totalStudyTime = disciplineStats.reduce(
    (acc, d) => acc + (d.studyTimeSeconds || 0),
    0,
  );
  const sessionLogs = (stats?.settings as any)?.studySessionLog || [];

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60);
    return h === 0 ? `${m}min` : `${h}h${m > 0 ? m + "m" : ""}`;
  };

  const disciplinesByAccuracy = [...disciplineStats]
    .filter((d) => d.performance && d.performance.questionsResolved > 0)
    .sort(
      (a, b) => (b.performance?.accuracy || 0) - (a.performance?.accuracy || 0),
    );

  const studyTimeData = [...disciplineStats]
    .filter((d) => (d.studyTimeSeconds || 0) > 0)
    .sort((a, b) => (b.studyTimeSeconds || 0) - (a.studyTimeSeconds || 0))
    .slice(0, 7)
    .map((d) => ({
      name: d.name.length > 14 ? d.name.slice(0, 13) + "…" : d.name,
      horas: Math.round(((d.studyTimeSeconds || 0) / 3600) * 10) / 10,
      color: d.color,
    }));

  const accuracyData = disciplinesByAccuracy.slice(0, 8).map((d) => ({
    name: d.name.length > 14 ? d.name.slice(0, 13) + "…" : d.name,
    acerto: d.performance?.accuracy || 0,
    color: d.color,
  }));

  const examChartData =
    mockExams
      ?.slice()
      .reverse()
      .map((e) => ({
        data: format(new Date(e.date), "dd/MM"),
        acerto: Math.round((e.correct / e.totalQuestions) * 100),
      })) || [];

  const totalRevisions =
    (revisions?.length || 0) + (completedRevisions?.length || 0);
  const completionRate =
    totalRevisions > 0
      ? Math.round(((completedRevisions?.length || 0) / totalRevisions) * 100)
      : 0;

  const thisW = (weekly as any)?.thisWeek;

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
    <div className="space-y-10 w-full pb-10 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Analytics & Performance
          </h1>
          <p className="text-[11px] font-bold text-muted-foreground opacity-60 uppercase tracking-widest">
            Métricas reais e insights de aprovação
          </p>
        </div>
        <div className="flex gap-2">
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
                dangerouslySetInnerHTML={{
                  __html: aiInsight.replace(
                    /\*\*(.*?)\*\*/g,
                    '<strong class="text-primary">$1</strong>',
                  ),
                }}
              />
            </div>
            <Sparkles className="absolute -right-2 -bottom-2 w-16 h-16 opacity-5 rotate-12 text-primary" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            label: "Estudo Total",
            val: formatTime(totalStudyTime),
            sub: "Tempo acumulado",
            icon: Clock,
            color: "var(--primary)",
          },
          {
            label: "Aproveitamento",
            val: `${overallAccuracy}%`,
            sub: "Média de acertos",
            icon: Target,
            color: "var(--accent-green)",
          },
          {
            label: "Questões",
            val: totalQuestions,
            sub: "Itens resolvidos",
            icon: CheckCircle2,
            color: "var(--accent-blue)",
          },
          {
            label: "Revisões",
            val: completedRevisions?.length || 0,
            sub: `${completionRate}% conclusão`,
            icon: Zap,
            color: "var(--accent-amber)",
          },
        ].map((s, i) => (
          <div key={i} className="soe-card p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <div
                className="p-1.5 rounded-md bg-secondary border border-border"
                style={{ color: s.color }}
              >
                <s.icon size={14} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
                {s.label}
              </span>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-foreground/90">
                {s.val}
              </p>
              <p className="text-[10px] font-bold text-muted-foreground opacity-40 uppercase tracking-tight">
                {s.sub}
              </p>
            </div>
          </div>
        ))}
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
              <div className="flex items-center gap-3 mb-6">
                <Target className="w-4 h-4 text-accent-green" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest">
                  Top Performance
                </h2>
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
                    Frequência
                  </span>
                </div>
                <span className="text-xs font-bold text-accent-green">
                  +{thisW?.questions || 0}q
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
    </div>
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
