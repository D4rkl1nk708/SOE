/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  buildSessionReport,
  buildSessionReportFromAttempts,
  type SessionAttemptLite,
} from "../shared/sessionReport";

const topics = [
  { id: 1, name: "Controle de Constitucionalidade", disciplineId: 10 },
  { id: 2, name: "Docker", disciplineId: 20 },
];
const disciplines = [
  { id: 10, name: "Direito Constitucional" },
  { id: 20, name: "Redes" },
];

function attempt(
  id: string,
  topicId: number | null,
  correct: boolean,
  at: string,
): SessionAttemptLite {
  return { id, topicId, correct, createdAt: at };
}

const START = "2026-11-19T15:00:00.000Z";
const END = "2026-11-19T15:18:00.000Z";

describe("relatório da sessão a partir das tentativas (v6.9.5)", () => {
  it("conta só as tentativas dentro da janela [início, fim]", () => {
    const report = buildSessionReportFromAttempts({
      attempts: [
        attempt("a1", 1, true, "2026-11-19T14:59:00.000Z"), // antes
        attempt("a2", 1, true, "2026-11-19T15:01:00.000Z"),
        attempt("a3", 1, false, "2026-11-19T15:05:00.000Z"),
        attempt("a4", 2, true, "2026-11-19T15:10:00.000Z"),
        attempt("a5", 2, true, "2026-11-19T15:30:00.000Z"), // depois
      ],
      startedAt: START,
      endedAt: END,
      topics,
      disciplines,
      globalBefore: 60,
      globalAfter: 65,
    });

    expect(report.questions).toBe(3);
    expect(report.correct).toBe(2);
    expect(report.errors).toBe(1);
    expect(report.accuracy).toBe(67);
    expect(report.noData).toBe(false);
    expect(report.unclassified).toBe(0);
    expect(report.topics).toHaveLength(2);
  });

  it("agrupa por tópico com nome e disciplina, ordenado por volume", () => {
    const report = buildSessionReportFromAttempts({
      attempts: [
        attempt("a1", 2, true, "2026-11-19T15:02:00.000Z"),
        attempt("a2", 1, true, "2026-11-19T15:03:00.000Z"),
        attempt("a3", 1, true, "2026-11-19T15:04:00.000Z"),
        attempt("a4", 1, false, "2026-11-19T15:05:00.000Z"),
      ],
      startedAt: START,
      endedAt: END,
      topics,
      disciplines,
    });

    expect(report.topics[0].topicId).toBe(1);
    expect(report.topics[0].topicName).toBe("Controle de Constitucionalidade");
    expect(report.topics[0].disciplineName).toBe("Direito Constitucional");
    expect(report.topics[0].questions).toBe(3);
    expect(report.topics[0].correct).toBe(2);
    expect(report.topics[0].accuracy).toBe(67);
    expect(report.topics[1].questions).toBe(1);
  });

  it("questões sem tópico entram no total e em `unclassified`, não num tópico", () => {
    const report = buildSessionReportFromAttempts({
      attempts: [
        attempt("a1", 1, true, "2026-11-19T15:02:00.000Z"),
        attempt("a2", null, false, "2026-11-19T15:03:00.000Z"),
        attempt("a3", null, true, "2026-11-19T15:04:00.000Z"),
      ],
      startedAt: START,
      endedAt: END,
      topics,
      disciplines,
    });

    expect(report.questions).toBe(3);
    expect(report.unclassified).toBe(2);
    expect(report.topics).toHaveLength(1);
    expect(report.topics[0].questions).toBe(1);
  });

  it("janela vazia devolve noData (o chamador pode cair no delta)", () => {
    const report = buildSessionReportFromAttempts({
      attempts: [],
      startedAt: START,
      endedAt: END,
      topics,
      disciplines,
    });
    expect(report.noData).toBe(true);
    expect(report.questions).toBe(0);
  });

  it("datas inválidas não explodem e não contam nada", () => {
    const report = buildSessionReportFromAttempts({
      attempts: [attempt("a1", 1, true, "2026-11-19T15:02:00.000Z")],
      startedAt: "não é data",
      endedAt: END,
      topics,
      disciplines,
    });
    expect(report.questions).toBe(0);
  });

  it("o relatório por delta continua existindo como fallback", () => {
    const delta = buildSessionReport({
      before: [
        {
          topicId: 1,
          topicName: "Controle de Constitucionalidade",
          disciplineName: "Direito Constitucional",
          resolved: 10,
          correct: 7,
          readiness: 40,
        },
      ],
      after: [
        {
          topicId: 1,
          topicName: "Controle de Constitucionalidade",
          disciplineName: "Direito Constitucional",
          resolved: 15,
          correct: 12,
          readiness: 52,
        },
      ],
      globalBefore: 60,
      globalAfter: 66,
    });
    expect(delta.questions).toBe(5);
    expect(delta.correct).toBe(5);
    expect(delta.topics[0].readinessDelta).toBe(12);
  });

  it("lê o readiness antes/depois quando o snapshot é passado", () => {
    const report = buildSessionReportFromAttempts({
      attempts: [attempt("a1", 1, true, "2026-11-19T15:02:00.000Z")],
      startedAt: START,
      endedAt: END,
      topics,
      disciplines,
      before: [
        {
          topicId: 1,
          topicName: "Controle de Constitucionalidade",
          disciplineName: "Direito Constitucional",
          resolved: 4,
          correct: 3,
          readiness: 40,
        },
      ],
      after: [
        {
          topicId: 1,
          topicName: "Controle de Constitucionalidade",
          disciplineName: "Direito Constitucional",
          resolved: 5,
          correct: 4,
          readiness: 47,
        },
      ],
    });
    expect(report.topics[0].readinessDelta).toBe(7);
    expect(report.topics[0].accuracyBefore).toBe(75);
  });
});
