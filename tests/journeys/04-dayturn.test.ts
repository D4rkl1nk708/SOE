/** @vitest-environment node */
/**
 * Jornada 4 (v6.9.8, item 2.3 + 2.2): virar o dia.
 *
 * O relógio fica em 23:59 local (02:59 UTC do dia seguinte) e depois em 00:01.
 * Se "hoje" for calculado em UTC, às 23:59 o app já acha que é amanhã: revisão
 * de amanhã aparece vencida e a sessão é registrada no dia errado.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../../server/routers";
import { addLocalDays } from "../../shared/localDay";
import { bootstrapJourney, JOURNEY_USER_ID, type JourneyMeta } from "./setup";

const TODAY = "2026-11-21";
const TOMORROW = addLocalDays(TODAY, 1);

type Storage = typeof import("../../server/jsonStorage");
type Caller = ReturnType<typeof appRouter.createCaller>;

interface Ctx {
  meta: JourneyMeta;
  storage: Storage;
  caller: Caller;
  cleanup: () => void;
}

async function makeContext(): Promise<Ctx> {
  const boot = await bootstrapJourney(TODAY);
  const caller = appRouter.createCaller({
    user: { id: JOURNEY_USER_ID },
    req: {},
    res: {},
  } as never);
  return {
    meta: boot.meta,
    storage: boot.storage,
    caller,
    cleanup: boot.cleanup,
  };
}

describe("Jornada 4 — 23:59 → 00:01 no dia local", () => {
  let ctx: Ctx;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    ctx = await makeContext();
  });

  afterEach(() => {
    ctx.cleanup();
    vi.useRealTimers();
  });

  it("revisão de amanhã não conta como vencida às 23:59", async () => {
    vi.setSystemTime(new Date(2026, 10, 21, 23, 59, 30));
    const revisions = await ctx.caller.revision.list();
    const pendingByDay = (day: string) =>
      revisions.filter(
        (item) => !item.completed && !item.ignored && item.scheduledDate < day,
      ).length;

    const stats = await ctx.caller.dashboard.getStats();
    expect(stats.pendingRevisions).toBe(pendingByDay(TODAY));

    const overview = await ctx.caller.study.overview({ minutes: 240 });
    expect(overview.plan.date).toBe(TODAY);
    const tomorrowTopicIds = new Set(
      revisions
        .filter((item) => !item.completed && item.scheduledDate === TOMORROW)
        .map((item) => item.topicId),
    );
    const overdueIds = new Set(
      revisions
        .filter(
          (item) =>
            !item.completed && !item.ignored && item.scheduledDate < TODAY,
        )
        .map((item) => item.topicId),
    );
    // Blocos de revisão só podem ser de tópicos realmente vencidos hoje.
    for (const block of overview.plan.blocks) {
      if (block.kind !== "revisao") continue;
      expect(overdueIds.has(block.topicId as number)).toBe(true);
    }
    expect(tomorrowTopicIds.size).toBeGreaterThan(0);
  });

  it("a sessão encerrada às 23:59 é registrada no dia local", async () => {
    vi.setSystemTime(new Date(2026, 10, 21, 23, 59, 30));
    const startedAt = new Date(2026, 10, 21, 23, 30, 0).toISOString();
    const endedAt = new Date().toISOString();
    await ctx.caller.study.recordSession({
      startedAt,
      endedAt,
      minutes: 25,
      accuracy: 60,
      questions: 5,
      correct: 3,
      topicId: 3,
      topicName: ctx.meta.topics[2].name,
      disciplineId: ctx.meta.topics[2].disciplineId,
    });

    const sessions = await ctx.caller.study.recentSessions({ limit: 1 });
    expect(sessions[0]?.date).toBe(TODAY);
  });

  it("depois da meia-noite o dia muda sem duplicar revisão", async () => {
    vi.setSystemTime(new Date(2026, 10, 21, 23, 59, 30));
    const before = await ctx.caller.revision.list();
    const statsBefore = await ctx.caller.dashboard.getStats();
    const planBefore = await ctx.caller.study.overview({ minutes: 240 });

    vi.setSystemTime(new Date(2026, 10, 22, 0, 1, 0));
    const after = await ctx.caller.revision.list();
    const statsAfter = await ctx.caller.dashboard.getStats();
    const planAfter = await ctx.caller.study.overview({ minutes: 240 });

    expect(planAfter.plan.date).toBe(TOMORROW);
    expect(planBefore.plan.date).toBe(TODAY);
    expect(after).toHaveLength(before.length);
    expect(statsAfter.pendingRevisions).toBe(statsBefore.pendingRevisions + 2);
    // Nenhum tópico aparece duas vezes em blocos de revisão do mesmo dia.
    const revisionTopics = planAfter.plan.blocks
      .filter((block) => block.kind === "revisao")
      .map((block) => block.topicId);
    expect(new Set(revisionTopics).size).toBe(revisionTopics.length);
  });
});
