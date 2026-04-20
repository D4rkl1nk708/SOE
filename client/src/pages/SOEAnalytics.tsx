/**
 * SOEAnalytics — Análise IA
 *
 * Princípio: mostrar apenas o que o usuário NÃO consegue enxergar sozinho.
 * Cada insight é gerado por correlações cruzadas entre múltiplas dimensões.
 * Seguindo SRP: cada função de análise é pura e isolada.
 */

import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Clock, Brain, Zap, TrendingDown, TrendingUp,
  AlertCircle, BarChart2, Shuffle, ChevronRight,
  Target, Trophy, Percent,
} from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";

// ─── Utilitários ──────────────────────────────────────────────────────────────

function daysSince(d?: string): number {
  if (!d) return 9999;
  try { return differenceInDays(new Date(), parseISO(d)); } catch { return 9999; }
}
function safePct(c: number, t: number): number | null { return t > 0 ? Math.round(c / t * 100) : null; }
function accColor(a: number | null): string {
  if (a === null) return "var(--muted-text)";
  return a >= 70 ? "var(--accent-green)" : a >= 50 ? "var(--accent-amber)" : "var(--accent-red, #dc2626)";
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ET {
  id: number; name: string;
  disciplineId: number; disciplineName: string; disciplineColor: string; disciplineWeight: number;
  studyDate: string; studyTimeSeconds: number;
  questions: number; accuracy: number | null;
  correctCount: number; errorCount: number;
  errorByAttention: number; errorByForgetting: number; errorByTheory: number; errorByTrap: number;
  completedRevisions: number;
  // TEC enriched
  incidencia: number | null;        // 0.0–1.0 — frequência real do assunto na banca
  totalQuestoesBanca: number | null;// total disponível no TEC
  bancaDominante: string | null;
  dificuldade: number | null;
}

// ─── Insight generators (pure functions) ─────────────────────────────────────

/** Paradoxo do Conforto: muito tempo, baixo acerto → abordagem errada, não falta de tempo */
function comfortParadox(topics: ET[]) {
  const w = topics.filter(t => t.questions >= 5 && t.accuracy !== null);
  if (w.length < 3) return [];
  const avgTime = w.reduce((s, t) => s + t.studyTimeSeconds, 0) / w.length;
  return w
    .filter(t => t.studyTimeSeconds > avgTime * 1.5 && (t.accuracy ?? 100) < 65)
    .sort((a, b) => b.studyTimeSeconds - a.studyTimeSeconds)
    .slice(0, 3)
    .map(t => ({ ...t, timeHours: Math.round(t.studyTimeSeconds / 360) / 10 }));
}

/** Falsa Segurança: acerto alto mas amostra insuficiente (<10 questões) */
function falseSecurity(topics: ET[]) {
  return topics
    .filter(t => (t.accuracy ?? 0) >= 75 && t.questions > 0 && t.questions < 10)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))
    .slice(0, 4);
}

/** Alto Alavancagem: acerto 55–69%, perto do limiar — maior ROI marginal */
function highLeverage(topics: ET[]) {
  return topics
    .filter(t => { const a = t.accuracy ?? 0; return a >= 55 && a < 70 && t.questions >= 5; })
    .sort((a, b) => b.disciplineWeight - a.disciplineWeight || (b.accuracy ?? 0) - (a.accuracy ?? 0))
    .slice(0, 5);
}

/** Regressão Silenciosa: muito estudo, revisões feitas, mas acerto baixo e parado há 30+ dias */
function silentRegression(topics: ET[]) {
  return topics
    .filter(t => t.questions >= 10 && (t.accuracy ?? 100) < 70 && t.completedRevisions >= 2 && daysSince(t.studyDate) > 30)
    .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100))
    .slice(0, 4);
}

