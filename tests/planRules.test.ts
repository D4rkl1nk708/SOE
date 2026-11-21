import { describe, it, expect } from "vitest";
import {
  MAX_CONSECUTIVE_REVISIONS,
  OVERDUE_CAP_DAYS,
  limitConsecutiveRevisions,
  normalizeLocalDay,
  overdueDaysFor,
  overdueReason,
  planRevisionScore,
  topicsCompletedOnLocalDay,
} from "../shared/planRules";
import { localDayISO } from "../shared/localDay";

/**
 * Regras puras do plano do dia (v6.9.8, item 1.1) — usadas pelo servidor
 * (`computePlan`) e pelo modo offline (`localDb`), para não existirem duas
 * contas diferentes para a mesma decisão.
 */

describe("planRevisionScore", () => {
  it("usa 1000 de base e teto de 30 dias de atraso", () => {
    expect(planRevisionScore(0)).toBe(1000);
    expect(planRevisionScore(7)).toBe(1007);
    expect(planRevisionScore(OVERDUE_CAP_DAYS)).toBe(1030);
    expect(planRevisionScore(339)).toBe(1030);
  });

  it("mais atrasada não vence sempre", () => {
    expect(planRevisionScore(339)).toBeLessThan(planRevisionScore(40) + 1);
    expect(planRevisionScore(339)).toBe(planRevisionScore(45));
  });

  it("aguenta entrada inválida", () => {
    expect(planRevisionScore(Number.NaN)).toBe(1000);
    expect(planRevisionScore(-5)).toBe(1000);
  });
});

describe("overdueReason", () => {
  it("fala em dias até 30 e em backlog depois", () => {
    expect(overdueReason(0)).toBe("Revisão programada para hoje");
    expect(overdueReason(1)).toBe("Revisão vencida há 1 dia");
    expect(overdueReason(30)).toBe("Revisão vencida há 30 dias");
    expect(overdueReason(31)).toBe("Revisão atrasada (backlog)");
    expect(overdueReason(339)).toBe("Revisão atrasada (backlog)");
  });
});

describe("overdueDaysFor", () => {
  it("conta dias de calendário entre a data agendada e hoje", () => {
    expect(overdueDaysFor("2026-11-20", "2026-11-21")).toBe(1);
    expect(overdueDaysFor("2026-09-01", "2026-11-21")).toBe(81);
    expect(overdueDaysFor("2026-11-21", "2026-11-21")).toBe(0);
    expect(overdueDaysFor("2026-11-25", "2026-11-21")).toBe(0);
    expect(overdueDaysFor("", "2026-11-21")).toBe(Number.NaN);
  });
});

describe("topicsCompletedOnLocalDay", () => {
  it("inclui só o que foi concluído no dia local", () => {
    const done = topicsCompletedOnLocalDay(
      [
        {
          topicId: 1,
          completed: true,
          completedAt: "2026-11-21T15:00:00.000Z",
        },
        {
          topicId: 2,
          completed: true,
          completedAt: "2026-11-19T15:00:00.000Z",
        },
        { topicId: 3, completed: false, completedAt: null },
        { topicId: 4, completed: true, completedAt: null },
      ],
      "2026-11-21",
    );
    expect([...done]).toEqual([1]);
  });
});

describe("limitConsecutiveRevisions", () => {
  const build = () => [
    { id: "r1", revision: true },
    { id: "r2", revision: true },
    { id: "r3", revision: true },
    { id: "r4", revision: true },
    { id: "r5", revision: true },
    { id: "w1", revision: false },
    { id: "w2", revision: false },
  ];

  it("cola um bloco de ponto fraco depois de dois de revisão", () => {
    const ordered = limitConsecutiveRevisions(
      build(),
      (block) => block.revision,
    );
    expect(ordered.map((block) => block.id)).toEqual([
      "r1",
      "r2",
      "w1",
      "r3",
      "r4",
      "w2",
      "r5",
    ]);
  });

  it("nunca passa do limite e não perde bloco", () => {
    const ordered = limitConsecutiveRevisions(
      build(),
      (block) => block.revision,
    );
    let streak = 0;
    for (const block of ordered) {
      streak = block.revision ? streak + 1 : 0;
      expect(streak).toBeLessThanOrEqual(MAX_CONSECUTIVE_REVISIONS);
    }
    expect(ordered).toHaveLength(build().length);
  });

  it("sem bloco alternativo, mantém a ordem original", () => {
    const only = [
      { id: "r1", revision: true },
      { id: "r2", revision: true },
      { id: "r3", revision: true },
    ];
    expect(
      limitConsecutiveRevisions(only, (block) => block.revision).map(
        (block) => block.id,
      ),
    ).toEqual(["r1", "r2", "r3"]);
  });
});

describe("normalizeLocalDay", () => {
  it("aceita dia local e timestamp, devolve string vazia para lixo", () => {
    expect(normalizeLocalDay("2026-11-21")).toBe("2026-11-21");
    expect(normalizeLocalDay(localDayISO(new Date(2026, 10, 21, 10, 0)))).toBe(
      "2026-11-21",
    );
    expect(normalizeLocalDay("")).toBe("");
    expect(normalizeLocalDay(null)).toBe("");
    expect(normalizeLocalDay("ontem")).toBe("");
  });
});
