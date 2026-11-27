/**
 * Intervalo mínimo entre recuperações do mesmo tópico (v6.9.11, item A1 / 4.2).
 *
 * Evidência: espaçamento supera massificação (Cepeda et al., 2006) e recuperar
 * com o conteúdo "fresco" rende pouco (Chaves, cap. 7.2 — "pelo menos ~3 dias").
 * Antes, nada no SOE impedia três revisões do mesmo tema no mesmo dia: o 25/50
 * podia conviver com duplicatas e o backlog empurrava o mesmo tópico todos os
 * dias.
 *
 * Este módulo é a ÚNICA porta para reagendar revisão por espaçamento:
 *  - não cria nem apaga revisão;
 *  - não altera `revisionNumber`, `type`, `userId`, `createdAt`;
 *  - só empurra para frente (`to >= from`), nunca para antes de `today`;
 *  - ignora o passado (o backlog já trata disso) e as concluídas;
 *  - é idempotente: rodar duas vezes seguidas devolve zero mudanças.
 *
 * A persistência (backup, gravação e evento `spacing-guard`) fica no
 * `jsonStorage` (servidor) e no `localDb` (offline).
 */
import { addLocalDays, localDayFrom, localDaysBetween } from "./localDay";

/** Intervalo mínimo (dias) entre recuperações do mesmo tópico. */
export const MIN_RECALL_GAP_DAYS = 3;

export type SpacingFixReason = "min-gap" | "same-day-duplicate";

export interface SpacingRevisionLike {
  id: number;
  topicId: number;
  scheduledDate: string;
  completed?: boolean;
  completedAt?: string | null;
  ignored?: boolean;
}

export interface SpacingFix {
  id: number;
  topicId: number;
  from: string;
  to: string;
  reason: SpacingFixReason;
}

export interface PlanSpacingInput {
  revisions: SpacingRevisionLike[];
  today: string;
  /** Dias mínimos entre recuperações (padrão 3). */
  minGapDays?: number;
}

function isPending(revision: SpacingRevisionLike): boolean {
  return revision.completed !== true && revision.ignored !== true;
}

/**
 * Último dia em que o tópico foi recuperado: maior `completedAt` (dia local)
 * ou `scheduledDate` entre as revisões concluídas.
 */
export function lastRecallDay(
  revisions: SpacingRevisionLike[],
  topicId: number,
): string | null {
  let best: string | null = null;
  for (const revision of revisions) {
    if (revision.topicId !== topicId) continue;
    if (revision.completed !== true) continue;
    if (revision.ignored === true) continue;
    const candidates = [
      localDayFrom(revision.completedAt),
      localDayFrom(revision.scheduledDate),
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (!best || candidate > best) best = candidate;
    }
  }
  return best;
}

/**
 * Correções necessárias para respeitar o gap mínimo. Não muta nada: devolve a
 * lista de movimentos para quem for aplicar (com backup).
 */
export function planSpacingFixes(input: PlanSpacingInput): SpacingFix[] {
  const today = localDayFrom(input.today);
  if (!today) return [];
  const gap = Math.max(
    1,
    Math.trunc(
      Number.isFinite(input.minGapDays as number)
        ? (input.minGapDays as number)
        : MIN_RECALL_GAP_DAYS,
    ),
  );

  const byTopic = new Map<number, SpacingRevisionLike[]>();
  for (const revision of input.revisions) {
    const list = byTopic.get(revision.topicId) || [];
    list.push(revision);
    byTopic.set(revision.topicId, list);
  }

  const fixes: SpacingFix[] = [];

  for (const [topicId, topicRevisions] of byTopic) {
    const pending = topicRevisions
      .filter((revision) => isPending(revision))
      .filter((revision) => {
        const day = localDayFrom(revision.scheduledDate);
        return Boolean(day) && day! >= today;
      })
      .sort((a, b) => {
        const byDay = String(a.scheduledDate).localeCompare(
          String(b.scheduledDate),
        );
        return byDay !== 0 ? byDay : a.id - b.id;
      });
    if (pending.length === 0) continue;

    let anchor = lastRecallDay(topicRevisions, topicId);
    let previousDay: string | null = null;

    for (const revision of pending) {
      const day = localDayFrom(revision.scheduledDate);
      if (!day) continue;

      let target: string | null = null;
      let reason: SpacingFixReason = "min-gap";

      if (anchor) {
        const minAllowed = addLocalDays(anchor, gap);
        if (minAllowed && day < minAllowed) {
          target = minAllowed;
          reason = previousDay === day ? "same-day-duplicate" : "min-gap";
        }
      } else if (previousDay === day) {
        // Sem histórico: a segunda pendente do mesmo dia vai para depois.
        target = addLocalDays(day, gap);
        reason = "same-day-duplicate";
      }

      if (target) {
        // Nunca para o passado e nunca para trás.
        if (target < today) target = today;
        if (target <= day) target = addLocalDays(day, gap);
        fixes.push({
          id: revision.id,
          topicId,
          from: String(revision.scheduledDate),
          to: target,
          reason,
        });
        anchor = target;
      } else {
        anchor = anchor && anchor > day ? anchor : day;
      }
      previousDay = day;
    }
  }

  fixes.sort((a, b) => a.id - b.id);
  return fixes;
}

/**
 * Quantos dias faltam para a próxima recuperação permitida do tópico.
 * Usado pela UI ("volte em N dias") e pelo resumo do guard.
 */
export function daysUntilNextRecall(
  revisions: SpacingRevisionLike[],
  topicId: number,
  today: string,
  minGapDays: number = MIN_RECALL_GAP_DAYS,
): number {
  const last = lastRecallDay(revisions, topicId);
  const todayDay = localDayFrom(today);
  if (!last || !todayDay) return 0;
  const allowed = addLocalDays(last, Math.max(1, Math.trunc(minGapDays)));
  if (!allowed) return 0;
  const diff = localDaysBetween(todayDay, allowed);
  return Number.isFinite(diff) ? Math.max(0, diff) : 0;
}
