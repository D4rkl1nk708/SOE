/**
 * Calibração certeza × acerto (v6.9.7, item 1).
 *
 * O aluno declara "certeza", "dúvida" ou "chute" ao responder; aqui cruzamos
 * essa declaração com o resultado. É estatística determinística — nenhuma IA,
 * nenhum texto inventado: só contagem, percentual e uma frase de risco.
 *
 * Regra de honestidade: tentativa sem confiança declarada cai em
 * `nao_declarado`; nunca deduzimos confiança a partir do acerto.
 */

export type CalibrationLevel = "certeza" | "duvida" | "chute" | "nao_declarado";

export const CALIBRATION_LEVELS: CalibrationLevel[] = [
  "certeza",
  "duvida",
  "chute",
  "nao_declarado",
];

export const CALIBRATION_LABELS: Record<CalibrationLevel, string> = {
  certeza: "Certeza",
  duvida: "Dúvida",
  chute: "Chute",
  nao_declarado: "Não declarado",
};

export interface CalibrationAttemptLike {
  answered?: boolean;
  correct?: boolean;
  confidence?: string | null;
  confidencePhase?: string | null;
  disciplineId?: number;
  topicId?: number | null;
}

export interface CalibrationBucket {
  level: CalibrationLevel;
  label: string;
  total: number;
  correct: number;
  /** % de acerto dentro do nível (0–100, arredondado). */
  accuracy: number;
}

export interface CalibrationSummary {
  /** Tentativas recebidas (respondidas + em branco). */
  total: number;
  answered: number;
  skipped: number;
  /** Total de tentativas com nível declarado pelo aluno. */
  declared: number;
  /** % de tentativas em `nao_declarado` (0–100). */
  undeclaredPct: number;
  buckets: CalibrationBucket[];
  /** Acertos que vieram de chute (risco em banca C/E, onde erro desconta). */
  chutesAcertados: number;
  /** Erros marcados como chute. */
  chutesErrados: number;
  /** % das tentativas respondidas que foram chute (0–100). */
  taxaChute: number;
  /** % de acerto entre as tentativas declaradas com certeza (0–100). */
  indiceConfianca: number;
  /** % de acerto geral nas tentativas respondidas (0–100). */
  overallAccuracy: number;
  /** Verdadeiro quando há amostra suficiente para opinar (> 0 declaradas). */
  calibrated: boolean;
}

const EMPTY_BUCKETS: Record<CalibrationLevel, CalibrationBucket> = {
  certeza: {
    level: "certeza",
    label: "Certeza",
    total: 0,
    correct: 0,
    accuracy: 0,
  },
  duvida: {
    level: "duvida",
    label: "Dúvida",
    total: 0,
    correct: 0,
    accuracy: 0,
  },
  chute: { level: "chute", label: "Chute", total: 0, correct: 0, accuracy: 0 },
  nao_declarado: {
    level: "nao_declarado",
    label: "Não declarado",
    total: 0,
    correct: 0,
    accuracy: 0,
  },
};

