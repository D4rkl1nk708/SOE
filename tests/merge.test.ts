// @vitest-environment node
import { describe, expect, it } from "vitest";
import { smartMergeDatabases } from "../shared/merge";

const ISO1 = "2026-01-01T00:00:00.000Z";
const ISO2 = "2026-02-01T00:00:00.000Z";

function database(overrides: Record<string, any> = {}) {
  return {
    users: [
      {
        id: 1,
        openId: "local-user",
        name: "Local",
        email: "local@estudos.local",
        settings: {
          theme: "dark",
          aiApiKey: "pc-key",
          studyStreak: { current: 1, best: 1, lastStudyDate: ISO1 },
        },
      },
    ],
    disciplines: [
      {
        id: 1,
        userId: 1,
        name: "Direito Civil",
        color: "#111",
        weight: 1,
        order: 1,
        studyTimeSeconds: 0,
        createdAt: ISO1,
        updatedAt: ISO1,
      },
    ],
    topics: [
      {
        id: 10,
        userId: 1,
        disciplineId: 1,
        name: "Posse",
        order: 1,
        studyDate: ISO1,
        notes: null,
        studyTimeSeconds: 0,
        performance: {
          questionsResolved: 200,
          correctCount: 150,
          errorCount: 50,
          accuracy: 75,
          lastImportedAt: ISO1,
        },
        createdAt: ISO1,
        updatedAt: ISO1,
      },
    ],
    revisions: [],
    mockExams: [],
    notes: [],
    flashcards: [],
    questionErrors: [],
    essays: [],
    tecSnapshots: [],
    subjectiveAnswers: [],
    conceptConfusions: [],
    mentorSessions: [],
    cadernosTec: {},
    counters: {},
    ...overrides,
  } as any;
}

function mobileDatabase(overrides: Record<string, any> = {}) {
  return {
    ...database(),
    users: [
      {
        ...database().users[0],
        id: 9,
        openId: "android",
        settings: {
          theme: "light",
          aiApiKey: "mobile-key",
          studyStreak: { current: 3, best: 5, lastStudyDate: ISO2 },
        },
      },
    ],
    disciplines: [{ ...database().disciplines[0], id: 5, userId: 9 }],
    topics: [
      {
        ...database().topics[0],
        id: 50,
        userId: 9,
        disciplineId: 5,
        performance: {
          questionsResolved: 10,
          correctCount: 8,
          errorCount: 2,
          accuracy: 80,
          lastImportedAt: ISO2,
        },
      },
    ],
    ...overrides,
  } as any;
}

describe("smartMergeDatabases", () => {
  it("é idempotente ao sincronizar o mesmo aparelho mais de uma vez", () => {
    const once = smartMergeDatabases(database(), mobileDatabase(), 1);
    expect(once.topics[0].performance.questionsResolved).toBe(210);
    expect(once.topics[0].performance.correctCount).toBe(158);
    expect(once.topics[0].performance.errorCount).toBe(52);

    const twice = smartMergeDatabases(once, mobileDatabase(), 1);
    expect(twice.topics[0].performance.questionsResolved).toBe(210);
    expect(twice.topics[0].performance.correctCount).toBe(158);
    expect(twice.topics[0].performance.errorCount).toBe(52);
  });

  it("mantém correta+erros = respondidas quando os totais empatam", () => {
    const a = database();
    const b = database({
      topics: [
        {
          ...a.topics[0],
          performance: {
            questionsResolved: 100,
            correctCount: 80,
            errorCount: 20,
            accuracy: 80,
            lastImportedAt: ISO2,
          },
        },
      ],
    });
    a.topics[0].performance = {
      questionsResolved: 100,
      correctCount: 60,
      errorCount: 40,
      accuracy: 60,
      lastImportedAt: ISO1,
    };

    const merged = smartMergeDatabases(a, b, 1);
    const perf = merged.topics[0].performance;
    expect(perf.correctCount).toBe(80);
    expect(perf.errorCount).toBe(20);
    expect(perf.correctCount + perf.errorCount).toBe(perf.questionsResolved);
  });

  it("preserva todos os snapshots TEC (não colapsa por data)", () => {
    const a = database({
      tecSnapshots: [
        { id: 1, userId: 1, importedAt: ISO1, totalQuestions: 10, topics: [] },
        { id: 2, userId: 1, importedAt: ISO2, totalQuestions: 20, topics: [] },
      ],
    });
    const merged = smartMergeDatabases(a, database({ tecSnapshots: [] }), 1);
    expect(merged.tecSnapshots).toHaveLength(2);
    expect(merged.tecSnapshots.map((s: any) => s.importedAt)).toEqual([
      ISO1,
      ISO2,
    ]);
  });

  it("remapeia disciplineId/topicId dos flashcards e mantém o mais avançado", () => {
    const pc = database({
      flashcards: [
        {
          id: 1,
          userId: 1,
          disciplineId: 1,
          topicId: 10,
          front: "Q",
          back: "A",
          repetitions: 2,
          updatedAt: ISO1,
        },
      ],
    });
    const mobile = mobileDatabase({
      flashcards: [
        {
          id: 2,
          userId: 9,
          disciplineId: 5,
          topicId: 50,
          front: "Q",
          back: "A",
          repetitions: 5,
          updatedAt: ISO2,
        },
      ],
    });

    const merged = smartMergeDatabases(pc, mobile, 1);
    expect(merged.flashcards).toHaveLength(1);
    expect(merged.flashcards[0].disciplineId).toBe(1);
    expect(merged.flashcards[0].topicId).toBe(1);
    expect(merged.flashcards[0].repetitions).toBe(5);
  });

  it("não sobrescreve configurações locais com as do celular", () => {
    const merged = smartMergeDatabases(database(), mobileDatabase(), 1);
    expect(merged.users[0].settings.theme).toBe("dark");
    expect(merged.users[0].settings.aiApiKey).toBe("pc-key");
    expect(merged.users[0].settings.studyStreak.best).toBe(5);
  });

  it("deduplica subjetivas pela data/texto, não pelo id local", () => {
    const answer = {
      id: 1,
      userId: 1,
      revisionId: 1,
      topicId: 10,
      topicName: "Posse",
      disciplineName: "Direito Civil",
      banca: "CEBRASPE",
      imageDataUrl: "",
      transcription: "resposta",
      correction: "ok",
      createdAt: ISO1,
    };
    const pc = database({ subjectiveAnswers: [answer] });
    const mobile = mobileDatabase({
      subjectiveAnswers: [{ ...answer, id: 77, userId: 9, topicId: 50 }],
    });
    const merged = smartMergeDatabases(pc, mobile, 1);
    expect(merged.subjectiveAnswers).toHaveLength(1);
  });

  it("não ressuscita disciplina excluída em um merge posterior", () => {
    const pc = database();
    pc.users[0].settings.deletedDisciplineNames = ["tecnologia da informacao"];
    const mobile = database({
      disciplines: [
        {
          ...database().disciplines[0],
          id: 9,
          name: "Tecnologia da Informação",
        },
      ],
      topics: [
        {
          ...database().topics[0],
          id: 90,
          disciplineId: 9,
          name: "Redes",
        },
      ],
    });

    const merged = smartMergeDatabases(pc, mobile, 1);
    expect(
      merged.disciplines.some(
        (discipline: any) => discipline.name === "Tecnologia da Informação",
      ),
    ).toBe(false);
    expect(merged.topics.some((topic: any) => topic.id === 90)).toBe(false);
  });
});
