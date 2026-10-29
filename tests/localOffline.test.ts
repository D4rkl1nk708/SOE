/** @vitest-environment node */
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/aiHelpers", () => ({
  callAiProvider: vi.fn().mockResolvedValue(""),
  extractJSON: vi.fn(),
  AiProvider: {},
}));

import * as localDb from "../client/src/lib/localDb";

describe("modo offline (APK)", () => {
  beforeAll(async () => {
    await localDb.localAuthMe();
  });

  it("study.overview entrega a forma que a tela de Plano espera", async () => {
    const overview: any = await localDb.localStudyOverview({ minutes: 120 });

    // o crash era "Cannot read properties of undefined (reading 'slice')"
    expect(Array.isArray(overview.mastery.topWeak)).toBe(true);
    expect(Array.isArray(overview.coverage.disciplines)).toBe(true);
    expect(Array.isArray(overview.coverage.priorities)).toBe(true);
    expect(Array.isArray(overview.plan.blocks)).toBe(true);
    expect(typeof overview.plan.date).toBe("string");
    expect(typeof overview.base.coveragePct).toBe("number");
    expect(typeof overview.calibration.accuracy).toBe("number");
  });

  it("revisão semanal offline devolve os campos usados no Plano", async () => {
    const weekly: any = await localDb.localStudyWeeklyReview();
    for (const key of [
      "answered",
      "accuracy",
      "minutes",
      "revisionsCompleted",
      "revisionsDueNext7",
      "wins",
      "risks",
    ]) {
      expect(weekly).toHaveProperty(key);
    }
    expect(Array.isArray(weekly.wins)).toBe(true);
  });

  it("registra resposta do TEC com confiança quando o tópico existe", async () => {
    const discipline = await localDb.localDisciplineCreate({
      name: "Disciplina Offline",
      color: "#0066CC",
      weight: 1,
    });
    await localDb.localTopicCreate({
      name: "Tema Offline",
      disciplineId: discipline.id,
    });

    const result = await localDb.localRecordTecAnswer({
      disciplina: "Disciplina Offline",
      assunto: "Tema Offline",
      correct: true,
      confidence: "chute",
      seconds: 30,
    });

    expect(result.ok).toBe(true);

    const user: any = await localDb.localAuthMe();
    const attempts = user.settings.questionAttempts || [];
    const last = attempts[attempts.length - 1];
    expect(last.confidence).toBe("chute");
    expect(last.source).toBe("tec");
    expect(last.correct).toBe(true);
  });

  it("importação de caderno só aumenta os totais e ignora nome desconhecido", async () => {
    const discipline = await localDb.localDisciplineCreate({
      name: "Disciplina Caderno",
      color: "#0066CC",
      weight: 1,
    });
    const topic = await localDb.localTopicCreate({
      name: "Tema Caderno",
      disciplineId: discipline.id,
    });
    await localDb.localTopicSetPerformance({
      topicId: topic.id,
      correctCount: 2,
      errorCount: 1,
    });

    const first = await localDb.localImportCaderno({
      rows: [
        {
          disciplina: "Disciplina Caderno",
          assunto: "Tema Caderno",
          acertos: 10,
          erros: 3,
        },
        { disciplina: "Fantasma", assunto: "Nada", acertos: 5, erros: 0 },
      ],
    });

    expect(first.imported).toBe(1);
    expect(first.skipped).toBe(1);

    const after = await localDb.localTopicList({
      disciplineId: discipline.id,
    });
    const updated = after.topics.find((item) => item.id === topic.id)!;
    expect(updated.performance?.correctCount).toBe(10);
    expect(updated.performance?.errorCount).toBe(3);

    // valores menores não reduzem o histórico
    const second = await localDb.localImportCaderno({
      rows: [
        {
          disciplina: "Disciplina Caderno",
          assunto: "Tema Caderno",
          acertos: 1,
          erros: 1,
        },
      ],
    });
    expect(second.imported).toBe(0);
    const stable = await localDb.localTopicList({
      disciplineId: discipline.id,
    });
    const kept = stable.topics.find((item) => item.id === topic.id)!;
    expect(kept.performance?.correctCount).toBe(10);
  });

  it("devolve motivo claro quando o tópico não existe", async () => {
    const result = await localDb.localRecordTecAnswer({
      disciplina: "Não Existe",
      assunto: "Nada",
      correct: false,
      confidence: null,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("discipline_not_found");
  });
});