/** "acho" (rótulo antigo do TEC) e "dúvida" são o mesmo nível. */
export function normalizeCalibrationLevel(
  confidence: string | null | undefined,
): CalibrationLevel {
  const value = String(confidence ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (value === "certeza" || value === "certo" || value === "certa") {
    return "certeza";
  }
  if (value === "duvida" || value === "acho" || value === "chutei mas acho") {
    return "duvida";
  }
  if (value === "chute" || value === "chutei" || value === "guess") {
    return "chute";
  }
  return "nao_declarado";
}

function pct(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/**
 * Resumo da calibração. Aceita tentativas em branco: elas contam em `total`,
 * não em `answered` e nunca entram na taxa de acerto.
 */
export function summarizeCalibration(
  attempts: CalibrationAttemptLike[] | null | undefined,
): CalibrationSummary {
  const list = Array.isArray(attempts) ? attempts : [];
  const buckets: Record<CalibrationLevel, CalibrationBucket> = {
    certeza: { ...EMPTY_BUCKETS.certeza },
    duvida: { ...EMPTY_BUCKETS.duvida },
    chute: { ...EMPTY_BUCKETS.chute },
    nao_declarado: { ...EMPTY_BUCKETS.nao_declarado },
  };

  let answered = 0;
  let correctTotal = 0;

  for (const attempt of list) {
    if (!attempt) continue;
    const level = normalizeCalibrationLevel(attempt.confidence);
    const bucket = buckets[level];
    bucket.total += 1;
    if (!attempt.answered) continue;
    answered += 1;
    if (attempt.correct) {
      bucket.correct += 1;
      correctTotal += 1;
    }
  }

  for (const level of CALIBRATION_LEVELS) {
    const bucket = buckets[level];
    bucket.accuracy = pct(bucket.correct, bucket.total);
  }

  const declared =
    buckets.certeza.total + buckets.duvida.total + buckets.chute.total;
  const total = list.length;

  return {
    total,
    answered,
    skipped: Math.max(0, total - answered),
    declared,
    undeclaredPct: pct(buckets.nao_declarado.total, total),
    buckets: CALIBRATION_LEVELS.map((level) => buckets[level]),
    chutesAcertados: buckets.chute.correct,
    chutesErrados: Math.max(0, buckets.chute.total - buckets.chute.correct),
    taxaChute: pct(buckets.chute.total, answered),
    indiceConfianca: pct(buckets.certeza.correct, buckets.certeza.total),
    overallAccuracy: pct(correctTotal, answered),
    calibrated: declared > 0,
  };
}

/** Resumo por disciplina (usado pela UI; ordena por volume respondido). */
export interface CalibrationDisciplineSummary extends CalibrationSummary {
  disciplineId: number;
  disciplineName?: string;
}

export function summarizeCalibrationByDiscipline(
  attempts:
    | (CalibrationAttemptLike & { disciplineId?: number })[]
    | null
    | undefined,
  disciplines: Array<{ id: number; name: string }> | null | undefined,
  limit = 5,
): CalibrationDisciplineSummary[] {
  const names = new Map<number, string>(
    (disciplines || []).map((discipline) => [discipline.id, discipline.name]),
  );
  const groups = new Map<number, CalibrationAttemptLike[]>();
  for (const attempt of attempts || []) {
    const id = Number(attempt?.disciplineId);
    if (!Number.isFinite(id)) continue;
    const list = groups.get(id) || [];
    list.push(attempt);
    groups.set(id, list);
  }
  const rows: CalibrationDisciplineSummary[] = [];
  for (const [disciplineId, list] of groups) {
    const summary = summarizeCalibration(list);
    if (!summary.calibrated) continue;
    rows.push({
      ...summary,
      disciplineId,
      disciplineName: names.get(disciplineId) || `Disciplina ${disciplineId}`,
    });
  }
  return rows
    .sort((a, b) => b.answered - a.answered || b.declared - a.declared)
    .slice(0, Math.max(1, limit));
}

/**
 * 1–3 frases objetivas sobre o risco. Nunca promete nota, nunca inventa dado:
 * cada frase só existe quando o número que a sustenta existe.
 */
export function calibrationAdvice(summary: CalibrationSummary): string[] {
  if (!summary || summary.total === 0) {
    return [
      "Ainda não há tentativas com confiança declarada para cruzar certeza e acerto.",
    ];
  }

  if (!summary.calibrated) {
    return [
      "Passe a marcar certeza, dúvida ou chute ao responder no TEC: sem isso não há como cruzar o que você sentiu com o que acertou.",
    ];
  }

  const advice: string[] = [];
  const certeza = summary.buckets.find((bucket) => bucket.level === "certeza");
  const certezaErradas = certeza
    ? Math.max(0, certeza.total - certeza.correct)
    : 0;

  if (summary.chutesAcertados > 0) {
    advice.push(
      `${summary.chutesAcertados} dos seus acertos vieram de chute: na prova Cebraspe isso costuma virar erro e desconta.`,
    );
  }

  if (certezaErradas > 0) {
    advice.push(
      `${certezaErradas} ${certezaErradas === 1 ? "questão marcada" : "questões marcadas"} como certeza você errou — é confiança mal calibrada, não falta de conteúdo.`,
    );
  }

  if (advice.length === 0) {
    advice.push(
      `Seu índice de confiança está em ${summary.indiceConfianca}% e nenhum acerto veio de chute declarado: o risco de nota inflada é baixo.`,
    );
  }

  if (advice.length === 1 && summary.taxaChute >= 25) {
    advice.push(
      `${summary.taxaChute}% das respostas foram chute — acima de um quarto, cada acerto vale menos que a garantia de não errar.`,
    );
  }

  return advice.slice(0, 3);
}
