import { describe, it, expect } from "vitest";
import { masteryFromRecalls, type Recall } from "../shared/mastery";

const r = (day: string, correct = true, fresh = false): Recall => ({
  day,
  correct,
  fresh,
});

describe("mastery — selo com 2 recuperações espaçadas + transferência (4.1 / 4.9)", () => {
  it("2 acertos espaçados dão nível 2; o selo de dominado exige questão nova", () => {
    const semNova = masteryFromRecalls([r("2026-11-01"), r("2026-11-05")]);
    expect(semNova.spacedCorrect).toBe(2);
    expect(semNova.level).toBe(2);

    // questão nova 2 dias depois da segunda: não conta como terceira espaçada,
    // mas é a transferência que fecha o selo
    const comNova = masteryFromRecalls([
      r("2026-11-01"),
      r("2026-11-05"),
      r("2026-11-07", true, true),
    ]);
    expect(comNova.level).toBe(3);
    expect(comNova.freshCorrect).toBe(1);
  });

  it("3 recuperações espaçadas + questão nova → nível 4 (consolidado)", () => {
    const result = masteryFromRecalls([
      r("2026-11-01"),
      r("2026-11-05"),
      r("2026-11-10"),
      r("2026-11-14", true, true),
    ]);
    expect(result.spacedCorrect).toBe(3);
    expect(result.level).toBe(4);
  });

  it("acertos no mesmo dia contam uma vez só", () => {
    const result = masteryFromRecalls([
      r("2026-11-01"),
      r("2026-11-01"),
      r("2026-11-01", false),
      r("2026-11-01"),
    ]);
    expect(result.spacedCorrect).toBe(1);
    expect(result.level).toBe(1);
  });

  it("acertos com menos de 3 dias de intervalo não somam", () => {
    const result = masteryFromRecalls([
      r("2026-11-01"),
      r("2026-11-02"),
      r("2026-11-03"),
      r("2026-11-09"),
    ]);
    expect(result.spacedCorrect).toBe(2);
    expect(result.level).toBe(2);
  });

  it("questão vista não dá o selo: precisa de acerto em questão nova depois da segunda", () => {
    const seenOnly = masteryFromRecalls([
      r("2026-11-01"),
      r("2026-11-05"),
      r("2026-11-10"),
      r("2026-11-15", true, false),
    ]);
    expect(seenOnly.level).toBe(2);

    const fresh = masteryFromRecalls([
      r("2026-11-01"),
      r("2026-11-05"),
      r("2026-11-10"),
      r("2026-11-15", true, true),
    ]);
    expect(fresh.level).toBe(4);
  });

  it("acerto em questão nova na primeira revisão não vale como transferência", () => {
    const result = masteryFromRecalls([
      r("2026-11-01"),
      r("2026-11-04", true, true),
      r("2026-11-08"),
    ]);
    // a questão nova caiu no dia da SEGUNDA recuperação: não é "depois" dela.
    // Os três dias são espaçados (3 recuperações), mas sem transferência -> nível 2.
    expect(result.spacedCorrect).toBe(3);
    expect(result.level).toBe(2);
  });

  it("erro não zera nem conta", () => {
    const result = masteryFromRecalls([
      r("2026-11-01"),
      r("2026-11-03", false),
      r("2026-11-05"),
      r("2026-11-06", false),
      r("2026-11-10"),
    ]);
    expect(result.spacedCorrect).toBe(3);
    expect(result.level).toBe(2);
  });

  it("lista vazia → nível 0 com motivo honesto", () => {
    const result = masteryFromRecalls([]);
    expect(result.level).toBe(0);
    expect(result.spacedCorrect).toBe(0);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("respeita minGapDays customizado", () => {
    const recalls = [r("2026-11-01"), r("2026-11-03"), r("2026-11-05")];
    expect(masteryFromRecalls(recalls, 3).spacedCorrect).toBe(2);
    expect(masteryFromRecalls(recalls, 2).spacedCorrect).toBe(3);
  });
});
