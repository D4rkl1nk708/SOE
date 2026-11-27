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