/** Padrão Sistêmico de Erros: qual tipo domina em toda a preparação */
function dominantErrorPattern(topics: ET[]) {
  const totals = {
    attention: topics.reduce((s, t) => s + t.errorByAttention, 0),
    forgetting: topics.reduce((s, t) => s + t.errorByForgetting, 0),
    theory: topics.reduce((s, t) => s + t.errorByTheory, 0),
    trap: topics.reduce((s, t) => s + t.errorByTrap, 0),
  };
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  if (grand < 10) return null;
  const meta = {
    attention: { label: "Desatenção", action: "Leia o enunciado duas vezes antes de marcar.", color: "var(--accent-amber)", icon: "👁" },
    forgetting: { label: "Esquecimento", action: "Aumente a frequência de revisões nas fases iniciais.", color: "var(--accent-blue)", icon: "🧠" },
    theory: { label: "Lacuna Teórica", action: "Esses temas precisam de revisão conceitual, não mais questões.", color: "var(--accent-red, #dc2626)", icon: "📖" },
    trap: { label: "Pegadinha de Banca", action: "Pratique questões da mesma banca — aprenda o estilo de enganar.", color: "#8b5cf6", icon: "🎯" },
  };
  const dominant = (Object.keys(totals) as Array<keyof typeof totals>).sort((a, b) => totals[b] - totals[a])[0];
  return { dominant, totals, grand, percentage: Math.round(totals[dominant] / grand * 100), count: totals[dominant], ...meta[dominant] };
}

/** Desalinhamento Estratégico: peso no edital vs. tempo dedicado */
function weightMismatch(
  disciplines: Array<{ disciplineId: number; name: string; color: string; studyTimeSeconds: number; topics: ET[] }>,
  totalWeight: number
) {
  const totalTime = disciplines.reduce((s, d) => s + d.studyTimeSeconds, 0);
  if (totalTime === 0 || totalWeight === 0) return [];
  return disciplines
    .filter(d => d.studyTimeSeconds > 0)
    .map(d => {
      const ws = d.topics.reduce((s, t) => s + t.disciplineWeight, 0) / totalWeight;
      const ts = d.studyTimeSeconds / totalTime;
      return { ...d, weightShare: ws, timeShare: ts, gap: ws - ts };
    })
    .filter(d => d.gap > 0.08)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3);
}

/** Cronograma Ignorado: revisões agendadas mas < 40% executadas */
function revisionGap(
  topics: ET[],
  revisions: Array<{ topicId: number; completed: boolean; ignored: boolean }>
) {
  const map = new Map<number, { total: number; done: number }>();
  for (const r of revisions) {
    if (r.ignored) continue;
    const e = map.get(r.topicId) ?? { total: 0, done: 0 };
    e.total++; if (r.completed) e.done++;
    map.set(r.topicId, e);
  }
  return topics
    .filter(t => { const e = map.get(t.id); return e && e.total >= 3 && e.done / e.total < 0.4; })
    .map(t => { const e = map.get(t.id)!; return { ...t, revTotal: e.total, revDone: e.done, revRate: Math.round(e.done / e.total * 100) }; })
    .sort((a, b) => a.revRate - b.revRate)
    .slice(0, 4);
}


/**
 * INSIGHT: Score de Risco de Reprovação
 * Fórmula: peso_edital × (1 - acerto) × fator_esquecimento × (1 + incidencia_bonus)
 * Quanto maior, mais urgente é trabalhar o tema.
 */
interface RiskScore {
  id: number; name: string;
  disciplineName: string; disciplineColor: string;
  accuracy: number; incidencia: number; weight: number;
  riskScore: number;
  projectedPointsLost: number; // pontos que vai perder na prova se continuar assim
  daysStale: number;
  bancaDominante: string | null;
}

