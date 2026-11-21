/** @vitest-environment node */
/**
 * Jornada 5 (v6.9.8, item 2.3): desfazer a conclusão devolve o estado exato.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../../server/routers";
import { bootstrapJourney, JOURNEY_USER_ID, type JourneyMeta } from "./setup";

const TODAY = "2026-11-21";

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

function simplifyRevisions(revisions: any[]) {
  return revisions
    .map((item) => ({
      id: item.id,
      topicId: item.topicId,
      scheduledDate: item.scheduledDate,
      completed: item.completed,
      completedAt: item.completedAt,
      ignored: item.ignored,
    }))
    .sort((a, b) => a.id - b.id);
}

function simplifyBlocks(blocks: any[]) {
  return blocks.map((block) => ({
    id: block.id,
    kind: block.kind,
    topicId: block.topicId,
    revisionId: block.revisionId ?? null,
    score: block.score,
    minutes: block.minutes,
  }));
}

describe("Jornada 5 — desfazer devolve o estado exato", () => {
  let ctx: Ctx;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 21, 9, 0, 0));
    ctx = await makeContext();
  });

  afterEach(() => {
    ctx.cleanup();
    vi.useRealTimers();
  });

  it("concluir e desfazer volta fila, plano e dashboard ao ponto de partida", async () => {
    const revisionsBefore = simplifyRevisions(await ctx.caller.revision.list());
    const statsBefore = await ctx.caller.dashboard.getStats();
    const planBefore = (await ctx.caller.study.overview({ minutes: 240 })).plan;

    const target = revisionsBefore.find(
      (item) =>
        !item.completed && item.scheduledDate <= TODAY && item.topicId === 1,
    );
    expect(target).toBeTruthy();

    await ctx.caller.revision.markCompleted({
      id: target!.id,
      completed: true,
    });
    const changed = await ctx.caller.revision.list();
    expect(changed.find((item) => item.id === target!.id)?.completed).toBe(
      true,
    );

    await ctx.caller.revision.markCompleted({
      id: target!.id,
      completed: false,
    });

    expect(simplifyRevisions(await ctx.caller.revision.list())).toEqual(
      revisionsBefore,
    );
    const statsAfter = await ctx.caller.dashboard.getStats();
    expect(statsAfter.pendingRevisions).toBe(statsBefore.pendingRevisions);
    expect(statsAfter.completedRevisions).toBe(statsBefore.completedRevisions);

    const planAfter = (await ctx.caller.study.overview({ minutes: 240 })).plan;
    expect(simplifyBlocks(planAfter.blocks)).toEqual(
      simplifyBlocks(planBefore.blocks),
    );
    expect(planAfter.overdueRevisions).toBe(planBefore.overdueRevisions);
  });
});
