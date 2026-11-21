/**
 * Triagem do backlog de revisões e reagendamento a partir da sessão.
 *
 * Funções puras: não criam, apagam nem gravam nada. Servem para responder duas
 * perguntas sem tocar na lógica 25/50 (que é quem gera revisões novas):
 *  - "esse backlog de revisões vencidas é dívida real ou ruído que dá para
 *    arquivar?" (selectBacklog / backlogSummary / suggestBacklogAction);
 *  - "a sessão de hoje deve reagendar a revisão pendente deste tópico?"
 *    (planSessionReschedule).
 *
 * Datas são sempre strings `YYYY-MM-DD` (calendário local, como
 * `formatDateForDb` grava). Nada de `Date` local aqui: comparamos por dia UTC,
 * então fuso e horário de verão não deslocam a contagem.
 */

/** Forma mínima de uma revisão que estas funções precisam. */
export type Rev = {
  id: number;
  topicId: number;
  scheduledDate: string;
  completed: boolean;
  ignored?: boolean;
};

/** Uma revisão pendente é a que não foi concluída nem arquivada. */
export type BacklogSummary = {
  total: number;
  overdue: number;
  veryOld: number;
  oldestDays: number;
  oldestTopicIds: number[];
};

export type BacklogAction = "nenhuma" | "reagendar" | "arquivar";

const DAY_MS = 86_400_000;
/** Vencida há tanto tempo que já é arqueológica (usada em `veryOld`). */
const VERY_OLD_DAYS = 90;
/** Acima disso, manter a dívida custa mais do que reconhecer a perda. */
const ARCHIVE_AT_VERY_OLD = 300;
/** Acima disso, a fila ativa deixa de caber num dia de estudo. */
const RESCHEDULE_AT_OVERDUE = 30;
const MAX_OLDEST_TOPICS = 10;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Converte `YYYY-MM-DD` no timestamp UTC da meia-noite daquele dia. */
function toUtcMidnight(iso: string): number | null {
  if (typeof iso !== "string") return null;
  const match = ISO_DATE.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ts = Date.UTC(year, month - 1, day);
  // Rejeita datas que "rolam" (ex.: 2026-02-30 viraria 2026-03-02).
  const check = new Date(ts);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return ts;
}

/** Normaliza para `YYYY-MM-DD`, ou `null` se a data for inválida. */
function normalizeIsoDate(iso: string): string | null {
  const ts = toUtcMidnight(iso);
  if (ts === null) return null;
  // `ts` é meia-noite UTC de propósito: aqui normalizamos uma data já
  // informada, não "hoje" — trocar por dia local deslocaria o dia.
  // eslint-disable-next-line no-restricted-syntax
  return new Date(ts).toISOString().slice(0, 10);
}

function isPending(rev: Rev): boolean {
  return rev.completed !== true && rev.ignored !== true;
}

/** Idade em dias de uma revisão; `NaN` quando a data é inválida. */
function ageInDays(rev: Rev, todayIso: string): number {
  return daysBetween(rev.scheduledDate, todayIso);
}

/**
 * Diferença em dias inteiros entre duas datas `YYYY-MM-DD`.
 * Positiva quando `toIso` é depois de `fromIso`. Retorna `NaN` se alguma data
 * for inválida (aí a comparação some da triagem em vez de virar dívida falsa).
 */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = toUtcMidnight(fromIso);
  const to = toUtcMidnight(toIso);
  if (from === null || to === null) return Number.NaN;
  return Math.round((to - from) / DAY_MS);
}

/**
 * Revisões pendentes com pelo menos `olderThanDays` dias de atraso,
 * da mais antiga para a mais nova.
 */
export function selectBacklog(
  revisions: Rev[],
  todayIso: string,
  olderThanDays: number,
): Rev[] {
  const minAge = Number.isFinite(olderThanDays) ? olderThanDays : 0;
  return revisions
    .filter(isPending)
    .map((rev) => ({ rev, age: ageInDays(rev, todayIso) }))
    .filter((entry) => Number.isFinite(entry.age) && entry.age >= minAge)
    .sort((a, b) => b.age - a.age || a.rev.id - b.rev.id)
    .map((entry) => entry.rev);
}

