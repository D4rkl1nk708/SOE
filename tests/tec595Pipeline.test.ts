/** @vitest-environment node */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import request from "supertest";
import * as path from "path";
import * as fs from "fs";
import { configureApp } from "../server/_core/appFactory";
import * as storage from "../server/jsonStorage";
import {
  addManualAnswer,
  buildTecLiveActivity,
  listPendingClassifications,
  resolvePendingClassification,
  undoLastAnswer,
} from "../server/tecCaptureService";
import { formatDateForDb } from "../shared/scheduling";

const TEST_DATA_DIR = path.join(process.cwd(), "test-data-tec695");
const VALID_TOKEN = "token-tec-695-very-long-and-secure";

let app: any;
let server: any;
let userId = 0;
let disciplineId = 0;
let topicId = 0;

function yesterdayIso(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return formatDateForDb(date);
}

async function post(body: Record<string, unknown>) {
  return request(app)
    .post("/api/tec/increment")
    .set("x-soe-token", VALID_TOKEN)
    .send(body);
}

describe("captura do TEC v6.9.5 (pipeline do servidor)", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    storage.setDataDir(TEST_DATA_DIR);
    storage.resetCache();
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    // `configureApp` monta o app SEM ouvir em porta: dois arquivos de teste
    // correndo em workers paralelos disputavam a 3000 e geravam EADDRINUSE.
    const created = await configureApp();
    app = created.app;
    server = created.server;

    await storage.upsertUser({ openId: "tec-695-user", name: "Aluno TEC" });
    const user = (await storage.getUserByOpenId("tec-695-user"))!;
    userId = user.id;
    await storage.updateUserSettings(userId, {
      pushToken: VALID_TOKEN,
      aiApiKey: "",
    });
    disciplineId = (
      await storage.createDiscipline({
        userId,
        name: "Direito Constitucional",
        color: "#000",
        weight: 1,
      })
    ).id;
    topicId = (
      await storage.createTopic({
        userId,
        disciplineId,
        name: "Controle de Constitucionalidade",
        studyDate: new Date().toISOString(),
        notes: null,
      })
    ).id;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        try {
          server.close(() => resolve());
        } catch {
          resolve();
        }
      });
    }
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  it("classifica localmente (sem IA) e registra a tentativa no tópico certo", async () => {
    const response = await post({
      disciplina: "Direito Constitucional",
      assunto: "Controle de Constitucionalidade",
      questionLabel: "Controle de Constitucionalidade",
      questionStatement:
        "Sobre o controle difuso de constitucionalidade, assinale a alternativa correta.",
      correctAdd: 1,
      errorAdd: 0,
      timeSpentSeconds: 42,
      questionSignature: "qid:1001",
      dedupKey: "qid:1001",
      questionId: "1001",
    });

    expect(response.status).toBe(200);
    expect(response.body.pending).toBe(false);
    expect(response.body.topicId).toBe(topicId);

    const topics = await storage.getTopicsByUser(userId);
    const topic = topics.find((item) => item.id === topicId)!;
    expect(topic.performance?.correctCount).toBe(1);
    expect(topic.performance?.errorCount).toBe(0);

    const attempts = await storage.getAllQuestionAttempts(userId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].topicId).toBe(topicId);
    expect(attempts[0].seconds).toBe(42);
    expect(attempts[0].questionId).toBe("qid:1001");
    expect(attempts[0].pendingClassification ?? null).toBeNull();

    // Evento "estudou hoje" no tópico (visível no calendário).
    const settings = await storage.getUserSettings(userId);
    const dayEvent = (settings?.studyEvents || []).find((event) =>
      String(event.id).startsWith(`tec-day-${topicId}-`),
    );
    expect(dayEvent).toBeTruthy();
  });

  it("cabeçalho genérico (Desenvolvimento/Blog) NÃO vira disciplina: fica pendente", async () => {
    const before = await storage.getDisciplinesByUser(userId);
    const response = await post({
      disciplina: "Desenvolvimento",
      assunto: "Blog",
      questionLabel: "Blog",
      correctAdd: 0,
      errorAdd: 1,
      timeSpentSeconds: 10,
      questionSignature: "qid:2002",
    });

    expect(response.status).toBe(200);
    expect(response.body.pending).toBe(true);
    expect(response.body.topicId).toBeNull();

    const after = await storage.getDisciplinesByUser(userId);
    expect(after).toHaveLength(before.length);

    const topics = await storage.getTopicsByUser(userId);
    expect(topics.some((topic) => topic.name === "Blog")).toBe(false);

    const attempts = await storage.getAllQuestionAttempts(userId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].topicId).toBeNull();
    expect(attempts[0].pendingClassification?.tecLabel).toBe("Blog");

    // Nenhum contador de tópico foi mexido.
    const topic = topics.find((item) => item.id === topicId)!;
    expect(topic.performance?.questionsResolved ?? 0).toBe(0);
  });

  it("conclui UMA revisão de teste vencida por bloco de 5 questões e não mexe na teoria", async () => {
    const theoryId = 0;
    await storage.createRevisions([
      {
        userId,
        topicId,
        scheduledDate: yesterdayIso(),
        type: "revision",
        revisionNumber: 1,
      },
      {
        userId,
        topicId,
        scheduledDate: yesterdayIso(),
        type: "test",
        revisionNumber: 1,
      },
    ]);
    void theoryId;

    let autoCompleted: any = null;
    for (let index = 0; index < 5; index += 1) {
      const response = await post({
        disciplina: "Direito Constitucional",
        assunto: "Controle de Constitucionalidade",
        questionLabel: "Controle de Constitucionalidade",
        correctAdd: index % 2 === 0 ? 1 : 0,
        errorAdd: index % 2 === 0 ? 0 : 1,
        timeSpentSeconds: 30,
        questionSignature: `qid:300${index}`,
      });
      expect(response.status).toBe(200);
      if (response.body.autoCompleted)
        autoCompleted = response.body.autoCompleted;
    }

    expect(autoCompleted).toBeTruthy();
    expect(autoCompleted.answersToday).toBe(5);

    const revisions = await storage.getRevisionsByUser(userId);
    const test = revisions.find((revision) => revision.type === "test")!;
    const theory = revisions.find((revision) => revision.type === "revision")!;
    expect(test.completed).toBe(true);
    expect(theory.completed).toBe(false);

    // Desfazer devolve a revisão ao calendário.
    await storage.markRevisionCompleted(test.id, userId, false);
    const reopened = (await storage.getRevisionsByUser(userId)).find(
      (revision) => revision.id === test.id,
    )!;
    expect(reopened.completed).toBe(false);
  });

  it("autoCompleteTestAfter = 0 desliga a conclusão automática", async () => {
    await storage.updateUserSettings(userId, { autoCompleteTestAfter: 0 });
    await storage.createRevisions([
      {
        userId,
        topicId,
        scheduledDate: yesterdayIso(),
        type: "test",
        revisionNumber: 1,
      },
    ]);

    let completedAny = false;
    for (let index = 0; index < 6; index += 1) {
      const response = await post({
        disciplina: "Direito Constitucional",
        assunto: "Controle de Constitucionalidade",
        correctAdd: 1,
        errorAdd: 0,
        questionSignature: `qid:400${index}`,
      });
      if (response.body.autoCompleted) completedAny = true;
    }
    expect(completedAny).toBe(false);
    const revisions = await storage.getRevisionsByUser(userId);
    expect(revisions.every((revision) => !revision.completed)).toBe(true);
  });

  it("reclassificar um rótulo pendente grava alias e reatribui sem duplicar", async () => {
    for (let index = 0; index < 3; index += 1) {
      await post({
        disciplina: "Matéria Desconhecida",
        assunto: "Assunto XYZ Desconhecido",
        questionLabel: "Assunto XYZ Desconhecido",
        correctAdd: index === 0 ? 1 : 0,
        errorAdd: index === 0 ? 0 : 1,
        questionSignature: `qid:500${index}`,
      });
    }

    const pending = await listPendingClassifications(userId);
    expect(pending.total).toBe(3);
    expect(pending.groups).toHaveLength(1);
    expect(pending.groups[0].tecLabel).toBe("Assunto XYZ Desconhecido");

    const result = await resolvePendingClassification(userId, {
      tecLabel: "Assunto XYZ Desconhecido",
      action: "assign",
      topicId,
    });
    expect(result.ok).toBe(true);
    expect(result.updated).toBe(3);

    const settings = await storage.getUserSettings(userId);
    expect(settings?.tecTopicAliases?.["assunto xyz desconhecido"]).toBe(
      topicId,
    );

    const topics = await storage.getTopicsByUser(userId);
    const topic = topics.find((item) => item.id === topicId)!;
    // 1 acerto + 2 erros, contados UMA vez cada.
    expect(topic.performance?.correctCount).toBe(1);
    expect(topic.performance?.errorCount).toBe(2);
    expect(topic.performance?.questionsResolved).toBe(3);

    const attempts = await storage.getAllQuestionAttempts(userId);
    expect(attempts.every((attempt) => attempt.topicId === topicId)).toBe(true);
    expect(attempts.every((attempt) => !attempt.pendingClassification)).toBe(
      true,
    );

    // Reclassificar de novo não soma de novo.
    const again = await resolvePendingClassification(userId, {
      tecLabel: "Assunto XYZ Desconhecido",
      action: "assign",
      topicId,
    });
    expect(again.updated).toBe(0);
    const topicsAfter = await storage.getTopicsByUser(userId);
    expect(
      topicsAfter.find((item) => item.id === topicId)?.performance
        ?.questionsResolved,
    ).toBe(3);
  });

  it("a próxima questão do mesmo rótulo já entra no tópico (alias)", async () => {
    await resolvePendingClassification(userId, {
      tecLabel: "Assunto XYZ Desconhecido",
      action: "assign",
      topicId,
    });
    const response = await post({
      disciplina: "Matéria Desconhecida",
      assunto: "Assunto XYZ Desconhecido",
      questionLabel: "Assunto XYZ Desconhecido",
      correctAdd: 1,
      errorAdd: 0,
      questionSignature: "qid:6001",
    });
    expect(response.body.pending).toBe(false);
    expect(response.body.topicId).toBe(topicId);
  });

  it("+Acertei/+Errei manual e desfazer ajustam o tópico exatamente", async () => {
    const manual = await addManualAnswer(userId, { correct: true, topicId });
    expect(manual.ok).toBe(true);

    let topics = await storage.getTopicsByUser(userId);
    expect(
      topics.find((item) => item.id === topicId)?.performance?.correctCount,
    ).toBe(1);

    const undone = await undoLastAnswer(userId, {
      since: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(undone.ok).toBe(true);
    expect(undone.undone?.correct).toBe(true);

    topics = await storage.getTopicsByUser(userId);
    expect(
      topics.find((item) => item.id === topicId)?.performance?.correctCount,
    ).toBe(0);
    expect(await storage.getAllQuestionAttempts(userId)).toHaveLength(0);
  });

  it("liveActivity devolve contador, últimas respostas e janela", async () => {
    const since = new Date(Date.now() - 1000).toISOString();
    await post({
      disciplina: "Direito Constitucional",
      assunto: "Controle de Constitucionalidade",
      correctAdd: 1,
      errorAdd: 0,
      questionSignature: "qid:7001",
      timeSpentSeconds: 15,
    });
    await post({
      disciplina: "Desenvolvimento",
      assunto: "Blog",
      correctAdd: 1,
      errorAdd: 0,
      questionSignature: "qid:7002",
    });

    const activity = await buildTecLiveActivity(userId, since);
    expect(activity.count).toBe(2);
    expect(activity.correct).toBe(2);
    expect(activity.pending).toBe(1);
    expect(activity.attempts).toHaveLength(2);
    expect(activity.items.length).toBeGreaterThan(0);
    expect(activity.lastCaptureAt).toBeTruthy();
  });

  it("erro sem enunciado fica como 'enunciado pendente', sem placeholder enganoso", async () => {
    const response = await request(app)
      .post("/api/tec/wrong-question")
      .set("x-soe-token", VALID_TOKEN)
      .send({
        questionId: "#3872741",
        banca: "CEBRASPE",
        year: 2025,
        contest: "CGU",
        disciplina: "Direito Constitucional",
        assunto: "Controle de Constitucionalidade",
        statement: "",
        statementPending: true,
        alternatives: [],
      });

    expect(response.status).toBe(200);
    const errors = await storage.getQuestionErrorsByUser(userId);
    const saved = errors.items[0];
    expect(saved).toBeTruthy();
    expect(saved.statement).toContain("#3872741");
    expect(saved.statement).not.toContain("não capturado pelo TEC");
    expect(saved.statementPending).toBe(true);
  });

  it("cada resposta registra no máximo uma questão (invariante anti-tráfego)", async () => {
    const response = await post({
      disciplina: "Direito Constitucional",
      assunto: "Controle de Constitucionalidade",
      correctAdd: 1,
      errorAdd: 1,
      questionSignature: "qid:8001",
    });
    expect(response.status).toBe(400);
    const attempts = await storage.getAllQuestionAttempts(userId);
    expect(attempts).toHaveLength(0);
  });
});
