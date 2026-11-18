/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  computeEditalCoverage,
  nameSimilarity,
  preserveRowLinks,
  suggestTopicLinks,
} from "../shared/editalCoverage";

const disciplines = [
  { id: 1, name: "Direito Constitucional" },
  { id: 2, name: "Redes de Computadores" },
];

const topics = [
  {
    id: 10,
    name: "Direitos e garantias fundamentais",
    disciplineId: 1,
    performance: { correctCount: 7, errorCount: 3, questionsResolved: 10 },
  },
  {
    id: 11,
    name: "Organização do Estado",
    disciplineId: 1,
    performance: { correctCount: 0, errorCount: 0, questionsResolved: 0 },
  },
  { id: 20, name: "Modelo OSI", disciplineId: 2, performance: {} },
];

describe("nameSimilarity", () => {
  it("casa nome igual e contenção", () => {
    expect(nameSimilarity("Crase", "crase")).toBe(1);
    expect(
      nameSimilarity(
        "Crimes contra a administração",
        "Crimes contra a Administração Pública",
      ),
    ).toBeGreaterThanOrEqual(0.9);
  });

  it("não casa assuntos diferentes", () => {
    expect(nameSimilarity("Licitação", "Redes neurais")).toBeLessThan(0.2);
  });
});

describe("suggestTopicLinks — sugestão por similaridade (item 5)", () => {
  const rows = [
    {
      id: "r1",
      discipline: "Direito Constitucional",
      topic: "Direitos e garantias fundamentais",
      completed: false,
    },
    {
      id: "r2",
      discipline: "Direito Constitucional",
      topic: "Organização do Estado",
      completed: false,
    },
    {
      id: "r3",
      discipline: "Redes de Computadores",
      topic: "Modelo OSI",
      completed: false,
    },
    {
      id: "r4",
      discipline: "Direito Constitucional",
      topic: "Controle de constitucionalidade",
      completed: false,
    },
    {
      id: "h1",
      discipline: "Direito Constitucional",
      topic: "Bloco",
      completed: false,
      isHeader: true,
    },
  ];

  it("sugere o tópico mais parecido e ignora cabeçalho", () => {
    const suggestions = suggestTopicLinks(rows, topics, disciplines);
    expect(suggestions).toHaveLength(4); // sem o header
    const r1 = suggestions.find((item) => item.rowId === "r1")!;
    expect(r1.topicIds[0]).toBe(10);
    expect(r1.score).toBeGreaterThan(0.4);
    expect(suggestions.find((item) => item.rowId === "r3")!.topicIds[0]).toBe(
      20,
    );
  });

  it("linha sem correspondente vem sem vínculo", () => {
    const suggestions = suggestTopicLinks(rows, topics, disciplines);
    const r4 = suggestions.find((item) => item.rowId === "r4")!;
    expect(r4.topicIds).toEqual([]);
    expect(r4.reason).toContain("Nenhum tópico");
  });

  it("respeita o limite de sugestões por linha", () => {
    const suggestions = suggestTopicLinks(rows, topics, disciplines, {
      maxSuggestions: 1,
    });
    for (const item of suggestions)
      expect(item.topicIds.length).toBeLessThanOrEqual(1);
  });
});

describe("computeEditalCoverage — cobertura real (item 5)", () => {
  const rows = [
    {
      id: "r1",
      discipline: "Direito Constitucional",
      topic: "Direitos e garantias fundamentais",
      completed: true,
      topicIds: [10],
    },
    {
      id: "r2",
      discipline: "Direito Constitucional",
      topic: "Organização do Estado",
      completed: false,
      topicIds: [11],
    },
    {
      id: "r3",
      discipline: "Redes de Computadores",
      topic: "Modelo OSI",
      completed: false,
    },
  ];

  it("soma questões e acerto dos tópicos ligados", () => {
    const coverage = computeEditalCoverage(rows, topics, disciplines);
    const constitutional = coverage.blocks.find(
      (block) => block.discipline === "Direito Constitucional",
    )!;
    expect(constitutional.rows).toBe(2);
    expect(constitutional.rowsLinked).toBe(2);
    expect(constitutional.rowsCompleted).toBe(1);
    expect(constitutional.linkedTopicIds.sort()).toEqual([10, 11]);
    expect(constitutional.questions).toBe(10);
    expect(constitutional.accuracy).toBe(70);
    expect(constitutional.covered).toBe(true);
  });

  it("lista os blocos sem nenhuma questão", () => {
    const coverage = computeEditalCoverage(rows, topics, disciplines);
    expect(coverage.emptyBlocks).toEqual(["Redes de Computadores"]);
    expect(coverage.totals.rows).toBe(3);
    expect(coverage.totals.rowsLinked).toBe(2);
    expect(coverage.totals.coveragePercent).toBe(67);
    expect(coverage.totals.questions).toBe(10);
    expect(coverage.totals.accuracy).toBe(70);
  });

  it("edital vazio não quebra", () => {
    const coverage = computeEditalCoverage([], topics, disciplines);
    expect(coverage.blocks).toEqual([]);
    expect(coverage.totals.coveragePercent).toBe(0);
    expect(coverage.totals.accuracy).toBeNull();
  });
});

describe("preserveRowLinks — salvar o edital não apaga os vínculos", () => {
  it("mantém os topicIds anteriores quando a linha chega sem vínculo", () => {
    const previous = [
      {
        id: "r1",
        discipline: "A",
        topic: "a",
        completed: false,
        topicIds: [10, 11],
      },
    ];
    const incoming = [
      { id: "r1", discipline: "A", topic: "a", completed: true },
      { id: "r2", discipline: "B", topic: "b", completed: false },
    ];
    const merged = preserveRowLinks(incoming, previous);
    expect(merged[0].topicIds).toEqual([10, 11]);
    expect(merged[0].completed).toBe(true);
    expect(merged[1].topicIds).toBeUndefined();
  });

  it("vínculo explícito da linha vence o anterior", () => {
    const merged = preserveRowLinks(
      [
        {
          id: "r1",
          discipline: "A",
          topic: "a",
          completed: false,
          topicIds: [20],
        },
      ],
      [
        {
          id: "r1",
          discipline: "A",
          topic: "a",
          completed: false,
          topicIds: [10],
        },
      ],
    );
    expect(merged[0].topicIds).toEqual([20]);
  });
});
