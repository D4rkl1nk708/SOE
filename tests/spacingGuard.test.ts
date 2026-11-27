import { describe, it, expect } from "vitest";
import {
  MIN_RECALL_GAP_DAYS,
  lastRecallDay,
  planSpacingFixes,
} from "../shared/spacingGuard";

type R = {
  id: number;
  userId: number;
  topicId: number;
  scheduledDate: string;
  type: "revision" | "test";
  revisionNumber: number;
  completed: boolean;
  ignored: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

let nextId = 1;
function rev(over: Partial<R>): R {
  const base: R = {
    id: nextId++,
    userId: 1,
    topicId: 1,
    scheduledDate: "2026-12-01",
    type: "revision",
    revisionNumber: 1,
    completed: false,
    ignored: false,
    completedAt: null,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
  };
  return { ...base, ...over };
}

describe("spacingGuard — intervalo mínimo de 3 dias (4.2)", () => {
  it("usa 3 dias como intervalo mínimo", () => {
    expect(MIN_RECALL_GAP_DAYS).toBe(3);
  });

  it("lastRecallDay pega o maior dia entre as concluídas (completedAt local)", () => {
    const revisions = [
      rev({
        id: 1,
        completed: true,
        scheduledDate: "2026-11-10",
        completedAt: "2026-11-12T23:30:00-03:00",
      }),
      rev({
        id: 2,
        completed: true,
        scheduledDate: "2026-11-15",
        completedAt: null,
      }),
      rev({ id: 3, topicId: 2, completed: true, scheduledDate: "2026-11-20" }),
    ];
    expect(lastRecallDay(revisions as any, 1)).toBe("2026-11-15");
    expect(lastRecallDay(revisions as any, 3)).toBeNull();
  });

  it("respeita o gap: futura a 1 dia da última recuperação vai para +3", () => {
    const today = "2026-11-17";
    const revisions = [
      rev({
        id: 10,
        topicId: 7,
        completed: true,
        scheduledDate: "2026-11-16",
        completedAt: "2026-11-16T20:00:00-03:00",
      }),
      rev({ id: 11, topicId: 7, scheduledDate: "2026-11-18" }),
      rev({ id: 12, topicId: 7, scheduledDate: "2026-11-28" }),
    ];
    const fixes = planSpacingFixes({ revisions: revisions as any, today });
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({
      id: 11,
      topicId: 7,
      from: "2026-11-18",
      to: "2026-11-19",
      reason: "min-gap",
    });
    // a futura que já respeita o gap não é tocada
    expect(fixes.some((fix) => fix.id === 12)).toBe(false);
  });

  it("não toca no passado (o backlog existente cuida disso)", () => {
    const today = "2026-11-21";
    const revisions = [
      rev({
        id: 20,
        topicId: 3,
        completed: true,
        scheduledDate: "2026-11-20",
        completedAt: "2026-11-20T10:00:00-03:00",
      }),
      rev({ id: 21, topicId: 3, scheduledDate: "2026-11-10" }),
      rev({ id: 22, topicId: 3, scheduledDate: "2026-11-21" }),
    ];
    const fixes = planSpacingFixes({ revisions: revisions as any, today });
    expect(fixes.some((fix) => fix.id === 21)).toBe(false);
    expect(fixes.map((fix) => fix.id)).toEqual([22]);
    expect(fixes[0].to).toBe("2026-11-23");
  });

  it("nunca move uma revisão para antes de hoje", () => {
    const today = "2026-11-21";
    const revisions = [
      rev({
        id: 30,
        topicId: 4,
        completed: true,
        scheduledDate: "2026-11-21",
        completedAt: "2026-11-21T08:00:00-03:00",
      }),
      rev({ id: 31, topicId: 4, scheduledDate: "2026-11-21" }),
      rev({ id: 32, topicId: 4, scheduledDate: "2026-11-22" }),
    ];
    const fixes = planSpacingFixes({
      revisions: revisions as any,
      today,
      minGapDays: 3,
    });
    expect(fixes.length).toBeGreaterThan(0);
    for (const fix of fixes) {
      expect(fix.to >= today).toBe(true);
    }
  });

  it("é idempotente: rodar duas vezes seguidas não move de novo", () => {
    const today = "2026-11-21";
    const revisions = [
      rev({
        id: 40,
        topicId: 9,
        completed: true,
        scheduledDate: "2026-11-19",
        completedAt: "2026-11-19T19:00:00-03:00",
      }),
      rev({ id: 41, topicId: 9, scheduledDate: "2026-11-20" }),
      rev({ id: 42, topicId: 9, scheduledDate: "2026-11-21" }),
      rev({ id: 43, topicId: 9, scheduledDate: "2026-11-22" }),
    ];
    const first = planSpacingFixes({ revisions: revisions as any, today });
    expect(first.length).toBeGreaterThan(0);
    const patched = revisions.map((revision) => {
      const fix = first.find((item) => item.id === revision.id);
      return fix ? { ...revision, scheduledDate: fix.to } : revision;
    });
    const second = planSpacingFixes({ revisions: patched as any, today });
    expect(second).toEqual([]);
  });

  it("duas pendentes do mesmo tópico no mesmo dia: a segunda vai para depois", () => {
    const today = "2026-11-21";
    const revisions = [
      rev({ id: 50, topicId: 12, scheduledDate: "2026-11-26" }),
      rev({ id: 51, topicId: 12, scheduledDate: "2026-11-26" }),
      rev({ id: 52, topicId: 13, scheduledDate: "2026-11-26" }),
    ];
    const fixes = planSpacingFixes({ revisions: revisions as any, today });
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({
      id: 51,
      topicId: 12,
      from: "2026-11-26",
      to: "2026-11-29",
      reason: "same-day-duplicate",
    });
  });

  it("não altera nenhum outro campo da revisão", () => {
    const today = "2026-11-21";
    const original = rev({
      id: 60,
      topicId: 15,
      revisionNumber: 7,
      type: "test",
      createdAt: "2026-05-01T10:00:00.000Z",
    });
    const revisions = [original];
    const fixes = planSpacingFixes({ revisions: revisions as any, today });
    expect(fixes).toEqual([]);
    expect(revisions[0]).toEqual(original);
  });
});
