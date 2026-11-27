/**
 * Métricas de retenção (v6.9.11, item C4 / seção 6 da pesquisa).
 *
 * Troca de vaidade por resultado: minutos estudados → retenção por hora;
 * questões respondidas → acerto em questão nova a 7/25/50 dias; nota do
 * simulado → nota esperada com intervalo + Brier.
 *
 * Honestidade acima de tudo: com amostra pequena o card mostra
 * "amostra insuficiente (n=X)" em vez de inventar número (125 dos 137 tópicos
 * do aluno têm pouco histórico — a incerteza é parte do dado).
 */
import { localDayFrom, localDaysBetween } from "./localDay";

export const MIN_RETENTION_SAMPLE = 10;

export interface RetentionAttemptLike {
  questionId?: string | null;
  topicId?: number | null;
  correct?: boolean;
  answered?: boolean;
  createdAt?: string;
  /** Questão nunca vista pelo aluno. */
  fresh?: boolean;
  context?: string | null;
}

export interface RetentionHorizon {
  days: 7 | 25 | 50;
  label: string;
  sample: number;
  correct: number;
  accuracy: number;
  available: boolean;
}

export interface RetentionMetrics {
  minSample: number;
  available: boolean;
  horizons: RetentionHorizon[];
  fresh: {
    sample: number;
    correct: number;
    accuracy: number;
    available: boolean;
    label: string;
  };
  perHour: {
    sample: number;
    studyHours: number;
    correctPerHour: number;
    available: boolean;
    label: string;
  };
  coverage: {
    weightedCoveragePct: number;
    proficiency: number;
    combined: number;
    available: boolean;
  };
  brier: { score: number | null; sample: number; available: boolean };
  expectedScore: {
    score: number;
    low: number;
    high: number;
    sample: number;
    available: boolean;
    label: string;
  };
}

const HORIZONS: Array<7 | 25 | 50> = [7, 25, 50];

