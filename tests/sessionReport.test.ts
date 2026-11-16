import { describe, it, expect } from "vitest";
import {
  buildSessionReport,
  summarizeReport,
  type TopicSnapshot,
} from "../shared/sessionReport";

function snap(
  topicId: number,
  resolved: number,
  correct: number,
  extra: Partial<TopicSnapshot> = {},
): TopicSnapshot {
  return {
    topicId,
    topicName: `Tema ${topicId}`,
    disciplineName: "Disciplina",
    resolved,
    correct,
    readiness: 50,
    ...extra,
  };
}

describe("buildSessionReport", () => {
  it("conta só as questões novas e separa acertos de erros", () => {
    const report = buildSessionReport({
      before: [snap(1, 10, 5)],
      after: [snap(1, 16, 11)],
      globalBefore: 50,
      globalAfter: 60,
    });

    expect(report.questions).toBe(6);
    expect(report.correct).toBe(6);
    expect(report.errors).toBe(0);
    expect(report.accuracy).toBe(100);
    expect(report.noData).toBe(false);
    expect(report.topics).toHaveLength(1);
    expect(report.topics[0].accuracyBefore).toBe(50);
  });

  it("classifica ponto fraco quando a acurácia da sessão fica abaixo de 60%", () => {
    const report = buildSessionReport({
      before: [snap(2, 20, 12)],
      after: [snap(2, 25, 13)],
    });

    expect(report.questions).toBe(5);
    expect(report.correct).toBe(1);
    expect(report.weaknesses[0]).toContain("20%");
    expect(report.weaknesses[0]).toContain("4 erros em 5");
  });

  it("classifica ponto forte com amostra de pelo menos 3 questões", () => {
    const report = buildSessionReport({
      before: [snap(3, 0, 0)],
      after: [snap(3, 4, 3)],
    });

    expect(report.strengths).toHaveLength(1);
    expect(report.strengths[0]).toContain("75%");
  });

  it("ignora tópico sem questão nova na janela", () => {
    const report = buildSessionReport({
      before: [snap(4, 8, 4)],
      after: [snap(4, 8, 4)],
    });

    expect(report.questions).toBe(0);
    expect(report.noData).toBe(true);
    expect(report.topics).toEqual([]);
  });

  it("nunca gera delta negativo (banco pode regravar contadores)", () => {
    const report = buildSessionReport({
      before: [snap(5, 10, 6)],
      after: [snap(5, 4, 2)],
    });

    expect(report.questions).toBe(0);
    expect(report.noData).toBe(true);
  });

  it("conta tópico novo por inteiro", () => {
    const report = buildSessionReport({
      before: [],
      after: [snap(6, 3, 2)],
    });

    expect(report.questions).toBe(3);
    expect(report.correct).toBe(2);
    expect(report.topics[0].accuracyBefore).toBe(0);
  });

  it("chama de atenção quando acerta bem mas fica abaixo de 80%", () => {
    const report = buildSessionReport({
      before: [snap(7, 0, 0)],
      after: [snap(7, 5, 3)],
    });

    expect(report.weaknesses[0]).toContain("abaixo de 80%");
  });

  it("resume em uma linha para o recibo", () => {
    const report = buildSessionReport({
      before: [snap(8, 0, 0)],
      after: [snap(8, 4, 3)],
    });

    expect(summarizeReport(report)).toContain("3/4 acertos (75%)");
  });
});
