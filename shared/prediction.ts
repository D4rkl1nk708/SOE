/**
 * Previsão antes do bloco, calibração e hipercorreção (v6.9.11, item B4 / 4.7).
 *
 * Evidência: o aluno é mau juiz do próprio conhecimento (Karpicke, Butler &
 * Roediger, 2009; Bjork & Bjork, 2011); erros cometidos COM confiança são os
 * mais bem corrigidos quando há feedback corretivo imediato (Butterfield &
 * Metcalfe, 2006). Daí:
 *  - prever o acerto antes do bloco (0–100%);
 *  - comparar previsto × obtido em pontos percentuais;
 *  - Brier score para acompanhar a calibração ao longo do tempo;
 *  - certeza + erro → cartão corretivo e recall no dia seguinte.
 */

export interface PredictionRecordLike {
  predictedPct: number;
  actualPct: number;
}

export interface PredictionSummary {
  sample: number;
  predictedAvg: number;
  actualAvg: number;
  /** Obtido − previsto, em pontos percentuais (negativo = otimista). */
  gapPoints: number;
  available: boolean;
  message: string;
}

export const MIN_PREDICTION_SAMPLE = 1;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function predictionErrorPoints(
  predictedPct: number,
  actualPct: number,
): number {
  const predicted = Number.isFinite(predictedPct) ? predictedPct : 0;
  const actual = Number.isFinite(actualPct) ? actualPct : 0;
  return Math.round(actual - predicted);
}

export function brierScore(
  items: Array<{ predicted: number; observed: number }>,
): number | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const item of items) {
    const predicted = Number(item?.predicted);
    const observed = Number(item?.observed);
    if (!Number.isFinite(predicted) || !Number.isFinite(observed)) continue;
    const p = Math.min(1, Math.max(0, predicted));
    const o = observed > 0.5 ? 1 : 0;
    sum += (p - o) ** 2;
    count += 1;
  }
  if (count === 0) return null;
  return sum / count;
}

export function summarizePredictions(
  records: PredictionRecordLike[],
): PredictionSummary {
  const valid = (records || []).filter(
    (record) =>
      Number.isFinite(Number(record?.predictedPct)) &&
      Number.isFinite(Number(record?.actualPct)),
  );
  const sample = valid.length;
  if (sample < MIN_PREDICTION_SAMPLE) {
    return {
      sample,
      predictedAvg: 0,
      actualAvg: 0,
      gapPoints: 0,
      available: false,
      message: `amostra insuficiente (n=${sample})`,
    };
  }
  const predictedAvg =
    valid.reduce((sum, record) => sum + Number(record.predictedPct), 0) /
    sample;
  const actualAvg =
    valid.reduce((sum, record) => sum + Number(record.actualPct), 0) / sample;
  const gapPoints = actualAvg - predictedAvg;
  return {
    sample,
    predictedAvg: round2(predictedAvg),
    actualAvg: round2(actualAvg),
    gapPoints: round2(gapPoints),
    available: true,
    message:
      Math.abs(gapPoints) < 5
        ? "Previsão calibrada: você acertou o que esperava."
        : gapPoints > 0
          ? "Você acertou MAIS do que previu — subestima seu preparo."
          : "Você acertou MENOS do que previu — atenção ao excesso de confiança.",
  };
}

/** Hipercorreção: erro declarado com certeza merece correção imediata. */
export function shouldHypercorrect(input: {
  confidence?: string | null;
  correct?: boolean;
}): boolean {
  return input.confidence === "certeza" && input.correct === false;
}

/** Brier por faixa de previsão (curva de calibração). */
export function calibrationCurve(
  records: PredictionRecordLike[],
  bucketSize = 20,
): Array<{
  from: number;
  to: number;
  sample: number;
  predicted: number;
  actual: number;
}> {
  const size = Math.max(5, Math.trunc(bucketSize));
  const buckets: Array<Array<PredictionRecordLike>> = [];
  for (let from = 0; from < 100; from += size) {
    buckets.push(
      (records || []).filter(
        (record) =>
          record.predictedPct >= from && record.predictedPct < from + size,
      ),
    );
  }
  return buckets
    .map((items, index) => {
      const from = index * size;
      const predicted =
        items.length > 0
          ? items.reduce((sum, item) => sum + item.predictedPct, 0) /
            items.length
          : 0;
      const actual =
        items.length > 0
          ? items.reduce((sum, item) => sum + item.actualPct, 0) / items.length
          : 0;
      return {
        from,
        to: from + size,
        sample: items.length,
        predicted: round2(predicted),
        actual: round2(actual),
      };
    })
    .filter((bucket) => bucket.sample > 0);
}

