import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Sessão guiada como dado: o registro precisa sobreviver ao reload, guardar o
 * tópico e vir na ordem certa (mais recente primeiro).
 */
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "soe-session-log-"));

describe("logGuidedSession / getRecentStudySessions", () => {
  let storage: typeof import("../server/jsonStorage");

  beforeEach(async () => {
    process.env.DATA_DIR = dataDir;
    process.env.SOE_STORAGE = "json";
    storage = await import("../server/jsonStorage");
    await storage.upsertUser({
      openId: "local-user",
      name: "Teste",
      email: "t@t.local",
      loginMethod: "local",
      role: "admin",
    });
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
    delete process.env.SOE_STORAGE;
  });

  it("grava início, fim, tópico e resultado", async () => {
    await storage.logGuidedSession(1, {
      startedAt: "2026-03-10T13:00:00.000Z",
      endedAt: "2026-03-10T13:18:00.000Z",
      minutes: 18,
      accuracy: 75,
      questions: 8,
      correct: 6,
      topicId: 42,
      topicName: "Camadas de imagem",
      disciplineId: 3,
      blockId: "rev-7",
    });

    const sessions = await storage.getRecentStudySessions(1);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].topicId).toBe(42);
    expect(sessions[0].topicName).toBe("Camadas de imagem");
    expect(sessions[0].questions).toBe(8);
    expect(sessions[0].correct).toBe(6);
    expect(sessions[0].blockId).toBe("rev-7");
    // accuracy é guardada como fração 0–1 no log
    expect(sessions[0].accuracy).toBeCloseTo(0.75, 5);
    expect(sessions[0].date).toBe("2026-03-10");
  });

  it("devolve da mais recente para a mais antiga", async () => {
    await storage.logGuidedSession(1, {
      startedAt: "2026-03-09T10:00:00.000Z",
      endedAt: "2026-03-09T10:10:00.000Z",
      minutes: 10,
      accuracy: 50,
      questions: 4,
      correct: 2,
      topicName: "Antiga",
    });
    await storage.logGuidedSession(1, {
      startedAt: "2026-03-11T10:00:00.000Z",
      endedAt: "2026-03-11T10:20:00.000Z",
      minutes: 20,
      accuracy: 90,
      questions: 10,
      correct: 9,
      topicName: "Recente",
    });

    const sessions = await storage.getRecentStudySessions(1, 5);
    expect(sessions[0].topicName).toBe("Recente");
    expect(sessions[1].topicName).toBe("Antiga");
  });

  it("respeita o limite pedido", async () => {
    for (let index = 0; index < 5; index += 1) {
      await storage.logGuidedSession(1, {
        startedAt: `2026-03-0${index + 1}T10:00:00.000Z`,
        endedAt: `2026-03-0${index + 1}T10:05:00.000Z`,
        minutes: 5,
        accuracy: 60,
        questions: 2,
        correct: 1,
        topicName: `Sessão ${index}`,
      });
    }

    const sessions = await storage.getRecentStudySessions(1, 2);
    expect(sessions).toHaveLength(2);
  });
});
