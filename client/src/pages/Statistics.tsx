import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { format } from "date-fns";
import {
  TrendingUp, BookOpen, CheckCircle2, Target, Award,
  Clock, Zap, Share2, ArrowUp, ArrowDown, Calendar, PenTool, BarChart2, Brain, AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, LineChart, Line,
} from "recharts";
import { ShareProgress } from "@/components/ShareProgress";
import { AIAnalysis } from "@/components/AIAnalysis";

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
  const utils = trpc.useUtils();
  const resetAllStats = trpc.topic.resetAllStats.useMutation({
    onSuccess: () => {
      import("sonner").then(({ toast }) => toast.success("Estatísticas zeradas com sucesso."));
      utils.dashboard.getStats.invalidate();
      utils.topic.list.invalidate();
      setResetConfirm(false);
    },
    onError: () => import("sonner").then(({ toast }) => toast.error("Erro ao zerar estatísticas.")),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3" style={{ color: "var(--muted-text)" }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: "var(--gold)", borderTopColor: "transparent" }} />
        <p className="text-sm">Carregando...</p>
      </div>
    </div>
  );

  const disciplineStats = (stats?.disciplineStats || []) as any[];
  const totalQuestions = disciplineStats.reduce((acc, d) => acc + (d.performance?.questionsResolved || 0), 0);
  const totalCorrect = disciplineStats.reduce((acc, d) => acc + (d.performance?.correctCount || 0), 0);
  const overallAccuracy = totalQuestions > 0 ? Math.round(totalCorrect / totalQuestions * 100) : 0;
  const totalStudyTime = disciplineStats.reduce((acc, d) => acc + (d.studyTimeSeconds || 0), 0);

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
    <div className="space-y-5 w-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight soe-gold-text">Visão Geral</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-text)" }}>Resumo do seu desempenho</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setAiDiscipline(null); setShowAI(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: "linear-gradient(135deg, var(--accent-blue) 0%, #7c3aed 100%)", color: "#fff" }}>
            <Brain className="w-4 h-4" /><span className="hidden sm:inline">Diagnóstico IA</span>
          </button>
          <button onClick={() => setShowShare(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            <Share2 className="w-4 h-4" /><span className="hidden sm:inline">Compartilhar</span>
          </button>
          {!resetConfirm ? (
            <button onClick={() => setResetConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: "color-mix(in srgb, #dc2626 12%, transparent)", color: "#dc2626" }}
              title="Zerar estatísticas de questões">
              <AlertCircle className="w-4 h-4" /><span className="hidden sm:inline">Zerar Dados</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setResetConfirm(false)}
                className="px-3 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "var(--stat-bg)", color: "var(--muted-text)" }}>
                Cancelar
              </button>
              <button onClick={() => resetAllStats.mutate()} disabled={resetAllStats.isPending}
                className="px-3 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "#dc2626", color: "#fff" }}>
                {resetAllStats.isPending ? "..." : "Confirmar"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hero */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Target, label: "Questões resolvidas", value: totalQuestions.toLocaleString("pt-BR"), color: "var(--accent-blue)" },
          { icon: Award, label: "Acerto geral", value: `${overallAccuracy}%`, color: overallAccuracy >= 70 ? "var(--accent-green)" : overallAccuracy >= 50 ? "var(--accent-amber)" : "var(--accent-red)" },
          { icon: Clock, label: "Tempo de estudo", value: formatTime(totalStudyTime), color: "var(--gold)" },
          { icon: BookOpen, label: "Disciplinas", value: disciplineStats.length, color: "#6d5fcf" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="soe-stat-card">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl flex-shrink-0" style={{ background: `${color}18` }}>
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--muted-text)" }}>{label}</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: "var(--app-fg)" }}>{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Semanal */}
      {thisW && (
        <div className="soe-card p-5">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: "var(--app-fg)" }}>
            <Calendar className="w-4 h-4" style={{ color: "var(--primary)" }} /> Esta semana
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: "var(--stat-bg)", color: "var(--muted-text)", border: "1px solid var(--card-border)" }}>
              vs semana passada
            </span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Temas", curr: thisW.topics, prev: lastW?.topics || 0, icon: BookOpen, color: "#6366f1" },
              { label: "Questões", curr: thisW.questions, prev: lastW?.questions || 0, icon: PenTool, color: "#0ea5e9" },
              { label: "Aproveitamento", curr: thisW.questions > 0 ? Math.round(thisW.correct / thisW.questions * 100) : 0, prev: lastW?.questions > 0 ? Math.round(lastW.correct / lastW.questions * 100) : 0, unit: "%", icon: Target, color: "#10b981" },
              { label: "Tempo", curr: Math.round(thisW.studySeconds / 60), prev: Math.round((lastW?.studySeconds || 0) / 60), fmt: (v: number) => v >= 60 ? `${Math.floor(v / 60)}h${v % 60 > 0 ? ` ${v % 60}m` : ""}` : `${v}min`, icon: Clock, color: "#8b5cf6" },
            ].map((item: any) => {
              const currDisplay = item.fmt ? item.fmt(item.curr) : `${item.curr}${item.unit || ""}`;
              const prevDisplay = item.fmt ? item.fmt(item.prev) : `${item.prev}${item.unit || ""}`;
              const delta = item.curr - item.prev;
              const pos = delta > 0, neutral = delta === 0;
              return (
                <div key={item.label} className="rounded-2xl p-4 flex flex-col gap-2"
                  style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
                  <div className="flex items-center justify-between">
                    <item.icon className="w-5 h-5" style={{ color: item.color }} />
                    {!neutral && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5"
                        style={{ background: pos ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", color: pos ? "var(--accent-green)" : "var(--accent-red, #dc2626)" }}>
                        {pos ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                        {item.fmt ? item.fmt(Math.abs(delta)) : `${Math.abs(delta)}${item.unit || ""}`}
                      </span>
                    )}
                    {neutral && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--stat-bg)", color: "var(--muted-text)" }}>= igual</span>}
                  </div>
                  <div>
                    <div className="text-2xl font-black tabular-nums" style={{ color: item.color }}>{currDisplay}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: "var(--muted-text)" }}>{item.label}</div>
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--muted-text)", opacity: 0.7 }}>
                    Semana passada: <span className="font-semibold">{prevDisplay}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Revisões + Streak + Simulados */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="soe-stat-card flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4" style={{ color: "var(--accent-green)" }} />
            <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: "var(--muted-text)" }}>Revisões</span>
          </div>
          <div className="flex justify-between items-end">
            <div><div className="text-2xl font-bold" style={{ color: "var(--app-fg)" }}>{completedRevisions?.length || 0}</div><div className="text-xs" style={{ color: "var(--muted-text)" }}>completadas</div></div>
            <div className="text-right"><div className="text-2xl font-bold" style={{ color: "var(--accent-amber)" }}>{revisions?.length || 0}</div><div className="text-xs" style={{ color: "var(--muted-text)" }}>pendentes</div></div>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--stat-border)" }}>
            <div className="h-full rounded-full" style={{ width: `${completionRate}%`, background: "var(--accent-green)" }} />
          </div>
          <p className="text-xs" style={{ color: "var(--muted-text)" }}>{completionRate}% concluídas</p>
        </div>

        <div className="soe-stat-card flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4" style={{ color: "var(--gold)" }} />
            <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: "var(--muted-text)" }}>Sequência</span>
          </div>
          <div className="flex justify-between items-end">
            <div><div className="text-2xl font-bold" style={{ color: "var(--app-fg)" }}>{(stats as any)?.settings?.studyStreak?.current || 0}</div><div className="text-xs" style={{ color: "var(--muted-text)" }}>dias atual</div></div>
            <div className="text-right"><div className="text-2xl font-bold soe-gold-text">{(stats as any)?.settings?.studyStreak?.best || 0}</div><div className="text-xs" style={{ color: "var(--muted-text)" }}>recorde</div></div>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--stat-border)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (((stats as any)?.settings?.studyStreak?.current || 0) / Math.max(1, (stats as any)?.settings?.studyStreak?.best || 1)) * 100)}%`, background: "var(--gold)" }} />
          </div>
        </div>

        <div className="soe-stat-card flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="h-4 w-4" style={{ color: "var(--accent-blue)" }} />
            <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: "var(--muted-text)" }}>Simulados</span>
          </div>
          <div className="flex justify-between items-end">
            <div><div className="text-2xl font-bold" style={{ color: "var(--app-fg)" }}>{mockExams?.length || 0}</div><div className="text-xs" style={{ color: "var(--muted-text)" }}>realizados</div></div>
            {mockExams && mockExams.length > 0 && (
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: "var(--accent-blue)" }}>
                  {Math.round(mockExams.reduce((a, e) => a + e.correct, 0) / mockExams.reduce((a, e) => a + e.totalQuestions, 0) * 100)}%
                </div>
                <div className="text-xs" style={{ color: "var(--muted-text)" }}>média acerto</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        {studyTimeData.length > 0 && (
          <div className="soe-card p-5">
            <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--app-fg)" }}>Tempo de estudo (horas)</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={studyTimeData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--stat-border)" horizontal={false} />
                  <XAxis type="number" dataKey="horas" tick={{ fontSize: 10, fill: "var(--muted-text)" }} tickLine={false} axisLine={false} unit="h" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-text)" }} tickLine={false} axisLine={false} width={80} />
                  <Tooltip content={<CT />} />
                  <Bar dataKey="horas" name="Horas" radius={[0, 4, 4, 0]} unit="h">
                    {studyTimeData.map((e, i) => <Cell key={i} fill={e.color || "var(--gold)"} opacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {accuracyData.length > 0 && (
          <div className="soe-card p-5">
            <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--app-fg)" }}>Acerto por disciplina</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={accuracyData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--stat-border)" horizontal={false} />
                  <XAxis type="number" dataKey="acerto" domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--muted-text)" }} tickLine={false} axisLine={false} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-text)" }} tickLine={false} axisLine={false} width={80} />
                  <Tooltip content={<CT />} />
                  <Bar dataKey="acerto" name="Acerto" radius={[0, 4, 4, 0]} unit="%">
                    {accuracyData.map((e, i) => (
                      <Cell key={i} fill={e.acerto >= 70 ? "var(--accent-green)" : e.acerto >= 50 ? "var(--accent-amber)" : "var(--accent-red, #dc2626)"} opacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Simulados evolução */}
      {examChartData.length > 1 && (
        <div className="soe-card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--app-fg)" }}>Evolução nos simulados</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={examChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--stat-border)" />
                <XAxis dataKey="data" tick={{ fontSize: 10, fill: "var(--muted-text)" }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--muted-text)" }} tickLine={false} axisLine={false} unit="%" />
                <Tooltip content={<CT />} />
                <Line type="monotone" dataKey="acerto" name="Acerto" stroke="var(--accent-green)" strokeWidth={2} dot={{ r: 4, fill: "var(--accent-green)" }} unit="%" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--app-fg)" }}>Todas as disciplinas</h3>
          <div className="space-y-2">
            {[...disciplineStats]
              .sort((a, b) => (b.performance?.questionsResolved || 0) - (a.performance?.questionsResolved || 0))
              .map(d => {
                const acc = d.performance?.accuracy ?? null;
                const acColor = acc === null ? "var(--muted-text)" : acc >= 70 ? "var(--accent-green)" : acc >= 50 ? "var(--accent-amber)" : "var(--accent-red, #dc2626)";
                return (
                  <div key={d.disciplineId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{ background: "var(--stat-bg)" }}>
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--app-fg)" }}>{d.name}</span>
                    {acc !== null && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: `color-mix(in srgb, ${acColor} 15%, transparent)`, color: acColor }}>
                        {acc}%
                      </span>
                    )}
                    <span className="text-xs flex-shrink-0" style={{ color: "var(--muted-text)" }}>
                      {d.performance?.questionsResolved || 0}q
                    </span>
                    <button
                      onClick={() => { setAiDiscipline({ id: d.disciplineId, name: d.name }); setShowAI(true); }}
                      title="Diagnóstico IA"
                      className="flex-shrink-0 p-1.5 rounded-lg transition-opacity hover:opacity-80"
                      style={{ background: "color-mix(in srgb, var(--accent-blue) 15%, transparent)", color: "var(--accent-blue)" }}>
                      <Brain style={{ width: 13, height: 13 }} />
                    </button>
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
