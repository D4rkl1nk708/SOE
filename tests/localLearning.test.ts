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
import type { SavedLesson } from "../shared/topicLessons";

const entry: Omit<SavedLesson, "id" | "createdAt"> = {
  topicName: "Memória virtual (offline)",
  disciplineName: "Arquitetura",
  title: "Aula offline",
  html: "<!doctype html><html><body><script>1</script></body></html>",
  steps: [
    { title: "Um", text: "Passo um." },
    { title: "Dois", text: "Passo dois." },
    { title: "Três", text: "Passo três." },
  ],
  interaction: "slider",
  question: {
    prompt: "Pergunta?",
    options: ["a", "b"],
    correctIndex: 0,
    feedback: "porque sim",
  },
  limits: ["ignora TLB"],
};

describe("Caderno Vivo offline (APK)", () => {
  beforeAll(async () => {
    await localDb.localAuthMe();
  });

  it("cria, lista e apaga aulas por tópico no próprio aparelho", async () => {
    const saved = await localDb.localLearningSaveLesson(entry);
    expect(saved.id).toMatch(/^aula-/);

    const listed = await localDb.localLearningLessons({
      topicName: "memória VIRTUAL (offline)",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0].title).toBe("Aula offline");

    const deleted = await localDb.localLearningDeleteLesson({
      lessonId: saved.id,
    });
    expect(deleted.success).toBe(true);
    expect(
      await localDb.localLearningLessons({ topicName: entry.topicName }),
    ).toEqual([]);
    await expect(
      localDb.localLearningDeleteLesson({ lessonId: saved.id }),
    ).rejects.toThrow(/não encontrada/i);
  });

  it("marca aula estudada uma vez por dia", async () => {
    const first = await localDb.localMarkLessonStudied({
      topicName: "Controle de constitucionalidade",
    });
    expect(first.recorded).toBe(true);

    const second = await localDb.localMarkLessonStudied({
      topicName: "Controle de constitucionalidade",
    });
    expect(second.recorded).toBe(false);

    const status = await localDb.localLessonStudiedToday({
      topicName: "Controle de constitucionalidade",
    });
    expect(status.studied).toBe(true);
  });

  it("diz com clareza o que depende do servidor", async () => {
    expect(() => localDb.localStartGeneration()).toThrow(
      /precisa do SOE no computador/i,
    );
    await expect(localDb.localLearningImportPdf()).rejects.toThrow(
      /precisa do SOE no computador/i,
    );
    await expect(localDb.localLearningGet()).rejects.toThrow(
      /fica no SOE do computador/i,
    );
  });

  it("analogias e micro-mundos continuam disponíveis offline", async () => {
    await localDb.localLearningSaveAnalogy({
      topicName: "Licitação",
      analogy: "Licitação é como um leilão com regras",
      mapping: ["edital = convite"],
      breaks: "quebra no sigilo",
      bestFor: "primeira leitura",
    });
    const analogies = await localDb.localLearningAnalogies({
      topicName: "licitação",
    });
    expect(analogies).toHaveLength(1);

    await localDb.localLearningSaveMicroWorld({
      topicName: "Licitação",
      title: "Fases",
      html: "<html></html>",
      controls: ["slider"],
      challenges: [],
      limits: [],
    });
    const worlds = await localDb.localLearningMicroWorlds({
      topicName: "Licitação",
    });
    expect(worlds).toHaveLength(1);
    expect(worlds[0].title).toBe("Fases");
  });
});
