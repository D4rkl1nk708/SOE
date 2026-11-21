/** @vitest-environment node */
/**
 * Item 1.1 (v6.9.8): quando TODAS as revisões vencidas do dia já foram
 * concluídas, o plano avisa ("Revisões do dia em dia") em vez de devolver o
 * mesmo tema — e aponta a próxima ação de conteúdo novo/ponto fraco.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { appRouter } from "../../server/routers";
import { addLocalDays } from "../../shared/localDay";

const TODAY = "2026-11-21";

type Storage = typeof import("../../server/jsonStorage");

function stamp(day: string): string {
  return new Date(`${day}T12:00:00`).toISOString();
}

describe("Jornada 6 — dia de revisão em dia", () => {
  let storage: Storage;
  let dir = "";

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 21, 9, 0, 0));
    storage = await import("../../server/jsonStorage");
    storage.closeDatabase();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "soe-journey-done-"));
    storage.setDataDir(dir);
    storage.resetCache();

    const iso = stamp(TODAY);
    storage.writeDatabase({
      users: [
        {
          id: 1,
          openId: "aluno-fixture",
          name: "Aluno Fixture",
          email: null,
          loginMethod: "local",
          role: "admin",
          settings: {
            theme: "light",
            studyStreak: { current: 0, best: 0, lastStudyDate: null },
            dailyGoalMinutes: 240,
            exams: [],
            editalRows: [],
          },
          createdAt: iso,
          updatedAt: iso,
          lastSignedIn: iso,
        },
      ],
      disciplines: [
        {
          id: 1,
          userId: 1,
          name: "Português",
          color: "#0ea5e9",
          weight: 3,
          order: 1,
          studyTimeSeconds: 0,
          createdAt: iso,
          updatedAt: iso,
        },
      ],
      topics: [
        {
          id: 1,
          userId: 1,
          disciplineId: 1,
          name: "Concordância verbal",
          order: 1,
          studyDate: addLocalDays(TODAY, -20),
          notes: null,
          performance: {
            questionsResolved: 40,
            correctCount: 12,
            errorCount: 28,
            accuracy: 30,
          },
          studyTimeSeconds: 0,
          createdAt: iso,
          updatedAt: iso,
        },
        {
          id: 2,
          userId: 1,
          disciplineId: 1,
          name: "Crase",
          order: 2,
          studyDate: addLocalDays(TODAY, -30),
          notes: null,
          performance: {
            questionsResolved: 40,
            correctCount: 20,
            errorCount: 20,
            accuracy: 50,
          },
          studyTimeSeconds: 0,
          createdAt: iso,
          updatedAt: iso,
        },
      ],
      revisions: [
        {
          id: 1,
          userId: 1,
          topicId: 1,
          scheduledDate: addLocalDays(TODAY, -60),
          type: "revision",
          revisionNumber: 1,
          completed: false,
          ignored: false,
          completedAt: null,
          createdAt: iso,
          updatedAt: iso,
        },
        {
          id: 2,
          userId: 1,
          topicId: 1,
          scheduledDate: addLocalDays(TODAY, -20),
          type: "revision",
          revisionNumber: 2,
          completed: false,
          ignored: false,
          completedAt: null,
          createdAt: iso,
          updatedAt: iso,
        },
        {
          id: 3,
          userId: 1,
          topicId: 2,
          scheduledDate: addLocalDays(TODAY, -5),
          type: "revision",
          revisionNumber: 1,
          completed: false,
          ignored: false,
          completedAt: null,
          createdAt: iso,
          updatedAt: iso,
        },
      ],
      mockExams: [],
      notes: [],
      flashcards: [],
      questionErrors: [],
      essays: [],
      tecSnapshots: [],
      cadernosTec: {},
      questionAttempts: [],
      counters: {
        users: 1,
        disciplines: 1,
        topics: 2,
        revisions: 3,
        mockExams: 0,
        notes: 0,
        flashcards: 0,
        questionErrors: 0,
        essays: 0,
        tecSnapshots: 0,
        questionAttempts: 0,
      },
    } as never);
  });

  afterEach(() => {
    storage.closeDatabase();
    vi.useRealTimers();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows pode manter o handle */
    }
  });

  it("avisa que as revisões estão em dia e aponta conteúdo novo", async () => {
    const caller = appRouter.createCaller({
      user: { id: 1 },
      req: {},
      res: {},
    } as never);

    const before = await caller.study.overview({ minutes: 240 });
    expect(before.plan.blocks[0]?.topicId).toBe(1);
    expect(before.plan.notice ?? null).toBeNull();
    expect(before.plan.dueDoneToday).toBe(false);

    await caller.revision.completeTopicBacklog({ topicId: 1 });
    await caller.revision.completeTopicBacklog({ topicId: 2 });

    const after = await caller.study.overview({ minutes: 240 });
    expect(after.plan.dueDoneToday).toBe(true);
    expect(after.plan.notice).toContain("Revisões do dia em dia");
    // Nada de revisão no plano: o dia já está cumprido.
    expect(after.plan.blocks.some((block) => block.kind === "revisao")).toBe(
      false,
    );
    // Mas continua havendo próximo passo: o bloco "em dia" + conteúdo novo.
    expect(after.plan.blocks.length).toBeGreaterThan(0);
    expect(
      after.plan.blocks.some((block) => block.id === "plan-due-done"),
    ).toBe(true);
    expect(
      after.plan.blocks.find((block) => block.id === "plan-due-done")?.title,
    ).toBe("Revisões do dia em dia");
  });

  it("o rótulo de atraso longo não assusta", async () => {
    const caller = appRouter.createCaller({
      user: { id: 1 },
      req: {},
      res: {},
    } as never);
    const overview = await caller.study.overview({ minutes: 240 });
    const revision = overview.plan.blocks.find(
      (block) => block.kind === "revisao",
    );
    expect(revision?.reason).toContain("backlog");
    expect(revision?.reason).not.toMatch(/\d{3} dias/);
    // Pontuação com teto: 60 dias não vale mais que 30.
    expect(revision?.score).toBeLessThanOrEqual(1030);
  });
});