function computeRiskScores(topics: ET[]): RiskScore[] {
  const withData = topics.filter(t => t.questions >= 5 && t.accuracy !== null);
  if (withData.length === 0) return [];

  return withData
    .map(t => {
      const acc = (t.accuracy ?? 0) / 100;
      const inc = t.incidencia ?? 0.05; // assume 5% se não tem dado real
      const stale = daysSince(t.studyDate);
      const forgettingFactor = Math.min(1 + stale / 180, 2.0); // esquecimento cresce com o tempo
      const risk = t.disciplineWeight * (1 - acc) * forgettingFactor * (1 + inc * 2);
      // Pontos projetados perdidos: incidência × questões da banca × (1 - acerto)
      const projectedLoss = (t.totalQuestoesBanca ?? 10) * inc * (1 - acc);
      return {
        id: t.id, name: t.name,
        disciplineName: t.disciplineName, disciplineColor: t.disciplineColor,
        accuracy: t.accuracy ?? 0,
        incidencia: inc,
        weight: t.disciplineWeight,
        riskScore: risk,
        projectedPointsLost: Math.round(projectedLoss * 10) / 10,
        daysStale: stale,
        bancaDominante: t.bancaDominante,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 6);
}

/**
 * INSIGHT: Nota Projetada
 * Se a prova fosse hoje, qual seria sua nota baseado no acerto atual ponderado pela incidência?
 */
interface GradeProjection {
  projectedGrade: number;      // 0–100
  topicsWithIncidencia: number;
  totalTopics: number;
  hasRealIncidencia: boolean;
  breakdown: Array<{ disciplineName: string; color: string; contribution: number; maxContribution: number }>;
}

function computeGradeProjection(topics: ET[], disciplines: Array<{ disciplineId: number; name: string; color: string; topics: ET[] }>): GradeProjection {
  const withData = topics.filter(t => t.questions >= 3 && t.accuracy !== null);
  const withInc = withData.filter(t => t.incidencia !== null && t.incidencia > 0);

  // Se tem incidência real, usa ela; senão, usa peso como proxy
  const useRealIncidencia = withInc.length >= 3;

  const totalWeight = withData.reduce((s, t) =>
    s + (useRealIncidencia && t.incidencia ? t.incidencia : t.disciplineWeight / 10), 0
  );
  if (totalWeight === 0) return { projectedGrade: 0, topicsWithIncidencia: 0, totalTopics: topics.length, hasRealIncidencia: false, breakdown: [] };

  const weightedAcc = withData.reduce((s, t) => {
    const w = useRealIncidencia && t.incidencia ? t.incidencia : t.disciplineWeight / 10;
    return s + (t.accuracy ?? 0) * w;
  }, 0);

  const projectedGrade = Math.round(weightedAcc / totalWeight);

  const breakdown = disciplines.map(d => {
    const dTopics = d.topics.filter(t => t.questions >= 3 && t.accuracy !== null);
    if (dTopics.length === 0) return null;
    const dWeight = dTopics.reduce((s, t) => s + (useRealIncidencia && t.incidencia ? t.incidencia : t.disciplineWeight / 10), 0);
    const dAcc = dTopics.reduce((s, t) => s + (t.accuracy ?? 0) * (useRealIncidencia && t.incidencia ? t.incidencia : t.disciplineWeight / 10), 0);
    return {
      disciplineName: d.name, color: d.color,
      contribution: Math.round(dAcc / totalWeight),
      maxContribution: Math.round(dWeight / totalWeight * 100),
    };
  }).filter((d): d is NonNullable<typeof d> => d !== null)
    .sort((a, b) => b.maxContribution - a.maxContribution)
    .slice(0, 5);

  return { projectedGrade, topicsWithIncidencia: withInc.length, totalTopics: topics.length, hasRealIncidencia: useRealIncidencia, breakdown };
}

/**
 * INSIGHT: Afinidade de Banca
 * Quais bancas você mais erra? Com dados reais do TEC por questão.
 */
function computeBancaAffinity(topics: ET[]): Array<{ banca: string; total: number; accuracy: number; color: string }> {
  const bancaMap = new Map<string, { correct: number; wrong: number }>();
  for (const t of topics) {
    if (!t.bancaDominante || t.questions === 0) continue;
    const e = bancaMap.get(t.bancaDominante) ?? { correct: 0, wrong: 0 };
    e.correct += t.correctCount;
    e.wrong += t.errorCount;
    bancaMap.set(t.bancaDominante, e);
  }
  const colors = ['#6366f1','#8b5cf6','#3b82f6','#06b6d4','#10b981','#f59e0b','#ef4444'];
  return Array.from(bancaMap.entries())
    .map(([banca, { correct, wrong }], i) => ({
      banca,
      total: correct + wrong,
      accuracy: correct + wrong > 0 ? Math.round(correct / (correct + wrong) * 100) : 0,
      color: colors[i % colors.length],
    }))
    .filter(b => b.total >= 3)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 6);
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SH({ icon: Icon, title, sub, color }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string; sub: string; color: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <h2 className="text-sm font-bold leading-tight" style={{ color: "var(--app-fg)" }}>{title}</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted-text)" }}>{sub}</p>
      </div>


    </div>
  );
}

