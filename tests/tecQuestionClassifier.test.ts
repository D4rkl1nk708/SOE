/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyTecQuestion,
  getTecAiCallsThisHour,
  resetTecAiRateLimiter,
} from "../server/tecQuestionClassifier";
import { isGenericTecLabel, normalizeTecLabel } from "../shared/tecLabels";

const disciplines = [
  { id: 1, name: "Direito Constitucional" },
  { id: 2, name: "Direito Previdenciário" },
  { id: 3, name: "Português" },
];

const topics = [
  { id: 11, name: "Controle de constitucionalidade", disciplineId: 1 },
  { id: 12, name: "Direitos fundamentais", disciplineId: 1 },
  { id: 21, name: "RGPS", disciplineId: 2 },
  { id: 31, name: "Concordância verbal", disciplineId: 3 },
];

const baseSettings = { aiApiKey: "chave-de-teste", aiProvider: "gemini" };

function jsonAi(payload: Record<string, unknown>) {
  return vi.fn(async () => `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``);
}

beforeEach(() => {
  resetTecAiRateLimiter();
});

describe("shared/tecLabels", () => {
  it("reconhece rótulos de navegação e preserva assuntos reais", () => {
    for (const label of [
      "Blog",
      "Guias",
      "TEC Concursos",
      "Questão TEC",
      "Geral",
      "tecconcursos",
      "questoes",
      "cadernos",
      "desempenho",
      "estatisticas",
      "1234",
      "A",
      "",
    ]) {
      expect(isGenericTecLabel(label)).toBe(true);
    }
    expect(isGenericTecLabel("Controle de constitucionalidade")).toBe(false);
    expect(normalizeTecLabel("TEC - Direito Constitucional")).toBe(
      "direito constitucional",
    );
  });
});

describe("classifyTecQuestion — local primeiro", () => {
  it("rótulo e disciplina genéricos: pendência imediata sem IA", async () => {
    const aiCall = jsonAi({ topicId: 11, confidence: 1, reason: "chute" });
    const result = await classifyTecQuestion({
      userId: 1,
      tecDiscipline: "Guias",
      tecLabel: "Blog",
      disciplines,
      topics,
      settings: baseSettings,
      aiCall,
    });

    expect(result.unresolved).toBe(true);
    expect(result.source).toBe("none");
    expect(result.suggestion).toBeNull();
    expect(result.topicId).toBeNull();
    expect(result.usedAi).toBe(false);
    expect(aiCall).not.toHaveBeenCalled();
  });

  it("rótulo genérico com disciplina real: pendência com sugestão, sem IA", async () => {
    const aiCall = jsonAi({ topicId: 11, confidence: 1, reason: "chute" });
    const result = await classifyTecQuestion({
      userId: 1,
      tecDiscipline: "Direito Constitucional",
      tecLabel: "Estatísticas",
      disciplines,
      topics,
      settings: baseSettings,
      aiCall,
    });

    expect(result.unresolved).toBe(true);
    expect(result.topicId).toBeNull();
    expect(result.suggestion?.disciplineId).toBe(1);
    expect(result.usedAi).toBe(false);
    expect(aiCall).not.toHaveBeenCalled();
  });

  it("alias de rótulo resolve com confiança 1 sem IA", async () => {
    const aiCall = jsonAi({ topicId: 12, confidence: 1, reason: "chute" });
    const result = await classifyTecQuestion({
      userId: 1,
      tecDiscipline: "Direito Constitucional",
      tecLabel: "Controle concentrado",
      disciplines,
      topics,
      settings: {
        ...baseSettings,
        tecTopicAliases: { "controle concentrado": 11 },
      },
      aiCall,
    });

    expect(result.unresolved).toBe(false);
    expect(result.source).toBe("alias");
    expect(result.confidence).toBe(1);
    expect(result.disciplineId).toBe(1);
    expect(result.topicId).toBe(11);
    expect(result.usedAi).toBe(false);
    expect(aiCall).not.toHaveBeenCalled();
  });

  it("alias de disciplina resolve o tópico reconhecido", async () => {
    const aiCall = jsonAi({ topicId: 12, confidence: 1, reason: "chute" });
    const result = await classifyTecQuestion({
      userId: 1,
      tecDiscipline: "Prev",
      tecLabel: "RGPS",
      disciplines,
      topics,
      settings: {
        ...baseSettings,
        tecDisciplineAliases: { prev: 2 },
      },
      aiCall,
    });

    expect(result.unresolved).toBe(false);
    expect(result.source).toBe("alias");
    expect(result.disciplineId).toBe(2);
    expect(result.topicId).toBe(21);
    expect(aiCall).not.toHaveBeenCalled();
  });

  it("match local com confiança >= 0,75 resolve sem IA", async () => {
    const aiCall = jsonAi({ topicId: 12, confidence: 1, reason: "chute" });
    const result = await classifyTecQuestion({
      userId: 1,
      tecDiscipline: "Direito Constitucional",
      tecLabel: "Controle de constitucionalidade",
      disciplines,
      topics,
      settings: baseSettings,
      aiCall,
    });

    expect(result.unresolved).toBe(false);
    expect(result.source).toBe("local");
    expect(result.topicId).toBe(11);
    expect(result.disciplineId).toBe(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    expect(result.usedAi).toBe(false);
    expect(aiCall).not.toHaveBeenCalled();
  });

  it("disciplina casada e tópico não: pendência com disciplina, nada é criado", async () => {
    const aiCall = jsonAi({ topicId: 11, confidence: 1, reason: "chute" });
    const result = await classifyTecQuestion({
      userId: 1,
      tecDiscipline: "Direito Constitucional",
      tecLabel: "Hermenêutica constitucional",
      disciplines,
      topics,
      settings: baseSettings,
      aiCall,
    });

    expect(result.unresolved).toBe(true);
    expect(result.source).toBe("none");
    expect(result.topicId).toBeNull();
    expect(result.suggestion?.disciplineId).toBe(1);
    expect(result.suggestion?.createTopic).toBeUndefined();
    expect(result.suggestion?.createDiscipline).toBeUndefined();
    expect(aiCall).not.toHaveBeenCalled();
  });
});

describe("classifyTecQuestion — IA como último recurso", () => {
  const ambiguous = {
    userId: 7,
    tecDiscipline: "Assunto avulso",
    tecLabel: "Benefícios previdenciários",
    disciplines,
    topics,
  };

  it("IA resolve e devolve entrada de cache do rótulo", async () => {
    const aiCall = jsonAi({
      disciplineId: 2,
      topicId: 21,
      confidence: 0.92,
      reason: "RGPS é benefício previdenciário",
    });

    const result = await classifyTecQuestion({
      ...ambiguous,
      settings: baseSettings,
      aiCall,
    });

    expect(aiCall).toHaveBeenCalledTimes(1);
    expect(result.unresolved).toBe(false);
    expect(result.source).toBe("ai");
    expect(result.topicId).toBe(21);
    expect(result.disciplineId).toBe(2);
    expect(result.usedAi).toBe(true);
    expect(result.aiCacheEntry?.key).toBe("beneficios previdenciarios");
    expect(result.aiCacheEntry?.value.topicId).toBe(21);
  });

  it("o prompt pede JSON e trunca o enunciado em 600 caracteres", async () => {
    const aiCall = vi.fn(
      async (_prompt: string) => '{"topicId": 21, "confidence": 0.9}',
    );

    await classifyTecQuestion({
      ...ambiguous,
      statementSnippet: "x".repeat(2000),
      settings: baseSettings,
      aiCall,
    });

    const prompt = String(aiCall.mock.calls[0][0]);
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("confidence");
    expect(prompt.length).toBeLessThan(2500);
    expect(prompt).not.toContain("x".repeat(700));
  });

  it("quota/429 vira pendência, sem lançar e sem usar IA", async () => {
    const aiCall = vi.fn(async () => {
      throw new Error("QUOTA_EXCEEDED: 429 too many requests");
    });

    const result = await classifyTecQuestion({
      ...ambiguous,
      settings: baseSettings,
      aiCall,
    });

    expect(result.unresolved).toBe(true);
    expect(result.source).toBe("none");
    expect(result.usedAi).toBe(false);
    expect(result.reason.toLowerCase()).toContain("cota");
    expect(result.aiCacheEntry).toBeNull();
  });

  it("JSON inválido vira pendência sem lançar", async () => {
    const aiCall = vi.fn(async () => "não consegui classificar essa questão");
    const result = await classifyTecQuestion({
      ...ambiguous,
      settings: baseSettings,
      aiCall,
    });

    expect(result.unresolved).toBe(true);
    expect(result.usedAi).toBe(false);
    expect(result.reason).toContain("JSON");
  });

  it("sem chave configurada não chama IA", async () => {
    const aiCall = vi.fn(async () => '{"topicId": 21, "confidence": 0.9}');
    const result = await classifyTecQuestion({
      ...ambiguous,
      settings: { aiApiKey: "   " },
      aiCall,
    });

    expect(aiCall).not.toHaveBeenCalled();
    expect(result.unresolved).toBe(true);
    expect(result.usedAi).toBe(false);
    expect(result.reason).toContain("API Key");
  });

  it("cache do rótulo evita a segunda chamada de IA", async () => {
    const aiCall = jsonAi({ topicId: 21, confidence: 0.9, reason: "cache" });

    const first = await classifyTecQuestion({
      ...ambiguous,
      settings: baseSettings,
      aiCall,
    });
    const second = await classifyTecQuestion({
      ...ambiguous,
      settings: baseSettings,
      aiCall,
    });

    expect(aiCall).toHaveBeenCalledTimes(1);
    expect(first.source).toBe("ai");
    expect(second.source).toBe("ai");
    expect(second.topicId).toBe(21);
    expect(second.usedAi).toBe(false);
  });

  it("cache persistido em settings resolve sem IA", async () => {
    const aiCall = jsonAi({
      topicId: 12,
      confidence: 1,
      reason: "não deveria",
    });

    const result = await classifyTecQuestion({
      userId: 9,
      tecDiscipline: "Assunto avulso",
      tecLabel: "Benefícios previdenciários",
      disciplines,
      topics,
      settings: {
        ...baseSettings,
        tecLabelAiCache: {
          "beneficios previdenciarios": {
            disciplineId: 2,
            topicId: 21,
            confidence: 0.88,
            reason: "veio do cache",
          },
        },
      },
      aiCall,
    });

    expect(aiCall).not.toHaveBeenCalled();
    expect(result.unresolved).toBe(false);
    expect(result.source).toBe("ai");
    expect(result.topicId).toBe(21);
    expect(result.usedAi).toBe(false);
  });

  it("limite por hora bloqueia a 11ª chamada", async () => {
    const aiCall = vi.fn(
      async () =>
        '{"disciplineId": null, "topicId": null, "confidence": 0.2, "reason": "incerto"}',
    );

    for (let index = 1; index <= 10; index++) {
      const result = await classifyTecQuestion({
        userId: 42,
        tecDiscipline: "Legislação avulsa",
        tecLabel: `Tema especifico ${index}`,
        disciplines: [],
        topics: [],
        settings: { ...baseSettings, tecAiClassifyPerHour: 10 },
        aiCall,
      });
      expect(result.usedAi).toBe(true);
    }

    expect(aiCall).toHaveBeenCalledTimes(10);
    expect(getTecAiCallsThisHour(42)).toBe(10);

    const blocked = await classifyTecQuestion({
      userId: 42,
      tecDiscipline: "Legislação avulsa",
      tecLabel: "Tema especifico 11",
      disciplines: [],
      topics: [],
      settings: { ...baseSettings, tecAiClassifyPerHour: 10 },
      aiCall,
    });

    expect(aiCall).toHaveBeenCalledTimes(10);
    expect(blocked.unresolved).toBe(true);
    expect(blocked.usedAi).toBe(false);
    expect(blocked.reason).toContain("Limite");
  });

  it("id inexistente devolvido pela IA é descartado", async () => {
    const aiCall = jsonAi({
      disciplineId: 2,
      topicId: 999,
      confidence: 0.99,
      reason: "inventou id",
    });

    const result = await classifyTecQuestion({
      ...ambiguous,
      settings: baseSettings,
      aiCall,
    });

    expect(result.topicId).toBeNull();
    expect(result.unresolved).toBe(true);
    expect(result.suggestion?.topicId).toBeNull();
    expect(result.suggestion?.disciplineId).toBe(2);
    // o acervo não tem o tópico 999
    expect(topics.some((topic) => topic.id === 999)).toBe(false);
  });

  it("sugestão de criação fica apenas como sugestão", async () => {
    const aiCall = jsonAi({
      confidence: 0.6,
      reason: "não existe nada parecido",
      createDiscipline: "Direito Ambiental",
      createTopic: "Licenciamento ambiental",
    });

    const result = await classifyTecQuestion({
      ...ambiguous,
      settings: baseSettings,
      aiCall,
    });

    expect(result.unresolved).toBe(true);
    expect(result.topicId).toBeNull();
    expect(result.disciplineId).toBeNull();
    expect(result.suggestion?.createDiscipline).toBe("Direito Ambiental");
    expect(result.suggestion?.createTopic).toBe("Licenciamento ambiental");
  });

  it("resetTecAiRateLimiter zera o contador em memória", async () => {
    const aiCall = jsonAi({ topicId: 21, confidence: 0.9, reason: "ok" });
    await classifyTecQuestion({ ...ambiguous, settings: baseSettings, aiCall });

    expect(getTecAiCallsThisHour(7)).toBe(1);
    resetTecAiRateLimiter();
    expect(getTecAiCallsThisHour(7)).toBe(0);
  });
});
