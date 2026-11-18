/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  countableMockExams,
  evaluateSimulado,
  isBlankSubmission,
  isCountableMockExam,
  mockExamAccuracy,
  summarizeMockExams,
} from "../shared/mockExamStats";
import {
  findBestDisciplineMatch,
  normalizeDisciplineKey,
} from "../server/tecDisciplineMatcher";

describe("simulado entregue em branco (item 4)", () => {
  const blankExam = {
    id: 1,
    date: "2026-10-28",
    correct: 0,
    wrong: 0,
    blank: 50,
    totalQuestions: 50,
    status: "completed" as const,
  };

  it("não conta simulado com zero respostas", () => {
    expect(isBlankSubmission(blankExam)).toBe(true);
    expect(isCountableMockExam(blankExam)).toBe(false);
    expect(countableMockExams([blankExam])).toEqual([]);
  });

  it("não conta simulado em andamento", () => {
    expect(
      isCountableMockExam({
        correct: 3,
        wrong: 1,
        status: "in_progress",
      }),
    ).toBe(false);
  });

  it("média ignora o simulado em branco", () => {
    const summary = summarizeMockExams([
      blankExam,
      { correct: 8, wrong: 2, totalQuestions: 10, status: "completed" },
      { correct: 6, wrong: 4, totalQuestions: 10, status: "completed" },
    ]);
    expect(summary.total).toBe(3);
    expect(summary.countable).toBe(2);
    expect(summary.discarded).toBe(1);
    // 14 acertos em 20 respondidas
    expect(summary.averageAccuracy).toBe(70);
    expect(summary.lastAccuracy).toBe(60);
    expect(mockExamAccuracy(blankExam)).toBeNull();
  });

  it("nota líquida CEBRASPE = acertos − erros e conta brancos", () => {
    const questions = [
      { id: "q1", correctAnswer: "C" },
      { id: "q2", correctAnswer: "E" },
      { id: "q3", correctAnswer: "C" },
      { id: "q4", correctAnswer: "E" },
    ];
    const evaluation = evaluateSimulado(questions, {
      q1: "C", // certo
      q2: "C", // errado
      q3: "", // branco
      // q4 em branco
    });
    expect(evaluation.correct).toBe(1);
    expect(evaluation.wrong).toBe(1);
    expect(evaluation.blank).toBe(2);
    expect(evaluation.answered).toBe(2);
    expect(evaluation.netScore).toBe(0);
    expect(evaluation.betterBlankCount).toBe(1);
    expect(evaluation.netIfWrongWereBlank).toBe(1);
  });

  it("entrega totalmente vazia é reconhecida como descarte", () => {
    const evaluation = evaluateSimulado(
      [
        { id: "q1", correctAnswer: "C" },
        { id: "q2", correctAnswer: "E" },
      ],
      {},
    );
    expect(evaluation.answered).toBe(0);
    expect(isBlankSubmission(evaluation)).toBe(true);
  });
});

describe("normalização de disciplina do TEC (item 3)", () => {
  it("remove prefixo, parênteses e acento", () => {
    expect(
      normalizeDisciplineKey(
        "Matéria: Direito Administrativo (Doutrina e Leis Federais)",
      ),
    ).toBe("direito administrativo");
    expect(normalizeDisciplineKey("TI - Desenvolvimento de Sistemas")).toBe(
      "desenvolvimento de sistemas",
    );
    expect(normalizeDisciplineKey("Redes de Computadores - Doutrina")).toBe(
      "redes de computadores",
    );
    expect(normalizeDisciplineKey("Acentuação Gráfica")).toBe(
      "acentuacao grafica",
    );
  });
});

describe("matcher não cria disciplina duplicada (item 3)", () => {
  const disciplines = [
    { id: 1, name: "Direito Administrativo" },
    { id: 2, name: "Desenvolvimento de Sistemas" },
  ];

  it("casa a disciplina existente apesar do prefixo/parênteses do TEC", () => {
    const match = findBestDisciplineMatch(
      disciplines,
      "Matéria: Direito Administrativo (Doutrina e Leis Federais)",
      "Atos administrativos",
    );
    expect(match.discipline?.id).toBe(1);
    expect(match.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("casa o nome com prefixo TI -", () => {
    const match = findBestDisciplineMatch(
      disciplines,
      "TI - Desenvolvimento de Sistemas",
      "Camadas",
    );
    expect(match.discipline?.id).toBe(2);
  });
});