function Card({ children, urgent }: { children: React.ReactNode; urgent?: boolean }) {
  return (
    <div className="p-3 rounded-xl" style={{
      background: "var(--stat-bg)",
      border: `1px solid ${urgent ? "rgba(220,38,38,0.25)" : "var(--card-border)"}`,
    }}>{children}</div>
  );
}

function Acc({ acc }: { acc: number | null }) {
  if (acc === null) return <span className="text-xs italic" style={{ color: "var(--muted-text)" }}>—</span>;
  const c = accColor(acc);
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}>
      {acc}%
    </span>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SOEAnalytics() {
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: allRevisions = [] } = trpc.revision.list.useQuery({});
  const { data: forgettingStats } = trpc.v10.getForgettingVelocity.useQuery();
  const { data: rebalance } = trpc.v10.getDisciplineRebalance.useQuery();

  const topics = useMemo<ET[]>(() => {
    type RawDisc = { disciplineId: number; name: string; color: string; studyTimeSeconds: number; topics: Array<{ id: number; name: string; studyDate: string; studyTimeSeconds: number; completedRevisions: number; performance?: { correctCount: number; errorCount: number; questionsResolved: number; errorByAttention?: number; errorByForgetting?: number; errorByTheory?: number; errorByTrap?: number } | null }> };
    const disciplines = ((stats?.disciplineStats ?? []) as RawDisc[]);
    return disciplines.flatMap(d =>
      d.topics.map(t => {
        const p = t.performance;
        const total = p ? p.correctCount + p.errorCount : 0;
        const dw = (rebalance ?? []).find(r => r.disciplineId === d.disciplineId)?.editalWeight ?? 1;
        return {
          id: t.id, name: t.name,
          disciplineId: d.disciplineId, disciplineName: d.name, disciplineColor: d.color, disciplineWeight: dw,
          studyDate: t.studyDate, studyTimeSeconds: t.studyTimeSeconds ?? 0,
          questions: total, accuracy: safePct(p?.correctCount ?? 0, total),
          correctCount: p?.correctCount ?? 0, errorCount: p?.errorCount ?? 0,
          errorByAttention: p?.errorByAttention ?? 0, errorByForgetting: p?.errorByForgetting ?? 0,
          errorByTheory: p?.errorByTheory ?? 0, errorByTrap: p?.errorByTrap ?? 0,
          completedRevisions: t.completedRevisions ?? 0,
          incidencia: p?.incidencia ?? null,
          totalQuestoesBanca: p?.totalQuestoesBanca ?? null,
          bancaDominante: p?.bancaDominante ?? null,
          dificuldade: p?.dificuldade ?? null,
        };
      })
    );
  }, [stats, rebalance]);

  const disciplines = useMemo(() =>
    ((stats?.disciplineStats ?? []) as Array<{ disciplineId: number; name: string; color: string; studyTimeSeconds: number; topics: ET[] }>)
      .map(d => ({ ...d, topics: topics.filter(t => t.disciplineId === d.disciplineId) })),
  [stats, topics]);

  const totalWeight = useMemo(() => topics.reduce((s, t) => s + t.disciplineWeight, 0), [topics]);

  const cp   = useMemo(() => comfortParadox(topics), [topics]);
  const fs   = useMemo(() => falseSecurity(topics), [topics]);
  const hl   = useMemo(() => highLeverage(topics), [topics]);
  const sr   = useMemo(() => silentRegression(topics), [topics]);
  const dep  = useMemo(() => dominantErrorPattern(topics), [topics]);
  const wm   = useMemo(() => weightMismatch(disciplines, totalWeight), [disciplines, totalWeight]);
  const rg   = useMemo(() => revisionGap(topics, allRevisions as Array<{ topicId: number; completed: boolean; ignored: boolean }>), [topics, allRevisions]);

  // New TEC-powered insights
  const riskScores    = useMemo(() => computeRiskScores(topics), [topics]);
  const gradeProj     = useMemo(() => computeGradeProjection(topics, disciplines), [topics, disciplines]);
  const bancaAffinity = useMemo(() => computeBancaAffinity(topics), [topics]);

  const hasAny = cp.length || fs.length || hl.length || sr.length || dep || wm.length || rg.length || riskScores.length || bancaAffinity.length;

  if (!stats) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: "var(--gold)", borderTopColor: "transparent" }} />
    </div>
  );

  if (!hasAny) return (
    <div className="soe-card p-12 text-center">
      <Brain className="h-12 w-12 mx-auto mb-3 opacity-15" style={{ color: "var(--gold)" }} />
      <p className="text-sm font-medium" style={{ color: "var(--app-fg)" }}>Dados insuficientes para análise</p>
      <p className="text-xs mt-1" style={{ color: "var(--muted-text)" }}>Registre pelo menos 5 questões em alguns temas para descobrir padrões ocultos.</p>
    </div>
  );

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--app-fg)" }}>Análise IA</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted-text)" }}>Padrões que as estatísticas normais não revelam</p>
      </div>

      {/* Paradoxo do Conforto */}
      {cp.length > 0 && (
        <div className="soe-card p-5">
          <SH icon={Clock} color="var(--accent-red, #dc2626)"
            title="Paradoxo do Conforto — Tempo ≠ Aprendizado"
            sub="Você investe mais tempo do que a média nesses temas, mas o acerto continua baixo. O problema não é quantidade — é a abordagem." />
          <div className="space-y-2">
            {cp.map(t => (
              <Card key={t.id} urgent>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--app-fg)" }}>{t.name}</p>
                    <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>{t.disciplineName}</p>
                    <p className="text-xs mt-1.5" style={{ color: "var(--accent-amber)" }}>
                      ⚡ {t.timeHours}h investidas, {t.accuracy}% de acerto. Mude a abordagem, não aumente o tempo.
                    </p>
                  </div>
                  <Acc acc={t.accuracy} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Padrão Sistêmico de Erros */}
      {dep && (
        <div className="soe-card p-5">
          <SH icon={Brain} color={dep.color}
            title={`Padrão Dominante: ${dep.label} (${dep.percentage}% dos erros)`}
            sub="Não é problema isolado de um tema — é sistêmico. Corrigir o padrão vale mais do que estudar qualquer tema específico." />
          <div className="p-4 rounded-xl mb-3"
            style={{ background: `color-mix(in srgb, ${dep.color} 8%, var(--stat-bg))`, border: `1px solid color-mix(in srgb, ${dep.color} 20%, transparent)` }}>
            <p className="text-sm font-bold" style={{ color: dep.color }}>{dep.icon} {dep.count} de {dep.grand} erros classificados são por {dep.label.toLowerCase()}</p>
            <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--app-fg)" }}><strong>O que fazer agora:</strong> {dep.action}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["attention","forgetting","theory","trap"] as const).map(k => {
              const labels = { attention:"Desatenção", forgetting:"Esquecimento", theory:"Teoria", trap:"Pegadinha" };
              const c = dep.totals[k]; const s = dep.grand > 0 ? Math.round(c/dep.grand*100) : 0; const isMain = k === dep.dominant;
              return (
                <div key={k} className="p-2.5 rounded-lg"
                  style={{ background: isMain ? `color-mix(in srgb, ${dep.color} 12%, transparent)` : "var(--stat-bg)", border:"1px solid var(--card-border)" }}>
                  <p className="text-[10px] font-semibold" style={{ color:"var(--muted-text)" }}>{labels[k]}</p>
                  <p className="text-sm font-black" style={{ color: isMain ? dep.color : "var(--app-fg)" }}>{c}</p>
                  <div className="h-1 rounded-full mt-1" style={{ background:"var(--card-border)" }}>
                    <div className="h-full rounded-full" style={{ width:`${s}%`, background: isMain ? dep.color : "var(--muted-text)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alto Alavancagem */}
      {hl.length > 0 && (
        <div className="soe-card p-5">
          <SH icon={Zap} color="var(--gold)"
            title="Maior Retorno por Hora Agora"
            sub="Acerto entre 55–69%: estão perto do limiar 'dominado'. Um empurrão aqui gera mais pontos do que dobrar esforço num tema ruim." />
          <div className="space-y-2">
            {hl.map(t => (
              <Card key={t.id}>
                <div className="flex items-center gap-3">
                  <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: "color-mix(in srgb, var(--gold) 60%, transparent)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color:"var(--app-fg)" }}>{t.name}</p>
                    <p className="text-[10px]" style={{ color:"var(--muted-text)" }}>{t.disciplineName} · {t.questions} questões</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Acc acc={t.accuracy} />
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color:"var(--gold)" }} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Falsa Segurança */}
      {fs.length > 0 && (
        <div className="soe-card p-5">
          <SH icon={AlertCircle} color="var(--accent-amber)"
            title="Falsa Segurança — Amostra Insuficiente"
            sub="Acerto alto, mas menos de 10 questões. Isso não é evidência de domínio — é viés de amostra pequena." />
          <div className="space-y-2">
            {fs.map(t => (
              <Card key={t.id}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color:"var(--app-fg)" }}>{t.name}</p>
                    <p className="text-[10px]" style={{ color:"var(--muted-text)" }}>{t.disciplineName}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background:"rgba(245,158,11,0.1)", color:"var(--accent-amber)" }}>
                      só {t.questions} questões
                    </span>
                    <Acc acc={t.accuracy} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Regressão Silenciosa */}
      {sr.length > 0 && (
        <div className="soe-card p-5">
          <SH icon={TrendingDown} color="var(--accent-red, #dc2626)"
            title="Regressão Silenciosa — Esquecimento Confirmado"
            sub="Histórico forte, revisões feitas, mas acerto baixo e parado há 30+ dias. O esquecimento de Ebbinghaus já atuou." />
          <div className="space-y-2">
            {sr.map(t => (
              <Card key={t.id} urgent>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color:"var(--app-fg)" }}>{t.name}</p>
                    <p className="text-[10px]" style={{ color:"var(--muted-text)" }}>
                      {t.disciplineName} · {daysSince(t.studyDate)}d sem estudar · {t.completedRevisions} revisões feitas
                    </p>
                  </div>
                  <Acc acc={t.accuracy} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Desalinhamento Estratégico */}
      {wm.length > 0 && (
        <div className="soe-card p-5">
          <SH icon={BarChart2} color="var(--accent-blue)"
            title="Desalinhamento Estratégico"
            sub="Essas disciplinas valem mais pontos no edital do que o tempo que você dedica. Seu esforço não está alinhado com a distribuição real da prova." />
          <div className="space-y-2">
            {wm.map(d => (
              <Card key={d.disciplineId}>
                <div className="flex items-start gap-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ background: d.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold" style={{ color:"var(--app-fg)" }}>{d.name}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-[10px]" style={{ color:"var(--muted-text)" }}>
                        Peso no edital: <strong style={{ color:"var(--accent-blue)" }}>{Math.round(d.weightShare * 100)}%</strong>
                      </span>
                      <span className="text-[10px]" style={{ color:"var(--muted-text)" }}>
                        Seu tempo: <strong style={{ color: d.gap > 0.15 ? "var(--accent-red, #dc2626)" : "var(--accent-amber)" }}>{Math.round(d.timeShare * 100)}%</strong>
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-black flex-shrink-0" style={{ color:"var(--accent-red, #dc2626)" }}>
                    −{Math.round(d.gap * 100)}pp
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Cronograma Ignorado */}
      {rg.length > 0 && (
        <div className="soe-card p-5">
          <SH icon={Shuffle} color="#8b5cf6"
            title="Cronograma Ignorado"
            sub="Revisões criadas mas raramente executadas. O problema não é conteúdo — é consistência." />
          <div className="space-y-2">
            {rg.map(t => (
              <Card key={t.id}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color:"var(--app-fg)" }}>{t.name}</p>
                    <p className="text-[10px]" style={{ color:"var(--muted-text)" }}>{t.disciplineName} · {t.revDone}/{t.revTotal} revisões executadas</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background:"rgba(139,92,246,0.1)", color:"#8b5cf6" }}>
                    {t.revRate}% feitas
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Curva de Retenção (dado objetivo com interpretação) */}
      {forgettingStats && forgettingStats.some(s => s.revisionCount > 0) && (
        <div className="soe-card p-5">
          <SH icon={TrendingUp} color="var(--accent-blue)"
            title="Retenção de Longo Prazo"
            sub="Comparação entre recall nas primeiras revisões vs. revisões tardias. Queda alta = disciplina vulnerável ao esquecimento." />
          <div className="space-y-2">
            {forgettingStats
              .filter(s => s.revisionCount > 0)
              .sort((a, b) => {
                const da = (a.avgRecallAt25 ?? 0) - (a.avgRecallAt50 ?? 0);
                const db = (b.avgRecallAt25 ?? 0) - (b.avgRecallAt50 ?? 0);
                return db - da;
              })
              .map((s, i) => {
                const isV = s.volatility === "high";
                const drop = s.avgRecallAt25 && s.avgRecallAt50 ? s.avgRecallAt25 - s.avgRecallAt50 : null;
                return (
                  <Card key={i} urgent={isV}>
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold truncate" style={{ color:"var(--app-fg)" }}>{s.disciplineName}</p>
                          {isV && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background:"rgba(220,38,38,0.1)", color:"#dc2626" }}>CRÍTICO</span>}
                        </div>
                        <p className="text-[10px]" style={{ color:"var(--muted-text)" }}>{s.revisionCount} auto-avaliações</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs">
                          <span style={{ color:"var(--accent-blue)" }}>{s.avgRecallAt25?.toFixed(1) ?? "—"}</span>
                          <span style={{ color:"var(--muted-text)" }}> → </span>
                          <span style={{ color: isV ? "#dc2626" : "var(--accent-amber)" }}>{s.avgRecallAt50?.toFixed(1) ?? "—"}</span>
                          <span style={{ color:"var(--muted-text)" }}>/5</span>
                        </p>
                        {drop !== null && (
                          <p className="text-[10px] font-bold" style={{ color: drop > 1 ? "#dc2626" : "var(--muted-text)" }}>−{drop.toFixed(1)} pts</p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Nota Projetada ── */}
      {gradeProj.projectedGrade > 0 && (
        <div className="soe-card p-5">
          <SH icon={Target} color="var(--gold)"
            title={`Nota Projetada: ${gradeProj.projectedGrade}%`}
            sub={gradeProj.hasRealIncidencia
              ? `Incidência real do TEC (${gradeProj.topicsWithIncidencia} temas) — se a prova fosse hoje.`
              : `Baseado no peso das disciplinas — use o TEC integrado para incidência real.`} />
          <div className="flex items-center gap-4 mb-4">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--stat-bg)" strokeWidth="3.8" />
                <circle cx="18" cy="18" r="15.9" fill="none"
                  stroke={gradeProj.projectedGrade >= 70 ? "var(--accent-green)" : gradeProj.projectedGrade >= 50 ? "var(--accent-amber)" : "var(--accent-red, #dc2626)"}
                  strokeWidth="3.8"
                  strokeDasharray={`${gradeProj.projectedGrade} ${100 - gradeProj.projectedGrade}`}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-black" style={{ color: "var(--app-fg)" }}>{gradeProj.projectedGrade}%</span>
              </div>
            </div>
            <div className="flex-1 space-y-1.5">
              {gradeProj.breakdown.map((d, i) => (
                <div key={i}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[10px] font-semibold truncate" style={{ color: "var(--muted-text)", maxWidth: "70%" }}>{d.disciplineName}</span>
                    <span className="text-[10px] font-bold" style={{ color: "var(--app-fg)" }}>{d.contribution}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--stat-bg)" }}>
                    <div className="h-full rounded-full" style={{ width: `${d.contribution}%`, background: d.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {!gradeProj.hasRealIncidencia && (
            <p className="text-xs p-3 rounded-xl" style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.2)", color: "var(--muted-text)" }}>
              💡 <strong style={{ color: "var(--gold)" }}>Use o TEC integrado</strong> e resolva questões para que o SOE aprenda a incidência real — a projeção ficará muito mais precisa.
            </p>
          )}
        </div>
      )}

      {/* ── Ranking de Risco de Reprovação ── */}
      {riskScores.length > 0 && (
        <div className="soe-card p-5">
          <SH icon={Trophy} color="var(--accent-red, #dc2626)"
            title="Ranking de Risco de Reprovação"
            sub="Score = peso_edital × (1 − acerto) × esquecimento × incidência. Esses são os temas que mais vão custar pontos." />
          <div className="space-y-2">
            {riskScores.map((t, i) => (
              <Card key={t.id} urgent={i < 2}>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
                    style={{ background: i===0?"rgba(220,38,38,0.15)":i===1?"rgba(245,158,11,0.15)":"var(--stat-bg)", color: i===0?"#dc2626":i===1?"var(--accent-amber)":"var(--muted-text)" }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--app-fg)" }}>{t.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px]" style={{ color: "var(--muted-text)" }}>{t.disciplineName}</span>
                      {t.incidencia > 0.05 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>
                          {Math.round(t.incidencia * 100)}% incidência
                        </span>
                      )}
                      {t.daysStale > 30 && <span className="text-[10px]" style={{ color: "var(--accent-amber)" }}>{t.daysStale}d parado</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Acc acc={t.accuracy} />
                    {t.projectedPointsLost > 0.5 && (
                      <p className="text-[10px] mt-0.5 font-bold" style={{ color: "var(--accent-red, #dc2626)" }}>−{t.projectedPointsLost} pts</p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Afinidade de Banca ── */}
      {bancaAffinity.length > 0 && (
        <div className="soe-card p-5">
          <SH icon={Percent} color="var(--accent-blue)"
            title="Desempenho por Banca"
            sub="Baseado nas questões do TEC. Seu ponto cego por organizadora — diferente do desempenho geral por tema." />
          <div className="space-y-2">
            {bancaAffinity.map((b, i) => (
              <Card key={i}>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ background: b.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold" style={{ color: "var(--app-fg)" }}>{b.banca}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--stat-bg)" }}>
                        <div className="h-full rounded-full" style={{ width: `${b.accuracy}%`, background: accColor(b.accuracy) }} />
                      </div>
                      <span className="text-[10px] font-bold flex-shrink-0" style={{ color: accColor(b.accuracy) }}>{b.accuracy}%</span>
                    </div>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-text)" }}>{b.total} questões resolvidas</p>
                  </div>
                  {b.accuracy < 55 && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0"
                      style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}>PONTO FRACO</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
