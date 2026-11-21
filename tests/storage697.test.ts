/** @vitest-environment node */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as storage from "../server/jsonStorage";
import { summarizePace } from "../shared/examPace";

const TEST_DATA_DIR = path.join(process.cwd(), "test-data-697");

type AnyRecord = Record<string, any>;

function discipline(id: number, name: string, questions = 0): AnyRecord {
  return {
    id,
    userId: 1,
    name,
    color: "#3B82F6",
    weight: 3,
    order: id,
    studyTimeSeconds: 0,
    performance: {
      questionsResolved: questions,
      correctCount: Math.round(questions * 0.6),
      errorCount: questions - Math.round(questions * 0.6),
      accuracy: 60,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function topic(
  id: number,
  disciplineId: number,
  name: string,
  questions = 0,
): AnyRecord {
  return {
    id,
    userId: 1,
    disciplineId,
    name,
    order: id,
    studyDate: "2026-01-01",
    notes: null,
    performance: {
      questionsResolved: questions,
      correctCount: Math.round(questions * 0.6),
      errorCount: questions - Math.round(questions * 0.6),
      accuracy: 60,
    },
    studyTimeSeconds: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/**
 * Base sintética com a forma da base real: 24 disciplinas, 12 chaves
 * normalizadas e os 3 grupos duplicados nomeados na tarefa (incluindo
 * 1.062 + 7 + 1 em Direito Administrativo).
 */
function writeRealisticDatabase() {
  const disciplines: AnyRecord[] = [];
  let id = 1;

  disciplines.push(
    discipline(id++, "Direito Administrativo", 1062),
    discipline(
      id++,
      "Matéria: Direito Administrativo (Doutrina e Leis Federais)",
      7,
    ),
    discipline(id++, "Direito Administrativo - Doutrina e Leis", 1),
    discipline(id++, "Direito Constitucional", 514),
    discipline(id++, "Direito Constitucional (CF/1988 e Doutrina)", 60),
    discipline(id++, "Desenvolvimento de Sistemas", 30),
    discipline(id++, "Matéria: TI - Desenvolvimento de Sistemas", 90),
  );

  const pairable = [
    "Direito Penal",
    "Direito Civil",
    "Português",
    "Raciocínio Lógico",
    "Informática",
    "Direito Tributário",
    "Direito Processual Civil",
    "Administração Geral",
  ];
  for (const name of pairable) {
    disciplines.push(discipline(id++, name, 20));
    disciplines.push(discipline(id++, `Matéria: ${name} (Doutrina e Leis)`, 5));
  }
  disciplines.push(discipline(id++, "Auditoria", 40));

  const topics = [
    topic(1, 1, "CF/88 arts. 18 a 43", 800),
    topic(2, 2, "CF/88 arts. 18 a 43", 7),
    topic(3, 3, "CF/88 arts. 18 a 43", 1),
    topic(4, 4, "Organização dos Poderes", 20),
    topic(5, 5, "CF/88 art. 37", 12),
  ];

  // Ponto cego de literalidade: volume com acerto baixo (entra como candidato).
  topics[4].performance = {
    questionsResolved: 12,
    correctCount: 5,
    errorCount: 7,
    accuracy: 40,
  };

  const db = {
    users: [
      {
        id: 1,
        openId: "u1",
        name: "Aluno",
        email: null,
        loginMethod: null,
        role: "user",
        settings: {
          theme: "light",
          studyStreak: { current: 0, best: 0, lastStudyDate: null },
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        lastSignedIn: "2026-01-01T00:00:00.000Z",
      },
    ],
    disciplines,
    topics,
    revisions: [
      {
        id: 1,
        userId: 1,
        topicId: 2,
        scheduledDate: "2026-11-21",
        type: "revision",
        revisionNumber: 1,
        completed: false,
        ignored: false,
        completedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    questionErrors: [
      {
        id: 1,
        userId: 1,
        topicId: 5,
        disciplineId: 4,
        statement: "A administração pública obedece aos princípios do art. 37.",
        alternatives: [],
        userAnswer: "E",
        correctAnswer: "C",
        resolution: "Art. 37, caput, da CF/88.",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    notes: [
      {
        id: 1,
        userId: 1,
        disciplineId: 4,
        topicId: 5,
        title: "Art. 37 — LIMPE",
        content:
          "Legalidade, impessoalidade, moralidade, publicidade, eficiência.",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    flashcards: [],
    mockExams: [],
    essays: [],
    cadernosTec: {},
    counters: {
      users: 1,
      disciplines: id,
      topics: topics.length,
      revisions: 1,
      questionErrors: 1,
      notes: 1,
      flashcards: 0,
      mockExams: 0,
    },
  };

  fs.writeFileSync(
    path.join(TEST_DATA_DIR, "database.json"),
    JSON.stringify(db, null, 2),
    "utf-8",
  );
  return db;
}

beforeEach(() => {
  if (fs.existsSync(TEST_DATA_DIR))
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  storage.setDataDir(TEST_DATA_DIR);
  storage.resetCache();
});

afterEach(() => {
  if (fs.existsSync(TEST_DATA_DIR))
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
});

describe("consolidação de disciplinas duplicadas (item 7)", () => {
  it("prévia aponta origem → destino, tópicos e questões sem escrever nada", async () => {
    writeRealisticDatabase();
    storage.resetCache();

    const preview = await storage.previewDisciplineConsolidation(1);
    expect(preview.disciplinesBefore).toBe(24);
    expect(preview.disciplinesAfter).toBe(12);
    expect(preview.groups).toHaveLength(11);

    const admin = preview.groups.find(
      (group) => group.key === "direito administrativo",
    );
    expect(admin).toBeDefined();
    expect(admin?.targetName).toBe("Direito Administrativo");
    expect(admin?.targetQuestions).toBe(1062);
    expect(admin?.questions).toBe(8);
    expect(admin?.topics).toBe(2);
    expect(admin?.sources.map((source) => source.name)).toEqual([
      "Matéria: Direito Administrativo (Doutrina e Leis Federais)",
      "Direito Administrativo - Doutrina e Leis",
    ]);

    // Nada foi escrito: a base continua com 24.
    const disciplines = await storage.getDisciplinesByUser(1);
    expect(disciplines).toHaveLength(24);
  });

  it("consolida com backup, soma 1.062 + 7 + 1 e não perde questão", async () => {
    writeRealisticDatabase();
    storage.resetCache();

    const before = await storage.getDisciplinesByUser(1);
    const questionsBefore = before.reduce(
      (sum, item) => sum + (item.performance?.questionsResolved || 0),
      0,
    );

    const result = await storage.consolidateDuplicateDisciplines(1);
    expect(result.consolidated).toBe(11);
    expect(result.sourcesAbsorbed).toBe(12);
    expect(result.disciplinesBefore).toBe(24);
    expect(result.disciplinesAfter).toBe(12);
    expect(result.questionsAfter).toBe(questionsBefore);
    expect(result.questionsAfter).toBeGreaterThanOrEqual(
      result.questionsBefore,
    );

    const after = await storage.getDisciplinesByUser(1);
    expect(after).toHaveLength(12);
    const admin = after.find((item) => item.name === "Direito Administrativo");
    expect(admin?.performance?.questionsResolved).toBe(1070);
    expect(
      after.some((item) => item.name.includes("Doutrina e Leis Federais")),
    ).toBe(false);

    // Tópicos homônimos foram fundidos: 800 + 7 + 1 no tópico canônico.
    const topics = await storage.getTopicsByUser(1);
    const merged = topics.find(
      (item) =>
        item.disciplineId === admin?.id && item.name === "CF/88 arts. 18 a 43",
    );
    expect(merged?.performance?.questionsResolved).toBe(808);
    expect(
      topics.filter((item) => item.name === "CF/88 arts. 18 a 43"),
    ).toHaveLength(1);

    // Revisão e tentativas migraram junto.
    const revisions = await storage.getRevisionsByUser(1);
    expect(revisions[0].topicId).toBe(merged?.id);

    // Backup automático antes da mescla (item 7.3).
    const backupsDir = path.join(TEST_DATA_DIR, "backups");
    const backups = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir) : [];
    expect(
      backups.filter((name) => name.startsWith("mescla-disciplinas-")).length,
    ).toBeGreaterThanOrEqual(1);

    // Evento no ledger descrevendo a consolidação.
    const settings = await storage.getUserSettings(1);
    expect(
      settings?.studyEvents?.some((event) =>
        String(event.title).includes("Consolidação"),
      ),
    ).toBe(true);
  });

  it("é idempotente: rodar de novo não faz nada", async () => {
    writeRealisticDatabase();
    storage.resetCache();
    await storage.consolidateDuplicateDisciplines(1);

    const second = await storage.consolidateDuplicateDisciplines(1);
    expect(second.consolidated).toBe(0);
    expect(second.disciplinesBefore).toBe(12);
    expect(second.disciplinesAfter).toBe(12);
  });
});

describe("deck Lei seca (item 3)", () => {
  it("monta cartões do material do aluno e não duplica origem", async () => {
    writeRealisticDatabase();
    storage.resetCache();

    const first = await storage.buildLeiSecaDeck(1);
    expect(first.created.length).toBe(2); // 1 erro + 1 nota
    expect(first.candidates.map((item) => item.topicId)).toContain(5);

    const second = await storage.buildLeiSecaDeck(1);
    expect(second.created.length).toBe(0);
    expect(second.skipped).toBe(2);

    const cards = await storage.getFlashcardsByUser(1);
    expect(cards).toHaveLength(2);
    expect(cards.every((card) => card.deck === "lei-seca")).toBe(true);
    expect(cards.filter((card) => card.sourceErrorId === 1)).toHaveLength(1);
    expect(cards.filter((card) => card.noteId === 1)).toHaveLength(1);
  });

  it("respeita a meta diária e o SM-2 avança a data", async () => {
    writeRealisticDatabase();
    storage.resetCache();

    await storage.buildLeiSecaDeck(1);
    const today = new Date().toISOString().split("T")[0];
    await storage.updateUserSettings(1, { leiSecaDailyCap: 1 });

    const batch = await storage.getLeiSecaToday(1);
    expect(batch.cap).toBe(1);
    expect(batch.cards).toHaveLength(1);
    expect(batch.dueToday).toBe(2);

    const card = batch.cards[0];
    const reviewed = await storage.reviewFlashcard(card.id, 1, 5);
    expect(reviewed.nextReviewDate > today).toBe(true);
    expect(reviewed.repetitions).toBe(1);

    const after = await storage.getLeiSecaToday(1);
    expect(after.dueToday).toBe(1);
  });
});

describe("ritmo do simulado persistido (item 4)", () => {
  it("grava tempo por questão, alvo e relatório no simulado entregue", async () => {
    writeRealisticDatabase();
    storage.resetCache();

    const created = await storage.createMockExam({
      userId: 1,
      name: "Simulado ritmo",
      date: "2026-11-21",
      correct: 2,
      wrong: 1,
      blank: 7,
      totalQuestions: 10,
      score: 1,
      questions: [],
      answers: { q1: "A", q2: "B", q3: "C" },
      status: "in_progress",
      mode: "cebraspe",
      durationMinutes: 15,
    });

    const timings = {
      q1: { seconds: 60, answeredAt: "2026-11-21T10:00:00.000Z" },
      q2: { seconds: 150, answeredAt: "2026-11-21T10:02:30.000Z" },
      q3: { seconds: 95, answeredAt: "2026-11-21T10:04:05.000Z" },
    };
    const pace = summarizePace(
      Object.entries(timings).map(([id, value]) => ({
        id,
        seconds: value.seconds,
        answeredAt: value.answeredAt,
        answered: true,
      })),
      90,
      10,
    );

    await storage.updateMockExam(created.id, 1, {
      answerTimings: timings,
      pace: 90,
      paceReport: pace,
      status: "completed",
      completedAt: "2026-11-21T10:05:00.000Z",
    });

    const exams = await storage.getMockExamsByUser(1);
    const exam = exams.find((item) => item.id === created.id);
    expect(exam?.answerTimings?.q2.seconds).toBe(150);
    expect(exam?.pace).toBe(90);
    expect(exam?.paceReport?.medianSeconds).toBe(95);
    expect(exam?.paceReport?.aboveTargetCount).toBe(2);
    // 65s de atraso total (60s na q2 + 5s na q3) não chega a uma questão de 90s.
    expect(exam?.paceReport?.questionsLostToLateness).toBe(0);
    expect(exam?.status).toBe("completed");
  });
});

describe("confiança da captura do TEC chega à tentativa (item 1.3)", () => {
  it("o eco com confidence anota a tentativa existente em vez de duplicar", async () => {
    writeRealisticDatabase();
    storage.resetCache();

    const captured = await storage.recordQuestionAttempt(1, {
      topicId: 4,
      disciplineId: 4,
      questionId: "q-999",
      answered: true,
      correct: true,
      confidence: null,
      confidencePhase: null,
      source: "tec",
    });

    const annotated = await storage.recordQuestionAttempt(1, {
      topicId: 4,
      disciplineId: 4,
      questionId: "q-999",
      answered: true,
      correct: true,
      confidence: "chute",
      confidencePhase: "after_result",
      source: "tec",
    });

    expect(annotated.id).toBe(captured.id);
    const db = storage.readDatabase();
    expect(db.questionAttempts).toHaveLength(1);
    expect(db.questionAttempts?.[0].confidence).toBe("chute");
    expect(db.questionAttempts?.[0].confidencePhase).toBe("after_result");
  });

  it("sem tópico casado, a confiança é anotada na resposta recente do TEC", async () => {
    writeRealisticDatabase();
    storage.resetCache();

    const captured = await storage.recordQuestionAttempt(1, {
      topicId: 4,
      disciplineId: 4,
      answered: true,
      correct: false,
      confidence: null,
      confidencePhase: null,
      source: "tec",
    });
    const attached = await storage.attachConfidenceToLatestTecAttempt(
      1,
      false,
      "certeza",
    );
    expect(attached?.id).toBe(captured.id);
    expect(attached?.confidence).toBe("certeza");
  });
});
