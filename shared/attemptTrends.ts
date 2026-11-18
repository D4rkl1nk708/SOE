/**
 * Tendência de acerto por disciplina — últimos 7 dias vs os 30 dias anteriores.
 *
 * Lê tentativas com horário (`QuestionAttempt.createdAt`), que antes eram um
 * total acumulado sem data. Com menos de MIN_TREND_ATTEMPTS respostas em
 * qualquer das duas janelas, o resultado honesto é "sem dados suficientes" —
 * não uma seta inventada em cima de 2 questões.
 */

export interface TrendAttemptLike {
  topicId?: number;
  disciplineId?: number;
  answered?: boolean;
  correct?: boolean;
  createdAt?: string;
}

export interface TrendTopicLike {
  id: number;
  disciplineId: number;
}

export interface TrendDisciplineLike {
  id: number;
  name: string;
}

export type TrendDirection = "up" | "down" | "flat";

export interface DisciplineTrend {
  disciplineId: number;
  disciplineName: string;
  recentAttempts: number;
  recentCorrect: number;
  recentAccuracy: number | null;
  previousAttempts: number;
  previousCorrect: number;
  previousAccuracy: number | null;
  delta: number | null;
  direction: TrendDirection | null;
  sufficient: boolean;
  label: string;
}

export const MIN_TREND_ATTEMPTS = 10;
export const RECENT_WINDOW_DAYS = 7;
export const BASELINE_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

function pct(correct: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((correct / total) * 100);
}

export function computeDisciplineTrends(
  attempts: TrendAttemptLike[],
  disciplines: TrendDisciplineLike[],
  topics: TrendTopicLike[] = [],
  now: Date = new Date(),
  options: {
    recentDays?: number;
    baselineDays?: number;
    minAttempts?: number;
  } = {},
): DisciplineTrend[] {
  const recentDays = options.recentDays ?? RECENT_WINDOW_DAYS;
  const baselineDays = options.baselineDays ?? BASELINE_WINDOW_DAYS;
  const minAttempts = options.minAttempts ?? MIN_TREND_ATTEMPTS;

  const nowMs = now.getTime();
  const recentFrom = nowMs - recentDays * DAY_MS;
  const baselineFrom = recentFrom - baselineDays * DAY_MS;

  const disciplineByTopic = new Map<number, number>();
  for (const topic of topics || [])
    disciplineByTopic.set(topic.id, topic.disciplineId);

  const buckets = new Map<
    number,
    {
      recentTotal: number;
      recentCorrect: number;
      prevTotal: number;
      prevCorrect: number;
    }
  >();
  const ensure = (id: number) => {
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = {
        recentTotal: 0,
        recentCorrect: 0,
        prevTotal: 0,
        prevCorrect: 0,
      };
      buckets.set(id, bucket);
    }
    return bucket;
  };

  for (const attempt of attempts || []) {
    if (!attempt || attempt.answered === false) continue;
    const time = Date.parse(String(attempt.createdAt || ""));
    if (!Number.isFinite(time) || time > nowMs) continue;
    if (time < baselineFrom) continue;

    const disciplineId =
      typeof attempt.disciplineId === "number"
        ? attempt.disciplineId
        : typeof attempt.topicId === "number"
          ? disciplineByTopic.get(attempt.topicId)
          : undefined;
    if (typeof disciplineId !== "number") continue;

    const bucket = ensure(disciplineId);
    const correct = attempt.correct ? 1 : 0;
    if (time >= recentFrom) {
      bucket.recentTotal += 1;
      bucket.recentCorrect += correct;
    } else {
      bucket.prevTotal += 1;
      bucket.prevCorrect += correct;
    }
  }

  const nameById = new Map<number, string>();
  for (const discipline of disciplines || [])
    nameById.set(discipline.id, discipline.name);

  const trends: DisciplineTrend[] = [];
  for (const [disciplineId, bucket] of buckets) {
    const recentAccuracy = pct(bucket.recentCorrect, bucket.recentTotal);
    const previousAccuracy = pct(bucket.prevCorrect, bucket.prevTotal);
    const sufficient =
      bucket.recentTotal >= minAttempts && bucket.prevTotal >= minAttempts;
    const delta =
      sufficient && recentAccuracy !== null && previousAccuracy !== null
        ? recentAccuracy - previousAccuracy
        : null;
    const direction: TrendDirection | null =
      delta === null ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";

    trends.push({
      disciplineId,
      disciplineName:
        nameById.get(disciplineId) || `Disciplina ${disciplineId}`,
      recentAttempts: bucket.recentTotal,
      recentCorrect: bucket.recentCorrect,
      recentAccuracy,
      previousAttempts: bucket.prevTotal,
      previousCorrect: bucket.prevCorrect,
      previousAccuracy,
      delta,
      direction,
      sufficient,
      label: sufficient
        ? `${recentAccuracy}% nos últimos ${recentDays} dias (${delta! >= 0 ? "+" : ""}${delta} p.p.)`
        : "Sem dados suficientes",
    });
  }

  return trends.sort((a, b) => {
    if (b.recentAttempts !== a.recentAttempts)
      return b.recentAttempts - a.recentAttempts;
    return a.disciplineName.localeCompare(b.disciplineName, "pt-BR");
  });
}
