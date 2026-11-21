/** @vitest-environment node */
/**
 * Item 2.4 (v6.9.8): guarda de dados.
 *
 * Verificadores novos do `getDataHealth` + as correções seguras, cada uma com
 * backup antes de gravar e teste de regressão provando que NADA além do alvo
 * foi alterado.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getDataHealth } from "../server/studyIntelligence";
import { addLocalDays, localDayISO } from "../shared/localDay";

const USER_ID = 1;
const TODAY = "2026-11-21";

type Storage = typeof import("../server/jsonStorage");

function isoAtLocalNoon(day: string): string {
  return new Date(`${day}T12:00:00`).toISOString();
}

function buildMessyDatabase() {
  const stamp = isoAtLocalNoon(TODAY);
  return {
    users: [
      {
        id: USER_ID,
        openId: "saude-fixture",
        name: "Aluno Fixture",
        email: null,
        loginMethod: "local",
        role: "admin",
        settings: {
          theme: "light",
          studyStreak: { current: 0, best: 0, lastStudyDate: null },
          exams: [],
          editalRows: [],
        },
        createdAt: stamp,
        updatedAt: stamp,
        lastSignedIn: stamp,
      },
    ],
    disciplines: [
      {
        id: 1,
        userId: USER_ID,
        name: "Português",
        color: "#0ea5e9",
        weight: 2,
        order: 1,
        studyTimeSeconds: 0,
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: 2,
        userId: USER_ID,
        name: "Raciocínio Lógico",
        color: "#8b5cf6",
        weight: 5,
        order: 1, // duplicado de propósito
        studyTimeSeconds: 0,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    topics: [
      {
        id: 1,
        userId: USER_ID,
        disciplineId: 1,
        name: "Crase",
        order: 1,
        studyDate: addLocalDays(TODAY, -5),
        notes: null,
        // incoerente: 10 resolvidas, 3 acertos + 4 erros
        performance: {
          questionsResolved: 10,
          correctCount: 3,
          errorCount: 4,
          accuracy: 30,
        },
        studyTimeSeconds: 0,
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: 2,
        userId: USER_ID,
        disciplineId: 2,
        name: "Sequências",
        order: 2,
        studyDate: addLocalDays(TODAY, -9),
        notes: null,
        performance: {
          questionsResolved: 20,
          correctCount: 12,
          errorCount: 8,
          accuracy: 60,
        },
        studyTimeSeconds: 0,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    revisions: [
      // 35 vencidas no tópico 2 → topicBacklog
      ...Array.from({ length: 35 }, (_, index) => ({
        id: index + 1,
        userId: USER_ID,
        topicId: 2,
        scheduledDate: addLocalDays(TODAY, -(index + 1)),
        type: "revision" as const,
        revisionNumber: index + 1,
        completed: false,
        ignored: false,
        completedAt: null,
        createdAt: stamp,
        updatedAt: stamp,
      })),
      {
        id: 500,
        userId: USER_ID,
        topicId: 1,
        scheduledDate: addLocalDays(TODAY, 3),
        type: "revision" as const,
        revisionNumber: 1,
        completed: false,
        ignored: false,
        completedAt: null,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    mockExams: [
      {
        id: 1,
        userId: USER_ID,
        name: "Simulado vazio",
        date: TODAY,
        correct: 0,
        wrong: 0,
        blank: 10,
        totalQuestions: 10,
        score: 0,
        createdAt: stamp,
      },
      {
        id: 2,
        userId: USER_ID,
        name: "Simulado respondido",
        date: TODAY,
        correct: 6,
        wrong: 4,
        blank: 0,
        totalQuestions: 10,
        score: 6,
        answers: { q1: "A", q2: "B" },
        createdAt: stamp,
      },
    ],
    notes: [],
    flashcards: [
      {
        id: 1,
        userId: USER_ID,
        disciplineId: 1,
        front: "Frente antiga",
        back: "Verso antigo",
        interval: 3,
        easeFactor: 2.5,
        repetitions: 1,
        nextReviewDate: addLocalDays(TODAY, -140),
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: 2,
        userId: USER_ID,
        disciplineId: 1,
        front: "Frente nova",
        back: "Verso novo",
        interval: 3,
        easeFactor: 2.5,
        repetitions: 1,
        nextReviewDate: addLocalDays(TODAY, 2),
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    questionErrors: [
      {
        id: 1,
        userId: USER_ID,
        topicId: 1,
        disciplineId: 1,
        statement: "",
        alternatives: [],
        createdAt: stamp,
      },
      {
        id: 2,
        userId: USER_ID,
        topicId: 1,
        disciplineId: 1,
        statement:
          "Assinale a alternativa correta a respeito do emprego da crase na frase apresentada.",
        alternatives: [],
        createdAt: stamp,
      },
    ],
    essays: [],
    tecSnapshots: [],
    cadernosTec: {},
    questionAttempts: [
      {
        id: "att-sem-topico",
        userId: USER_ID,
        topicId: null,
        disciplineId: null,
        answered: true,
        correct: false,
        confidence: null,
        confidencePhase: null,
        createdAt: stamp,
      },
    ],
    counters: {
      users: 1,
      disciplines: 2,
      topics: 2,
      revisions: 36,
      mockExams: 2,
      notes: 0,
      flashcards: 2,
      questionErrors: 2,
      essays: 0,
      tecSnapshots: 0,
      questionAttempts: 1,
    },
  };
}

describe("saúde dos dados (item 2.4)", () => {
  let storage: Storage;
  let dir = "";
  let backups: string[] = [];

  beforeEach(async () => {
    storage = await import("../server/jsonStorage");
    storage.closeDatabase();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "soe-health-"));
    storage.setDataDir(dir);
    storage.resetCache();
    storage.writeDatabase(buildMessyDatabase() as never);
  });

  afterEach(() => {
    storage.closeDatabase();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows pode manter o handle */
    }
  });

  function backupFiles(): string[] {
    const backupDir = path.join(dir, "backups");
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir);
  }

  it("encontra cada achado e só oferece ação para o que é corrigível", async () => {
    const health = await getDataHealth(USER_ID);

    expect(health.healthy).toBe(false);
    expect(health.errorsWithoutStatement).toBe(1);
    expect(health.emptyMockExams).toBe(1);
    expect(health.staleFlashcards).toBe(1);
    expect(health.duplicateOrder).toBeGreaterThan(0);
    expect(health.topicBacklog).toBe(1);
    expect(health.incoherentPerformance).toBe(1);
    expect(health.attemptsWithoutTopic).toBe(1);

    const ids = health.actions.map((action) => action.id).sort();
    expect(ids).toEqual([
      "delete-empty-mock-exams",
      "mark-errors-statement-pending",
      "reorder-disciplines",
      "reschedule-stale-flashcards",
    ]);
    // Backlog e performance incoerente são informativos, não ação destrutiva.
    expect(
      health.actions.some((action) => action.id === "reorder-disciplines"),
    ).toBe(true);
  });

  it("reordenar disciplinas grava backup e não apaga nada", async () => {
    const before = storage.readDatabase();
    const beforeNames = before.disciplines.map((discipline) => discipline.name);

    const result = await storage.applyDataHealthFix(
      USER_ID,
      "reorder-disciplines",
      TODAY,
    );

    expect(result.affected).toBeGreaterThan(0);
    expect(result.backup).toBeTruthy();
    expect(backupFiles().length).toBeGreaterThan(0);

    const after = storage.readDatabase();
    expect(
      after.disciplines.map((discipline) => discipline.name).sort(),
    ).toEqual([...beforeNames].sort());
    const orders = after.disciplines.map((discipline) => discipline.order);
    expect(new Set(orders).size).toBe(orders.length);
    // Maior peso primeiro.
    expect(
      after.disciplines.find(
        (discipline) => discipline.name === "Raciocínio Lógico",
      )?.order,
    ).toBe(1);
  });

  it("excluir simulado vazio mantém o respondido", async () => {
    const result = await storage.applyDataHealthFix(
      USER_ID,
      "delete-empty-mock-exams",
      TODAY,
    );
    expect(result.affected).toBe(1);
    const after = storage.readDatabase();
    expect(after.mockExams).toHaveLength(1);
    expect(after.mockExams[0].name).toBe("Simulado respondido");
  });

  it("marcar erro como enunciado pendente preserva o erro bom", async () => {
    const result = await storage.applyDataHealthFix(
      USER_ID,
      "mark-errors-statement-pending",
      TODAY,
    );
    expect(result.affected).toBe(1);
    const after = storage.readDatabase();
    const withoutStatement = after.questionErrors.find(
      (error) => error.id === 1,
    );
    const withStatement = after.questionErrors.find((error) => error.id === 2);
    expect(withoutStatement?.statementPending).toBe(true);
    expect(withStatement?.statementPending).toBeUndefined();
    expect(after.questionErrors).toHaveLength(2);
  });

  it("reagendar flashcard vencido só mexe no que passou de 90 dias", async () => {
    const result = await storage.applyDataHealthFix(
      USER_ID,
      "reschedule-stale-flashcards",
      localDayISO(new Date(`${TODAY}T12:00:00`)),
    );
    expect(result.affected).toBe(1);
    const after = storage.readDatabase();
    const stale = after.flashcards.find((card) => card.id === 1);
    const fresh = after.flashcards.find((card) => card.id === 2);
    expect(stale?.nextReviewDate).toBe(
      localDayISO(new Date(`${TODAY}T12:00:00`)),
    );
    expect(fresh?.nextReviewDate).toBe(addLocalDays(TODAY, 2));
  });

  it("base saudável não gera ação nem alarme", async () => {
    const clean = buildMessyDatabase();
    clean.questionErrors = [clean.questionErrors[1]];
    clean.mockExams = [clean.mockExams[1]];
    clean.flashcards = [clean.flashcards[1]];
    clean.disciplines[1].order = 2;
    clean.topics[0].performance = {
      questionsResolved: 7,
      correctCount: 3,
      errorCount: 4,
      accuracy: 43,
    };
    clean.questionAttempts = [];
    storage.writeDatabase(clean as never);

    const health = await getDataHealth(USER_ID);
    expect(health.actions).toHaveLength(0);
    expect(health.healthy).toBe(true);
  });
});
