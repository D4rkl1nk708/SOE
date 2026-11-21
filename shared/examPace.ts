/**
 * Ritmo de prova no simulado (v6.9.7, item 4).
 *
 * O simulado de 28/10 entregou 50 questões em branco e não guardava tempo por
 * questão — sem isso não existe treino de ritmo. Aqui só há matemática sobre o
 * que o aluno fez; nenhuma estimativa de nota sem base.
 */

export interface ExamAnswerTiming {
  /** id da questão no simulado. */
  id?: string;
  /** Tempo gasto na questão, em segundos. */
  seconds?: number | null;
  /** ISO de quando a resposta foi marcada. */
  answeredAt?: string | null;
  answered?: boolean;
  correct?: boolean;
  disciplineId?: number;
  disciplineName?: string;
  topicName?: string;
}

export interface PaceBucket {
  label: string;
  /** Limite inferior (segundos, inclusive). */
  from: number;
  /** Limite superior (segundos, exclusivo); null = sem teto. */
  to: number | null;
  count: number;
}

export interface PaceTopic {
  name: string;
  questions: number;
  /** Segundos gastos acima do alvo no tópico. */
  secondsOver: number;
  /** Questões do tópico respondidas acima do alvo. */
  aboveTarget: number;
}

export interface PaceSummary {
  paceSeconds: number;
  totalQuestions: number;
  answered: number;
  blank: number;
  totalSeconds: number;
  averageSeconds: number;
  medianSeconds: number;
  /** 90% das questões abaixo deste tempo. */
  p90Seconds: number;
  /** Tempo que a prova inteira levaria no alvo. */
  targetSeconds: number;
  /** Segundos gastos além do alvo nas questões respondidas. */
  secondsOverTarget: number;
  aboveTargetCount: number;
  pctAboveTarget: number;
  /** Questões que você alcançaria no alvo com o tempo que gastou. */
  projectedQuestionsAtPace: number;
  /** Questões que ficariam em branco mantendo o alvo. */
  blankAtTargetPace: number;
  /**
   * Questões que o ATRASO custou: cada `paceSeconds` perdidos acima do alvo é
   * uma questão que não deu tempo de responder. É o número honesto do
   * relatório — sem ele, quem entrega cedo veria "deixaria 9 em branco".
   */
  questionsLostToLateness: number;
  /** Acertos projetados se mantivesse o ritmo e o acerto atuais. */
  projectedCorrect: number;
  histogram: PaceBucket[];
  slowestTopic: PaceTopic | null;
  slowestDiscipline: PaceTopic | null;
  /** Frase de conclusão pronta para a UI ("" quando não há dado). */
  conclusion: string;
}

const HISTOGRAM_EDGES = [0, 30, 60, 90, 120, 180, 300];

/** Segundos-alvo por questão, por banca (padrão de prova objetiva). */
export function bancaPaceSeconds(banca?: string | null): number {
  const value = String(banca || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!value) return 90;
  if (value.includes("CEBRASPE") || value.includes("CESPE")) return 90;
  if (value.includes("FGV")) return 120;
  if (value.includes("FCC")) return 90;
  if (value.includes("VUNESP")) return 90;
  return 90;
}

