/** @vitest-environment node */
/**
 * Jornada 1 (v6.9.8, item 2.3): concluir revisão pelos caminhos da UI.
 *
 * No cliente existem seis telas que concluem revisão:
 *   Revisions, History, QuestionSession, GuidedSession, TecSessionLivePanel e
 *   Calendar. Cinco falam com `revision.markCompleted`; Calendar fala com
 *   `calendar.markCompleted`. Aqui cada caminho é exercitado pelo router real
 *   contra SQLite temporário e, depois de concluir, plano, fila, calendário e
 *   dashboard têm que concordar — e o próximo bloco tem que ser OUTRO tópico.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../../server/routers";
import { addLocalDays } from "../../shared/localDay";
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

/** Os seis caminhos da UI, com o endpoint que cada um usa. */
const PATHS: Array<{
  screen: string;
  call: (caller: Caller, revisionId: number) => Promise<unknown>;
}> = [
  {
    screen: "Revisions",
    call: (caller, revisionId) =>
      caller.revision.markCompleted({ id: revisionId, completed: true }),
  },
  {
    screen: "History",
    call: (caller, revisionId) =>
      caller.revision.markCompleted({ id: revisionId, completed: true }),
  },
  {
    screen: "QuestionSession",
    call: (caller, revisionId) =>
      caller.revision.markCompleted({ id: revisionId, completed: true }),
  },
  {
    screen: "GuidedSession",
    call: (caller, revisionId) =>
      caller.revision.markCompleted({ id: revisionId, completed: true }),
  },
  {
    screen: "TecSessionLivePanel",
    call: (caller, revisionId) =>
      caller.revision.markCompleted({ id: revisionId, completed: true }),
  },
  {
    screen: "Calendar",
    call: (caller, revisionId) =>
      caller.calendar.markCompleted({ revisionId, completed: true }),
  },
];

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

/** Primeira revisão pendente do tópico que abre o plano. */
async function topRevision(ctx: Ctx) {
  const overview = await ctx.caller.study.overview({ minutes: 240 });
  const top = overview.plan.blocks[0];
  expect(top).toBeTruthy();
  const pending = await ctx.caller.revision.list({
    completed: false,
    ignored: false,
  });
  const revision = pending
    .filter(
      (item) =>
        item.topicId === top.topicId && item.scheduledDate <= ctx.meta.today,
    )
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0];
  expect(revision).toBeTruthy();
  return { top, revision: revision! };
}

describe("Jornada 1 — concluir revisão pelos 6 caminhos", () => {
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

  for (const path of PATHS) {
    it(`${path.screen}: plano, fila, calendário e dashboard concordam`, async () => {
      const statsBefore = await ctx.caller.dashboard.getStats();
      const { top, revision } = await topRevision(ctx);
      const topicId = top.topicId as number;

      await path.call(ctx.caller, revision.id);

      const list = await ctx.caller.revision.list();
      const completed = list.find((item) => item.id === revision.id);
      expect(completed?.completed).toBe(true);

      const calendar = await ctx.caller.calendar.getActivities({
        startDate: addLocalDays(ctx.meta.today, -400),
        endDate: addLocalDays(ctx.meta.today, 60),
        limit: 5000,
      });
      const activity = ((calendar as any).activities as any[]).find(
        (item) => item.id === revision.id,
      );
      expect(activity?.completed).toBe(true);

      const statsAfter = await ctx.caller.dashboard.getStats();
      expect(statsAfter.completedRevisions).toBe(
        statsBefore.completedRevisions + 1,
      );
      expect(statsAfter.pendingRevisions).toBe(
        statsBefore.pendingRevisions - 1,
      );

      // O ponto central do bug: o plano não pode repetir o tópico do dia.
      const overview = await ctx.caller.study.overview({ minutes: 240 });
      const sameTopic = overview.plan.blocks.filter(
        (block) => block.topicId === topicId,
      );
      expect(
        sameTopic,
        `o plano voltou para o tópico ${topicId} (${top.topicName}) depois de concluir a revisão`,
      ).toHaveLength(0);
      expect(overview.plan.blocks[0]?.topicId).not.toBe(topicId);
    });
  }

  it("roteiro do dono: 5 conclusões do mesmo tópico, plano muda de tópico", async () => {
    const first = await ctx.caller.study.overview({ minutes: 240 });
    const topicId = first.plan.blocks[0].topicId as number;
    const pending = (
      await ctx.caller.revision.list({ completed: false, ignored: false })
    )
      .filter(
        (item) =>
          item.topicId === topicId && item.scheduledDate <= ctx.meta.today,
      )
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    expect(pending.length).toBeGreaterThanOrEqual(5);

    console.log(
      `antes      → ${first.plan.blocks[0].topicName} (tópico ${topicId})`,
    );
    for (let round = 1; round <= 5; round += 1) {
      await ctx.caller.revision.markCompleted({
        id: pending[round - 1].id,
        completed: true,
      });
      const overview = await ctx.caller.study.overview({ minutes: 240 });
      const top = overview.plan.blocks[0];
      console.log(
        `conclusão ${round} → ${top?.topicName} (tópico ${top?.topicId})`,
      );
      expect(
        top?.topicId,
        `o plano repetiu o tópico ${topicId} na conclusão ${round}`,
      ).not.toBe(topicId);
    }
  });
});
