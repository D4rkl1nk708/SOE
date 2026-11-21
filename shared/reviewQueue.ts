/**
 * Fila de revisões — camada de EXIBIÇÃO/PRIORIZAÇÃO.
 *
 * Este módulo NÃO cria, apaga nem reagenda revisões: a geração 25/50 continua
 * em `shared/scheduling.ts` (buildSchedule) e nada aqui a altera. Ele apenas
 * ordena o que já venceu e corta o topo em N, para a fila não virar ruído
 * (o usuário real tinha 8.316 revisões vencidas e 688 feitas na vida).
 *
 * Score = fraqueza do tópico × peso da disciplina × fator de atraso (saturado).
 */

export interface ReviewLike {
  id: number;
  topicId: number;
  type: "revision" | "test";
  scheduledDate: string;
  revisionNumber?: number;
  completed: boolean;
  ignored: boolean;
}

export interface QueueTopicLike {
  id: number;
  disciplineId: number;
  performance?: {
    accuracy?: number;
    correctCount?: number;
    errorCount?: number;
    questionsResolved?: number;
  } | null;
}

export interface QueueDisciplineLike {
  id: number;
  weight?: number;
  performance?: { accuracy?: number } | null;
}

export interface PrioritizedReview<T extends ReviewLike = ReviewLike> {
  revision: T;
  score: number;
  weakness: number;
  disciplineWeight: number;
  lateness: number;
  daysLate: number;
  /** Outras revisões pendentes do MESMO tópico (o tópico é um cartão só). */
  sameTopicPending?: number;
}

export interface ReviewQueueResult<T extends ReviewLike = ReviewLike> {
  /** Top N da fila (priorizado), pronto para exibir. */
  queue: PrioritizedReview<T>[];
  /** O restante do que venceu, recolhido em "Em espera". Nada é apagado. */
  waiting: PrioritizedReview<T>[];
  /** Total de revisões pendentes vencendo hoje ou antes. */
  dueTotal: number;
  /** Limite efetivo aplicado (0 = sem limite). */
  cap: number;
}

export const DEFAULT_DAILY_REVIEW_CAP = 25;

/** Peso máximo aplicado ao fator de atraso (evita que uma revisão de 2024 domine tudo). */
const MAX_LATENESS_FACTOR = 6;

