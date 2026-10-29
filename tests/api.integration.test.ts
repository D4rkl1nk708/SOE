/** @vitest-environment node */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import * as path from "path";
import * as fs from "fs";
import { createApp } from "../server/_core/index";
import * as storage from "../server/jsonStorage";

const TEST_DATA_DIR = path.join(process.cwd(), "test-data-api");
const VALID_TOKEN = "token-very-long-and-secure-456";

describe("API Integration Tests", () => {
  let app: any;
  let server: any;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    storage.setDataDir(TEST_DATA_DIR);
    storage.resetCache();
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    const created = await createApp();
    app = created.app;
    server = created.server;
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  it("should handle /api/tec/wrong-question and perform fuzzy matching", async () => {
    // 1. Create a user
    await storage.upsertUser({ openId: "api-user", name: "API User" });
    const user = (await storage.getUserByOpenId("api-user"))!;
    await storage.updateUserSettings(user.id, { pushToken: VALID_TOKEN });

    // 2. Create a discipline to match
    await storage.createDiscipline({
      userId: user.id,
      name: "Direito Constitucional",
      color: "#000",
      weight: 1,
    });

    // 3. Send a wrong question with a slightly different name
    const response = await request(app)
      .post("/api/tec/wrong-question")
      .set("x-soe-token", VALID_TOKEN)
      .send({
        questionId: "#999",
        disciplina: "Constitucional", // Fuzzy match!
        assunto: "Controle de Constitucionalidade",
        statement: "Questão de teste",
        userAnswer: "A",
        correctAnswer: "B",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // 4. Verify it matched the existing discipline
    const disciplines = await storage.getDisciplinesByUser(user.id);
    expect(disciplines).toHaveLength(1);
    expect(disciplines[0].name).toBe("Direito Constitucional");

    // 5. Verify it created the topic
    const topics = await storage.getTopicsByUser(user.id);
    expect(topics).toHaveLength(1);
    expect(topics[0].name).toBe("Controle de Constitucionalidade");

    // 6. Verify the error was saved
    const errors = await storage.getQuestionErrorsByUser(user.id);
    expect(errors.items).toHaveLength(1);
    expect(errors.items[0].questionId).toBe("#999");
  });

  it("recusa incremento que somaria mais de uma questão", async () => {
    await storage.upsertUser({ openId: "api-user-bulk", name: "Bulk User" });
    const user = (await storage.getUserByOpenId("api-user-bulk"))!;
    await storage.updateUserSettings(user.id, { pushToken: VALID_TOKEN });

    const response = await request(app)
      .post("/api/tec/increment")
      .set("x-soe-token", VALID_TOKEN)
      .send({
        assunto: "Controle da Administração",
        disciplina: "Direito Administrativo",
        correctAdd: 300,
        errorAdd: 0,
      });

    expect(response.status).toBe(400);
    expect(String(response.body.error)).toMatch(/no máximo uma questão/i);
  });

  it("recusa sincronização de caderno sem modo explícito de importação", async () => {
    await storage.upsertUser({ openId: "api-user-bulk", name: "Bulk User" });
    const user = (await storage.getUserByOpenId("api-user-bulk"))!;
    await storage.updateUserSettings(user.id, { pushToken: VALID_TOKEN });

    const response = await request(app)
      .post("/api/tec/caderno-push")
      .set("x-soe-token", VALID_TOKEN)
      .send({
        rows: [
          { disciplina: "Direito", assunto: "Tema", acertos: 300, erros: 0 },
        ],
      });

    expect(response.status).toBe(409);
    expect(String(response.body.error)).toMatch(/importação/i);
  });

  it("should return 401 if token is invalid", async () => {
    const response = await request(app)
      .post("/api/tec/wrong-question")
      .send({ statement: "test" });

    expect(response.status).toBe(401);
  });

  it("não expõe /api/sync/export para origens públicas", async () => {
    const response = await request(app)
      .get("/api/sync/export")
      .set("Origin", "https://evil.example.com");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("permite /api/sync/export para origem local", async () => {
    const response = await request(app)
      .get("/api/sync/export")
      .set("Origin", "http://127.0.0.1:3000");

    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://127.0.0.1:3000",
    );
  });
});