/* ─────────────────────────────────────────────────────────────────────────
 * v6.9.15 (item A): julgamento atrasado (JOL).
 *
 * A previsão ANTES do bloco ("forecast") mede expectativa; a estimativa DEPOIS
 * de corrigir, sem o material à vista ("jol"), mede julgamento com a tarefa já
 * resolvida — e é bem mais precisa (g = 0,93). O card de calibração passa a
 * mostrar os três números lado a lado: previsto antes, estimado depois e real.
 * ───────────────────────────────────────────────────────────────────────── */

export type PredictionKind = "forecast" | "jol";

export interface JudgedPredictionLike {
  /** Ausente = registro antigo (6.9.11), que só fazia previsão antes. */
  kind?: string | null;
  predictedPct: number;
  actualPct?: number;
}

export interface PredictionLeg {
  kind: PredictionKind;
  sample: number;
  predictedAvg: number | null;
  actualAvg: number | null;
  /** Real − previsto, em pontos percentuais. */
  errorPoints: number | null;
  brier: number | null;
  available: boolean;
}

export interface ThreeWayCalibration {
  forecast: PredictionLeg;
  jol: PredictionLeg;
  actual: { sample: number; avg: number | null };
  /** true quando o "depois" errou menos p.p. que o "antes". */
  improved: boolean | null;
  note: string;
}

export function normalizePredictionKind(
  kind: string | null | undefined,
): PredictionKind {
  return kind === "jol" ? "jol" : "forecast";
}

/** Só entram registros com os dois lados (previsto e obtido). */
function judgedItems(records: JudgedPredictionLike[]): JudgedPredictionLike[] {
  return (Array.isArray(records) ? records : []).filter(
    (record) =>
      Number.isFinite(Number(record?.predictedPct)) &&
      Number.isFinite(Number(record?.actualPct)),
  );
}

/** Brier separado por tipo: misturar os dois esconde justamente o efeito. */
export function brierScoreByKind(records: JudgedPredictionLike[]): {
  forecast: number | null;
  jol: number | null;
} {
  const items = judgedItems(records);
  const forKind = (kind: PredictionKind) =>
    brierScore(
      items
        .filter((record) => normalizePredictionKind(record.kind) === kind)
        .map((record) => ({
          predicted: Number(record.predictedPct) / 100,
          observed: Number(record.actualPct) / 100,
        })),
    );
  return { forecast: forKind("forecast"), jol: forKind("jol") };
}

function leg(
  kind: PredictionKind,
  records: JudgedPredictionLike[],
): PredictionLeg {
  const items = judgedItems(records).filter(
    (record) => normalizePredictionKind(record.kind) === kind,
  );
  const sample = items.length;
  if (sample === 0) {
    return {
      kind,
      sample: 0,
      predictedAvg: null,
      actualAvg: null,
      errorPoints: null,
      brier: null,
      available: false,
    };
  }
  const predictedAvg =
    items.reduce((sum, record) => sum + Number(record.predictedPct), 0) /
    sample;
  const actualAvg =
    items.reduce((sum, record) => sum + Number(record.actualPct), 0) / sample;
  const brier = brierScore(
    items.map((record) => ({
      predicted: Number(record.predictedPct) / 100,
      observed: Number(record.actualPct) / 100,
    })),
  );
  return {
    kind,
    sample,
    predictedAvg: round2(predictedAvg),
    actualAvg: round2(actualAvg),
    errorPoints: Math.round(actualAvg - predictedAvg),
    brier,
    available: true,
  };
}

export function summarizeThreeWayCalibration(
  records: JudgedPredictionLike[],
): ThreeWayCalibration {
  const items = judgedItems(records);
  const forecast = leg("forecast", items);
  const jol = leg("jol", items);
  const actualAvg =
    items.length > 0
      ? round2(
          items.reduce((sum, record) => sum + Number(record.actualPct), 0) /
            items.length,
        )
      : null;

  const improved =
    forecast.available &&
    jol.available &&
    Number.isFinite(forecast.errorPoints) &&
    Number.isFinite(jol.errorPoints)
      ? Math.abs(Number(jol.errorPoints)) <
        Math.abs(Number(forecast.errorPoints))
      : null;

  let note: string;
  if (forecast.available && jol.available) {
    note =
      "O julgamento depois costuma ser mais preciso: com o bloco já corrigido, você estima a partir do desempenho que teve — não da expectativa que carregava antes de responder.";
  } else if (jol.available) {
    note =
      "Só há estimativa depois do bloco. Faça a previsão antes para comparar os dois julgamentos.";
  } else if (forecast.available) {
    note =
      "Só há previsão antes do bloco. Estime depois de corrigir: o julgamento atrasado costuma ser bem mais preciso.";
  } else {
    note =
      "Sem previsão registrada ainda. Preveja antes do bloco e estime depois de corrigir para ver os três números.";
  }

  return {
    forecast,
    jol,
    actual: { sample: items.length, avg: actualAvg },
    improved,
    note,
  };
}
