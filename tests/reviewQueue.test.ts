/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import type { ReviewLike } from "../shared/reviewQueue";
import {
  DEFAULT_DAILY_REVIEW_CAP,
  latenessFactor,
  prioritizeReviews,
  topicWeakness,
  daysBetween,
  parseDbDate,
} from "../shared/reviewQueue";

const today = new Date(2026, 10, 18); // 18/11/2026 (mês 0-based)

function rev(
  overrides: Partial<ReviewLike> & { id: number; topicId: number },
): ReviewLike {
  return {
    type: "revision",
    scheduledDate: "2026-11-18",
    completed: false,
    ignored: false,
    ...overrides,
  };
}

describe("prioritizeReviews — fila de revisões (item 1)", () => {
  const disciplines = [
    { id: 1, weight: 3 },
    { id: 2, weight: 1 },
  ];
  const topics = [
    // fraco: 40% de acerto
    {
      id: 10,
      disciplineId: 1,
      performance: { correctCount: 4, errorCount: 6 },
    },
    // forte: 90% de acerto
    {
      id: 11,
      disciplineId: 2,
      performance: { correctCount: 9, errorCount: 1 },
    },
    // sem questão respondida
    {
      id: 12,
      disciplineId: 2,
      performance: { correctCount: 0, errorCount: 0 },
    },
  ];

  it("coloca o tópico fraco e a disciplina de maior peso no topo", () => {
    const revisions = [
      rev({ id: 1, topicId: 11 }),
      rev({ id: 2, topicId: 10 }),
    ];
    const result = prioritizeReviews(revisions, topics, disciplines, today, 25);
    expect(result.queue[0].revision.id).toBe(2);
    expect(result.queue[1].revision.id).toBe(1);
    expect(result.dueTotal).toBe(2);
  });

  it("dá prioridade ao tópico sem nenhuma questão", () => {
    const revisions = [
      rev({ id: 1, topicId: 11 }), // acerta 90%
      rev({ id: 2, topicId: 12 }), // sem dados
    ];
    const result = prioritizeReviews(revisions, topics, disciplines, today, 25);
    expect(result.queue[0].revision.id).toBe(2);
    expect(result.queue[0].weakness).toBeGreaterThan(1);
  });

  it("corta no teto e mantém o resto em espera sem apagar nada", () => {
    const revisions = Array.from({ length: 8 }, (_, index) =>
      rev({ id: index + 1, topicId: 10 }),
    );
    const result = prioritizeReviews(revisions, topics, disciplines, today, 3);
    expect(result.queue).toHaveLength(3);
    expect(result.waiting).toHaveLength(5);
    expect(result.queue.length + result.waiting.length).toBe(8);
    expect(result.cap).toBe(3);
    expect(result.dueTotal).toBe(8);
  });

  it("cap 0 significa sem limite", () => {
    const revisions = Array.from({ length: 40 }, (_, index) =>
      rev({ id: index + 1, topicId: 10 }),
    );
    const result = prioritizeReviews(revisions, topics, disciplines, today, 0);
    expect(result.queue).toHaveLength(40);
    expect(result.waiting).toHaveLength(0);
    expect(result.cap).toBe(0);
  });

  it("usa 25 como padrão quando o cap não é informado", () => {
    const revisions = Array.from({ length: 30 }, (_, index) =>
      rev({ id: index + 1, topicId: 10 }),
    );
    const result = prioritizeReviews(
      revisions,
      topics,
      disciplines,
      today,
      undefined as any,
    );
    expect(result.cap).toBe(DEFAULT_DAILY_REVIEW_CAP);
    expect(result.queue).toHaveLength(25);
    expect(result.waiting).toHaveLength(5);
  });

  it("ignora concluídas, ignoradas e o que ainda não venceu", () => {
    const revisions = [
      rev({ id: 1, topicId: 10 }),
      rev({ id: 2, topicId: 10, completed: true }),
      rev({ id: 3, topicId: 10, ignored: true }),
      rev({ id: 4, topicId: 10, scheduledDate: "2026-12-01" }),
    ];
    const result = prioritizeReviews(revisions, topics, disciplines, today, 25);
    expect(result.dueTotal).toBe(1);
    expect(result.queue[0].revision.id).toBe(1);
  });

  it("desempata revisão antes de teste, depois pelo atraso", () => {
    const revisions = [
      rev({ id: 1, topicId: 10, type: "test", scheduledDate: "2026-11-18" }),
      rev({
        id: 2,
        topicId: 10,
        type: "revision",
        scheduledDate: "2026-11-18",
      }),
    ];
    const result = prioritizeReviews(revisions, topics, disciplines, today, 25);
    expect(result.queue[0].revision.id).toBe(2);

    const late = [
      rev({ id: 3, topicId: 10, scheduledDate: "2026-11-16" }),
      rev({ id: 4, topicId: 10, scheduledDate: "2026-11-10" }),
    ];
    const byLateness = prioritizeReviews(late, topics, disciplines, today, 25);
    expect(byLateness.queue[0].revision.id).toBe(4);
    expect(byLateness.queue[0].daysLate).toBe(8);
  });

  it("não quebra com tópico/disciplina ausentes", () => {
    const result = prioritizeReviews(
      [rev({ id: 1, topicId: 999 })],
      topics,
      disciplines,
      today,
      25,
    );
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0].disciplineWeight).toBe(1);
    expect(result.queue[0].weakness).toBeGreaterThan(1);
  });

  it("tópico com accuracy em percentual é interpretado corretamente", () => {
    expect(
      topicWeakness({ id: 1, disciplineId: 1, performance: { accuracy: 80 } }),
    ).toBeCloseTo(0.2, 5);
    expect(
      topicWeakness({
        id: 1,
        disciplineId: 1,
        performance: { accuracy: 0.5, questionsResolved: 10 },
      }),
    ).toBeCloseTo(0.5, 5);
  });

  it("fator de atraso satura (não explode com 3 anos de atraso)", () => {
    expect(latenessFactor(0)).toBe(1);
    expect(latenessFactor(1)).toBeGreaterThan(1);
    expect(latenessFactor(30)).toBeLessThanOrEqual(6);
    expect(latenessFactor(3000)).toBe(6);
  });

  it("conta dias no calendário local (sem deslocamento de fuso)", () => {
    const from = parseDbDate("2026-11-10")!;
    expect(daysBetween(from, today)).toBe(8);
    expect(parseDbDate("2026-11-18")!).toBeDefined();
  });
});
