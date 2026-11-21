/**
 * Regras puras do plano do dia (v6.9.8, item 1.1).
 *
 * O plano adaptativo é calculado em dois lugares: no servidor
 * (`server/studyIntelligence.ts::computePlan`) e no modo offline
 * (`client/src/lib/localDb.ts`). Antes cada um tinha a sua conta, e a conta
 * era cruel: `score = 1000 + overdueDays` fazia a revisão mais atrasada vencer
 * sempre, então o aluno via "Revisão vencida há 339 dia(s)" e o mesmo tópico
 * voltava todos os dias, mesmo depois de concluído.
 *
 * Aqui ficam as regras compartilhadas e testadas:
 *  - teto de atraso (`OVERDUE_CAP_DAYS`): mais atrasada não vence sempre;
 *  - rótulo honesto: até 30 dias "vencida há N dias", acima disso "backlog";
 *  - tópicos já concluídos no dia local de hoje ficam fora do plano do dia;
 *  - no máximo 2 blocos de revisão seguidos, depois um de ponto fraco/novo.
 */
import { isSameLocalDay, localDaysBetween, localDayFrom } from "./localDay";

/** Teto de dias de atraso que entram na pontuação. */
export const OVERDUE_CAP_DAYS = 30;

/** Quantos blocos de revisão podem vir em sequência antes de intercalar. */
export const MAX_CONSECUTIVE_REVISIONS = 2;

type RevisionLike = {
  topicId: number;
  completed?: boolean;
  ignored?: boolean;
  completedAt?: string | null;
  scheduledDate?: string;
};

/** Dias de atraso (0 quando é para hoje ou futuro). `NaN` se a data é inválida. */
export function overdueDaysFor(
  scheduledDate: string | null | undefined,
  todayIso: string,
): number {
  const diff = localDaysBetween(String(scheduledDate || ""), todayIso);
  if (!Number.isFinite(diff)) return Number.NaN;
  return Math.max(0, diff);
}

/** Pontuação de uma revisão vencida: 1000 base + atraso com teto de 30. */
export function planRevisionScore(overdueDays: number): number {
  const days = Number.isFinite(overdueDays) ? Math.max(0, overdueDays) : 0;
  return 1000 + Math.min(days, OVERDUE_CAP_DAYS);
}

/** Rótulo do motivo — nunca "vencida há 339 dias" para o aluno. */
export function overdueReason(overdueDays: number): string {
  const days = Number.isFinite(overdueDays) ? Math.max(0, overdueDays) : 0;
  if (days <= 0) return "Revisão programada para hoje";
  if (days <= OVERDUE_CAP_DAYS) {
    return `Revisão vencida há ${days} ${days === 1 ? "dia" : "dias"}`;
  }
  return "Revisão atrasada (backlog)";
}

/**
 * Tópicos que já tiveram uma revisão concluída no dia local de hoje.
 * O plano do dia não volta para eles — era isso que fazia o "próximo no plano"
 * ser sempre o mesmo tópico depois de o aluno concluir 9 vezes.
 */
export function topicsCompletedOnLocalDay(
  revisions: RevisionLike[],
  todayIso: string,
): Set<number> {
  const done = new Set<number>();
  for (const revision of revisions) {
    if (!revision?.completed) continue;
    if (!isSameLocalDay(revision.completedAt, todayIso)) continue;
    done.add(revision.topicId);
  }
  return done;
}

/**
 * Reordena para não haver mais de `max` blocos de revisão seguidos: ao bater o
 * limite, o próximo bloco de ponto fraco/conteúdo novo é puxado para a frente.
 */
export function limitConsecutiveRevisions<T>(
  blocks: T[],
  isRevision: (block: T) => boolean,
  max: number = MAX_CONSECUTIVE_REVISIONS,
): T[] {
  const remaining = [...blocks];
  const ordered: T[] = [];
  let streak = 0;
  while (remaining.length > 0) {
    let index = 0;
    if (streak >= max) {
      const alternative = remaining.findIndex((block) => !isRevision(block));
      if (alternative > 0) index = alternative;
    }
    const [next] = remaining.splice(index, 1);
    if (next === undefined) break;
    ordered.push(next);
    streak = isRevision(next) ? streak + 1 : 0;
  }
  return ordered;
}

/**
 * Dia local de um filtro `YYYY-MM-DD` recebido da UI. Devolve "" quando não há
 * data válida — quem chama decide o fallback (nunca `new Date().toISOString()`).
 */
export function normalizeLocalDay(value: string | null | undefined): string {
  return localDayFrom(value) || "";
}
