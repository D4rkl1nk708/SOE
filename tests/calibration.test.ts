import { describe, expect, it } from "vitest";
import {
  calibrationAdvice,
  normalizeCalibrationLevel,
  summarizeCalibration,
  summarizeCalibrationByDiscipline,
} from "../shared/calibration";

const attempt = (
  confidence: string | null,
  correct: boolean,
  extra: Record<string, unknown> = {},
) => ({
  answered: true,
  correct,
  confidence,
  confidencePhase: confidence ? "after_result" : null,
  ...extra,
});

describe("calibração certeza × acerto (item 1)", () => {
  it("sem dados: zero em tudo e frase de convite, sem divisão por zero", () => {
    const summary = summarizeCalibration([]);
    expect(summary.total).toBe(0);
    expect(summary.answered).toBe(0);
    expect(summary.overallAccuracy).toBe(0);
    expect(summary.taxaChute).toBe(0);
    expect(summary.indiceConfianca).toBe(0);
    expect(summary.calibrated).toBe(false);
    expect(summary.buckets).toHaveLength(4);
    expect(calibrationAdvice(summary)[0]).toMatch(/Ainda não há tentativas/);
  });

  it("tudo certeza e tudo certo: índice de confiança 100 e nenhum risco", () => {
    const summary = summarizeCalibration([
      attempt("certeza", true),
      attempt("certeza", true),
      attempt("certeza", true),
    ]);
    expect(summary.indiceConfianca).toBe(100);
    expect(summary.chutesAcertados).toBe(0);
    expect(summary.calibrated).toBe(true);
    expect(calibrationAdvice(summary).join(" ")).toMatch(
      /risco de nota inflada é baixo/,
    );
  });

  it("chute que acerta vira alerta de risco Cebraspe", () => {
    const summary = summarizeCalibration([
      attempt("chute", true),
      attempt("chute", true),
      attempt("chute", false),
      attempt("certeza", true),
    ]);
    expect(summary.chutesAcertados).toBe(2);
    expect(summary.chutesErrados).toBe(1);
    expect(summary.taxaChute).toBe(75);
    const advice = calibrationAdvice(summary).join(" ");
    expect(advice).toMatch(/2 dos seus acertos vieram de chute/);
    expect(advice).toMatch(/Cebraspe/);
  });

  it("mistura: cada nível tem total, acerto e percentual próprio", () => {
    const summary = summarizeCalibration([
      attempt("certeza", true),
      attempt("certeza", true),
      attempt("certeza", false),
      attempt("acho", true),
      attempt("acho", false),
      attempt("chute", false),
      attempt(null, true),
    ]);
    const byLevel = Object.fromEntries(
      summary.buckets.map((bucket) => [bucket.level, bucket]),
    );
    expect(byLevel.certeza.total).toBe(3);
    expect(byLevel.certeza.correct).toBe(2);
    expect(byLevel.certeza.accuracy).toBe(67);
    expect(byLevel.duvida.total).toBe(2);
    expect(byLevel.duvida.accuracy).toBe(50);
    expect(byLevel.chute.total).toBe(1);
    expect(byLevel.nao_declarado.total).toBe(1);
    expect(summary.total).toBe(7);
    expect(summary.declared).toBe(6);
    expect(summary.overallAccuracy).toBe(57);
    expect(summary.undeclaredPct).toBe(14);
  });

  it("percentuais são arredondados (nunca 66.666…)", () => {
    const summary = summarizeCalibration([
      attempt("certeza", true),
      attempt("certeza", true),
      attempt("certeza", false),
    ]);
    expect(summary.indiceConfianca).toBe(67);
    expect(Number.isInteger(summary.indiceConfianca)).toBe(true);
  });

  it("confidence inválida não quebra e cai em não declarado", () => {
    const summary = summarizeCalibration([
      { answered: true, correct: true, confidence: "sei lá" } as any,
      { answered: true, correct: false, confidence: 42 } as any,
    ]);
    const bucket = summary.buckets.find(
      (item) => item.level === "nao_declarado",
    );
    expect(bucket?.total).toBe(2);
    expect(summary.declared).toBe(0);
  });

  it("tentativa em branco conta no total, não na taxa de acerto", () => {
    const summary = summarizeCalibration([
      { answered: false, correct: false, confidence: null } as any,
      attempt("certeza", true),
    ]);
    expect(summary.total).toBe(2);
    expect(summary.answered).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.overallAccuracy).toBe(100);
  });

  it("acento e rótulo antigo 'acho' são normalizados para dúvida", () => {
    expect(normalizeCalibrationLevel("dúvida")).toBe("duvida");
    expect(normalizeCalibrationLevel("acho")).toBe("duvida");
    expect(normalizeCalibrationLevel("CERTEZA")).toBe("certeza");
    expect(normalizeCalibrationLevel(null)).toBe("nao_declarado");
  });

  it("acima de 80% sem declarar: a UI recebe o convite, não um gráfico vazio", () => {
    const attempts = Array.from({ length: 10 }, () => attempt(null, true));
    attempts.push(attempt("certeza", true));
    const summary = summarizeCalibration(attempts);
    expect(summary.undeclaredPct).toBe(91);
    expect(summary.calibrated).toBe(true);
    const noDeclared = summarizeCalibration(
      Array.from({ length: 10 }, () => attempt(null, true)),
    );
    expect(noDeclared.undeclaredPct).toBe(100);
    expect(noDeclared.calibrated).toBe(false);
    expect(calibrationAdvice(noDeclared)[0]).toMatch(
      /marque certeza|marcar certeza/,
    );
  });

  it("recorte por disciplina: top 5 com dados, sem disciplina inventada", () => {
    const attempts = [
      ...Array.from({ length: 6 }, () =>
        attempt("certeza", true, { disciplineId: 1 }),
      ),
      ...Array.from({ length: 4 }, () =>
        attempt("chute", false, { disciplineId: 2 }),
      ),
      attempt("certeza", true, { disciplineId: 9 }),
    ];
    const rows = summarizeCalibrationByDiscipline(
      attempts as any,
      [
        { id: 1, name: "Direito Administrativo" },
        { id: 2, name: "Direito Constitucional" },
      ],
      5,
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].disciplineId).toBe(1);
    expect(rows[0].disciplineName).toBe("Direito Administrativo");
    expect(rows[2].disciplineName).toBe("Disciplina 9");
    expect(rows.every((row) => row.calibrated)).toBe(true);
  });

  it("certeza errada gera frase de confiança mal calibrada", () => {
    const summary = summarizeCalibration([
      attempt("certeza", true),
      attempt("certeza", false),
      attempt("certeza", false),
    ]);
    const advice = calibrationAdvice(summary).join(" ");
    expect(advice).toMatch(/2 questões marcadas como certeza você errou/);
  });
});
