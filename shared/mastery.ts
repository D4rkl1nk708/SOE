/**
 * Selo de domínio por recuperações espaçadas (v6.9.11, itens A2 / 4.1 e 4.9).
 *
 * Evidência: recuperação repetida até critério, com espaçamento, é o que
 * produz retenção durável (Roediger & Karpicke, 2006; Adesope et al., 2017);
 * reconhecer item visto não é saber — o selo "dominado" só cai com acerto em
 * questão NOVA (teste de transferência).
 *
 * Regras (determinísticas, sem IA), calibradas pelo que a evidência mostra:
 *  - conta acertos em dias DISTINTOS com ≥3 dias entre si (máximo 3);
 *  - nível 1 = 1 recuperação espaçada; nível 2 = 2 recuperações espaçadas;
 *  - nível 3 (DOMINADO) = 2 recuperações espaçadas + acerto em questão NOVA
 *    depois da segunda (2 bastam: com 1 o aluno abandona e vai pior; exigir 3
 *    só aumenta o custo sem ganho — Serfaty & Serrano, 2023; Badali, 2022);
 *  - nível 4 (CONSOLIDADO) = 3 espaçadas + acerto em questão nova;
 *  - erro não zera e não conta.
 */
import { localDayFrom, localDaysBetween } from "./localDay";

export type Recall = {
  day: string;
  correct: boolean;
  /** `true` = questão nunca vista pelo aluno (teste de transferência). */
  fresh: boolean;
};

export type MasteryLevel = 0 | 1 | 2 | 3 | 4;

export interface MasteryResult {
  level: MasteryLevel;
  spacedCorrect: number;
  freshCorrect: number;
  reason: string;
}

export const MASTERY_LEVEL_LABELS: Record<MasteryLevel, string> = {
  0: "Aprendido",
  1: "Recuperado 1×",
  2: "Recuperado 2×",
  3: "Dominado",
  4: "Consolidado",
};

function uniqueSortedDays(recalls: Recall[]): string[] {
  const days = new Set<string>();
  for (const recall of recalls) {
    if (!recall || recall.correct !== true) continue;
    const day = localDayFrom(recall.day);
    if (day) days.add(day);
  }
  return [...days].sort();
}

export function masteryFromRecalls(
  recalls: Recall[],
  minGapDays: number = 3,
): MasteryResult {
  const gap = Math.max(
    1,
    Math.trunc(Number.isFinite(minGapDays) ? minGapDays : 3),
  );
  const days = uniqueSortedDays(recalls);

  const accepted: string[] = [];
  for (const day of days) {
    if (accepted.length === 0) {
      accepted.push(day);
      continue;
    }
    const last = accepted[accepted.length - 1];
    const diff = localDaysBetween(last, day);
    if (Number.isFinite(diff) && diff >= gap) accepted.push(day);
  }

  const spacedCorrect = Math.min(3, accepted.length);
  const secondDay = accepted.length >= 2 ? accepted[1] : null;

  // Acerto em questão nova DEPOIS da segunda recuperação espaçada.
  const freshAfterSecond = secondDay
    ? recalls.some((recall) => {
        if (!recall || recall.correct !== true || recall.fresh !== true) {
          return false;
        }
        const day = localDayFrom(recall.day);
        if (!day) return false;
        const diff = localDaysBetween(secondDay, day);
        return Number.isFinite(diff) && diff > 0;
      })
    : false;

  const freshCorrect = recalls.filter((recall) => {
    if (!recall || recall.correct !== true || recall.fresh !== true) {
      return false;
    }
    const day = localDayFrom(recall.day);
    if (!day) return false;
    if (!secondDay) return false;
    const diff = localDaysBetween(secondDay, day);
    return Number.isFinite(diff) && diff > 0;
  }).length;

  let level = Math.min(2, spacedCorrect) as MasteryLevel;
  if (spacedCorrect >= 2 && freshAfterSecond) level = 3;
  if (spacedCorrect >= 3 && freshAfterSecond) level = 4;

  const reason =
    level === 4
      ? "3 recuperações espaçadas + acerto em questão nova"
      : level === 3
        ? "2 recuperações espaçadas + acerto em questão nova · dominado"
        : spacedCorrect === 0
          ? "Sem acerto registrado — o domínio começa na primeira recuperação"
          : spacedCorrect === 1
            ? "1 de 2 recuperações espaçadas · falta a segunda em outro dia"
            : "2 recuperações espaçadas · falta o acerto em questão nova para o selo";

  return { level, spacedCorrect, freshCorrect, reason };
}

/** Recalls a partir do histórico de tentativas de um tópico. */
export function recallsFromAttempts(
  attempts: Array<{
    topicId?: number | null;
    correct?: boolean;
    createdAt?: string;
    context?: string | null;
    fresh?: boolean;
    firstEncounter?: boolean;
  }>,
  topicId: number,
): Recall[] {
  const recalls: Recall[] = [];
  for (const attempt of attempts) {
    if (Number(attempt.topicId) !== topicId) continue;
    if (attempt.context === "pretest") continue;
    if (attempt.correct !== true) continue;
    const day = localDayFrom(attempt.createdAt);
    if (!day) continue;
    recalls.push({
      day,
      correct: true,
      fresh: Boolean(attempt.fresh ?? attempt.firstEncounter),
    });
  }
  return recalls;
}
