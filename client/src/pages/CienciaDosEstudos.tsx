/**
 * CienciaDosEstudos - Página central das features científicas
 *
 * Agrupa:
 * - F10: Sugestão de Horário por Ritmo Biológico (peak hours)
 * - F12: Alerta de Ilusão de Conhecimento (metacognição)
 * - F13: Relatório Confiança vs Desempenho Real
 * - F17: Rebalanceamento de Disciplinas (tempo vs acerto vs peso)
 * - F19: Velocidade de Esquecimento por Disciplina
 *
 * Fundamentos:
 * - Cap 5.3: nível de alerta afeta codificação
 * - Cap 5.7: "familiaridade causa falsa sensação de domínio" — metacognição
 * - Bjork et al. (2013): Self-Regulated Learning: Beliefs, Techniques, and Illusions
 * - Küpper-Tetzel et al. (2014): intervalo ótimo depende do retenção individual
 */
import { trpc } from "@/lib/trpc";
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ScatterChart,
  Scatter,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import {
  Clock,
  Brain,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  BarChart2,
  Zap,
} from "lucide-react";
import { EmotionLogger } from "@/components/EmotionLogger";

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div
          className="p-1.5 rounded-lg"
          style={{
            background: "color-mix(in srgb, var(--primary) 15%, transparent)",
          }}
        >
          <div style={{ color: "var(--primary)" }}>{icon}</div>
        </div>
        <h2 className="text-base font-bold" style={{ color: "var(--app-fg)" }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`p-4 rounded-xl border ${className}`}
      style={{
        background: "var(--stat-bg)",
        borderColor: "var(--card-border)",
      }}
    >
      {children}
    </div>
  );
}

