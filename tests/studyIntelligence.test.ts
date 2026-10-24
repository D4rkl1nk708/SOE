/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as storage from "../server/jsonStorage";
import { getStudyOverview } from "../server/studyIntelligence";

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
