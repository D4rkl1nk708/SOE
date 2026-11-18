/** @vitest-environment node */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as storage from "../server/jsonStorage";
import { sanitizeDatabaseForBackup } from "../server/storage/sanitize";
import { buildExamEditalMigration } from "../shared/editalCoverage";

const TEST_DATA_DIR = path.join(process.cwd(), "test-data-694");

function writeLegacyDatabase(extra: Record<string, unknown> = {}) {
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
          questionAttempts: [
            {
              id: "a1",
              topicId: 1,
              answered: true,
              correct: true,
              confidence: null,
              confidencePhase: null,
              createdAt: "2026-01-01T10:00:00.000Z",
            },
            {
              id: "a2",
              topicId: 1,
              answered: true,
              correct: false,
              confidence: "chute",
              confidencePhase: "before_result",
              createdAt: "2026-01-01T10:05:00.000Z",
            },
          ],
          editalRows: [
            {
              id: "r1",
              discipline: "Direito Constitucional",
              topic: "Direitos fundamentais",
              completed: false,
            },
          ],
          exams: [{ id: "exam-1", name: "CGU", date: "2027-01-10" }],
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        lastSignedIn: "2026-01-01T00:00:00.000Z",
      },
    ],
    disciplines: [
      {
        id: 1,
        userId: 1,
        name: "Direito Constitucional",
        color: "#111111",
        weight: 3,
        order: 1,
        studyTimeSeconds: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    topics: [
      {
        id: 1,
        userId: 1,
        disciplineId: 1,
        name: "Direitos fundamentais",
        order: 1,
        studyDate: "2026-01-01",
        notes: null,
        performance: { questionsResolved: 2, correctCount: 1, errorCount: 1 },
        studyTimeSeconds: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    revisions: [],
    counters: { users: 1, disciplines: 1, topics: 1, revisions: 0 },
    ...extra,
  };
  fs.writeFileSync(
    path.join(TEST_DATA_DIR, "database.json"),
    JSON.stringify(db),
    "utf-8",
  );
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

describe("questionAttempts — coleção própria (item 2)", () => {
  it("migra de settings para a coleção, uma única vez, com backup", () => {
    writeLegacyDatabase();
    storage.resetCache();

    const db = storage.readDatabase();
    expect(Array.isArray(db.questionAttempts)).toBe(true);
    expect(db.questionAttempts).toHaveLength(2);
    expect(db.questionAttempts?.[0].userId).toBe(1);
    expect(db.users[0].settings.questionAttempts).toBeUndefined();

    const backups = fs.readdirSync(path.join(TEST_DATA_DIR, "backups"));
    expect(
      backups.some((name) =>
        name.startsWith("database-before-questionAttempts"),
      ),
    ).toBe(true);

    // Segunda leitura: nada é duplicado
    storage.resetCache();
    const again = storage.readDatabase();
    expect(again.questionAttempts).toHaveLength(2);
  });

  it("recordQuestionAttempt grava na coleção e expõe a view em settings", async () => {
    writeLegacyDatabase();
    storage.resetCache();
    const record = await storage.recordQuestionAttempt(1, {
      topicId: 1,
      disciplineId: 1,
      answered: true,
      correct: true,
      confidence: null,
      confidencePhase: null,
      source: "manual",
    });
    const db = storage.readDatabase();
    expect(db.questionAttempts?.some((item) => item.id === record.id)).toBe(
      true,
    );
    expect(db.users[0].settings.questionAttempts).toBeUndefined();

    const settings = await storage.getUserSettings(1);
    expect(settings?.questionAttempts?.length).toBe(3);
    expect(
      db.users[0].settings.studyEvents?.some(
        (event) => event.type === "answer",
      ),
    ).toBe(true);
  });

  it("não conta duas vezes a mesma assinatura de questão (dedupe)", async () => {
    writeLegacyDatabase();
    storage.resetCache();
    const input = {
      topicId: 1,
      disciplineId: 1,
      questionId: "q-123",
      answered: true as const,
      correct: true,
      confidence: null,
      confidencePhase: null,
      source: "tec" as const,
    };
    const first = await storage.recordQuestionAttempt(1, input);
    const second = await storage.recordQuestionAttempt(1, input);
    expect(second.id).toBe(first.id);
    const db = storage.readDatabase();
    expect(
      db.questionAttempts?.filter((item) => item.questionId === "q-123"),
    ).toHaveLength(1);
  });

  it("aceita gravação legada via settings e redireciona para a coleção", async () => {
    writeLegacyDatabase();
    storage.resetCache();
    await storage.updateUserSettings(1, {
      questionAttempts: [
        {
          id: "legacy-write-1",
          topicId: 1,
          answered: true,
          correct: true,
          createdAt: "2026-02-01T10:00:00.000Z",
        },
      ],
    } as any);
    const db = storage.readDatabase();
    expect(
      db.questionAttempts?.some((item) => item.id === "legacy-write-1"),
    ).toBe(true);
    expect(db.users[0].settings.questionAttempts).toBeUndefined();
  });
});

describe("edital por concurso (item 5)", () => {
  it("migra o edital global para o concurso ativo com backup", () => {
    writeLegacyDatabase();
    storage.resetCache();
    const db = storage.readDatabase();
    const settings = db.users[0].settings as any;
    expect(settings.activeExamId).toBe("exam-1");
    expect(settings.exams[0].editalRows).toHaveLength(1);
    expect(settings.editalRows).toEqual([]);
    const backups = fs.readdirSync(path.join(TEST_DATA_DIR, "backups"));
    expect(backups.some((name) => name.includes("editalPerExam"))).toBe(true);
  });

  it("getExamEditalOverview devolve as linhas do concurso ativo", async () => {
    writeLegacyDatabase();
    storage.resetCache();
    const overview = await storage.getExamEditalOverview(1);
    expect(overview.activeExamId).toBe("exam-1");
    expect(overview.rows).toHaveLength(1);
    expect(overview.exams[0].rows).toBe(1);
    expect(overview.exams[0].linkedRows).toBe(0);
  });

  it("liga linhas do edital a tópicos e reflete na cobertura", async () => {
    writeLegacyDatabase();
    storage.resetCache();
    const changed = await storage.patchEditalRowLinks(1, [
      { rowId: "r1", topicIds: [1] },
    ]);
    expect(changed).toBe(1);
    const overview = await storage.getExamEditalOverview(1);
    expect(overview.rows[0].topicIds).toEqual([1]);
    expect(overview.exams[0].linkedRows).toBe(1);
  });

  it("updateSettings({editalRows}) grava no concurso ativo, não em settings", async () => {
    writeLegacyDatabase();
    storage.resetCache();
    await storage.updateUserSettings(1, {
      editalRows: [
        {
          id: "r2",
          discipline: "Português",
          topic: "Crase",
          completed: true,
        },
      ],
    } as any);
    const db = storage.readDatabase();
    const settings = db.users[0].settings as any;
    expect(settings.editalRows).toEqual([]);
    expect(settings.exams[0].editalRows[0].id).toBe("r2");
  });

  it("helper de migração aponta o concurso escolhido", () => {
    const result = buildExamEditalMigration(
      [
        { id: "e1", name: "A", date: "2027-01-01" },
        { id: "e2", name: "B", date: "2027-02-01" },
      ],
      [{ id: "r1", discipline: "X", topic: "Y", completed: false }],
      "e2",
    );
    expect(result?.examId).toBe("e2");
    expect(result?.warning).toContain("B");
    expect(
      buildExamEditalMigration(
        [{ id: "e1", name: "A", date: "2027-01-01", editalRows: [] }],
        [],
      ),
    ).toBeNull();
  });
});

describe("settings leves e seguros (item 6)", () => {
  it("foto em base64 vira arquivo em data/uploads e settings guarda a referência", async () => {
    writeLegacyDatabase();
    storage.resetCache();
    const pixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    await storage.updateUserSettings(1, { profileImage: pixel });
    const settings = await storage.getUserSettings(1);
    expect(settings?.profileImage).toMatch(/^\/uploads\/avatar-1_/);

    const files = fs.readdirSync(path.join(TEST_DATA_DIR, "uploads"));
    expect(files.some((name) => name.startsWith("avatar-1_"))).toBe(true);
  });

  it("migra a foto já gravada em base64 (uma vez)", async () => {
    writeLegacyDatabase();
    const db = storage.readDatabase();
    db.users[0].settings.profileImage =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    storage.writeDatabase(db);

    const migrated = await storage.migrateProfileImageToFile(1);
    expect(migrated).toBe(true);
    const settings = await storage.getUserSettings(1);
    expect(settings?.profileImage).toMatch(/^\/uploads\//);
    expect(await storage.migrateProfileImageToFile(1)).toBe(false);
  });

  it("export não carrega aiApiKey nem pushToken; backup sanitizado também não", async () => {
    writeLegacyDatabase();
    const db = storage.readDatabase();
    db.users[0].settings.aiApiKey = "sk-segredo";
    db.users[0].settings.pushToken = "token-segredo";
    storage.writeDatabase(db);

    const exported = await storage.exportDatabase();
    expect(exported).not.toContain("sk-segredo");
    expect(exported).not.toContain("token-segredo");

    const sanitized = sanitizeDatabaseForBackup(db);
    expect((sanitized.users[0].settings as any).aiApiKey).toBeUndefined();
    expect((sanitized.users[0].settings as any).pushToken).toBeUndefined();
    // O original continua intacto em memória (o app ainda precisa da chave).
    expect(db.users[0].settings.aiApiKey).toBe("sk-segredo");
  });
});

describe("flashcards dos erros (item 7)", () => {
  it("cria um card por erro sem duplicar e usa gabarito + resolução", async () => {
    writeLegacyDatabase();
    storage.resetCache();
    await storage.saveQuestionError({
      userId: 1,
      topicId: 1,
      disciplineId: 1,
      statement:
        "Segundo a CF/88, é vedada a criação de mais de uma organização sindical na mesma base territorial.",
      alternatives: [
        { letter: "C", text: "Certo" },
        { letter: "E", text: "Errado" },
      ],
      userAnswer: "E",
      correctAnswer: "C",
      banca: "CEBRASPE",
      resolution:
        "Art. 8º, II, da CF: a lei não poderá exigir autorização do Estado.",
    });

    const first = await storage.generateFlashcardsFromErrors(1);
    expect(first.created.length).toBe(1);
    expect(first.skipped).toBe(0);

    const cards = await storage.getFlashcardsByUser(1);
    expect(cards).toHaveLength(1);
    expect(cards[0].sourceErrorId).toBe(1);
    expect(cards[0].front).toContain("organização sindical");
    expect(cards[0].back).toContain("Resposta correta: C");
    expect(cards[0].back).toContain("Art. 8º");

    const second = await storage.generateFlashcardsFromErrors(1);
    expect(second.created.length).toBe(0);
    expect(second.skipped).toBe(1);
    expect(await storage.getFlashcardsByUser(1)).toHaveLength(1);
  });
});

describe("mescla de disciplinas (item 3)", () => {
  it("move tentativas e funde tópicos homônimos somando performance", async () => {
    writeLegacyDatabase();
    storage.resetCache();
    const target = await storage.createDiscipline({
      userId: 1,
      name: "Redes",
      color: "#222222",
      weight: 2,
    });
    const source = await storage.createDiscipline({
      userId: 1,
      name: "Redes de Computadores",
      color: "#333333",
      weight: 1,
    });
    const topicA = await storage.createTopic({
      userId: 1,
      disciplineId: source.id,
      name: "Modelo OSI",
      studyDate: "2026-01-02",
      notes: null,
    });
    const topicB = await storage.createTopic({
      userId: 1,
      disciplineId: target.id,
      name: "modelo osi",
      studyDate: "2026-01-03",
      notes: null,
    });
    await storage.recordQuestionAttempt(1, {
      topicId: topicA.id,
      disciplineId: source.id,
      answered: true,
      correct: true,
      confidence: null,
      confidencePhase: null,
    });

    const result = await storage.mergeDisciplines(1, source.id, target.id);
    expect(result.success).toBe(true);
    expect(result.movedTopics).toBeGreaterThanOrEqual(0);
    expect(result.mergedTopics).toBeGreaterThanOrEqual(1);

    const topics = await storage.getTopicsByUser(1);
    const homonyms = topics.filter(
      (topic) => topic.name.toLowerCase() === "modelo osi",
    );
    expect(homonyms).toHaveLength(1);
    const attempts = await storage.getQuestionAttempts(1, 100);
    expect(attempts.some((attempt) => attempt.disciplineId === target.id)).toBe(
      true,
    );
    const backups = fs.readdirSync(path.join(TEST_DATA_DIR, "backups"));
    expect(backups.some((name) => name.startsWith("mescla-disciplinas"))).toBe(
      true,
    );
  });
});
