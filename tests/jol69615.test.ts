/** @vitest-environment node */
/**
 * A — Julgamento atrasado (JOL) e calibração em três números (v6.9.15).
 *
 * Evidência: o julgamento ATRASADO (depois de resolver, sem o material à vista)
 * é bem mais preciso que a previsão antes do bloco (g = 0,93). O app já tinha o
 * `forecast`; aqui entra o `jol` — e o card passa a mostrar previsto antes,
 * estimado depois e real, com o erro em p.p. de cada um.
 *
 * Regra que o teste protege: o JOL é julgamento, não nota. Registrar a
 * estimativa não pode mexer na acurácia nem nas tentativas do bloco.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  brierScoreByKind,
  summarizeThreeWayCalibration,
} from "../shared/prediction";
import * as storage from "../server/jsonStorage";
import { appRouter } from "../server/routers";

const STAMP = "2026-11-27T12:00:00.000Z";

function seedDatabase(dir: string) {
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
        name: "Direito Administrativo",
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
        name: "Anulação e revogação",
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
}

describe("A — JOL atrasado: três números lado a lado", () => {
  it("previsto antes, estimado depois e real, cada um com erro em p.p.", () => {
    const three = summarizeThreeWayCalibration([
      { kind: "forecast", predictedPct: 80, actualPct: 55 },
      { kind: "forecast", predictedPct: 70, actualPct: 55 },
      // Registro antigo (6.9.11) não tem kind: continua sendo previsão antes.
      { predictedPct: 90, actualPct: 55 },
      { kind: "jol", predictedPct: 60, actualPct: 55 },
    ]);

    expect(three.forecast.sample).toBe(3);
    expect(three.forecast.predictedAvg).toBe(80);
    expect(three.forecast.errorPoints).toBe(-25);
    expect(three.jol.sample).toBe(1);
    expect(three.jol.predictedAvg).toBe(60);
    expect(three.jol.errorPoints).toBe(-5);
    expect(three.actual.sample).toBe(4);
    expect(three.actual.avg).toBe(55);
    // O "depois" errou 20 p.p. menos que o "antes".
    expect(three.improved).toBe(true);
    expect(three.note).toMatch(/depois|atrasad/i);
  });

  it("Brier é calculado por tipo; amostra vazia não inventa número", () => {
    const brier = brierScoreByKind([
      { kind: "forecast", predictedPct: 80, actualPct: 100 },
      { kind: "jol", predictedPct: 60, actualPct: 100 },
    ]);
    expect(brier.forecast).toBeCloseTo(0.04, 5);
    expect(brier.jol).toBeCloseTo(0.16, 5);
    expect(brierScoreByKind([])).toEqual({ forecast: null, jol: null });

    const empty = summarizeThreeWayCalibration([]);
    expect(empty.forecast.available).toBe(false);
    expect(empty.jol.available).toBe(false);
    expect(empty.actual.sample).toBe(0);
    expect(empty.actual.avg).toBeNull();
    expect(empty.improved).toBeNull();
  });
});

describe("A — JOL gravado não altera a nota do bloco", () => {
  let dir: string;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    storage.closeDatabase();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "soe-jol-"));
    storage.setDataDir(dir);
    storage.resetCache();
    seedDatabase(dir);
    caller = appRouter.createCaller({
      user: { id: 1 },
      req: {},
      res: {},
    } as never);
  });

  afterEach(() => {
    storage.closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("grava kind=jol com o resultado real e mantém acurácia e tentativas intactas", async () => {
    for (const correct of [true, true, false, false]) {
      await caller.study.recordAttempt({
        topicId: 10,
        disciplineId: 1,
        answered: true,
        correct,
        confidence: "certeza",
        source: "manual",
      });
    }

    const before = await caller.study.calibration();
    const attemptsBefore = (await storage.getAllQuestionAttempts(1)).length;
    expect(before.threeWay.jol.sample).toBe(0);
    expect(before.threeWay.actual.avg).toBeNull();

    await caller.study.savePrediction({
      kind: "jol",
      predictedPct: 70,
      actualPct: 100,
      questions: 4,
      topicId: 10,
      disciplineId: 1,
      source: "question-session-jol",
    });

    const settings = await storage.getUserSettings(1);
    const stored = (settings?.accuracyPredictions || [])[0] as any;
    expect(stored?.kind).toBe("jol");
    expect(stored?.predictedPct).toBe(70);

    const after = await caller.study.calibration();
    // Julgar não é responder: nada de tentativa fantasma nem acurácia mexida.
    expect((await storage.getAllQuestionAttempts(1)).length).toBe(
      attemptsBefore,
    );
    expect(after.overallAccuracy).toBe(before.overallAccuracy);
    expect(after.answered).toBe(before.answered);

    // O JOL entra como julgamento (com o real já conhecido).
    expect(after.threeWay.jol.sample).toBe(1);
    expect(after.threeWay.jol.predictedAvg).toBe(70);
    expect(after.threeWay.actual.avg).toBe(100);
    expect(after.threeWay.forecast.sample).toBe(0);
  });

  it("uma previsão antes do bloco continua sendo forecast quando kind é omitido", async () => {
    await caller.study.savePrediction({
      predictedPct: 80,
      questions: 5,
      topicId: 10,
      source: "question-session",
    });
    const settings = await storage.getUserSettings(1);
    const stored = (settings?.accuracyPredictions || [])[0] as any;
    expect(stored?.kind).toBeUndefined();
    const calibration = await caller.study.calibration();
    expect(calibration.threeWay.forecast.sample).toBe(0);
    // Sem resultado ainda não há perna para comparar.
    expect(calibration.threeWay.jol.sample).toBe(0);
  });
});
