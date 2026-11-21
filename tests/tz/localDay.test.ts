/** @vitest-environment node */
/**
 * Item 2.2 (v6.9.8): "hoje" é dia LOCAL.
 *
 * Roda com TZ=America/Sao_Paulo fixado no vitest.journeys.config.ts e relógio
 * em 23:30 — o horário em que o app antigo achava que já era o dia seguinte.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  addLocalDays,
  isSameLocalDay,
  localDayFrom,
  localDayISO,
  localDaysBetween,
} from "../../shared/localDay";
import {
  OVERDUE_CAP_DAYS,
  limitConsecutiveRevisions,
  overdueReason,
  planRevisionScore,
  topicsCompletedOnLocalDay,
} from "../../shared/planRules";

describe("localDay com TZ=America/Sao_Paulo", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("23:30 de sábado ainda é sábado (UTC já é domingo)", () => {
    const lateNight = new Date(2026, 10, 21, 23, 30, 0);
    expect(lateNight.toISOString().slice(0, 10)).toBe("2026-11-22");
    expect(localDayISO(lateNight)).toBe("2026-11-21");
  });

  it("21:00 é o limite: antes era o primeiro minuto do dia seguinte em UTC", () => {
    expect(localDayISO(new Date(2026, 10, 21, 20, 59, 0))).toBe("2026-11-21");
    expect(localDayISO(new Date(2026, 10, 21, 21, 0, 0))).toBe("2026-11-21");
    expect(localDayISO(new Date(2026, 10, 21, 23, 59, 59))).toBe("2026-11-21");
    expect(localDayISO(new Date(2026, 10, 22, 0, 0, 1))).toBe("2026-11-22");
  });

  it("isSameLocalDay compara o dia local de um timestamp UTC", () => {
    // 02:30 UTC de 22/11 = 23:30 de 21/11 em Brasília.
    expect(isSameLocalDay("2026-11-22T02:30:00.000Z", "2026-11-21")).toBe(true);
    expect(isSameLocalDay("2026-11-22T02:30:00.000Z", "2026-11-22")).toBe(
      false,
    );
    expect(isSameLocalDay(null, "2026-11-22")).toBe(false);
  });

  it("addLocalDays atravessa mês e ano sem escorregar", () => {
    expect(addLocalDays("2026-11-21", 1)).toBe("2026-11-22");
    expect(addLocalDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addLocalDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addLocalDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addLocalDays("2026-11-21", 0)).toBe("2026-11-21");
  });

  it("localDaysBetween conta dias de calendário", () => {
    expect(localDaysBetween("2026-11-01", "2026-11-21")).toBe(20);
    expect(localDaysBetween("2026-11-21", "2026-11-01")).toBe(-20);
    expect(localDayFrom("2026-11-21T23:30:00-03:00")).toBe("2026-11-21");
  });
});

describe("planRules — teto de atraso e intercalação", () => {
  it("a revisão mais atrasada não vence sempre", () => {
    expect(planRevisionScore(1)).toBe(1001);
    expect(planRevisionScore(OVERDUE_CAP_DAYS)).toBe(1030);
    expect(planRevisionScore(339)).toBe(1030);
    expect(planRevisionScore(339)).toBe(planRevisionScore(45));
  });

  it("rótulo deixa de assustar o aluno", () => {
    expect(overdueReason(0)).toBe("Revisão programada para hoje");
    expect(overdueReason(1)).toBe("Revisão vencida há 1 dia");
    expect(overdueReason(9)).toBe("Revisão vencida há 9 dias");
    expect(overdueReason(31)).toBe("Revisão atrasada (backlog)");
    expect(overdueReason(339)).not.toContain("339");
  });

  it("tópico concluído hoje sai do plano do dia", () => {
    const revisions = [
      {
        topicId: 7,
        completed: true,
        completedAt: "2026-11-22T02:30:00.000Z", // 23:30 de 21/11 local
      },
      { topicId: 8, completed: true, completedAt: "2026-11-20T12:00:00.000Z" },
      { topicId: 9, completed: false, completedAt: null },
    ];
    const done = topicsCompletedOnLocalDay(revisions, "2026-11-21");
    expect([...done]).toEqual([7]);
  });

  it("no máximo 2 blocos de revisão seguidos", () => {
    const blocks = [
      { id: "r1", revision: true },
      { id: "r2", revision: true },
      { id: "r3", revision: true },
      { id: "r4", revision: true },
      { id: "w1", revision: false },
      { id: "w2", revision: false },
    ];
    const ordered = limitConsecutiveRevisions(
      blocks,
      (block) => block.revision,
    );
    const ids = ordered.map((block) => block.id);
    expect(ids.slice(0, 4)).toEqual(["r1", "r2", "w1", "r3"]);
    // Nenhuma sequência maior que 2.
    let streak = 0;
    for (const block of ordered) {
      streak = block.revision ? streak + 1 : 0;
      expect(streak).toBeLessThanOrEqual(2);
    }
    // Nada é perdido.
    expect(new Set(ids)).toEqual(new Set(blocks.map((block) => block.id)));
  });
});
