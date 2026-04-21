import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  TrendingUp, BookOpen, CheckCircle2, Target, Award,
  Clock, Zap, Share2, ArrowUp, ArrowDown, Calendar, PenTool, BarChart2, Brain, AlertCircle, Sparkles, Lightbulb
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, LineChart, Line,
} from "recharts";
import { ShareProgress } from "@/components/ShareProgress";
import { AIAnalysis } from "@/components/AIAnalysis";
import { StudyHeatmap } from "@/components/StudyHeatmap";
import { PeakHoursChart } from "@/components/PeakHoursChart";
import { motion, AnimatePresence } from "framer-motion";

export default function Statistics() {
  const { data: stats, isLoading } = trpc.dashboard.getStats.useQuery();
  const { data: weekly } = trpc.dashboard.getWeeklyStats.useQuery();
  const { data: mockExams } = trpc.mockExam.list.useQuery();
  const { data: revisions } = trpc.revision.list.useQuery({ completed: false });
  const { data: completedRevisions } = trpc.revision.list.useQuery({ completed: true });
  
  const [showShare, setShowShare] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiDiscipline, setAiDiscipline] = useState<{ id: number; name: string } | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const utils = trpc.useUtils();
  const getInsightMut = trpc.mentor.getStatsInsight.useMutation();

  const apiKey = (stats?.settings as any)?.aiApiKey ?? "";

  const resetAllStats = trpc.topic.resetAllStats.useMutation({
    onSuccess: () => {
      import("sonner").then(({ toast }) => toast.success("Estatísticas zeradas com sucesso."));
      utils.dashboard.getStats.invalidate();
      utils.topic.list.invalidate();
      setResetConfirm(false);
    },
    onError: () => import("sonner").then(({ toast }) => toast.error("Erro ao zerar estatísticas.")),
  });

  useEffect(() => {
    if (stats && apiKey && !aiInsight && !loadingInsight) {
      setLoadingInsight(true);
      getInsightMut.mutate({ apiKey, provider: (stats.settings as any)?.aiProvider ?? "gemini" }, {
        onSuccess: (res) => setAiInsight(res.insight),
        onSettled: () => setLoadingInsight(false)
      });
    }
  }, [!!stats, !!apiKey]);

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3" style={{ color: "var(--muted-text)" }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
        <p className="text-sm">Carregando...</p>
      </div>
    </div>
  );

  const disciplineStats = (stats?.disciplineStats || []) as any[];
  const totalQuestions = disciplineStats.reduce((acc, d) => acc + (d.performance?.questionsResolved || 0), 0);
  const totalCorrect = disciplineStats.reduce((acc, d) => acc + (d.performance?.correctCount || 0), 0);
  const overallAccuracy = totalQuestions > 0 ? Math.round(totalCorrect / totalQuestions * 100) : 0;
  const totalStudyTime = disciplineStats.reduce((acc, d) => acc + (d.studyTimeSeconds || 0), 0);
  const sessionLogs = (stats?.settings as any)?.studySessionLog || [];

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h === 0 ? `${m}min` : `${h}h ${m}m`;
  };

  const disciplinesByAccuracy = [...disciplineStats]
    .filter(d => d.performance && d.performance.questionsResolved > 0)
    .sort((a, b) => (b.performance?.accuracy || 0) - (a.performance?.accuracy || 0));

  const studyTimeData = [...disciplineStats]
    .filter(d => (d.studyTimeSeconds || 0) > 0)
    .sort((a, b) => (b.studyTimeSeconds || 0) - (a.studyTimeSeconds || 0))
    .slice(0, 7)
    .map(d => ({
      name: d.name.length > 14 ? d.name.slice(0, 13) + "…" : d.name,
      horas: Math.round((d.studyTimeSeconds || 0) / 3600 * 10) / 10,
      color: d.color,
    }));

  const accuracyData = disciplinesByAccuracy.slice(0, 8).map(d => ({
    name: d.name.length > 14 ? d.name.slice(0, 13) + "…" : d.name,
    acerto: d.performance?.accuracy || 0,
    color: d.color,
  }));

  const examChartData = mockExams?.slice().reverse().map(e => ({
    data: format(new Date(e.date), "dd/MM"),
    acerto: Math.round((e.correct / e.totalQuestions) * 100),
  })) || [];

  const totalRevisions = (revisions?.length || 0) + (completedRevisions?.length || 0);
  const completionRate = totalRevisions > 0
    ? Math.round((completedRevisions?.length || 0) / totalRevisions * 100) : 0;

  const thisW = (weekly as any)?.thisWeek;
  const lastW = (weekly as any)?.lastWeek;

  const CT = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="px-3 py-2 rounded-xl text-xs shadow-lg"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <p className="font-semibold mb-1" style={{ color: "var(--app-fg)" }}>{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}{p.unit || ""}</p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 w-full pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--primary)" }}>Estatísticas</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-text)" }}>Seu progresso real em números e insights</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowShare(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95"
            style={{ background: "var(--primary)", color: "white", boxShadow: "0 4px 12px var(--primary-shadow)" }}>
            <Share2 className="w-4 h-4" /><span className="hidden sm:inline">Compartilhar</span>
          </button>
          {!resetConfirm ? (
            <button onClick={() => setResetConfirm(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:bg-red-500/10"
              style={{ color: "var(--accent-red, #dc2626)", border: "1px solid color-mix(in srgb, var(--accent-red, #dc2626) 20%, transparent)" }}
              title="Zerar estatísticas de questões">
              <AlertCircle className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setResetConfirm(false)}
                className="px-3 py-2 rounded-xl text-sm font-semibold"
                style={{ background: "var(--stat-bg)", color: "var(--muted-text)" }}>
                Cancelar
              </button>
              <button onClick={() => resetAllStats.mutate()} disabled={resetAllStats.isPending}
                className="px-3 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: "#dc2626" }}>
                Zerar Agora
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mentor's Flash Insight */}
      <AnimatePresence>
        {aiInsight && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl flex items-center gap-4 relative overflow-hidden"
            style={{ 
              background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 15%, transparent) 0%, color-mix(in srgb, var(--primary) 5%, transparent) 100%)",
              border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)"
            }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--primary)", color: "white" }}>
              <Lightbulb className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "var(--primary)", opacity: 0.8 }}>Destaque do Mentor IA</p>
              <p className="text-sm font-medium leading-relaxed" style={{ color: "var(--app-fg)" }}
                 dangerouslySetInnerHTML={{ __html: aiInsight.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
            </div>
            <Sparkles className="absolute -right-2 -bottom-2 w-16 h-16 opacity-10 rotate-12" style={{ color: "var(--primary)" }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Tempo de Estudo", val: formatTime(totalStudyTime), sub: "Total acumulado", icon: Clock, color: "var(--primary)" },
          { label: "Aproveitamento", val: `${overallAccuracy}%`, sub: "Média geral", icon: Target, color: "var(--accent-green)" },
          { label: "Questões", val: totalQuestions, sub: "Total resolvidas", icon: CheckCircle2, color: "var(--accent-blue)" },
          { label: "Revisões", val: completedRevisions?.length || 0, sub: `${completionRate}% concluídas`, icon: Zap, color: "var(--accent-amber)" },
        ].map((s, i) => (
          <div key={i} className="p-4 rounded-2xl flex flex-col gap-2" 
            style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" 
                style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)`, color: s.color }}>
                <s.icon className="w-4 h-4" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>{s.label}</p>
              <p className="text-xl font-black" style={{ color: "var(--app-fg)" }}>{s.val}</p>
              <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Routine Analysis */}
        <div className="lg:col-span-2 space-y-6">
          <div className="soe-card p-5">
            <div className="flex items-center gap-2 mb-5">
              <Calendar className="w-5 h-5" style={{ color: "var(--primary)" }} />
              <h2 className="text-sm font-bold" style={{ color: "var(--app-fg)" }}>Análise de Rotina</h2>
            </div>
            <div className="space-y-8">
              <StudyHeatmap logs={sessionLogs} />
              <div className="pt-4 border-t" style={{ borderColor: "var(--card-border)" }}>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Pico de Performance (Horários)</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: "var(--primary)", opacity: 0.8 }} />
                    <span className="text-[9px]" style={{ color: "var(--muted-text)" }}>% de Acerto</span>
                  </div>
                </div>
                <PeakHoursChart logs={sessionLogs} />
                <p className="text-[10px] mt-4 text-center italic" style={{ color: "var(--muted-text)" }}>
                  As barras mais escuras representam horários com mais sessões registradas.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="soe-card p-5">
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" style={{ color: "var(--primary)" }} />
                  <h2 className="text-xs font-bold" style={{ color: "var(--app-fg)" }}>Horas por Disciplina</h2>
                </div>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={studyTimeData} layout="vertical" margin={{ left: 30, right: 30 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "var(--muted-text)" }} width={80} axisLine={false} tickLine={false} />
                    <Tooltip content={<CT />} cursor={{ fill: "var(--stat-bg)", opacity: 0.4 }} />
                    <Bar dataKey="horas" radius={[0, 4, 4, 0]} unit="h">
                      {studyTimeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="soe-card p-5">
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4" style={{ color: "var(--accent-green)" }} />
                  <h2 className="text-xs font-bold" style={{ color: "var(--app-fg)" }}>Ranking de Acerto</h2>
                </div>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={accuracyData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--muted-text)" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "var(--muted-text)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CT />} cursor={{ fill: "var(--stat-bg)", opacity: 0.4 }} />
                    <Bar dataKey="acerto" radius={[4, 4, 0, 0]} unit="%">
                      {accuracyData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Evolução e Metas */}
        <div className="space-y-6">
          <div className="soe-card p-5">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-4 h-4" style={{ color: "var(--primary)" }} />
              <h2 className="text-xs font-bold" style={{ color: "var(--app-fg)" }}>Evolução Simulados</h2>
            </div>
            {examChartData.length > 0 ? (
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={examChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--card-border)" />
                    <XAxis dataKey="data" tick={{ fontSize: 9, fill: "var(--muted-text)" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "var(--muted-text)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CT />} />
                    <Line type="monotone" dataKey="acerto" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, fill: "var(--primary)" }} unit="%" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-xs text-center p-4" style={{ color: "var(--muted-text)" }}>
                Nenhum simulado registrado ainda.
              </div>
            )}
          </div>

          <div className="soe-card p-5">
            <div className="flex items-center gap-2 mb-5">
              <Zap className="w-4 h-4" style={{ color: "var(--accent-amber)" }} />
              <h2 className="text-xs font-bold" style={{ color: "var(--app-fg)" }}>Comprometimento</h2>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Revisões Concluídas</span>
                  <span className="text-xs font-black" style={{ color: "var(--app-fg)" }}>{completionRate}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--stat-bg)" }}>
                  <div className="h-full rounded-full transition-all duration-1000" 
                    style={{ width: `${completionRate}%`, background: "var(--accent-amber)", boxShadow: "0 0 8px color-mix(in srgb, var(--accent-amber) 40%, transparent)" }} />
                </div>
              </div>
              
              <div className="pt-2">
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-semibold" style={{ color: "var(--app-fg)" }}>Frequência Semanal</span>
                  </div>
                  <span className="text-xs font-bold" style={{ color: "var(--accent-green)" }}>+{thisW?.questions || 0}q</span>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-semibold" style={{ color: "var(--app-fg)" }}>Sequência</span>
                  </div>
                  <span className="text-xs font-bold" style={{ color: "var(--gold)" }}>{(stats as any)?.settings?.studyStreak?.current || 0} dias</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top / Bottom */}
      {(disciplinesByAccuracy.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="soe-card p-5">
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--app-fg)" }}>
              <span style={{ color: "var(--accent-green)" }}>↑</span> Melhores disciplinas
            </h3>
            <div className="space-y-3">
              {disciplinesByAccuracy.slice(0, 3).map((d, i) => (
                <div key={d.disciplineId} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ background: "var(--stat-bg)", color: "var(--accent-green)" }}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs font-medium truncate">{d.name}</p>
                      <span className="text-xs font-bold ml-2" style={{ color: "var(--accent-green)" }}>{d.performance?.accuracy}%</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--stat-border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${d.performance?.accuracy}%`, background: "var(--accent-green)" }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="soe-card p-5">
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--app-fg)" }}>
              <span style={{ color: "var(--accent-red, #dc2626)" }}>↓</span> Para reforçar
            </h3>
            <div className="space-y-3">
              {[...disciplinesByAccuracy].reverse().slice(0, 3).map((d, i) => (
                <div key={d.disciplineId} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ background: "var(--stat-bg)", color: "var(--accent-red, #dc2626)" }}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs font-medium truncate">{d.name}</p>
                      <span className="text-xs font-bold ml-2" style={{ color: "var(--accent-red, #dc2626)" }}>{d.performance?.accuracy}%</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--stat-border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${d.performance?.accuracy}%`, background: "var(--accent-red, #dc2626)" }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {disciplineStats.length === 0 && (
        <div className="soe-card p-12 text-center">
          <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-15" style={{ color: "var(--gold)" }} />
          <p className="text-sm" style={{ color: "var(--muted-text)" }}>Cadastre disciplinas e temas para ver suas estatísticas aqui.</p>
        </div>
      )}

      {/* Full discipline list with AI buttons */}
      {disciplineStats.length > 0 && (
        <div className="soe-card p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold" style={{ color: "var(--app-fg)" }}>Todas as disciplinas</h3>
            <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: "var(--muted-text)" }}>
              {disciplineStats.length} matérias cadastradas
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[...disciplineStats]
              .sort((a, b) => (b.performance?.questionsResolved || 0) - (a.performance?.questionsResolved || 0))
              .map(d => {
                const acc = d.performance?.accuracy ?? null;
                const acColor = acc === null ? "var(--muted-text)" : acc >= 70 ? "var(--accent-green)" : acc >= 50 ? "var(--accent-amber)" : "var(--accent-red, #dc2626)";
                return (
                  <div key={d.disciplineId} className="flex items-center gap-3 px-4 py-3 rounded-2xl group transition-all hover:scale-[1.01]"
                    style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
                    <div className="w-2.5 h-10 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: "var(--app-fg)" }}>{d.name}</p>
                      <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>{d.performance?.questionsResolved || 0} questões resolvidas</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {acc !== null && (
                        <div className="text-right">
                          <p className="text-sm font-black" style={{ color: acColor }}>{acc}%</p>
                          <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--card-border) 50%, transparent)" }}>
                            <div className="h-full rounded-full" style={{ width: `${acc}%`, background: acColor }} />
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => { setAiDiscipline({ id: d.disciplineId, name: d.name }); setShowAI(true); }}
                        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: "var(--card-border)", color: "var(--app-fg)" }}>
                        <Brain className="w-4 h-4" />
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
          onClose={() => { setShowAI(false); setAiDiscipline(null); }}
          disciplineId={aiDiscipline?.id}
          disciplineName={aiDiscipline?.name}
        />
      )}
    </div>
  );
}
