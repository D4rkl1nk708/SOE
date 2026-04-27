/**
 * Serviço de analytics — lógica de relatórios e estatísticas.
 * Separado de jsonStorage.ts para respeitar o SRP:
 *   jsonStorage = persistência pura (CRUD)
 *   analyticsService = consultas analíticas e relatórios
 */

import * as storage from "./jsonStorage";
import type { Discipline, Topic, Revision } from "./jsonStorage";

// ─── Utilitários internos ──────────────────────────────────────────────────

function inDateRange(dateStr: string, from: Date, to: Date): boolean {
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

interface PerfSummary {
  topics: number;
  questions: number;
  correct: number;
  studySeconds: number;
  accuracy: number;
}

function sumTopicPerf(topics: Topic[]): PerfSummary {
  const q = topics.reduce(
    (s, t) => s + (t.performance?.questionsResolved ?? 0),
    0,
  );
  const c = topics.reduce((s, t) => s + (t.performance?.correctCount ?? 0), 0);
  return {
    topics: topics.length,
    questions: q,
    correct: c,
    studySeconds: topics.reduce((s, t) => s + (t.studyTimeSeconds ?? 0), 0),
    accuracy: q > 0 ? Math.round((c / q) * 100) : 0,
  };
}

// ─── Dashboard Stats ────────────────────────────────────────────────────────

export async function getDashboardStats(userId: number) {
  const [user, disciplines, topics, revisions] = await Promise.all([
    storage
      .getUserByOpenId("")
      .then(() => null)
      .catch(() => null), // placeholder
    storage.getDisciplinesByUser(userId),
    storage.getTopicsByUser(userId),
    storage.getRevisionsByUser(userId),
  ]);
  const settings = await storage.getUserSettings(userId);

  const today = new Date().toISOString().split("T")[0];
  const pendingRevisions = revisions.filter(
    (r) => !r.completed && !r.ignored && r.scheduledDate < today,
  ).length;
  const completedRevisions = revisions.filter((r) => r.completed).length;

  // Build lookup maps for O(1) access instead of O(n) filters in inner loops
  const topicsByDiscipline = new Map<number, Topic[]>();
  for (const t of topics) {
    const list = topicsByDiscipline.get(t.disciplineId) ?? [];
    list.push(t);
    topicsByDiscipline.set(t.disciplineId, list);
  }

  const revisionsByTopic = new Map<number, Revision[]>();
  for (const r of revisions) {
    const list = revisionsByTopic.get(r.topicId) ?? [];
    list.push(r);
    revisionsByTopic.set(r.topicId, list);
  }

  return {
    totalTopics: topics.length,
    totalDisciplines: disciplines.length,
    pendingRevisions,
    completedRevisions,
    settings,
    disciplineStats: disciplines.map((d) => {
      const discTopics = topicsByDiscipline.get(d.id) ?? [];
      const totalResolved = discTopics.reduce(
        (s, t) => s + (t.performance?.questionsResolved ?? 0),
        0,
      );
      const totalCorrect = discTopics.reduce(
        (s, t) => s + (t.performance?.correctCount ?? 0),
        0,
      );
      const totalError = discTopics.reduce(
        (s, t) => s + (t.performance?.errorCount ?? 0),
        0,
      );
      const aggPerformance =
        totalResolved > 0
          ? {
              questionsResolved: totalResolved,
              accuracy: Math.round((totalCorrect / totalResolved) * 100),
              correctCount: totalCorrect,
              errorCount: totalError,
            }
          : d.performance;
      const studyTimeSeconds =
        discTopics.reduce((s, t) => s + (t.studyTimeSeconds ?? 0), 0) ||
        d.studyTimeSeconds ||
        0;

      return {
        disciplineId: d.id,
        name: d.name,
        color: d.color,
        topicCount: discTopics.length,
        performance: aggPerformance,
        studyTimeSeconds,
        topics: discTopics
          .sort(
            (a, b) =>
              (a.order ?? Number.MAX_SAFE_INTEGER) -
              (b.order ?? Number.MAX_SAFE_INTEGER),
          )
          .map((t) => {
            const topicRevisions = revisionsByTopic.get(t.id) ?? [];
            return {
              id: t.id,
              name: t.name,
              studyDate: t.studyDate,
              studyTimeSeconds: t.studyTimeSeconds ?? 0,
              completedRevisions: topicRevisions.filter((r) => r.completed)
                .length,
              performance: t.performance,
            };
          }),
      };
    }),
  };
}

// ─── Weekly Stats ────────────────────────────────────────────────────────────

export async function getWeeklyStats(userId: number) {
  const [topics, disciplines] = await Promise.all([
    storage.getTopicsByUser(userId),
    storage.getDisciplinesByUser(userId),
  ]);

  const todayEnd = endOfDay(new Date());
  const weekStart = startOfDay(addDays(todayEnd, -6));
  const lastWeekEnd = new Date(weekStart.getTime() - 1);
  const lastWeekStart = startOfDay(addDays(lastWeekEnd, -6));

  const thisWeekTopics = topics.filter((t) =>
    inDateRange(t.createdAt || t.studyDate, weekStart, todayEnd),
  );
  const lastWeekTopics = topics.filter((t) =>
    inDateRange(t.createdAt || t.studyDate, lastWeekStart, lastWeekEnd),
  );

  // Build discipline topic index for O(1) lookups
  const topicsByDiscipline = new Map<number, Topic[]>();
  for (const t of topics) {
    const list = topicsByDiscipline.get(t.disciplineId) ?? [];
    list.push(t);
    topicsByDiscipline.set(t.disciplineId, list);
  }

  const byDiscipline = disciplines
    .map((d) => {
      const discTopics = topicsByDiscipline.get(d.id) ?? [];
      const totalQ = discTopics.reduce(
        (s, t) => s + (t.performance?.questionsResolved ?? 0),
        0,
      );
      const totalC = discTopics.reduce(
        (s, t) => s + (t.performance?.correctCount ?? 0),
        0,
      );
      const secs = discTopics.reduce(
        (s, t) => s + (t.studyTimeSeconds ?? 0),
        0,
      );
      return {
        name: d.name,
        color: d.color,
        studySeconds: secs,
        accuracy: totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0,
        questionsResolved: totalQ,
      };
    })
    .filter((d) => d.studySeconds > 0 || d.questionsResolved > 0);

  return {
    thisWeek: sumTopicPerf(thisWeekTopics),
    lastWeek: sumTopicPerf(lastWeekTopics),
    byDiscipline,
  };
}

// ─── Period Comparison ───────────────────────────────────────────────────────

export async function getPeriodComparison(userId: number, days = 7) {
  const [topics, disciplines] = await Promise.all([
    storage.getTopicsByUser(userId),
    storage.getDisciplinesByUser(userId),
  ]);

  const todayEnd = endOfDay(new Date());
  const curStart = startOfDay(addDays(todayEnd, -(days - 1)));
  const prevEnd = new Date(curStart.getTime() - 1);
  const prevStart = startOfDay(addDays(prevEnd, -(days - 1)));

  const curTopics = topics.filter((t) =>
    inDateRange(t.createdAt || t.studyDate, curStart, todayEnd),
  );
  const prevTopics = topics.filter((t) =>
    inDateRange(t.createdAt || t.studyDate, prevStart, prevEnd),
  );

  const disciplineDeltas = disciplines
    .map((d) => {
      const cur = curTopics.filter((t) => t.disciplineId === d.id);
      const prev = prevTopics.filter((t) => t.disciplineId === d.id);
      const curPerf = sumTopicPerf(cur);
      const prevPerf = sumTopicPerf(prev);
      return {
        name: d.name,
        color: d.color,
        accuracyDelta: curPerf.accuracy - prevPerf.accuracy,
        timeDelta: curPerf.studySeconds - prevPerf.studySeconds,
        currentAccuracy: curPerf.accuracy,
        prevAccuracy: prevPerf.accuracy,
      };
    })
    .filter(
      (d) =>
        d.currentAccuracy > 0 ||
        d.prevAccuracy > 0 ||
        Math.abs(d.timeDelta) > 60,
    );

  return {
    current: sumTopicPerf(curTopics),
    previous: sumTopicPerf(prevTopics),
    disciplineDeltas,
  };
}

// ─── Neglected Disciplines ───────────────────────────────────────────────────

export async function getNeglectedDisciplines(
  userId: number,
  thresholdDays = 7,
) {
  const [disciplines, topics] = await Promise.all([
    storage.getDisciplinesByUser(userId),
    storage.getTopicsByUser(userId),
  ]);
  const todayStart = startOfDay(new Date());

  const topicsByDiscipline = new Map<number, Topic[]>();
  for (const t of topics) {
    const list = topicsByDiscipline.get(t.disciplineId) ?? [];
    list.push(t);
    topicsByDiscipline.set(t.disciplineId, list);
  }

  return disciplines
    .map((d) => {
      const discTopics = topicsByDiscipline.get(d.id) ?? [];
      if (discTopics.length === 0) return null;
      const lastDateStr =
        discTopics
          .map((t) => t.createdAt || t.studyDate)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null;
      const lastDate = lastDateStr ? new Date(lastDateStr) : null;
      const daysSince = lastDate
        ? Math.floor((todayStart.getTime() - lastDate.getTime()) / 86_400_000)
        : 999;
      return {
        name: d.name,
        daysSinceStudy: daysSince,
        lastStudyDate: lastDateStr,
      };
    })
    .filter(
      (d): d is NonNullable<typeof d> =>
        d !== null && d.daysSinceStudy >= thresholdDays,
    )
    .sort((a, b) => b.daysSinceStudy - a.daysSinceStudy);
}

// ─── Study Heatmap ───────────────────────────────────────────────────────────

export async function getStudyHeatmap(userId: number, months: number) {
  const topics = await storage.getTopicsByUser(userId);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  cutoff.setHours(0, 0, 0, 0);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const map = new Map<string, { count: number; seconds: number }>();
  for (const t of topics) {
    const d = t.studyDate || (t.createdAt ? t.createdAt.split("T")[0] : null);
    if (!d || d < cutoffStr) continue;
    const entry = map.get(d) ?? { count: 0, seconds: 0 };
    entry.count++;
    entry.seconds += t.studyTimeSeconds ?? 0;
    map.set(d, entry);
  }

  return Array.from(map.entries())
    .map(([date, { count, seconds }]) => ({
      date,
      count,
      minutes: Math.round(seconds / 60),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Today Study Minutes ─────────────────────────────────────────────────────

export async function getTodayStudyMinutes(userId: number): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const topics = await storage.getTopicsByUser(userId);
  return Math.round(
    topics
      .filter((t) => t.updatedAt?.startsWith(today))
      .reduce((s, t) => s + (t.studyTimeSeconds ?? 0), 0) / 60,
  );
}

// ─── Discipline Rebalance Report ─────────────────────────────────────────────

export async function getDisciplineRebalanceReport(userId: number) {
  const [disciplines, topics, revisions, settings] = await Promise.all([
    storage.getDisciplinesByUser(userId),
    storage.getTopicsByUser(userId),
    storage.getRevisionsByUser(userId, { completed: true }),
    storage.getUserSettings(userId),
  ]);

  const topicsByDiscipline = new Map<number, Topic[]>();
  for (const t of topics) {
    const list = topicsByDiscipline.get(t.disciplineId) ?? [];
    list.push(t);
    topicsByDiscipline.set(t.disciplineId, list);
  }

  const revisionTopicIds = new Set(revisions.map((r) => r.topicId));
  const editalRows = settings?.editalRows ?? [];

  return disciplines.map((d) => {
    const discTopics = topicsByDiscipline.get(d.id) ?? [];
    const totalQ = discTopics.reduce(
      (s, t) => s + (t.performance?.questionsResolved ?? 0),
      0,
    );
    const totalC = discTopics.reduce(
      (s, t) => s + (t.performance?.correctCount ?? 0),
      0,
    );
    const revsDone = revisions.filter((r) =>
      discTopics.some((t) => t.id === r.topicId),
    ).length;
    editalRows.find((e) =>
      e.discipline?.toLowerCase().includes(d.name.toLowerCase()),
    );
    return {
      disciplineId: d.id,
      name: d.name,
      color: d.color,
      studyTimeHours: Math.round((d.studyTimeSeconds ?? 0) / 360) / 10,
      accuracy: totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0,
      questionsResolved: totalQ,
      revisionsDone: revsDone,
      topicsCount: discTopics.length,
      editalWeight: d.weight,
    };
  });
}

// ─── Forgetting Velocity ─────────────────────────────────────────────────────

export async function getForgettingVelocityByDiscipline(userId: number) {
  const [disciplines, topics, revisions] = await Promise.all([
    storage.getDisciplinesByUser(userId),
    storage.getTopicsByUser(userId),
    storage.getRevisionsByUser(userId, { completed: true }),
  ]);

  const ratedRevisions = revisions.filter((r) => r.recallRating !== undefined);

  const topicsByDiscipline = new Map<number, Set<number>>();
  for (const t of topics) {
    const set = topicsByDiscipline.get(t.disciplineId) ?? new Set();
    set.add(t.id);
    topicsByDiscipline.set(t.disciplineId, set);
  }

  return disciplines.map((d) => {
    const discTopicIds = topicsByDiscipline.get(d.id) ?? new Set();
    const dRevs = ratedRevisions.filter((r) => discTopicIds.has(r.topicId));
    const early = dRevs
      .filter((r) => r.revisionNumber <= 3)
      .map((r) => r.recallRating ?? 0)
      .filter(Boolean);
    const late = dRevs
      .filter((r) => r.revisionNumber >= 6)
      .map((r) => r.recallRating ?? 0)
      .filter(Boolean);
    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const avgEarly = avg(early);
    const avgLate = avg(late);
    const drop = avgEarly !== null && avgLate !== null ? avgEarly - avgLate : 0;
    const volatility: "low" | "medium" | "high" =
      drop < 0.5 ? "low" : drop < 1.5 ? "medium" : "high";
    return {
      disciplineId: d.id,
      disciplineName: d.name,
      color: d.color,
      avgRecallAt25: avgEarly !== null ? Math.round(avgEarly * 10) / 10 : null,
      avgRecallAt50: avgLate !== null ? Math.round(avgLate * 10) / 10 : null,
      volatility,
      revisionCount: dRevs.length,
    };
  });
}

// ─── Peak Hours ───────────────────────────────────────────────────────────────

export async function getPeakHoursAnalysis(userId: number) {
  const settings = await storage.getUserSettings(userId);
  const log = settings?.studySessionLog ?? [];
  const hourMap = new Map<number, { total: number; count: number }>();
  for (const s of log) {
    if (s.accuracy > 0) {
      const entry = hourMap.get(s.hourStart) ?? { total: 0, count: 0 };
      entry.total += s.accuracy;
      entry.count++;
      hourMap.set(s.hourStart, entry);
    }
  }
  return Array.from(hourMap.entries())
    .map(([hour, { total, count }]) => ({
      hour,
      avgAccuracy: Math.round((total / count) * 100) / 100,
      sessions: count,
    }))
    .sort((a, b) => b.avgAccuracy - a.avgAccuracy);
}

// ─── TEC Regressions ─────────────────────────────────────────────────────────

export async function getTecRegressions(userId: number, thresholdPp = 5) {
  const snaps = await storage.getTecSnapshots(userId, 2);
  if (snaps.length < 2) return [];
  const [current, previous] = snaps;
  return current.topics
    .flatMap((curTopic) => {
      const prevTopic = previous.topics.find(
        (t) =>
          t.topicName === curTopic.topicName &&
          t.disciplineName === curTopic.disciplineName,
      );
      if (!prevTopic) return [];
      const delta = curTopic.accuracy - prevTopic.accuracy;
      if (delta > -thresholdPp) return [];
      return [
        {
          topicName: curTopic.topicName,
          disciplineName: curTopic.disciplineName,
          previousAccuracy: prevTopic.accuracy,
          currentAccuracy: curTopic.accuracy,
          delta,
          currentErrors: curTopic.errorCount,
        },
      ];
    })
    .sort((a, b) => a.delta - b.delta);
}

export async function getWeakTopicsFromSnapshot(
  userId: number,
  accuracyThreshold = 65,
) {
  const snaps = await storage.getTecSnapshots(userId, 1);
  if (!snaps[0]) return [];
  return snaps[0].topics
    .filter((t) => t.accuracy < accuracyThreshold && t.questionsResolved >= 5)
    .sort((a, b) => a.accuracy - b.accuracy);
}

// ─── Monte Carlo Predictive Readiness ──────────────────────────────

export interface MonteCarloResult {
  expectedScore: number;
  volatility: number;
  worstCase: number;
  bestCase: number;
  approvalChance: number;
  cutoffRisk: number;
}

/**
 * IDEA 4: Simulação de Monte Carlo para "Predictive Readiness"
 * Roda 1000 simulações usando a variância histórica do aluno
 */
export async function runMonteCarloSimulation(
  userId: number,
  simulatedQuestions = 100,
): Promise<MonteCarloResult> {
  const stats = await storage.getDisciplineRebalanceReport(userId);
  if (stats.length === 0) {
    return {
      expectedScore: 0,
      volatility: 0,
      worstCase: 0,
      bestCase: 0,
      approvalChance: 0,
      cutoffRisk: 0,
    };
  }

  // Calcular média e desvio padrão dos acertos por disciplina
  const accuracies = stats.map((s) => s.accuracy / 100);
  const totalQ = stats.reduce((sum, s) => sum + s.questionsResolved, 0);
  if (totalQ < 20) {
    // Dados insuficientes, retornamos média simples
    const avgAccuracy =
      accuracies.reduce((a, b) => a + b, 0) / accuracies.length || 0.5;
    return {
      expectedScore: Math.round(avgAccuracy * 100),
      volatility: 0,
      worstCase: Math.round((avgAccuracy - 0.1) * 100),
      bestCase: Math.round((avgAccuracy + 0.1) * 100),
      approvalChance: avgAccuracy >= 0.7 ? 50 : 10,
      cutoffRisk: avgAccuracy < 0.7 ? 90 : 30,
    };
  }

  // Simulação de Monte Carlo (1000 rodadas)
  const results: number[] = [];
  const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
  const variance =
    accuracies.reduce((sum, acc) => sum + Math.pow(acc - mean, 2), 0) /
    accuracies.length;
  const stdDev = Math.sqrt(variance) || 0.1;

  for (let i = 0; i < 1000; i++) {
    // Box-Muller transform para geração de números normais
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const simulatedAccuracy = mean + z * stdDev;
    results.push(Math.max(0, Math.min(1, simulatedAccuracy)));
  }

  results.sort((a, b) => a - b);
  const expectedScore = Math.round(
    (results.reduce((a, b) => a + b, 0) / results.length) * 100,
  );
  const p5 = results[Math.floor(results.length * 0.05)];
  const p95 = results[Math.floor(results.length * 0.95)];
  const stdVol = Math.round(
    Math.sqrt(
      results.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
        results.length,
    ) * 100,
  );

  // Aproximação: chance de aprovação considerando nota de corte em 70%
  const approvalChance = Math.round(
    (1 - results.filter((r) => r >= 0.7).length / results.length) * 100,
  );
  const cutoffRisk = Math.round(
    (results.filter((r) => r < 0.7).length / results.length) * 100,
  );

  return {
    expectedScore,
    volatility: stdVol,
    worstCase: Math.round(p5 * 100),
    bestCase: Math.round(p95 * 100),
    approvalChance,
    cutoffRisk,
  };
}
