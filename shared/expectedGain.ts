/**
 * Ganho esperado por minuto (v6.9.11, item A4 / 4.12).
 *
 * Evidência: agendar pelo esquecimento estimado supera agenda fixa (Lindsey et
 * al., 2014); a política ótima de "o que revisar agora" é o estado da arte
 * (Tabibian et al., 2019; Hunziker et al., 2019). A decisão de estudar "o mais
 * fraco" ignora peso no edital e incidência da banca.
 *
 * Fórmula (documentada, determinística):
 *   gain = weight
 *        * (1 - proficiency/100)
 *        * (1 + 0.15 * min(daysSinceStudy, 30) / 30)
 *        * (1 + accuracyTrend / 10)
 *        * (0.5 + bancaShare)
 *   retorno = gain / max(minutes, 1)
 *
 * Uso no plano: APENAS como desempate quando a diferença de atraso entre dois
 * blocos é menor que 7 dias — a regra "vencidas primeiro" continua mandando.
 */

/** Diferença máxima de atraso (dias) em que o ganho pode desempatar. */
export const GAIN_TIEBREAK_MAX_OVERDUE_DIFF_DAYS = 7;

export interface ExpectedGainInput {
  /** Peso do tópico no edital (≥0). */
  weight: number;
  /** Proficiência estimada 0–100. */
  proficiency: number;
  /** Dias desde o último contato com o tópico. */
  daysSinceStudy: number;
  /** Tendência de acerto recente (-10..10, 0 = estável). */
  accuracyTrend: number;
  /** Fração de questões do tópico que a banca cobra (0..1). */
  bancaShare: number;
  /** Minutos previstos para o bloco (≥1). */
  minutes: number;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function expectedGainPerMinute(input: ExpectedGainInput): number {
  const weight = Math.max(0, finite(input.weight));
  const proficiency = clamp(finite(input.proficiency), 0, 100);
  const days = clamp(finite(input.daysSinceStudy), 0, 30);
  const trend = clamp(finite(input.accuracyTrend), -10, 10);
  const bancaShare = clamp(finite(input.bancaShare, 0.5), 0, 1);
  const minutes = Math.max(1, finite(input.minutes, 1));

  const gain =
    weight *
    (1 - proficiency / 100) *
    (1 + (0.15 * Math.min(days, 30)) / 30) *
    (1 + trend / 10) *
    (0.5 + bancaShare);

  return gain / Math.max(minutes, 1);
}

/**
 * O ganho só pode desempatar quando os dois blocos estão a menos de 7 dias de
 * atraso entre si — senão a revisão mais antiga sempre perderia para o tópico
 * "mais rentável", quebrando a regra de vencidas primeiro.
 */
export function shouldUseGainTiebreak(
  overdueDaysA: number,
  overdueDaysB: number,
  maxDiffDays: number = GAIN_TIEBREAK_MAX_OVERDUE_DIFF_DAYS,
): boolean {
  const a = Math.max(0, finite(overdueDaysA));
  const b = Math.max(0, finite(overdueDaysB));
  const diff = Math.abs(a - b);
  return Number.isFinite(diff) && diff < maxDiffDays;
}
