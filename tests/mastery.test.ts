import { describe, it, expect } from "vitest";
import { masteryFromRecalls, type Recall } from "../shared/mastery";

const r = (day: string, correct = true, fresh = false): Recall => ({
  day,
  correct,
  fresh,
});

describe("mastery — selo só com recuperações espaçadas (4.1 / 4.9)", () => {
  it("3 acertos espaçados (≥3 dias) → nível 3", () => {
    const result = masteryFromRecalls([
      r("2026-11-01"),
      r("2026-11-05"),
      r("2026-11-10"),
    ]);
    expect(result.spacedCorrect).toBe(3);
    expect(result.level).toBe(3);
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
    // 01, 09 → só dois pontos válidos (02 e 03 coladas demais)
    expect(result.spacedCorrect).toBe(2);
    expect(result.level).toBe(2);
  });

  it("questão vista não dá nível 4: precisa de acerto em questão nova depois do 3º espaçado", () => {
    const seenOnly = masteryFromRecalls([
      r("2026-11-01"),
      r("2026-11-05"),
      r("2026-11-10"),
      r("2026-11-15", true, false),
    ]);
    expect(seenOnly.level).toBe(3);

    const fresh = masteryFromRecalls([
      r("2026-11-01"),
      r("2026-11-05"),
      r("2026-11-10"),
      r("2026-11-14", true, true),
    ]);
    expect(fresh.level).toBe(4);
    expect(fresh.freshCorrect).toBe(1);
  });

  it("acerto em questão nova antes do terceiro espaçado não basta para nível 4", () => {
    const result = masteryFromRecalls([
      r("2026-11-01"),
      r("2026-11-04", true, true),
      r("2026-11-07"),
      r("2026-11-10"),
    ]);
    expect(result.spacedCorrect).toBe(3);
    expect(result.level).toBe(3);
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
    expect(result.level).toBe(3);
  });

  it("lista vazia → nível 0 com motivo honesto", () => {
    const result = masteryFromRecalls([]);
    expect(result.level).toBe(0);
    expect(result.spacedCorrect).toBe(0);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("respeita minGapDays customizado", () => {
    const recalls = [r("2026-11-01"), r("2026-11-03"), r("2026-11-05")];
    // gap 3: 01 conta, 03 e 05 ficam colados; 05 entra porque está a 4 dias de 01.
    expect(masteryFromRecalls(recalls, 3).spacedCorrect).toBe(2);
    expect(masteryFromRecalls(recalls, 2).spacedCorrect).toBe(3);
  });
});