/**
 * Retrato honesto do backlog: quantas pendências existem, quantas já venceram,
 * quantas são antigas o bastante para não valer mais a pena, e os tópicos mais
 * antigos (até 10) para o usuário reconhecer de onde vem a dívida.
 */
export function backlogSummary(
  revisions: Rev[],
  todayIso: string,
): BacklogSummary {
  const pending = revisions.filter(isPending);
  let overdue = 0;
  let veryOld = 0;
  let oldestDays = 0;
  const aged: Array<{ topicId: number; age: number }> = [];

  for (const rev of pending) {
    const age = ageInDays(rev, todayIso);
    if (!Number.isFinite(age)) continue;
    if (age > 0) overdue += 1;
    if (age >= VERY_OLD_DAYS) veryOld += 1;
    if (age > oldestDays) oldestDays = age;
    aged.push({ topicId: rev.topicId, age });
  }

  aged.sort((a, b) => b.age - a.age);

  const oldestTopicIds: number[] = [];
  for (const entry of aged) {
    if (oldestTopicIds.includes(entry.topicId)) continue;
    oldestTopicIds.push(entry.topicId);
    if (oldestTopicIds.length >= MAX_OLDEST_TOPICS) break;
  }

  return {
    total: pending.length,
    overdue,
    veryOld,
    oldestDays,
    oldestTopicIds,
  };
}

/**
 * Sugere o que fazer com o backlog, sempre considerando o custo de manter a
 * dívida: arquivar o que é arqueológico, reagendar a fila ativa, ou nada.
 */
export function suggestBacklogAction(summary: {
  overdue: number;
  veryOld: number;
}): { action: BacklogAction; why: string } {
  const overdue = Math.max(0, Math.trunc(Number(summary?.overdue) || 0));
  const veryOld = Math.max(0, Math.trunc(Number(summary?.veryOld) || 0));

  if (veryOld >= ARCHIVE_AT_VERY_OLD) {
    return {
      action: "arquivar",
      why: `${veryOld} revisões vencidas há mais de 300 dias: cobrar isso todo dia só gera culpa, não memória — arquive e siga do que está vivo.`,
    };
  }

  if (overdue >= RESCHEDULE_AT_OVERDUE) {
    return {
      action: "reagendar",
      why: `${overdue} revisões atrasadas: empilhadas elas travam o plano; reagende as que ainda importam em vez de carregar a fila inteira.`,
    };
  }

  return {
    action: "nenhuma",
    why: "Backlog pequeno: dá para vencer no ritmo normal sem reorganizar o plano.",
  };
}

/**
 * Decide se a sessão de hoje deve mover a revisão pendente de um tópico.
 *
 * Só age se houver pendência daquele `topicId`; escolhe a mais antiga e devolve
 * a data mais próxima entre `suggestedDate` e hoje — nunca no passado e nunca
 * depois de `suggestedDate`. Não cria revisão nova: apenas indica a data.
 */
export function planSessionReschedule(
  revisions: Rev[],
  topicId: number | undefined,
  suggestedDate: string,
  todayIso: string,
): { revisionId: number; newDate: string } | null {
  if (topicId === undefined || topicId === null || !Number.isFinite(topicId)) {
    return null;
  }

  const candidates = revisions
    .filter((rev) => isPending(rev) && rev.topicId === topicId)
    .map((rev) => ({ rev, age: ageInDays(rev, todayIso) }))
    .filter((entry) => Number.isFinite(entry.age))
    .sort((a, b) => b.age - a.age || a.rev.id - b.rev.id);

  if (candidates.length === 0) return null;

  const target = candidates[0].rev;
  const today = normalizeIsoDate(todayIso);
  const suggested = normalizeIsoDate(suggestedDate);

  let newDate: string;
  if (today === null) {
    // Sem "hoje" confiável não há como garantir "nunca no passado".
    newDate =
      suggested ??
      normalizeIsoDate(target.scheduledDate) ??
      target.scheduledDate;
  } else if (suggested === null) {
    newDate = today;
  } else {
    // `YYYY-MM-DD` compara lexicograficamente na ordem cronológica.
    newDate = suggested < today ? today : suggested;
  }

  return { revisionId: target.id, newDate };
}
