/** @vitest-environment node */
/**
 * Jornada 7 (v6.9.11): a implacável.
 *
 * - concluir uma revisão coloca as futuras do tópico a ≥3 dias;
 * - domínio só sobe com 3 dias distintos de acerto;
 * - o plano do dia não repete tópico.
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

describe("Jornada 7 — spacing guard, domínio e plano sem repetição", () => {
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

  it("concluir 1 revisão move as futuras do tópico para ≥3 dias", async () => {
    const topicId = 20;
    const before = await ctx.storage.getRevisionsByUser(JOURNEY_USER_ID);
    const pendingFuture = before.filter(
      (revision) =>
        revision.topicId === topicId &&
        !revision.completed &&
        !revision.ignored &&
        revision.scheduledDate >= TODAY,
    );
    expect(pendingFuture.length).toBeGreaterThan(0);

    // Conclui a revisão de hoje do tópico.
    const due = before.find(
      (revision) =>
        revision.topicId === topicId &&
        !revision.completed &&
        revision.scheduledDate <= TODAY,
    );
    expect(due).toBeTruthy();
    await ctx.caller.revision.markCompleted({ id: due!.id, completed: true });

    const result = await ctx.caller.revision.applySpacingGuard({
      today: TODAY,
    });
    expect(result.moved).toBeGreaterThan(0);

    const after = await ctx.storage.getRevisionsByUser(JOURNEY_USER_ID);
    const future = after.filter(
      (revision) =>
        revision.topicId === topicId &&
        !revision.completed &&
        !revision.ignored &&
        revision.scheduledDate >= TODAY,
    );
    const target = addLocalDays(TODAY, 3);
    const moved = future.filter((revision) => revision.scheduledDate >= target);
    expect(moved.length).toBeGreaterThan(0);
    for (const revision of future) {
      expect(revision.scheduledDate >= TODAY).toBe(true);
    }

    // Idempotente no segundo passe.
    const again = await ctx.caller.revision.applySpacingGuard({ today: TODAY });
    expect(again.moved).toBe(0);
  });

  it("domínio sobe a cada recuperação espaçada; selo exige questão nova", async () => {
    const topicId = 20;
    const topic = ctx.meta.topics.find((item) => item.id === topicId)!;
    const answer = async (dayIso: string, correct = true) => {
      const [year, month, day] = dayIso.split("-").map(Number);
      vi.setSystemTime(new Date(year, month - 1, day, 10, 0, 0));
      await ctx.caller.study.recordAttempt({
        topicId,
        disciplineId: topic.disciplineId,
        answered: true,
        correct,
        confidence: "acho",
        questionId: `j7-${dayIso}`,
      });
      const settings = await ctx.storage.getUserSettings(JOURNEY_USER_ID);
      return (settings as any)?.topicMastery?.[String(topicId)]?.level ?? 0;
    };

    // Três acertos no mesmo dia = 1 recuperação.
    expect(await answer(TODAY)).toBe(1);
    expect(await answer(TODAY)).toBe(1);
    expect(await answer(TODAY)).toBe(1);

    // Dias distintos com gap ≥3 sobem o nível (2 recuperações já valem).
    expect(await answer(addLocalDays(TODAY, 3))).toBe(2);
    // Terceira recuperação com questão nova: transferência confirmada -> consolidado.
    expect(await answer(addLocalDays(TODAY, 7))).toBe(4);
    // Um erro não zera.
    expect(await answer(addLocalDays(TODAY, 10), false)).toBe(4);
  });

  it("plano do dia não repete tópico", async () => {
    const overview = await ctx.caller.study.overview({ minutes: 720 });
    const ids = overview.plan.blocks
      .map((block: any) => block.topicId)
      .filter((id: number | null) => id !== null);
    expect(new Set(ids).size).toBe(ids.length);
    expect(overview.plan.blocks.length).toBeGreaterThan(0);
  });
});
