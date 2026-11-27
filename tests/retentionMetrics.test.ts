import { describe, it, expect } from "vitest";
import {
  computeRetentionMetrics,
  MIN_RETENTION_SAMPLE,
} from "../shared/retention";

const A = (questionId: string, day: string, correct: boolean) => ({
  questionId,
  correct,
  createdAt: `${day}T12:00:00-03:00`,
});

describe("retentionMetrics — retenção medida, não atividade (seção 6)", () => {
  it("sem amostra suficiente devolve 'amostra insuficiente (n=X)', não número inventado", () => {
    const metrics = computeRetentionMetrics({
      attempts: [A("q1", "2026-11-01", true), A("q1", "2026-11-03", false)],
    });
    expect(MIN_RETENTION_SAMPLE).toBeGreaterThan(2);
    for (const horizon of metrics.horizons) {
      expect(horizon.available).toBe(false);
      expect(horizon.label).toMatch(new RegExp(`n=${horizon.sample}`));
    }
    expect(metrics.available).toBe(false);
  });

  it("calcula retenção nas faixas de 7, 25 e 50 dias", () => {
    const attempts: any[] = [];
    // 12 repetições em até 7 dias
    for (let index = 0; index < 12; index += 1) {
      attempts.push(A(`q7-${index}`, "2026-10-01", true));
      attempts.push(A(`q7-${index}`, "2026-10-06", index < 9));
    }
    // 12 repetições entre 8 e 25 dias
    for (let index = 0; index < 12; index += 1) {
      attempts.push(A(`q25-${index}`, "2026-10-01", true));
      attempts.push(A(`q25-${index}`, "2026-10-20", index < 6));
    }
    // 12 repetições entre 26 e 50 dias
    for (let index = 0; index < 12; index += 1) {
      attempts.push(A(`q50-${index}`, "2026-09-01", true));
      attempts.push(A(`q50-${index}`, "2026-10-15", index < 3));
    }
    const metrics = computeRetentionMetrics({ attempts });
    const [seven, twentyFive, fifty] = metrics.horizons;
    expect(seven.days).toBe(7);
    expect(twentyFive.days).toBe(25);
    expect(fifty.days).toBe(50);
    expect(seven.sample).toBe(12);
    expect(seven.accuracy).toBe(75);
    expect(twentyFive.accuracy).toBe(50);
    expect(fifty.accuracy).toBe(25);
    expect(metrics.available).toBe(true);
  });

  it("acerto em questão nova é reportado separado", () => {
    const fresh = Array.from({ length: 10 }, (_, index) => ({
      questionId: `fresh-${index}`,
      correct: index < 7,
      createdAt: "2026-11-10T12:00:00-03:00",
      fresh: true,
    }));
    const metrics = computeRetentionMetrics({ attempts: fresh });
    expect(metrics.fresh.sample).toBe(10);
    expect(metrics.fresh.accuracy).toBe(70);
    expect(metrics.fresh.available).toBe(true);
  });

  it("retenção por hora estudada usa o tempo registrado", () => {
    const attempts = Array.from({ length: 10 }, (_, index) => ({
      questionId: `h-${index}`,
      correct: index < 6,
      createdAt: "2026-11-10T12:00:00-03:00",
      fresh: true,
    }));
    const metrics = computeRetentionMetrics({
      attempts,
      studySeconds: 2 * 3600,
    });
    expect(metrics.perHour.studyHours).toBeCloseTo(2, 5);
    expect(metrics.perHour.correctPerHour).toBeCloseTo(3, 5);
    expect(metrics.perHour.available).toBe(true);
  });

  it("cobertura ponderada × proficiência e nota esperada com intervalo", () => {
    const attempts = Array.from({ length: 40 }, (_, index) => ({
      questionId: `s-${index}`,
      correct: index < 24,
      createdAt: "2026-11-10T12:00:00-03:00",
      fresh: true,
    }));
    const metrics = computeRetentionMetrics({
      attempts,
      weightedCoveragePct: 50,
      proficiency: 60,
    });
    expect(metrics.coverage.combined).toBeCloseTo(30, 0);
    expect(metrics.expectedScore.score).toBe(60);
    expect(metrics.expectedScore.low).toBeLessThan(60);
    expect(metrics.expectedScore.high).toBeGreaterThan(60);
    expect(metrics.expectedScore.high).toBeLessThanOrEqual(100);
  });

  it("Brier entra no card quando há previsões", () => {
    const metrics = computeRetentionMetrics({
      attempts: [],
      predictions: [
        { predictedPct: 70, actualPct: 100 },
        { predictedPct: 70, actualPct: 0 },
        { predictedPct: 50, actualPct: 50 },
      ],
    });
    expect(metrics.brier.available).toBe(true);
    expect(metrics.brier.score).toBeCloseTo(0.1933, 3);
  });
});

describe("coleira do tutor na métrica de retenção (v6.9.12, A3)", () => {
  const turn = (mayRevealAnswer: boolean) => ({ mayRevealAnswer });

  it("sem turnos devolve 0 e não inventa taxa", () => {
    const metrics = computeRetentionMetrics({ attempts: [] });
    expect(metrics.tutor).toEqual({
      turns: 0,
      directAnswers: 0,
      directAnswerRate: 0,
    });
  });

  it("uso normal (nenhuma revelação) fica em 0% — a meta", () => {
    const metrics = computeRetentionMetrics({
      attempts: [],
      tutorTurns: Array.from({ length: 10 }, () => turn(false)),
    });
    expect(metrics.tutor.turns).toBe(10);
    expect(metrics.tutor.directAnswers).toBe(0);
    expect(metrics.tutor.directAnswerRate).toBe(0);
  });

  it("conta como resposta direta só o turno que liberou a solução completa", () => {
    const metrics = computeRetentionMetrics({
      attempts: [],
      tutorTurns: [...Array.from({ length: 9 }, () => turn(false)), turn(true)],
    });
    expect(metrics.tutor.turns).toBe(10);
    expect(metrics.tutor.directAnswers).toBe(1);
    expect(metrics.tutor.directAnswerRate).toBe(10);
  });
});
