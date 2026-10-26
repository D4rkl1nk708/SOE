/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as storage from "../server/jsonStorage";
import {
  getStudyOverview,
  previewFsrsSchedule,
} from "../server/studyIntelligence";

const TEST_DIR = path.join(process.cwd(), "test-data-study-intel");

describe("studyIntelligence", () => {
  beforeEach(() => {
    storage.setDataDir(TEST_DIR);
    storage.resetCache();
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  it("calcula cobertura, domínio e plano a partir do edital", async () => {
    await storage.upsertUser({ openId: "local-user", name: "Local" });
    const user = (await storage.getUserByOpenId("local-user"))!;
    const discipline = await storage.createDiscipline({
      userId: user.id,
      name: "Direito Constitucional",
      color: "#3b82f6",
      weight: 1,
    });
    const topic = await storage.createTopic({
      userId: user.id,
      disciplineId: discipline.id,
      name: "Controle de Constitucionalidade",
      studyDate: "2026-01-01",
      notes: null,
    });
    await storage.setTopicPerformance(topic.id, user.id, {
      correctCount: 6,
      errorCount: 6,
    });
    await storage.updateUserSettings(user.id, {
      dailyGoalMinutes: 120,
      editalRows: [
        {
          id: "r1",
          discipline: "Direito Constitucional",
          topic: "Controle de Constitucionalidade",
          completed: false,
          incidencia: 0.8,
        },
        {
          id: "r2",
          discipline: "Direito Constitucional",
          topic: "Tópico ainda não cadastrado",
          completed: false,
          incidencia: 0.4,
        },
      ],
    });

    const overview = await getStudyOverview(user.id, 120);

    expect(overview.coverage.totalRows).toBe(2);
    expect(overview.coverage.mappedRows).toBe(1);
    expect(overview.coverage.unmapped).toHaveLength(1);
    expect(overview.coverage.disciplines[0].name).toBe(
      "Direito Constitucional",
    );
    expect(overview.mastery.topics).toBe(1);
    expect(overview.plan.dailyMinutes).toBe(120);
    expect(overview.plan.blocks.length).toBeGreaterThan(0);
    expect(overview.plan.blocks[0].minutes).toBeGreaterThan(0);
  });

  it("usa a meta diária quando nenhum tempo é informado", async () => {
    await storage.upsertUser({ openId: "local-user", name: "Local" });
    const user = (await storage.getUserByOpenId("local-user"))!;
    await storage.updateUserSettings(user.id, { dailyGoalMinutes: 90 });

    const overview = await getStudyOverview(user.id);
    expect(overview.plan.dailyMinutes).toBe(90);
  });
});

describe("studyIntelligence — lentes e calibração", () => {
  beforeEach(() => {
    storage.setDataDir(TEST_DIR);
    storage.resetCache();
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  it("separa rotina base e edital sem duplicar o tópico", async () => {
    await storage.upsertUser({ openId: "local-user", name: "Local" });
    const user = (await storage.getUserByOpenId("local-user"))!;
    const base = await storage.createDiscipline({
      userId: user.id,
      name: "Direito Administrativo",
      color: "#3b82f6",
      weight: 1,
    });
    const other = await storage.createDiscipline({
      userId: user.id,
      name: "Auditoria",
      color: "#f59e0b",
      weight: 1,
    });
    const baseTopic = await storage.createTopic({
      userId: user.id,
      disciplineId: base.id,
      name: "Atos Administrativos",
      studyDate: "2026-01-01",
      notes: null,
    });
    const otherTopic = await storage.createTopic({
      userId: user.id,
      disciplineId: other.id,
      name: "Evidências",
      studyDate: "2026-01-01",
      notes: null,
    });
    await storage.setTopicPerformance(baseTopic.id, user.id, {
      correctCount: 8,
      errorCount: 2,
    });
    await storage.updateUserSettings(user.id, {
      baseDisciplineIds: [base.id],
      editalRows: [
        {
          id: "r1",
          discipline: "Auditoria",
          topic: "Evidências",
          completed: false,
          incidencia: 0.9,
        },
      ],
      questionAttempts: [
        {
          id: "a1",
          topicId: baseTopic.id,
          answered: true,
          correct: false,
          confidence: "certeza",
          confidencePhase: "before_result",
          createdAt: "2026-01-01T10:00:00.000Z",
        },
        {
          id: "a2",
          topicId: baseTopic.id,
          answered: true,
          correct: true,
          confidence: "chute",
          confidencePhase: "before_result",
          createdAt: "2026-01-01T10:01:00.000Z",
        },
        {
          id: "a3",
          topicId: baseTopic.id,
          answered: false,
          correct: false,
          confidence: null,
          confidencePhase: null,
          createdAt: "2026-01-01T10:02:00.000Z",
        },
      ],
    });

    const overview = await getStudyOverview(user.id, 120);
    expect(overview.base.configured).toBe(true);
    expect(overview.base.disciplines).toBe(1);
    expect(overview.base.topics).toBe(1);
    expect(overview.base.studied).toBe(1);
    expect(overview.calibration.answered).toBe(2);
    expect(overview.calibration.skipped).toBe(1);
    expect(overview.calibration.overconfidence).toBe(1);
    expect(overview.calibration.underconfidence).toBe(1);
    const baseBlocks = overview.plan.blocks.filter(
      (block: any) => block.topicId === baseTopic.id,
    );
    expect(baseBlocks).toHaveLength(1);
    expect(baseBlocks[0].lens).toBe("base");
    const editalBlock = overview.plan.blocks.find(
      (block: any) => block.topicId === otherTopic.id,
    );
    expect(editalBlock?.lens).toBe("edital");
  });

  it("prévia FSRS não aplica nada e informa que 25/50 segue ativo", async () => {
    await storage.upsertUser({ openId: "local-user", name: "Local" });
    const user = (await storage.getUserByOpenId("local-user"))!;
    const discipline = await storage.createDiscipline({
      userId: user.id,
      name: "Português",
      color: "#3b82f6",
      weight: 1,
    });
    const topic = await storage.createTopic({
      userId: user.id,
      disciplineId: discipline.id,
      name: "Crase",
      studyDate: "2026-01-01",
      notes: null,
    });
    await storage.setTopicPerformance(topic.id, user.id, {
      correctCount: 7,
      errorCount: 3,
    });

    const preview = await previewFsrsSchedule(user.id, 30);
    expect(preview.applied).toBe(false);
    expect(preview.note).toMatch(/25\/50/);
    expect(preview.items.length).toBeGreaterThan(0);
  });
});
