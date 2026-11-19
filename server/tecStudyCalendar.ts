/**
 * Decisões puras de calendário para a captura de questões do TEC.
 *
 * O módulo NÃO importa storage nem o planejador de revisões: recebe as
 * revisões e as tentativas já carregadas e devolve apenas decisões. Assim a
 * regra "quantas respostas hoje justificam concluir a revisão de teste" é
 * testável sem banco, sem relógio e sem fuso.
 *
 * Datas de revisão são YYYY-MM-DD e são comparadas como string (lexicográfico):
 * não há `new Date` em scheduledDate, então nada muda com fuso/DST.
 */

export type TecCalendarRevision = {
  id: number;
  topicId: number;
  scheduledDate: string;
  type: "revision" | "test";
  completed: boolean;
  revisionNumber?: number;
  ignored?: boolean;
};

export type TecCalendarAttemptLite = {
  topicId: number | null;
  correct: boolean;
  createdAt: string;
};

const DATE_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value) return false;
  const match = DATE_ISO_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  return (
    probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === day
  );
}

/**
 * Dia LOCAL (não UTC) de um createdAt ISO. Um createdAt que já é YYYY-MM-DD é
 * devolvido intacto: `new Date("2026-11-19")` é meia-noite UTC e, no Brasil,
 * cairia no dia 18.
 */
function toLocalDateIso(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isValidIsoDate(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}`;
}

/** Quantas tentativas do tópico caíram no dia informado (fuso local). */
export function countTopicAnswersOnDate(
  attempts: TecCalendarAttemptLite[],
  topicId: number,
  dateIso: string,
): { total: number; correct: number } {
  const result = { total: 0, correct: 0 };
  if (!Array.isArray(attempts) || !isValidIsoDate(dateIso)) return result;
  if (typeof topicId !== "number" || !Number.isFinite(topicId)) return result;

  for (const attempt of attempts) {
    if (!attempt || attempt.topicId !== topicId) continue;
    if (toLocalDateIso(attempt.createdAt) !== dateIso) continue;
    result.total += 1;
    if (attempt.correct) result.correct += 1;
  }
  return result;
}

/** Ordem canônica: vencida primeiro, depois revisionNumber, depois id. */
function compareRevisions(
  a: TecCalendarRevision,
  b: TecCalendarRevision,
): number {
  if (a.scheduledDate !== b.scheduledDate) {
    return a.scheduledDate < b.scheduledDate ? -1 : 1;
  }
  const revisionA = typeof a.revisionNumber === "number" ? a.revisionNumber : 0;
  const revisionB = typeof b.revisionNumber === "number" ? b.revisionNumber : 0;
  if (revisionA !== revisionB) return revisionA - revisionB;
  return a.id - b.id;
}

function isPendingRevision(
  revision: TecCalendarRevision,
  topicId: number,
  today: string,
  type: TecCalendarRevision["type"],
): boolean {
  if (!revision || typeof revision !== "object") return false;
  if (revision.topicId !== topicId) return false;
  if (revision.type !== type) return false;
  if (revision.completed) return false;
  if (revision.ignored) return false;
  if (!isValidIsoDate(revision.scheduledDate)) return false;
  return revision.scheduledDate <= today;
}

/**
 * Revisão de TESTE a concluir automaticamente: só 'test', pendente, com
 * scheduledDate <= hoje, e somente quando o usuário já respondeu hoje pelo
 * menos `threshold` questões do tópico. Devolve a mais antiga (empate por
 * revisionNumber e depois por id). threshold <= 0 desliga a automação.
 */
export function pickTestRevisionToAutoComplete(input: {
  revisions: TecCalendarRevision[];
  topicId: number;
  today: string;
  answersToday: number;
  threshold: number;
}): TecCalendarRevision | null {
  const { revisions, topicId, today, answersToday, threshold } = input;
  if (!Array.isArray(revisions) || !isValidIsoDate(today)) return null;
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) return null;
  if (threshold <= 0) return null;
  if (typeof answersToday !== "number" || !Number.isFinite(answersToday)) {
    return null;
  }
  if (answersToday < threshold) return null;

  const candidates = revisions.filter((revision) =>
    isPendingRevision(revision, topicId, today, "test"),
  );
  if (candidates.length === 0) return null;

  return candidates.sort(compareRevisions)[0] ?? null;
}

/**
 * Revisão de TEORIA pendente (vencida ou de hoje) do tópico, para a pergunta
 * "Concluir revisão de <tópico>?". Nunca é concluída automaticamente — é só
 * uma sugestão.
 */
export function pickTheoryRevisionSuggestion(input: {
  revisions: TecCalendarRevision[];
  topicId: number;
  today: string;
}): TecCalendarRevision | null {
  const { revisions, topicId, today } = input;
  if (!Array.isArray(revisions) || !isValidIsoDate(today)) return null;

  const candidates = revisions.filter((revision) =>
    isPendingRevision(revision, topicId, today, "revision"),
  );
  if (candidates.length === 0) return null;

  return candidates.sort(compareRevisions)[0] ?? null;
}
