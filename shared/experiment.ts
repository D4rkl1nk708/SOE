/**
 * A/B interno do SOE (v6.9.15).
 *
 * Não existe estudo de "gabarito em bloco × imediato" em concurso público
 * brasileiro. Em vez de importar a conclusão de outro contexto, o app mede a
 * própria política: cada aluno cai numa variante determinística, cada tentativa
 * carrega `{ key, variant, override }` e o relatório se recusa a concluir com
 * amostra pequena ("amostra insuficiente (n=X)").
 *
 * Puro, sem I/O: o servidor e o modo offline (APK) usam esta mesma conta.
 */
import type { FeedbackMode } from "./feedbackMode";

export const EXPERIMENT_KEY = "feedback-block-vs-immediate";
export const EXPERIMENT_NAME = "Gabarito em bloco × imediato";
/** Abaixo disso a comparação não vale: a variância engole o efeito. */
export const EXPERIMENT_MIN_SAMPLE = 20;
/** Retenção é medida em questão NOVA, uma semana depois do bloco. */
export const EXPERIMENT_RETENTION_DAYS = 7;

export const EXPERIMENT_VARIANT_LABELS: Record<ExperimentVariant, string> = {
  A: "Gabarito em bloco",
  B: "Gabarito imediato",
};

export type ExperimentVariant = "A" | "B";

/** FNV-1a 32 bits: estável entre chamadas, plataformas e versões do app. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Variante do aluno num experimento. Determinístico: a mesma pessoa no mesmo
 * experimento cai sempre na mesma variante — sem sorteio que muda a cada
 * abertura, senão não existe medição.
 */
export function assignVariant(
  userId: string | number | null | undefined,
  key: string = EXPERIMENT_KEY,
): ExperimentVariant {
  const seed = `${String(userId ?? "anon")}:${String(key || "")}`;
  return hashString(seed) % 2 === 0 ? "A" : "B";
}

/** A variante decide só o PADRÃO; o aluno pode trocar. */
export function variantDefaultFeedbackMode(
  variant: ExperimentVariant,
): FeedbackMode {
  return variant === "A" ? "block" : "immediate";
}

export interface ExperimentRecordLike {
  /** Nome do experimento (registros de outros experimentos são ignorados). */
  key?: string;
  variant?: string;
  override?: boolean;
  correct?: boolean;
  /** Questão nunca vista antes desta tentativa (sinal de retenção). */
  fresh?: boolean;
  /** Carimbo ISO da tentativa. */
  at?: string;
  createdAt?: string;
}

export interface ExperimentVariantSummary {
  variant: ExperimentVariant;
  label: string;
  n: number;
  correct: number;
  /** % de acerto no bloco (0–100). */
  accuracy: number;
  /** Tentativas em questão nova após o bloco (n) e acerto entre elas. */
  retentionN: number;
  retentionAccuracy: number;
  /** Quantas vezes o aluno trocou a política que a variante propôs. */
  overrides: number;
  overrideRate: number;
}

export interface ExperimentSummary {
  key: string;
  name: string;
  variants: ExperimentVariantSummary[];
  n: number;
  /** Menor amostra entre as variantes: é ela que limita a conclusão. */
  minN: number;
  minSample: number;
  retentionDays: number;
  /** Amostra pequena em QUALQUER variante impede a comparação. */
  insufficient: boolean;
  message: string;
}

function roundPct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function stampOf(record: ExperimentRecordLike): number {
  const raw = record.at ?? record.createdAt ?? "";
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function summarizeVariant(
  variant: ExperimentVariant,
  records: ExperimentRecordLike[],
  retentionDays: number,
): ExperimentVariantSummary {
  const n = records.length;
  const correct = records.filter((record) => record.correct === true).length;
  const overrides = records.filter((record) => record.override === true).length;

  const times = records.map(stampOf).filter((time) => Number.isFinite(time));
  const firstAt = times.length > 0 ? Math.min(...times) : Number.NaN;
  // Retenção: acerto em questão NOVA, pelo menos `retentionDays` depois do
  // primeiro registro da variante (o bloco de origem).
  const retention = records.filter((record) => {
    if (record.fresh !== true) return false;
    const time = stampOf(record);
    if (!Number.isFinite(time) || !Number.isFinite(firstAt)) return false;
    return time - firstAt >= retentionDays * 86_400_000;
  });
  const retentionCorrect = retention.filter(
    (record) => record.correct === true,
  ).length;

  return {
    variant,
    label: EXPERIMENT_VARIANT_LABELS[variant],
    n,
    correct,
    accuracy: roundPct(correct, n),
    retentionN: retention.length,
    retentionAccuracy: roundPct(retentionCorrect, retention.length),
    overrides,
    overrideRate: roundPct(overrides, n),
  };
}

/**
 * Resume as tentativas de um experimento. `insufficient` usa a MENOR amostra:
 * comparar 40 contra 6 é pior que não comparar — a variante pequena é só ruído,
 * e o texto mostra o n que limita.
 */
export function summarizeExperiment(
  records: ExperimentRecordLike[],
  options: {
    key?: string;
    minSample?: number;
    retentionDays?: number;
  } = {},
): ExperimentSummary {
  const key = options.key ?? EXPERIMENT_KEY;
  const minSample = Math.max(
    1,
    Math.floor(options.minSample ?? EXPERIMENT_MIN_SAMPLE),
  );
  const retentionDays = Math.max(
    1,
    Math.floor(options.retentionDays ?? EXPERIMENT_RETENTION_DAYS),
  );

  const valid = (Array.isArray(records) ? records : []).filter(
    (record) =>
      record &&
      (record.key === undefined || record.key === key) &&
      (record.variant === "A" || record.variant === "B") &&
      typeof record.correct === "boolean",
  );

  const variants: ExperimentVariantSummary[] = (["A", "B"] as const).map(
    (variant) =>
      summarizeVariant(
        variant,
        valid.filter((record) => record.variant === variant),
        retentionDays,
      ),
  );

  const n = variants.reduce((sum, item) => sum + item.n, 0);
  const minN = Math.min(...variants.map((item) => item.n));
  const insufficient = minN < minSample;

  const [a, b] = variants;
  let message: string;
  if (insufficient) {
    message = `amostra insuficiente (n=${minN}) — o app só compara com ${minSample} tentativas em cada variante.`;
  } else if (a.retentionN === 0 || b.retentionN === 0) {
    message =
      "Amostra suficiente no bloco; ainda sem questão nova depois de 7 dias para medir retenção.";
  } else {
    const leader =
      a.retentionAccuracy === b.retentionAccuracy
        ? "empate"
        : a.retentionAccuracy > b.retentionAccuracy
          ? a.label
          : b.label;
    message =
      leader === "empate"
        ? `Retenção em questão nova empatada: ${a.retentionAccuracy}% nas duas (n=${a.retentionN}/${b.retentionN}).`
        : `Retenção em questão nova: ${leader} leva vantagem (${a.retentionAccuracy}% × ${b.retentionAccuracy}%, n=${a.retentionN}/${b.retentionN}).`;
  }

  return {
    key,
    name: EXPERIMENT_NAME,
    variants,
    n,
    minN,
    minSample,
    retentionDays,
    insufficient,
    message,
  };
}
