import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

type Storage = typeof import("../server/jsonStorage");

function seed(storage: Storage) {
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
        weight: 4,
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
        name: "Atos administrativos",
        order: 1,
        studyDate: "2026-11-01",
        notes: null,
        studyTimeSeconds: 0,
        performance: {
          questionsResolved: 40,
          correctCount: 24,
          errorCount: 16,
          accuracy: 60,
        },
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: 11,
        userId: 1,
        disciplineId: 1,
        name: "Licitações",
        order: 2,
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
    questionErrors: [
      ...Array.from({ length: 5 }, (_, index) => ({
        id: index + 1,
        userId: 1,
        topicId: 10,
        disciplineId: 1,
        questionId: `e-${index + 1}`,
        statement: `Questão ${index + 1} sobre atos administrativos`,
        alternatives: [
          { letter: "A", text: "Alternativa A" },
          { letter: "B", text: "Alternativa B" },
          { letter: "C", text: "Alternativa C" },
        ],
        correctAnswer: "B",
        createdAt: stamp,
      })),
    ],
    essays: [],
    tecSnapshots: [],
    cadernosTec: {},
    questionAttempts: [],
    counters: {
      users: 1,
      disciplines: 1,
      topics: 2,
      revisions: 0,
      mockExams: 0,
      notes: 0,
      flashcards: 0,
      questionErrors: 5,
      essays: 0,
      tecSnapshots: 0,
      questionAttempts: 0,
    },
  } as any);
}

describe("pré-teste obrigatório (4.4)", () => {
  let dir: string;
  let storage: Storage;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 21, 9, 0, 0));
    storage = await import("../server/jsonStorage");
    storage.closeDatabase();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "soe-pretest-"));
    storage.setDataDir(dir);
    storage.resetCache();
    seed(storage);
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

  it("monta 5 questões do banco de erros do tópico", async () => {
    const pretest = await storage.startPretest(1, 10);
    expect(pretest.available).toBe(5);
    expect(pretest.questions).toHaveLength(5);
    expect(pretest.source).toBe("bank");
    expect(pretest.questions[0].statement).toContain("atos administrativos");
  });

  it("tópico sem banco e sem chave de IA devolve available 0 sem erro", async () => {
    const pretest = await storage.startPretest(1, 11);
    expect(pretest.available).toBe(0);
    expect(pretest.questions).toEqual([]);
  });

  it("tentativa de pré-teste vira baseline e não mexe em acurácia nem domínio", async () => {
    const before = await storage.getTopicById(10, 1);
    expect(before?.performance?.questionsResolved).toBe(40);

    for (let index = 0; index < 5; index += 1) {
      await storage.recordQuestionAttempt(1, {
        topicId: 10,
        disciplineId: 1,
        answered: true,
        correct: index < 3,
        confidence: null,
        confidencePhase: null,
        source: "manual",
        context: "pretest",
        questionId: `e-${index + 1}`,
      } as any);
    }

    const after = await storage.getTopicById(10, 1);
    expect(after?.performance?.questionsResolved).toBe(40);
    expect(after?.performance?.correctCount).toBe(24);

    const settings = await storage.getUserSettings(1);
    const baseline = (settings as any)?.pretestBaseline?.["10"];
    expect(baseline).toBeTruthy();
    expect(baseline.sample).toBe(5);
    expect(baseline.correct).toBe(3);
    expect(baseline.accuracy).toBe(60);

    const mastery = (settings as any)?.topicMastery?.["10"];
    expect(mastery?.level ?? 0).toBe(0);
    expect(mastery?.recalls ?? []).toEqual([]);
  });
});
