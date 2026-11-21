/** @vitest-environment node */
/**
 * Jornada 2 (v6.9.8, item 2.3): encerrar sessão concluindo o lote do tópico.
 *
 * `revision.completeTopicBacklog` conclui SÓ as pendentes com
 * `scheduledDate <= hoje local` daquele tópico. Futuras ficam intactas, nada é
 * criado, nada é reagendado e a regra 25/50 continua de fora. Idempotente.
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

describe("Jornada 2 — concluir em lote respeitando o calendário", () => {
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

  it("só mexe nas pendentes até hoje do tópico, sem criar nem apagar", async () => {
    const topicId = 4;
    const before = await ctx.caller.revision.list();
    const ofTopic = before.filter((item) => item.topicId === topicId);
    const duePending = ofTopic.filter(
      (item) => !item.completed && !item.ignored && item.scheduledDate <= TODAY,
    );
    const future = ofTopic.filter((item) => item.scheduledDate > TODAY);
    expect(duePending.length).toBeGreaterThan(30);
    expect(future.length).toBeGreaterThan(0);

    const backlog = await ctx.caller.revision.topicBacklog({ topicId });
    expect(backlog.duePending).toBe(duePending.length);

    const result = await ctx.caller.revision.completeTopicBacklog({ topicId });
    expect(result.completed).toBe(duePending.length);

    const after = await ctx.caller.revision.list();
    expect(after).toHaveLength(before.length);
    expect(new Set(after.map((item) => item.id))).toEqual(
      new Set(before.map((item) => item.id)),
    );

    const afterById = new Map(after.map((item) => [item.id, item]));
    for (const revision of duePending) {
      expect(afterById.get(revision.id)?.completed).toBe(true);
    }
    for (const revision of future) {
      const current = afterById.get(revision.id);
      expect(current?.completed, `futura ${revision.id} foi alterada`).toBe(
        false,
      );
      expect(current?.scheduledDate).toBe(revision.scheduledDate);
    }
    // Nenhum outro tópico foi tocado.
    const otherChanges = after.filter((item) => {
      if (item.topicId === topicId) return false;
      const old = before.find((oldItem) => oldItem.id === item.id);
      return old?.completed !== item.completed;
    });
    expect(otherChanges).toHaveLength(0);

    // Idempotente: rodar de novo não conclui nada.
    const again = await ctx.caller.revision.completeTopicBacklog({ topicId });
    expect(again.completed).toBe(0);
  });

  it("o plano do dia abandona o tópico depois do lote", async () => {
    const first = await ctx.caller.study.overview({ minutes: 240 });
    const topicId = first.plan.blocks[0].topicId as number;

    await ctx.caller.revision.completeTopicBacklog({ topicId });

    const overview = await ctx.caller.study.overview({ minutes: 240 });
    expect(
      overview.plan.blocks.filter((b) => b.topicId === topicId),
    ).toHaveLength(0);
    expect(overview.plan.blocks[0]?.topicId).not.toBe(topicId);
  });
});
