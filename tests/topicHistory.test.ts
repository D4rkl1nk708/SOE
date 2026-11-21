/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as storage from "../server/jsonStorage";

const DIR = path.join(process.cwd(), "test-data-history");

const base = {
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
        studyEvents: [],
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
      name: "D",
      color: "#000",
      weight: 1,
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
      name: "T",
      order: 1,
      studyDate: "2026-01-01",
      notes: null,
      performance: {
        questionsResolved: 10,
        accuracy: 50,
        correctCount: 5,
        errorCount: 5,
        history: [{ date: "2026-01-01", accuracy: 50, questionsResolved: 10 }],
      },
      studyTimeSeconds: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  revisions: [],
  counters: { users: 1, disciplines: 1, topics: 1, revisions: 0 },
};

beforeEach(() => {
  if (fs.existsSync(DIR)) fs.rmSync(DIR, { recursive: true });
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, "database.json"), JSON.stringify(base));
  storage.setDataDir(DIR);
  storage.resetCache();
});

afterEach(() => {
  storage.closeDatabase?.();
  if (fs.existsSync(DIR)) fs.rmSync(DIR, { recursive: true });
});

describe("histórico diário do tópico", () => {
  it("a entrada de hoje mostra o resultado ATUAL, não o anterior", async () => {
    await storage.setTopicPerformance(1, 1, { correctCount: 8, errorCount: 6 });
    const topic = storage.readDatabase().topics.find((t) => t.id === 1)!;
    const today = new Date().toISOString().slice(0, 10);
    const entry = (topic.performance?.history ?? []).find(
      (h) => h.date === today,
    )!;
    expect(entry.questionsResolved).toBe(14);
    expect(entry.accuracy).toBe(57);
    expect(topic.performance?.questionsResolved).toBe(14);
  });

  it("não acumula duas entradas no mesmo dia", async () => {
    await storage.setTopicPerformance(1, 1, { correctCount: 8, errorCount: 6 });
    await storage.setTopicPerformance(1, 1, { correctCount: 9, errorCount: 6 });
    const topic = storage.readDatabase().topics.find((t) => t.id === 1)!;
    const today = new Date().toISOString().slice(0, 10);
    const entries = (topic.performance?.history ?? []).filter(
      (h) => h.date === today,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].questionsResolved).toBe(15);
  });
});
