/** @vitest-environment node */
/**
 * Jornada 3 (v6.9.8, item 2.3): responder N questões em sequência.
 *
 * Contador do TEC, relatório da sessão e performance do tópico têm que falar o
 * mesmo número — e um eco do mesmo clique não pode contar duas vezes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../../server/routers";
import { buildSessionReportFromAttempts } from "../../shared/sessionReport";
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

describe("Jornada 3 — N questões em sequência sem contagem dupla", () => {
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

  it("contador, relatório e performance batem", async () => {
    const topicId = 20;
    const topic = ctx.meta.topics.find((item) => item.id === topicId)!;
    // Sessão limpa: o tópico começa sem performance declarada.
    await ctx.caller.topic.setPerformance({
      topicId,
      correctCount: 0,
      errorCount: 0,
    });
    const statsBefore = await ctx.caller.dashboard.getStats();
    const disciplineBefore = statsBefore.disciplineStats.find(
      (item: any) => item.disciplineId === topic.disciplineId,
    ) as any;
    const resolvedBefore = disciplineBefore.performance?.questionsResolved ?? 0;

    const startedAt = new Date().toISOString();
    const total = 12;
    let correct = 0;
    for (let index = 0; index < total; index += 1) {
      const isCorrect = index % 3 === 0;
      if (isCorrect) correct += 1;
      await ctx.caller.study.recordAttempt({
        topicId,
        disciplineId: topic.disciplineId,
        answered: true,
        correct: isCorrect,
        confidence: "certeza",
        seconds: 45,
        questionId: `q-${index}`,
        source: "manual",
      });
    }
    // Eco do mesmo clique (mesma questão, mesma resposta, segundos depois).
    await ctx.caller.study.recordAttempt({
      topicId,
      disciplineId: topic.disciplineId,
      answered: true,
      correct: true,
      confidence: "certeza",
      seconds: 45,
      questionId: "q-0",
      source: "manual",
    });

    const endedAt = new Date().toISOString();
    await ctx.caller.topic.setPerformance({
      topicId,
      correctCount: correct,
      errorCount: total - correct,
    });

    const attempts = (
      await ctx.storage.getAllQuestionAttempts(JOURNEY_USER_ID)
    ).filter((attempt) => attempt.topicId === topicId);
    expect(attempts).toHaveLength(total);

    const live = await ctx.caller.tec.liveActivity({
      since: startedAt,
      until: endedAt,
    });
    expect(live.count).toBe(total);
    expect(live.correct).toBe(correct);
    expect(live.errors).toBe(total - correct);

    const report = buildSessionReportFromAttempts({
      attempts: attempts as any[],
      startedAt,
      endedAt,
      topics: ctx.meta.topics,
      disciplines: ctx.meta.disciplines,
    });
    expect(report.noData).toBe(false);
    expect(report.questions).toBe(total);
    expect(report.correct).toBe(correct);
    expect(report.errors).toBe(total - correct);

    const stats = await ctx.caller.dashboard.getStats();
    const discipline = stats.disciplineStats.find(
      (item: any) => item.disciplineId === topic.disciplineId,
    ) as any;
    // A disciplina soma os tópicos dela: o delta tem que ser exatamente N.
    expect(discipline.performance.questionsResolved).toBe(
      resolvedBefore + total,
    );
    expect(discipline.performance.correctCount).toBe(
      (disciplineBefore.performance?.correctCount ?? 0) + correct,
    );
    expect(discipline.performance.errorCount).toBe(
      (disciplineBefore.performance?.errorCount ?? 0) + (total - correct),
    );
  });
});
