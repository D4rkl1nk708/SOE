import { describe, expect, it } from "vitest";
import {
  groupDisciplineDuplicates,
  normalizeDisciplineKey,
  summarizeDuplicates,
} from "../shared/disciplineDuplicates";

describe("disciplinas duplicadas (item 7)", () => {
  it("normaliza prefixo 'Matéria:', parênteses, cauda de doutrina e TI", () => {
    expect(
      normalizeDisciplineKey(
        "Matéria: Direito Administrativo (Doutrina e Leis Federais)",
      ),
    ).toBe("direito administrativo");
    expect(normalizeDisciplineKey("Direito Administrativo")).toBe(
      "direito administrativo",
    );
    expect(
      normalizeDisciplineKey("Direito Constitucional (CF/1988 e Doutrina)"),
    ).toBe("direito constitucional");
    expect(
      normalizeDisciplineKey("Matéria: TI - Desenvolvimento de Sistemas"),
    ).toBe("desenvolvimento de sistemas");
    expect(
      normalizeDisciplineKey("Direito Administrativo - Doutrina e Leis"),
    ).toBe("direito administrativo");
  });

  it("agrupa por chave normalizada e sugere o destino com mais questões", () => {
    const groups = groupDisciplineDuplicates([
      {
        id: 1,
        name: "Matéria: Direito Administrativo (Doutrina e Leis Federais)",
        performance: { questionsResolved: 1062 },
      },
      {
        id: 2,
        name: "Direito Administrativo",
        performance: { questionsResolved: 7 },
      },
      {
        id: 3,
        name: "Direito Administrativo - Doutrina e Leis",
        performance: { questionsResolved: 1 },
      },
      { id: 4, name: "Direito Penal", performance: { questionsResolved: 300 } },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].suggestedTarget.id).toBe(1);
    expect(groups[0].suggestedTarget.questions).toBe(1062);
    expect(groups[0].sources.map((source) => source.id)).toEqual([2, 3]);
    expect(groups[0].impact.questions).toBe(8);
    expect(groups[0].impact.disciplines).toBe(3);
  });

  it("empate de questões escolhe o menor id (determinístico)", () => {
    const groups = groupDisciplineDuplicates([
      { id: 7, name: "Direito Civil", performance: { questionsResolved: 10 } },
      { id: 5, name: "Direito Civil", performance: { questionsResolved: 10 } },
    ]);
    expect(groups[0].suggestedTarget.id).toBe(5);
  });

  it("sem duplicadas não há grupo (idempotência por construção)", () => {
    const groups = groupDisciplineDuplicates([
      { id: 1, name: "Direito Penal" },
      { id: 2, name: "Direito Civil" },
      { id: 3, name: "Português" },
    ]);
    expect(groups).toEqual([]);
  });

  it("cenário real: os 3 grupos nomeados somam 1.062 + 7 + 1 e nada é perdido", () => {
    const named = [
      {
        id: 1,
        name: "Matéria: Direito Administrativo (Doutrina e Leis Federais)",
        performance: { questionsResolved: 1062 },
      },
      {
        id: 2,
        name: "Direito Administrativo",
        performance: { questionsResolved: 7 },
      },
      {
        id: 3,
        name: "Direito Administrativo - Doutrina e Leis",
        performance: { questionsResolved: 1 },
      },
      {
        id: 4,
        name: "Direito Constitucional (CF/1988 e Doutrina)",
        performance: { questionsResolved: 514 },
      },
      {
        id: 5,
        name: "Direito Constitucional",
        performance: { questionsResolved: 120 },
      },
      {
        id: 6,
        name: "Matéria: TI - Desenvolvimento de Sistemas",
        performance: { questionsResolved: 90 },
      },
      {
        id: 7,
        name: "Desenvolvimento de Sistemas",
        performance: { questionsResolved: 30 },
      },
    ];
    const singles = Array.from({ length: 17 }, (_, index) => ({
      id: 100 + index,
      name: `Disciplina única ${index + 1}`,
      performance: { questionsResolved: index + 1 },
    }));
    const disciplines = [...named, ...singles];

    const overview = summarizeDuplicates(disciplines);
    expect(overview.groups).toHaveLength(3);
    expect(overview.disciplinesBefore).toBe(24);
    expect(overview.disciplinesAfter).toBe(20);

    const admin = overview.groups.find(
      (group) => group.key === "direito administrativo",
    );
    expect(
      (admin?.suggestedTarget.questions ?? 0) + (admin?.impact.questions ?? 0),
    ).toBe(1070);
    const constitutional = overview.groups.find(
      (group) => group.key === "direito constitucional",
    );
    expect(
      (constitutional?.suggestedTarget.questions ?? 0) +
        (constitutional?.impact.questions ?? 0),
    ).toBe(634);
    const ti = overview.groups.find(
      (group) => group.key === "desenvolvimento de sistemas",
    );
    expect(
      (ti?.suggestedTarget.questions ?? 0) + (ti?.impact.questions ?? 0),
    ).toBe(120);

    const totalQuestions = disciplines.reduce(
      (sum, discipline) => sum + discipline.performance.questionsResolved,
      0,
    );
    const afterQuestions = disciplines
      .filter(
        (discipline) =>
          !overview.groups.some((group) =>
            group.sources.some((source) => source.id === discipline.id),
          ),
      )
      .reduce(
        (sum, discipline) => sum + discipline.performance.questionsResolved,
        0,
      );
    expect(afterQuestions + overview.questionsMoved).toBe(totalQuestions);
  });
});
