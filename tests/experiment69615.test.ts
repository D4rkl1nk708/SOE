/** @vitest-environment node */
/**
 * B — A/B interno (v6.9.15).
 *
 * Não existe estudo de gabarito em bloco × imediato em concurso público
 * brasileiro. Então o app mede a própria política: variante determinística por
 * aluno, registro por tentativa, e um relatório que se recusa a opinar com
 * amostra pequena.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  EXPERIMENT_KEY,
  EXPERIMENT_MIN_SAMPLE,
  assignVariant,
  summarizeExperiment,
} from "../shared/experiment";

const STAMP = "2026-11-27T12:00:00.000Z";

function record(
  variant: "A" | "B",
  correct: boolean,
  at: string,
  extra: Record<string, unknown> = {},
) {
  return {
    key: EXPERIMENT_KEY,
    variant,
    override: false,
    correct,
    at,
    ...extra,
  };
}

describe("B — assignVariant", () => {
  it("é determinístico: mesma pessoa + mesmo experimento = mesma variante", () => {
    const first = assignVariant("aluno-1", EXPERIMENT_KEY);
    expect(["A", "B"]).toContain(first);
    for (let i = 0; i < 10; i += 1) {
      expect(assignVariant("aluno-1", EXPERIMENT_KEY)).toBe(first);
    }
    expect(assignVariant(1, EXPERIMENT_KEY)).toBe(
      assignVariant("1", EXPERIMENT_KEY),
    );
  });

  it("divide os alunos sem perder ninguém para um lado", () => {
    const counts = { A: 0, B: 0 };
    for (let id = 1; id <= 400; id += 1) {
      counts[assignVariant(`user-${id}`, EXPERIMENT_KEY)] += 1;
    }
    expect(counts.A + counts.B).toBe(400);
    expect(counts.A).toBeGreaterThan(100);
    expect(counts.B).toBeGreaterThan(100);
  });
});

describe("B — summarizeExperiment", () => {
  it("conta n, acerto e retenção por variante", () => {
    const records: any[] = [];
    // Bloco inicial em 01/11: 25 na A, 25 na B.
    for (let i = 0; i < 25; i += 1) {
      records.push(
        record("A", i < 20, "2026-11-01T10:00:00.000Z", {
          questionId: `a${i}`,
        }),
      );
      records.push(
        record("B", i < 15, "2026-11-01T11:00:00.000Z", {
          questionId: `b${i}`,
        }),
      );
    }
    // Retenção: questão nova 8 dias depois, sem o bloco à vista.
    for (let i = 0; i < 6; i += 1) {
      records.push(
        record("A", i < 4, "2026-11-09T10:00:00.000Z", {
          questionId: `a-new${i}`,
          fresh: true,
        }),
      );
      records.push(
        record("B", i < 2, "2026-11-09T11:00:00.000Z", {
          questionId: `b-new${i}`,
          fresh: true,
        }),
      );
    }

    const summary = summarizeExperiment(records);
    const a = summary.variants.find((item) => item.variant === "A")!;
    const b = summary.variants.find((item) => item.variant === "B")!;

    expect(summary.insufficient).toBe(false);
    expect(a.n).toBe(31);
    expect(b.n).toBe(31);
    expect(a.accuracy).toBe(77); // 24/31
    expect(b.accuracy).toBe(55); // 17/31
    expect(a.retentionN).toBe(6);
    expect(a.retentionAccuracy).toBe(67); // 4/6
    expect(b.retentionN).toBe(6);
    expect(b.retentionAccuracy).toBe(33); // 2/6
  });

  it("respeita o mínimo: com menos de 20 em uma das duas, não opina", () => {
    const records: any[] = [];
    for (let i = 0; i < 10; i += 1) {
      records.push(record("A", true, "2026-11-01T10:00:00.000Z"));
    }
    for (let i = 0; i < 12; i += 1) {
      records.push(record("B", false, "2026-11-01T10:00:00.000Z"));
    }

    const summary = summarizeExperiment(records);
    expect(EXPERIMENT_MIN_SAMPLE).toBe(20);
    expect(summary.insufficient).toBe(true);
    expect(summary.message).toContain(
      `amostra insuficiente (n=${summary.minN})`,
    );
    expect(summary.minN).toBe(10);
  });

  it("a troca da política é registrada como override", () => {
    const records: any[] = [];
    for (let i = 0; i < 22; i += 1) {
      records.push(
        record("A", true, "2026-11-01T10:00:00.000Z", { override: i < 4 }),
      );
    }
    const summary = summarizeExperiment(records);
    const a = summary.variants.find((item) => item.variant === "A")!;
    expect(a.overrides).toBe(4);
    expect(a.overrideRate).toBe(18); // 4/22
  });

  it("lista vazia não vira relatório falso", () => {
    const summary = summarizeExperiment([]);
    expect(summary.insufficient).toBe(true);
    expect(summary.variants).toHaveLength(2);
    expect(summary.variants.every((item) => item.n === 0)).toBe(true);
    expect(summary.message).toMatch(/amostra insuficiente/i);
  });
});

describe("B — registro por tentativa e relatório (servidor e offline)", () => {
  let dir: string;

  beforeEach(async () => {
    vi.resetModules();
    const storage = await import("../server/jsonStorage");
    storage.closeDatabase();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "soe-exp-"));
    storage.setDataDir(dir);
    storage.resetCache();
    storage.writeDatabase({
      users: [
        {
          id: 1,
          openId: "aluno",
          name: "Aluno",
          email: null,
          loginMethod: "local",
          role: "admin",
          settings: {
            theme: "light",
            studyStreak: { current: 0, best: 0, lastStudyDate: null },
          },
          createdAt: STAMP,
          updatedAt: STAMP,
          lastSignedIn: STAMP,
        },
      ],
      disciplines: [
        {
          id: 1,
          userId: 1,
          name: "Direito Constitucional",
          color: "#000",
          weight: 3,
          order: 1,
          studyTimeSeconds: 0,
          createdAt: STAMP,
          updatedAt: STAMP,
        },
      ],
      topics: [
        {
          id: 10,
          userId: 1,
          disciplineId: 1,
          name: "Controle de constitucionalidade",
          order: 1,
          studyDate: "2026-11-01",
          notes: null,
          studyTimeSeconds: 0,
          createdAt: STAMP,
          updatedAt: STAMP,
        },
      ],
      revisions: [],
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
        topics: 1,
        revisions: 0,
        mockExams: 0,
        notes: 0,
        flashcards: 0,
        questionErrors: 0,
        essays: 0,
        tecSnapshots: 0,
        questionAttempts: 0,
      },
    } as any);
  });

  afterEach(async () => {
    const storage = await import("../server/jsonStorage");
    storage.closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("study.experimentReport agrega as tentativas marcadas", async () => {
    const storage = await import("../server/jsonStorage");
    const { appRouter } = await import("../server/routers");
    const caller = appRouter.createCaller({
      user: { id: 1 },
      req: {},
      res: {},
    } as never);

    // 3 tentativas bastam para provar persistência + agregação; a conta com
    // amostra grande é coberta pelo teste puro de summarizeExperiment.
    for (let i = 0; i < 3; i += 1) {
      await caller.study.recordAttempt({
        topicId: 10,
        disciplineId: 1,
        answered: true,
        correct: i < 2,
        confidence: "acho",
        source: "manual",
        experiment: {
          key: EXPERIMENT_KEY,
          variant: "B",
          override: i === 0,
        },
      } as never);
    }

    const stored = await storage.getAllQuestionAttempts(1);
    expect((stored[0] as any).experiment).toEqual({
      key: EXPERIMENT_KEY,
      variant: "B",
      override: true,
    });
    expect((stored[1] as any).experiment.override).toBe(false);

    const report: any = await caller.study.experimentReport();
    expect(report.key).toBe(EXPERIMENT_KEY);
    expect(report.name).toMatch(/bloco/i);
    const b = report.variants.find((item: any) => item.variant === "B");
    expect(b.n).toBe(3);
    expect(b.correct).toBe(2);
    expect(b.accuracy).toBe(67);
    expect(b.overrides).toBe(1);
    // A perna A está vazia: sem comparação possível.
    expect(report.insufficient).toBe(true);
  });

  it("relatório offline entrega a mesma forma", async () => {
    const localDb = await import("../client/src/lib/localDb");
    await localDb.localAuthMe();
    for (let i = 0; i < 6; i += 1) {
      await localDb.localRecordQuestionAttempt({
        topicId: 10,
        disciplineId: 1,
        questionId: `q${i}`,
        answered: true,
        correct: i < 4,
        context: "practice",
        experiment: { key: EXPERIMENT_KEY, variant: "A", override: false },
      });
    }
    const report: any = await localDb.localStudyExperimentReport();
    const a = report.variants.find((item: any) => item.variant === "A");
    expect(a.n).toBe(6);
    expect(a.correct).toBe(4);
    expect(report.insufficient).toBe(true);
    expect(report.message).toMatch(/amostra insuficiente/i);
  });
});