/** Tópico sem nenhuma questão respondida: prioridade máxima explícita. */
const UNMEASURED_WEAKNESS = 1.1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Converte "YYYY-MM-DD" em Date local (não usar new Date(str): vira UTC). */
export function parseDbDate(value: string): Date | null {
  if (!value || typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysBetween(from: Date, to: Date): number {
  const fromMidnight = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
  ).getTime();
  const toMidnight = new Date(
    to.getFullYear(),
    to.getMonth(),
    to.getDate(),
  ).getTime();
  return Math.round((toMidnight - fromMidnight) / MS_PER_DAY);
}

/**
 * Fraqueza do tópico em 0..1.1 (1 = nunca acerta, 0 = acerta tudo).
 * Sem nenhuma questão respondida vale UNMEASURED_WEAKNESS, porque é justamente
 * o tópico que precisa ser revisado primeiro.
 */
export function topicWeakness(topic?: QueueTopicLike | null): number {
  const perf = topic?.performance || {};
  const correct = Number(perf.correctCount) || 0;
  const error = Number(perf.errorCount) || 0;
  const resolved = Math.max(
    Number(perf.questionsResolved) || 0,
    correct + error,
  );

  let accuracy: number | null = null;
  if (correct + error > 0) {
    accuracy = correct / (correct + error);
  } else if (
    typeof perf.accuracy === "number" &&
    Number.isFinite(perf.accuracy)
  ) {
    accuracy = perf.accuracy > 1 ? perf.accuracy / 100 : perf.accuracy;
  }
  if (accuracy === null || !Number.isFinite(accuracy))
    return UNMEASURED_WEAKNESS;
  return Math.min(1, Math.max(0, 1 - accuracy));
}

export function disciplineWeightFactor(
  discipline?: QueueDisciplineLike | null,
): number {
  const weight = Number(discipline?.weight);
  if (!Number.isFinite(weight) || weight <= 0) return 1;
  return Math.min(3, Math.max(0.5, weight));
}

/** Fator de atraso saturado: 1 dia = 2, 7 dias ≈ 4, 31+ dias = 6. */
export function latenessFactor(daysLate: number): number {
  const safe = Math.max(0, Number(daysLate) || 0);
  return Math.min(MAX_LATENESS_FACTOR, 1 + Math.log2(1 + safe));
}

export function scoreReview<T extends ReviewLike>(
  revision: T,
  topic: QueueTopicLike | null | undefined,
  discipline: QueueDisciplineLike | null | undefined,
  today: Date,
): PrioritizedReview<T> {
  const scheduled = parseDbDate(revision.scheduledDate);
  const daysLate = scheduled ? Math.max(0, daysBetween(scheduled, today)) : 0;
  const weakness = topicWeakness(topic);
  const weight = disciplineWeightFactor(discipline);
  const lateness = latenessFactor(daysLate);
  const score = Math.round(weakness * weight * lateness * 1e6) / 1e6;
  return {
    revision,
    score,
    weakness,
    disciplineWeight: weight,
    lateness,
    daysLate,
  };
}

export interface PrioritizeOptions {
  /**
   * Tópicos que já tiveram revisão concluída HOJE. Eles saem da fila do dia
   * (vão para "Em espera"): antes, o aluno concluía uma revisão e a próxima da
   * fila era o mesmo tópico de novo, porque a geração 25/50 cria ~150 revisões
   * de teste por tópico.
   */
  topicsDoneToday?: Iterable<number>;
  /** Um cartão por tópico em vez de um por revisão (padrão: true). */
  onePerTopic?: boolean;
}

export function prioritizeReviews<T extends ReviewLike>(
  revisions: T[],
  topics: QueueTopicLike[],
  disciplines: QueueDisciplineLike[],
  today: Date | string,
  cap: number = DEFAULT_DAILY_REVIEW_CAP,
  options: PrioritizeOptions = {},
): ReviewQueueResult<T> {
  const todayDate = typeof today === "string" ? parseDbDate(today) : today;
  const reference =
    todayDate && !Number.isNaN(todayDate.getTime()) ? todayDate : new Date();

  const topicById = new Map<number, QueueTopicLike>();
  for (const topic of topics || []) topicById.set(topic.id, topic);
  const disciplineById = new Map<number, QueueDisciplineLike>();
  for (const discipline of disciplines || [])
    disciplineById.set(discipline.id, discipline);

  const due: PrioritizedReview<T>[] = [];
  for (const revision of revisions || []) {
    if (!revision) continue;
    if (revision.completed || revision.ignored) continue;
    const scheduled = parseDbDate(revision.scheduledDate);
    if (!scheduled) continue;
    if (daysBetween(scheduled, reference) < 0) continue; // ainda não venceu
    const topic = topicById.get(revision.topicId);
    const discipline = topic
      ? disciplineById.get(topic.disciplineId)
      : undefined;
    due.push(scoreReview(revision, topic, discipline, reference));
  }

  due.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Desempate: revisão "de verdade" antes de teste aleatório.
    if (a.revision.type !== b.revision.type)
      return a.revision.type === "revision" ? -1 : 1;
    // Depois o que está atrasado há mais tempo.
    if (b.daysLate !== a.daysLate) return b.daysLate - a.daysLate;
    if (a.revision.scheduledDate !== b.revision.scheduledDate)
      return a.revision.scheduledDate < b.revision.scheduledDate ? -1 : 1;
    return a.revision.id - b.revision.id;
  });

  const doneToday = new Set<number>(options.topicsDoneToday ?? []);
  const onePerTopic = options.onePerTopic !== false;

  // Tópico já estudado hoje sai da fila do dia (segue em "Em espera":
  // nada é apagado nem ignorado, só sai da lista de hoje).
  const eligible: PrioritizedReview<T>[] = [];
  const doneTodayItems: PrioritizedReview<T>[] = [];
  for (const item of due) {
    if (doneToday.has(item.revision.topicId)) doneTodayItems.push(item);
    else eligible.push(item);
  }

  // Um cartão por tópico: o primeiro (mais prioritário) representa o tópico;
  // os demais contam em `sameTopicPending` e ficam em espera.
  const representativeByTopic = new Map<number, PrioritizedReview<T>>();
  const grouped: PrioritizedReview<T>[] = [];
  const rest: PrioritizedReview<T>[] = [];

  for (const item of eligible) {
    if (!onePerTopic) {
      grouped.push(item);
      continue;
    }
    const existing = representativeByTopic.get(item.revision.topicId);
    if (!existing) {
      const copy: PrioritizedReview<T> = { ...item, sameTopicPending: 1 };
      representativeByTopic.set(item.revision.topicId, copy);
      grouped.push(copy);
    } else {
      existing.sameTopicPending = (existing.sameTopicPending ?? 1) + 1;
      rest.push(item);
    }
  }

  const numericCap = Number.isFinite(Number(cap))
    ? Number(cap)
    : DEFAULT_DAILY_REVIEW_CAP;
  const effectiveCap = numericCap <= 0 ? 0 : Math.floor(numericCap);
  const queue =
    effectiveCap === 0 ? grouped.slice() : grouped.slice(0, effectiveCap);
  const notChosen = effectiveCap === 0 ? [] : grouped.slice(effectiveCap);
  const waiting = [...notChosen, ...rest, ...doneTodayItems];

  return {
    queue,
    waiting,
    dueTotal: due.length,
    cap: effectiveCap,
  };
}
