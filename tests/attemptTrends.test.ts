/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  computeDisciplineTrends,
  MIN_TREND_ATTEMPTS,
} from "../shared/attemptTrends";

const now = new Date("2026-11-18T12:00:00.000Z");
const DAY = 86_400_000;

function attempt(
  daysAgo: number,
  correct: boolean,
  disciplineId = 1,
  extra: Record<string, unknown> = {},
) {
  return {
    topicId: disciplineId * 100,
    disciplineId,
    answered: true,
    correct,
    createdAt: new Date(now.getTime() - daysAgo * DAY).toISOString(),
    ...extra,
  };
}

const disciplines = [
  { id: 1, name: "Direito Constitucional" },
  { id: 2, name: "Português" },
];
const topics = [
  { id: 100, disciplineId: 1 },
  { id: 200, disciplineId: 2 },
];

describe("computeDisciplineTrends — 7 dias vs 30 dias (item 2)", () => {
  it("compara a janela recente com a anterior e aponta a direção", () => {
    const attempts = [
      // recente (0-6 dias): 8/10 acertos = 80%
      ...Array.from({ length: 8 }, () => attempt(1, true)),
      ...Array.from({ length: 2 }, () => attempt(2, false)),
      // anterior (7-36 dias): 10/20 = 50%
      ...Array.from({ length: 10 }, () => attempt(10, true)),
      ...Array.from({ length: 10 }, () => attempt(20, false)),
    ];
    const [trend] = computeDisciplineTrends(attempts, disciplines, topics, now);
    expect(trend.recentAttempts).toBe(10);
    expect(trend.recentAccuracy).toBe(80);
    expect(trend.previousAttempts).toBe(20);
    expect(trend.previousAccuracy).toBe(50);
    expect(trend.delta).toBe(30);
    expect(trend.direction).toBe("up");
    expect(trend.sufficient).toBe(true);
  });

  it("marca queda quando piora", () => {
    const attempts = [
      ...Array.from({ length: 10 }, () => attempt(1, false)),
      ...Array.from({ length: 10 }, () => attempt(15, true)),
    ];
    const [trend] = computeDisciplineTrends(attempts, disciplines, topics, now);
    expect(trend.direction).toBe("down");
    expect(trend.delta).toBe(-100);
  });

  it("sem dados suficientes com menos de 10 tentativas", () => {
    const attempts = [
      ...Array.from({ length: 3 }, () => attempt(1, true)),
      ...Array.from({ length: 2 }, () => attempt(20, true)),
    ];
    const [trend] = computeDisciplineTrends(attempts, disciplines, topics, now);
    expect(trend.sufficient).toBe(false);
    expect(trend.delta).toBeNull();
    expect(trend.direction).toBeNull();
    expect(trend.label).toBe("Sem dados suficientes");
    expect(MIN_TREND_ATTEMPTS).toBe(10);
    // ainda mostra a amostra, sem inventar seta
    expect(trend.recentAccuracy).toBe(100);
  });

  it("resolve a disciplina pelo tópico quando a tentativa não tem disciplineId", () => {
    const attempts = [
      ...Array.from({ length: 10 }, (_, index) =>
        attempt(1, true, 2, { disciplineId: undefined, topicId: 200 }),
      ),
      ...Array.from({ length: 10 }, () =>
        attempt(20, true, 2, { disciplineId: undefined, topicId: 200 }),
      ),
    ];
    const trends = computeDisciplineTrends(attempts, disciplines, topics, now);
    expect(trends).toHaveLength(1);
    expect(trends[0].disciplineId).toBe(2);
    expect(trends[0].disciplineName).toBe("Português");
  });

  it("ignora tentativas sem resposta e fora das duas janelas", () => {
    const attempts = [
      attempt(1, false, 1, { answered: false }),
      attempt(400, true),
      attempt(1, true),
    ];
    const [trend] = computeDisciplineTrends(attempts, disciplines, topics, now);
    expect(trend.recentAttempts).toBe(1);
    expect(trend.previousAttempts).toBe(0);
  });

  it("devolve lista vazia sem tentativas", () => {
    expect(computeDisciplineTrends([], disciplines, topics, now)).toEqual([]);
  });
});
