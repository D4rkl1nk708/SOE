import { describe, it, expect } from "vitest";
import { topicSimilarity, buildContrastPairs } from "../shared/confusable";

const t = (id: number, name: string, disciplineId: number) => ({
  id,
  name,
  disciplineId,
});

describe("confusable — intercalação por contraste (4.3)", () => {
  it("reconhece par plausível anulação × revogação", () => {
    const a = "Anulação e revogação de atos administrativos";
    const b = "Revogação de ato administrativo";
    const score = topicSimilarity(a, b);
    expect(score).toBeGreaterThanOrEqual(0.34);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("ignora acento e caixa", () => {
    const base = topicSimilarity("Anulação de ato", "ANULACAO DE ATO");
    expect(base).toBe(1);
  });

  it("não junta disciplinas diferentes", () => {
    const topics = [
      t(1, "Anulação e revogação de atos administrativos", 1),
      t(2, "Revogação de ato administrativo", 2),
    ];
    expect(buildContrastPairs(topics)).toEqual([]);
  });

  it("monta o par dentro da mesma disciplina", () => {
    const topics = [
      t(1, "Anulação e revogação de atos administrativos", 1),
      t(2, "Revogação de ato administrativo", 1),
      t(3, "Crase e regência verbal", 2),
      t(4, "Concordância verbal e nominal", 2),
    ];
    const pairs = buildContrastPairs(topics);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a).toBe(1);
    expect(pairs[0].b).toBe(2);
    expect(pairs[0].score).toBeGreaterThanOrEqual(0.34);
  });

  it("respeita o limite por disciplina e não repete tópico", () => {
    const topics = [
      t(1, "Competência e atribuição administrativa", 1),
      t(2, "Competência administrativa e atribuição", 1),
      t(3, "Atribuição e competência do servidor", 1),
      t(4, "Competência do servidor público", 1),
      t(5, "Atribuição administrativa pública", 1),
      t(6, "Prazo e decadência administrativa", 1),
    ];
    const pairs = buildContrastPairs(topics, { perDiscipline: 2 });
    expect(pairs.length).toBeLessThanOrEqual(2);
    const used = new Set<number>();
    for (const pair of pairs) {
      expect(used.has(pair.a)).toBe(false);
      expect(used.has(pair.b)).toBe(false);
      used.add(pair.a);
      used.add(pair.b);
    }
  });

  it("respeita minScore", () => {
    const topics = [
      t(1, "Concordância verbal", 1),
      t(2, "Probabilidade e estatística", 1),
    ];
    expect(buildContrastPairs(topics, { minScore: 0.1 })).toEqual([]);
  });
});
