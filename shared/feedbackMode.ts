/**
 * Gabarito em bloco (v6.9.11, item B2 / 4.5).
 *
 * Evidência: feedback tem d ≈ 0,55, mas 17% dos efeitos são NEGATIVOS
 * (Wisniewski et al., 2020); feedback depois do bloco é tão bom ou melhor que
 * imediato em múltipla escolha (Chaves, cap. 5.8, citando Pashler et al.).
 * Então: sessão de prova de verdade — sem gabarito durante o bloco, correção
 * completa ao final.
 */

export type FeedbackMode = "block" | "immediate";

/** Abaixo disso a sessão é curta demais para "prova de verdade". */
export const BLOCK_FEEDBACK_MIN_QUESTIONS = 5;

export function resolveFeedbackMode(
  questionCount: number,
  preference?: FeedbackMode | null,
): FeedbackMode {
  if (preference === "immediate") return "immediate";
  const count = Number.isFinite(questionCount) ? questionCount : 0;
  if (count >= BLOCK_FEEDBACK_MIN_QUESTIONS) return "block";
  return "immediate";
}

/**
 * O aluno pode ver gabarito/explicação agora? No modo bloco, só depois de
 * corrigir o bloco inteiro.
 */
export function isFeedbackVisible(input: {
  mode: FeedbackMode;
  corrected: boolean;
}): boolean {
  if (input.mode === "immediate") return true;
  return input.corrected === true;
}

export function feedbackModeLabel(mode: FeedbackMode): string {
  return mode === "block"
    ? "Gabarito em bloco (corrigir no final)"
    : "Gabarito imediato";
}

/** Preferência padrão: bloco. <5 questões cai para imediato. */
export const DEFAULT_FEEDBACK_MODE: FeedbackMode = "block";
