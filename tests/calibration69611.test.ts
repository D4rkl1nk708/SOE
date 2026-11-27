import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  brierScore,
  summarizePredictions,
  shouldHypercorrect,
  predictionErrorPoints,
} from "../shared/prediction";

describe("calibração: previsão × obtido, Brier e hipercorreção (4.7)", () => {
  it("erro em pontos percentuais é obtido - previsto", () => {
    expect(predictionErrorPoints(70, 55)).toBe(-15);
    expect(predictionErrorPoints(50, 80)).toBe(30);
  });

  it("Brier médio de previsões por bloco", () => {
    const score = brierScore([
      { predicted: 0.7, observed: 1 },
      { predicted: 0.7, observed: 0 },
    ]);
    expect(score).toBeCloseTo(0.29, 10);
    expect(brierScore([])).toBeNull();
  });

  it("resumo compara previsto × obtido e conta a amostra", () => {
    const summary = summarizePredictions([
      { predictedPct: 70, actualPct: 60 },
      { predictedPct: 50, actualPct: 60 },
      { predictedPct: 80, actualPct: 40 },
    ]);
    expect(summary.sample).toBe(3);
    expect(summary.predictedAvg).toBeCloseTo(66.67, 1);
    expect(summary.actualAvg).toBeCloseTo(53.33, 1);
    expect(summary.gapPoints).toBeLessThan(0);
    expect(summary.available).toBe(true);
  });

  it("hipercorreção só com certeza + erro", () => {
    expect(shouldHypercorrect({ confidence: "certeza", correct: false })).toBe(
      true,
    );
    expect(shouldHypercorrect({ confidence: "certeza", correct: true })).toBe(
      false,
    );
    expect(shouldHypercorrect({ confidence: "acho", correct: false })).toBe(
      false,
    );
    expect(shouldHypercorrect({ confidence: null, correct: false })).toBe(
      false,
    );
  });
});

describe("hipercorreção cria cartão corretivo e agenda recall", () => {
  let dir: string;
  let storage: typeof import("../server/jsonStorage");

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 21, 10, 0, 0));
    storage = await import("../server/jsonStorage");
    storage.closeDatabase();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "soe-hyper-"));
    storage.setDataDir(dir);
    storage.resetCache();
    const stamp = new Date().toISOString();
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
          createdAt: stamp,
          updatedAt: stamp,
          lastSignedIn: stamp,
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
          createdAt: stamp,
          updatedAt: stamp,
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
          createdAt: stamp,
          updatedAt: stamp,
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

  afterEach(() => {
    storage.closeDatabase();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* handle aberto no Windows */
    }
    vi.useRealTimers();
  });

  it("certeza + erro cria flashcard com origem e recall amanhã", async () => {
    await storage.recordQuestionAttempt(1, {
      topicId: 10,
      disciplineId: 1,
      answered: true,
      correct: false,
      confidence: "certeza",
      confidencePhase: "before_result",
      questionId: "q-1",
      statementSnippet: "A anulação tem efeito retroativo.",
      correctAnswerLetter: "C",
    } as any);

    const cards = await storage.getFlashcardsByUser(1);
    const card = cards.find((item: any) => item.hypercorrection);
    expect(card).toBeTruthy();
    expect(card?.front).toContain("anulação");
    expect(card?.nextReviewDate).toBe("2026-11-22");
    expect((card as any)?.hypercorrection).toBe(true);
    expect((card as any)?.sourceTopicId).toBe(10);
  });

  it("não duplica cartão para a mesma tentativa", async () => {
    const attempt = await storage.recordQuestionAttempt(1, {
      topicId: 10,
      disciplineId: 1,
      answered: true,
      correct: false,
      confidence: "certeza",
      questionId: "q-2",
    } as any);
    await storage.ensureHypercorrectionCard(1, attempt as any);
    await storage.ensureHypercorrectionCard(1, attempt as any);
    const cards = await storage.getFlashcardsByUser(1);
    expect(
      cards.filter(
        (item: any) => item.hypercorrectionFromAttemptId === attempt.id,
      ),
    ).toHaveLength(1);
  });
});
