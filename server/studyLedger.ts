import * as storage from "./jsonStorage";

export type StudyEventType =
  | "revision"
  | "answer"
  | "error"
  | "session"
  | "tec";

export interface StudyEvent {
  id: string;
  type: StudyEventType;
  occurredAt: string;
  title: string;
  detail: string;
  disciplineName?: string;
  topicName?: string;
  correct?: boolean;
  minutes?: number;
  source?: string;
}

export interface StudyLedger {
  generatedAt: string;
  total: number;
  byType: Record<StudyEventType, number>;
  lastEventAt: string | null;
  events: StudyEvent[];
}

const emptyCounts = (): Record<StudyEventType, number> => ({
  revision: 0,
  answer: 0,
  error: 0,
  session: 0,
  tec: 0,
});

function safeDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * Ledger é uma projeção somente leitura dos dados já existentes.
 * Não escreve, não migra e não altera o agendador 25/50.
 */
export async function getStudyLedger(
  userId: number,
  limit = 100,
): Promise<StudyLedger> {
  const [settings, topics, disciplines, revisions, errorsPage] =
    await Promise.all([
      storage.getUserSettings(userId),
      storage.getTopicsByUser(userId),
      storage.getDisciplinesByUser(userId),
      storage.getRevisionsByUser(userId),
      storage.getQuestionErrorsByUser(userId, { limit: 200 }),
    ]);

  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const disciplineById = new Map(
    disciplines.map((discipline) => [discipline.id, discipline]),
  );
  const events: StudyEvent[] = [];

  for (const revision of revisions) {
    const topic = topicById.get(revision.topicId);
    if (!topic) continue;
    const discipline = disciplineById.get(topic.disciplineId);
    const occurredAt = safeDate(
      revision.completedAt ||
        (revision.scheduledDate
          ? `${revision.scheduledDate}T12:00:00`
          : revision.createdAt),
    );
    if (!occurredAt) continue;
    events.push({
      id: `rev-${revision.id}`,
      type: "revision",
      occurredAt,
      title: revision.completed
        ? `Revisão concluída: ${topic.name}`
        : revision.ignored
          ? `Revisão ignorada: ${topic.name}`
          : `Revisão agendada: ${topic.name}`,
      detail: revision.completed
        ? `Etapa ${revision.revisionNumber ?? 1} concluída`
        : `Prevista para ${revision.scheduledDate}`,
      disciplineName: discipline?.name,
      topicName: topic.name,
    });
  }

  for (const attempt of settings?.questionAttempts || []) {
    const topic = topicById.get(attempt.topicId);
    if (!topic) continue;
    const discipline = disciplineById.get(topic.disciplineId);
    events.push({
      id: `att-${attempt.id}`,
      type: "answer",
      occurredAt: safeDate(attempt.createdAt),
      title: attempt.correct
        ? `Acertou: ${topic.name}`
        : attempt.answered
          ? `Errou: ${topic.name}`
          : `Não respondeu: ${topic.name}`,
      detail: [
        attempt.banca,
        attempt.confidence ? `confiança ${attempt.confidence}` : null,
        attempt.seconds ? `${attempt.seconds}s` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      disciplineName: discipline?.name,
      topicName: topic.name,
      correct: attempt.correct,
      source: attempt.source,
    });
  }

  for (const error of errorsPage.items) {
    const topic = topicById.get(error.topicId);
    const discipline = disciplineById.get(error.disciplineId);
    events.push({
      id: `err-${error.id}`,
      type: "error",
      occurredAt: safeDate(error.createdAt),
      title: `Erro registrado: ${topic?.name || "questão"}`,
      detail: [error.banca, error.errorOrigin || "não classificado"]
        .filter(Boolean)
        .join(" · "),
      disciplineName: discipline?.name,
      topicName: topic?.name,
      correct: false,
      source: "tec",
    });
  }

  for (const session of settings?.studySessionLog || []) {
    if (!session.date) continue;
    events.push({
      id: `ses-${session.date}-${session.durationMin || 0}`,
      type: "session",
      occurredAt: safeDate(`${session.date}T12:00:00`),
      title: "Sessão de estudo",
      detail: `${session.durationMin || 0} min registrados`,
      minutes: session.durationMin || 0,
      source: "manual",
    });
  }

  const sorted = events
    .filter((event) => Boolean(event.occurredAt))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const byType = emptyCounts();
  for (const event of sorted) byType[event.type] += 1;

  return {
    generatedAt: new Date().toISOString(),
    total: sorted.length,
    byType,
    lastEventAt: sorted[0]?.occurredAt || null,
    events: sorted.slice(0, Math.max(1, Math.min(500, limit))),
  };
}