export default function CienciaDosEstudos() {
  const { data: peakHours = [], isLoading: loadingPeak } =
    trpc.v10.getPeakHours.useQuery();
  const { data: emotionCorr = [], isLoading: loadingEmotion } =
    trpc.v10.getEmotionCorrelation.useQuery();
  const { data: rebalance = [], isLoading: loadingRebalance } =
    trpc.v10.getDisciplineRebalance.useQuery();
  const { data: forgetting = [], isLoading: loadingForgetting } =
    trpc.v10.getForgettingVelocity.useQuery();

  // F10 peak hours chart data
  const peakData = useMemo(() => {
    const all24 = Array.from({ length: 24 }, (_, h) => {
      const entry = peakHours.find((p: any) => p.hour === h);
      return {
        hora: `${h}h`,
        acerto: entry ? Math.round(entry.avgAccuracy * 100) : null,
        sessoes: entry?.sessions || 0,
      };
    });
    return all24.filter((d: any) => d.acerto !== null);
  }, [peakHours]);

  const bestHour = peakHours.sort(
    (a: any, b: any) => b.avgAccuracy - a.avgAccuracy,
  )[0];

  // F12/F13 illusion of knowledge: disciplines where self-rating is high but accuracy is low
  const illusionCases = useMemo(() => {
    return rebalance
      .filter((d: any) => d.questionsResolved >= 10)
      .map((d: any) => {
        const avgRecall = forgetting.find(
          (f: any) => f.disciplineId === d.disciplineId,
        )?.avgRecallAt25;
        if (!avgRecall) return null;
        // High recall rating (4-5) but low accuracy: illusion of knowledge
        const gap = (avgRecall / 5) * 100 - d.accuracy;
        return { ...d, avgRecall, gap, hasIllusion: gap > 20 };
      })
      .filter(Boolean)
      .filter((d: any) => d!.hasIllusion)
      .sort((a: any, b: any) => b!.gap - a!.gap) as any[];
  }, [rebalance, forgetting]);

  // F17 rebalance: time vs accuracy scatter
  const rebalanceData = useMemo(() => {
    return rebalance
      .filter((d: any) => d.questionsResolved > 0 || d.studyTimeHours > 0)
      .map((d: any) => ({
        name: d.name.length > 12 ? d.name.slice(0, 11) + "…" : d.name,
        horas: d.studyTimeHours,
        acerto: d.accuracy,
        peso: d.editalWeight,
        color: d.color,
        questoes: d.questionsResolved,
        disciplineId: d.disciplineId,
      }));
  }, [rebalance]);

  // F17: find underinvested (high weight, low time) and overinvested (low accuracy, high time)
  const overinvested = useMemo(() => {
    return rebalanceData
      .filter((d: any) => d.acerto < 60 && d.horas > 5)
      .sort((a: any, b: any) => b.horas - a.horas)
      .slice(0, 3);
  }, [rebalanceData]);

  const underinvested = useMemo(() => {
    return rebalance
      .filter((d: any) => (d.editalWeight || 0) >= 7 && d.studyTimeHours < 3)
      .slice(0, 3);
  }, [rebalance]);

  // F19 forgetting velocity
  const volatileDisc = forgetting.filter(
    (f: any) => f.volatility === "high" && f.revisionCount >= 2,
  );
  const stableDisc = forgetting.filter(
    (f: any) => f.volatility === "low" && f.revisionCount >= 2,
  );

  const moodLabels: Record<number, string> = {
    1: "😫 Péssimo",
    2: "😕 Mal",
    3: "😐 Neutro",
    4: "🙂 Bem",
    5: "😄 Ótimo",
  };

  const noData =
    peakHours.length === 0 &&
    emotionCorr.length === 0 &&
    rebalance.length === 0;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-8">
      <div>
        <h1 className="text-2xl font-black" style={{ color: "var(--app-fg)" }}>
          Ciência dos Estudos
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-text)" }}>
          Insights baseados nos dados da sua jornada e na neurociência do
          aprendizado
        </p>
      </div>

      {noData && (
        <Card>
          <div className="text-center py-6 space-y-2">
            <Brain className="h-10 w-10 mx-auto opacity-20" />
            <p className="font-semibold" style={{ color: "var(--app-fg)" }}>
              Dados insuficientes
            </p>
            <p className="text-sm" style={{ color: "var(--muted-text)" }}>
              Continue usando o sistema — após algumas semanas de revisões e
              questões, esta página vai mostrar padrões valiosos sobre como e
              quando você aprende melhor.
            </p>
          </div>
        </Card>
      )}

      {/* F09 - Log emotion */}
      <Section
        title="Estado Emocional de Hoje"
        icon={<Zap className="h-4 w-4" />}
      >
        <Card>
          <p className="text-sm mb-3" style={{ color: "var(--muted-text)" }}>
            Emoções regulam a formação de memória (Izquierdo et al., 1998).
            Registre como está antes de estudar.
          </p>
          <EmotionLogger />
          {emotionCorr.length > 0 && (
            <div className="mt-4 space-y-2">
              <p
                className="text-xs font-semibold"
                style={{ color: "var(--muted-text)" }}
              >
                Seu desempenho por estado emocional:
              </p>
              {emotionCorr
                .sort((a: any, b: any) => b.mood - a.mood)
                .map((c: any) => (
                  <div key={c.mood} className="flex items-center gap-2">
                    <span className="w-24 text-xs">{moodLabels[c.mood]}</span>
                    <div
                      className="flex-1 h-4 rounded-full overflow-hidden"
                      style={{ background: "var(--card-border)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${c.avgAccuracy * 100}%`,
                          background:
                            c.avgAccuracy > 0.65
                              ? "var(--accent-green)"
                              : c.avgAccuracy > 0.45
                                ? "#eab308"
                                : "var(--accent-red)",
                        }}
                      />
                    </div>
                    <span className="text-xs w-10 text-right font-mono">
                      {Math.round(c.avgAccuracy * 100)}%
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--muted-text)" }}
                    >
                      ({c.count}x)
                    </span>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </Section>

      {/* F10 - Peak Hours */}
      {peakData.length > 0 && (
        <Section
          title="Seu Horário de Pico (F10)"
          icon={<Clock className="h-4 w-4" />}
        >
          <Card>
            {bestHour && (
              <div
                className="mb-3 p-3 rounded-lg"
                style={{
                  background:
                    "color-mix(in srgb, var(--accent-green) 12%, transparent)",
                  border:
                    "1px solid color-mix(in srgb, var(--accent-green) 30%, transparent)",
                }}
              >
                <p
                  className="text-sm font-bold"
                  style={{ color: "var(--accent-green)" }}
                >
                  🏆 Seu melhor horário: {bestHour.hour}h —{" "}
                  {Math.round(bestHour.avgAccuracy * 100)}% de acerto médio
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--app-fg)" }}
                >
                  Reserve os temas mais difíceis para esse período. O nível de
                  alerta influencia diretamente a codificação (Cap 5.3).
                </p>
              </div>
            )}
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={peakData}
                margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--card-border)"
                />
                <XAxis
                  dataKey="hora"
                  tick={{ fontSize: 10, fill: "var(--muted-text)" }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: "var(--muted-text)" }}
                />
                <Tooltip formatter={(v: any) => [`${v}%`, "Acerto"]} />
                <Bar
                  dataKey="acerto"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <p
              className="text-xs mt-2 text-center"
              style={{ color: "var(--muted-text)" }}
            >
              Acerto médio por horário de início das sessões
            </p>
          </Card>
        </Section>
      )}

      {/* F12/F13 - Illusion of Knowledge */}
      {illusionCases.length > 0 && (
        <Section
          title="Ilusão de Conhecimento (F12/F13)"
          icon={<AlertTriangle className="h-4 w-4" />}
        >
          <Card>
            <p className="text-sm mb-3" style={{ color: "var(--muted-text)" }}>
              Disciplinas onde você acha que sabe (alta confiança de evocação)
              mas os testes mostram o contrário. "A familiaridade com o material
              causa falsa sensação de domínio." (Chaves, Cap 5.7)
            </p>
            <div className="space-y-3">
              {illusionCases.map((d: any) => (
                <div
                  key={d.disciplineId}
                  className="flex items-center gap-3 p-3 rounded-lg border"
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--accent-red) 30%, transparent)",
                    background:
                      "color-mix(in srgb, var(--accent-red) 5%, transparent)",
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: d.color }}
                  />
                  <div className="flex-1">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--app-fg)" }}
                    >
                      {d.name}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--muted-text)" }}
                    >
                      Confiança de evocação:{" "}
                      {Math.round((d.avgRecall / 5) * 100)}% · Acerto real:{" "}
                      {d.accuracy}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className="text-sm font-black"
                      style={{ color: "var(--accent-red)" }}
                    >
                      -{Math.round(d.gap)}pts
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--muted-text)" }}
                    >
                      de gap
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs mt-3" style={{ color: "var(--muted-text)" }}>
              ⚡ Ação: faça mais questões dessas disciplinas antes de confiar na
              memória.
            </p>
          </Card>
        </Section>
      )}

      {/* F17 - Rebalance Report */}
      {rebalanceData.length > 0 && (
        <Section
          title="Rebalanceamento de Disciplinas (F17)"
          icon={<BarChart2 className="h-4 w-4" />}
        >
          {overinvested.length > 0 && (
            <Card>
              <p
                className="text-xs font-semibold mb-2"
                style={{ color: "#f97316" }}
              >
                ⚠️ Muito tempo investido, pouco resultado:
              </p>
              {overinvested.map((d: any) => (
                <div
                  key={d.disciplineId}
                  className="flex items-center gap-2 text-sm py-1"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: d.color }}
                  />
                  <span style={{ color: "var(--app-fg)" }}>{d.name}</span>
                  <span style={{ color: "var(--muted-text)" }}>
                    — {d.horas}h estudadas, {d.acerto}% de acerto
                  </span>
                </div>
              ))}
              <p
                className="text-xs mt-2"
                style={{ color: "var(--muted-text)" }}
              >
                Mais horas passivas (releitura) não ajudam. Tente mais questões
                e revisão ativa.
              </p>
            </Card>
          )}
          {underinvested.length > 0 && (
            <Card>
              <p
                className="text-xs font-semibold mb-2"
                style={{ color: "var(--accent-green)" }}
              >
                📌 Alta prioridade no edital, pouco tempo investido:
              </p>
              {underinvested.map((d: any) => (
                <div
                  key={d.disciplineId}
                  className="flex items-center gap-2 text-sm py-1"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: d.color }}
                  />
                  <span style={{ color: "var(--app-fg)" }}>{d.name}</span>
                  <span style={{ color: "var(--muted-text)" }}>
                    — peso {d.editalWeight}/10, apenas {d.studyTimeHours}h
                  </span>
                </div>
              ))}
            </Card>
          )}
          <Card>
            <p
              className="text-xs font-semibold mb-2"
              style={{ color: "var(--muted-text)" }}
            >
              Tempo estudado vs Acerto (por disciplina):
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={rebalanceData.slice(0, 8)}
                margin={{ top: 4, right: 8, left: -20, bottom: 30 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--card-border)"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: "var(--muted-text)" }}
                  angle={-30}
                  textAnchor="end"
                />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-text)" }} />
                <Tooltip
                  formatter={(v: any, name: string) => [
                    name === "acerto" ? `${v}%` : `${v}h`,
                    name === "acerto" ? "Acerto" : "Horas",
                  ]}
                />
                <Bar
                  dataKey="acerto"
                  fill="var(--primary)"
                  name="acerto"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="horas"
                  fill="color-mix(in srgb, var(--primary) 40%, transparent)"
                  name="horas"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Section>
      )}

      {/* F19 - Forgetting Velocity */}
      {forgetting.filter((f: any) => f.revisionCount >= 2).length > 0 && (
        <Section
          title="Velocidade de Esquecimento (F19)"
          icon={<TrendingDown className="h-4 w-4" />}
        >
          <Card>
            <p className="text-sm mb-3" style={{ color: "var(--muted-text)" }}>
              Baseado nas suas avaliações de dificuldade de evocação.
              Disciplinas com queda grande entre revisões iniciais (25 dias) e
              tardias (50 dias) precisam de mais testes aleatórios.
              (Küpper-Tetzel et al., 2014)
            </p>
            {volatileDisc.length > 0 && (
              <div className="mb-3">
                <p
                  className="text-xs font-semibold mb-1.5"
                  style={{ color: "var(--accent-red)" }}
                >
                  Alta volatilidade — precisa de mais testes:
                </p>
                {volatileDisc.map((d: any) => (
                  <div
                    key={d.disciplineId}
                    className="flex items-center gap-3 p-2 rounded-lg mb-1"
                    style={{
                      background:
                        "color-mix(in srgb, var(--accent-red) 8%, transparent)",
                    }}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: d.color }}
                    />
                    <span
                      className="text-sm flex-1"
                      style={{ color: "var(--app-fg)" }}
                    >
                      {d.disciplineName}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--muted-text)" }}
                    >
                      {d.avgRecallAt25
                        ? `↓ ${d.avgRecallAt25} → ${d.avgRecallAt50 ?? "?"}`
                        : ""}{" "}
                      (evocação)
                    </span>
                  </div>
                ))}
              </div>
            )}
            {stableDisc.length > 0 && (
              <div>
                <p
                  className="text-xs font-semibold mb-1.5"
                  style={{ color: "var(--accent-green)" }}
                >
                  Bem consolidadas — pode espaçar mais:
                </p>
                {stableDisc.slice(0, 3).map((d: any) => (
                  <div
                    key={d.disciplineId}
                    className="flex items-center gap-3 p-2 rounded-lg mb-1"
                    style={{
                      background:
                        "color-mix(in srgb, var(--accent-green) 8%, transparent)",
                    }}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: d.color }}
                    />
                    <span
                      className="text-sm flex-1"
                      style={{ color: "var(--app-fg)" }}
                    >
                      {d.disciplineName}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--accent-green)" }}
                    >
                      estável ✓
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Section>
      )}

      <div className="text-center py-4">
        <p className="text-xs" style={{ color: "var(--muted-text)" }}>
          Todos os insights são baseados nos seus dados reais e nas pesquisas
          citadas em <em>Você Não Sabe Estudar!</em> (Chaves, 2022)
        </p>
      </div>
    </div>
  );
}