function toSeconds(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function formatMinutes(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return `${rest}s`;
  if (rest === 0) return `${minutes} min`;
  return `${minutes} min ${rest}s`;
}

function groupByTopic(
  timed: Array<{ seconds: number; key: string }>,
  paceSeconds: number,
): PaceTopic | null {
  const map = new Map<string, PaceTopic>();
  for (const item of timed) {
    const key = item.key || "Sem tópico";
    const current =
      map.get(key) ||
      ({
        name: key,
        questions: 0,
        secondsOver: 0,
        aboveTarget: 0,
      } as PaceTopic);
    current.questions += 1;
    if (item.seconds > paceSeconds) {
      current.secondsOver += item.seconds - paceSeconds;
      current.aboveTarget += 1;
    }
    map.set(key, current);
  }
  let worst: PaceTopic | null = null;
  for (const topic of map.values()) {
    if (!worst) {
      worst = topic;
      continue;
    }
    if (
      topic.secondsOver > worst.secondsOver ||
      (topic.secondsOver === worst.secondsOver &&
        topic.questions > worst.questions)
    ) {
      worst = topic;
    }
  }
  return worst && worst.secondsOver > 0 ? worst : null;
}

/**
 * `answers` pode ser um array ou o mapa `questionId -> resposta` usado pelo
 * simulado. Quando é mapa, o tempo vem de `secondsById`.
 */
export function summarizePace(
  answers:
    | ExamAnswerTiming[]
    | Record<string, string | ExamAnswerTiming>
    | null
    | undefined,
  paceSeconds: number,
  totalQuestions: number,
): PaceSummary {
  const pace = toSeconds(paceSeconds) || 90;
  const total = Math.max(0, Math.round(Number(totalQuestions) || 0));

  let entries: ExamAnswerTiming[] = [];
  if (Array.isArray(answers)) {
    entries = answers.filter(Boolean);
  } else if (answers && typeof answers === "object") {
    entries = Object.entries(answers).map(([id, value]) =>
      typeof value === "string"
        ? { id, answered: Boolean(value) }
        : { id, ...(value as ExamAnswerTiming) },
    );
  }

  const answered = entries.filter(
    (entry) =>
      entry.answered !== false &&
      (entry.answered === true || toSeconds(entry.seconds) > 0),
  );
  const secondsList = entries
    .map((entry) => toSeconds(entry.seconds))
    .filter((value) => value > 0);
  const sorted = [...secondsList].sort((a, b) => a - b);

  const totalSeconds = secondsList.reduce((sum, value) => sum + value, 0);
  const answeredCount =
    answered.length > 0 ? answered.length : secondsList.length;
  const blank = Math.max(0, total - answeredCount);
  const aboveTarget = secondsList.filter((value) => value > pace).length;
  const secondsOverTarget = secondsList.reduce(
    (sum, value) => sum + Math.max(0, value - pace),
    0,
  );

  const projectedQuestionsAtPace =
    totalSeconds > 0 ? Math.max(0, Math.floor(totalSeconds / pace)) : 0;
  const blankAtTargetPace = Math.max(0, total - projectedQuestionsAtPace);
  const questionsLostToLateness = Math.floor(secondsOverTarget / pace);
  const correctCount = entries.filter((entry) => entry.correct).length;
  const accuracyRatio = answeredCount > 0 ? correctCount / answeredCount : 0;
  const projectedCorrect =
    accuracyRatio > 0
      ? Math.round(accuracyRatio * Math.min(total, projectedQuestionsAtPace))
      : 0;

  const histogram: PaceBucket[] = [];
  for (let index = 0; index < HISTOGRAM_EDGES.length; index++) {
    const from = HISTOGRAM_EDGES[index];
    const to =
      index + 1 < HISTOGRAM_EDGES.length ? HISTOGRAM_EDGES[index + 1] : null;
    const count = sorted.filter(
      (value) => value >= from && (to === null || value < to),
    ).length;
    histogram.push({
      label: to === null ? `${from}s+` : `${from}–${to}s`,
      from,
      to,
      count,
    });
  }

  const timedByTopic = entries
    .map((entry) => ({
      seconds: toSeconds(entry.seconds),
      key: entry.topicName || entry.disciplineName || "",
      discipline: entry.disciplineName || "",
    }))
    .filter((entry) => entry.seconds > 0 && entry.key.trim().length > 0);

  const slowestTopic = groupByTopic(
    timedByTopic.map((entry) => ({ seconds: entry.seconds, key: entry.key })),
    pace,
  );
  const slowestDiscipline = groupByTopic(
    timedByTopic.map((entry) => ({
      seconds: entry.seconds,
      key: entry.discipline,
    })),
    pace,
  );

  let conclusion = "";
  if (secondsList.length === 0) {
    conclusion =
      "Este simulado não guardou tempo por questão — rode um novo para medir ritmo.";
  } else if (secondsOverTarget === 0) {
    conclusion = `Ritmo sob controle: nenhuma questão passou de ${pace}s.`;
  } else if (slowestTopic) {
    const extra = Math.max(0, projectedQuestionsAtPace - answeredCount);
    conclusion =
      `Você perdeu ${formatMinutes(slowestTopic.secondsOver)} em ${slowestTopic.aboveTarget} ` +
      `${slowestTopic.aboveTarget === 1 ? "questão" : "questões"} de ${slowestTopic.name} — ` +
      `corte para ${pace}s por questão` +
      (extra > 0
        ? ` e sobra tempo para mais ${extra} ${extra === 1 ? "questão" : "questões"}.`
        : ".");
  } else {
    conclusion = `Você gastou ${formatMinutes(secondsOverTarget)} acima do alvo de ${pace}s por questão.`;
  }

  return {
    paceSeconds: pace,
    totalQuestions: total,
    answered: answeredCount,
    blank,
    totalSeconds,
    averageSeconds:
      answeredCount > 0 ? Math.round(totalSeconds / answeredCount) : 0,
    medianSeconds: median(sorted),
    p90Seconds: percentile(sorted, 0.9),
    targetSeconds: pace * total,
    secondsOverTarget,
    aboveTargetCount: aboveTarget,
    pctAboveTarget:
      secondsList.length > 0
        ? Math.round((aboveTarget / secondsList.length) * 100)
        : 0,
    projectedQuestionsAtPace,
    blankAtTargetPace,
    questionsLostToLateness,
    projectedCorrect,
    histogram,
    slowestTopic,
    slowestDiscipline,
    conclusion,
  };
}