function pct(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function horizonFor(days: number): 7 | 25 | 50 | null {
  if (!Number.isFinite(days) || days <= 0) return null;
  if (days <= 7) return 7;
  if (days <= 25) return 25;
  if (days <= 50) return 50;
  return null;
}

export interface RetentionInput {
  attempts: RetentionAttemptLike[];
  /** Data "hoje" (YYYY-MM-DD); padrão = agora. */
  today?: string;
  minSample?: number;
  /** Tempo total de estudo (segundos) para o card de retenção por hora. */
  studySeconds?: number;
  predictions?: Array<{ predictedPct: number; actualPct: number }>;
  weightedCoveragePct?: number;
  /** Proficiência estimada 0–100. */
  proficiency?: number;
}

/**
 * Retenção por horizonte: para cada questão repetida, quantos dias se passaram
 * desde o primeiro contato. Faixas 7/25/50 (dia 1–7, 8–25, 26–50).
 */
export function computeRetentionMetrics(
  input: RetentionInput,
): RetentionMetrics {
  const minSample = Math.max(
    1,
    Math.trunc(
      Number.isFinite(input.minSample as number)
        ? (input.minSample as number)
        : MIN_RETENTION_SAMPLE,
    ),
  );

  const valid = (input.attempts || []).filter(
    (attempt) =>
      attempt && attempt.answered !== false && localDayFrom(attempt.createdAt),
  );

  // Primeiro contato por questão (por dia local).
  const firstDay = new Map<string, string>();
  for (const attempt of valid) {
    const id = String(attempt.questionId || "").trim();
    if (!id) continue;
    const day = localDayFrom(attempt.createdAt) as string;
    const current = firstDay.get(id);
    if (!current || day < current) firstDay.set(id, day);
  }

  const buckets = new Map<number, { sample: number; correct: number }>();
  for (const attempt of valid) {
    const id = String(attempt.questionId || "").trim();
    if (!id) continue;
    const day = localDayFrom(attempt.createdAt) as string;
    const first = firstDay.get(id);
    if (!first || first === day) continue; // primeiro contato não é retenção
    const days = localDaysBetween(first, day);
    const bucket = horizonFor(days);
    if (!bucket) continue;
    const entry = buckets.get(bucket) || { sample: 0, correct: 0 };
    entry.sample += 1;
    if (attempt.correct === true) entry.correct += 1;
    buckets.set(bucket, entry);
  }

  const horizons: RetentionHorizon[] = HORIZONS.map((days) => {
    const entry = buckets.get(days) || { sample: 0, correct: 0 };
    const available = entry.sample >= minSample;
    return {
      days,
      label: available
        ? `${days} dias — ${pct(entry.correct, entry.sample)}% (n=${entry.sample})`
        : `amostra insuficiente (n=${entry.sample})`,
      sample: entry.sample,
      correct: entry.correct,
      accuracy: pct(entry.correct, entry.sample),
      available,
    };
  });

  const freshAttempts = valid.filter((attempt) => attempt.fresh === true);
  const freshCorrect = freshAttempts.filter(
    (attempt) => attempt.correct === true,
  ).length;
  const freshAvailable = freshAttempts.length >= minSample;

  const studySeconds = Math.max(0, Number(input.studySeconds) || 0);
  const studyHours = studySeconds / 3600;
  const totalCorrect = valid.filter(
    (attempt) => attempt.correct === true,
  ).length;
  const perHourAvailable = studyHours > 0 && valid.length >= minSample;
  const correctPerHour = studyHours > 0 ? totalCorrect / studyHours : 0;

  const weightedCoveragePct = Math.max(
    0,
    Math.min(100, Number(input.weightedCoveragePct) || 0),
  );
  const proficiency = Math.max(
    0,
    Math.min(100, Number(input.proficiency) || 0),
  );
  const combined = round1((weightedCoveragePct * proficiency) / 100);

  const answered = valid.length;
  const overallAccuracy = pct(totalCorrect, answered);
  const expectedBase = freshAvailable
    ? pct(freshCorrect, freshAttempts.length)
    : overallAccuracy;
  const expectedAvailable = answered >= minSample;
  const p = expectedBase / 100;
  const margin =
    expectedAvailable && answered > 0
      ? 1.96 * Math.sqrt((p * (1 - p)) / answered) * 100
      : 0;
  const low = Math.max(0, Math.round(expectedBase - margin));
  const high = Math.min(100, Math.round(expectedBase + margin));

  const predictionItems = (input.predictions || []).filter(
    (item) =>
      Number.isFinite(Number(item?.predictedPct)) &&
      Number.isFinite(Number(item?.actualPct)),
  );
  const brierAvailable = predictionItems.length >= 3;
  const brier = brierAvailable
    ? round1(
        (predictionItems.reduce((sum, item) => {
          const predicted = Math.min(1, Math.max(0, item.predictedPct / 100));
          const actual = Math.min(1, Math.max(0, item.actualPct / 100));
          return sum + (predicted - actual) ** 2;
        }, 0) /
          predictionItems.length) *
          1000,
      ) / 1000
    : null;

  const anyHorizon = horizons.some((horizon) => horizon.available);

  return {
    minSample,
    available: anyHorizon || freshAvailable,
    horizons,
    fresh: {
      sample: freshAttempts.length,
      correct: freshCorrect,
      accuracy: pct(freshCorrect, freshAttempts.length),
      available: freshAvailable,
      label: freshAvailable
        ? `${pct(freshCorrect, freshAttempts.length)}% em questão nova (n=${freshAttempts.length})`
        : `amostra insuficiente (n=${freshAttempts.length})`,
    },
    perHour: {
      sample: answered,
      studyHours: round1(studyHours),
      correctPerHour: round1(correctPerHour),
      available: perHourAvailable,
      label: perHourAvailable
        ? `${round1(correctPerHour)} acertos por hora (n=${answered})`
        : `amostra insuficiente (n=${answered})`,
    },
    coverage: {
      weightedCoveragePct: round1(weightedCoveragePct),
      proficiency: Math.round(proficiency),
      combined,
      available: weightedCoveragePct > 0,
    },
    brier: {
      score: brier,
      sample: predictionItems.length,
      available: brierAvailable,
    },
    expectedScore: {
      score: expectedBase,
      low,
      high,
      sample: answered,
      available: expectedAvailable,
      label: expectedAvailable
        ? `${expectedBase}% (${low}–${high}%, n=${answered})`
        : `amostra insuficiente (n=${answered})`,
    },
  };
}
