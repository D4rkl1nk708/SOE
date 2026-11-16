import { describe, it, expect } from "vitest";
import {
  decideAfterAnswer,
  decideStudyMode,
  decideReviewGap,
  decideNextBlock,
} from "../shared/decisions";

describe("decideAfterAnswer", () => {
  it("manda encerrar depois de 3 erros seguidos", () => {
    const d = decideAfterAnswer({ correct: false, consecutiveErrors: 3 });
    expect(d.action).toBe("encerrar");
    expect(d.why).toContain("Três erros");
  });

  it("erro em questão tida como certa pede explicação", () => {
    const d = decideAfterAnswer({
      correct: false,
      confidence: "certeza",
      consecutiveErrors: 1,
    });
    expect(d.action).toBe("explicar");
  });

  it("erro comum pede revisão imediata", () => {
    expect(
      decideAfterAnswer({ correct: false, confidence: "acho" }).action,
    ).toBe("revisar_agora");
  });

  it("acerto no chute vira flashcard", () => {
    const d = decideAfterAnswer({ correct: true, confidence: "chute" });
    expect(d.action).toBe("flashcard");
    expect(d.why).toContain("chute");
  });

  it("acerto com tempo cumprido manda reagendar", () => {
    const d = decideAfterAnswer({
      correct: true,
      confidence: "certeza",
      elapsedMinutes: 16,
      plannedMinutes: 15,
    });
    expect(d.action).toBe("reagendar");
  });

  it("acerto normal segue praticando", () => {
    const d = decideAfterAnswer({
      correct: true,
      confidence: "acho",
      elapsedMinutes: 5,
      plannedMinutes: 15,
    });
    expect(d.action).toBe("praticar");
  });
});

describe("decideStudyMode", () => {
  it("procedimento com tempo vira micro-mundo", () => {
    const d = decideStudyMode({
      conceptual: false,
      procedural: true,
      minutesAvailable: 15,
    });
    expect(d.mode).toBe("micro_world");
  });

  it("conceitual vira Feynman", () => {
    const d = decideStudyMode({ conceptual: true, minutesAvailable: 15 });
    expect(d.mode).toBe("feynman");
  });

  it("conceitual com erro recorrente explica o motivo", () => {
    const d = decideStudyMode({
      conceptual: true,
      recurringErrors: true,
      minutesAvailable: 20,
    });
    expect(d.mode).toBe("feynman");
    expect(d.why).toContain("recorrente");
  });

  it("factual puro vira flashcard", () => {
    const d = decideStudyMode({ conceptual: false, minutesAvailable: 10 });
    expect(d.mode).toBe("flashcard");
  });

  it("procedimento sem tempo suficiente não vira micro-mundo", () => {
    const d = decideStudyMode({
      conceptual: false,
      procedural: true,
      minutesAvailable: 5,
    });
    expect(d.mode).not.toBe("micro_world");
  });
});

describe("decideReviewGap", () => {
  it("acurácia baixa revisa amanhã", () => {
    expect(decideReviewGap({ accuracy: 40 }).days).toBe(1);
  });

  it("erro com acurácia razoável revisa em 2 dias", () => {
    expect(decideReviewGap({ accuracy: 65, hadErrors: true }).days).toBe(2);
  });

  it("acerto médio revisa em 3 dias", () => {
    expect(decideReviewGap({ accuracy: 65 }).days).toBe(3);
  });

  it("acerto bom revisa em uma semana", () => {
    expect(decideReviewGap({ accuracy: 75 }).days).toBe(7);
  });

  it("acerto alto com prontidão alta espaça mais", () => {
    expect(decideReviewGap({ accuracy: 95, readiness: 85 }).days).toBe(16);
  });

  it("com FSRS não decide nada", () => {
    expect(decideReviewGap({ accuracy: 90, hasFsrs: true }).days).toBe(0);
  });
});

describe("decideNextBlock", () => {
  const blocks = [
    { id: "rev-1", kind: "revisao", minutes: 15, topicId: 1, score: 1000 },
    { id: "weak-2", kind: "questoes", minutes: 25, topicId: 2, score: 60 },
    { id: "weak-3", kind: "estudo", minutes: 30, topicId: 3, score: 90 },
  ];

  it("respeita o tempo disponível", () => {
    const d = decideNextBlock({ blocks, minutesAvailable: 20 });
    expect(d.block?.minutes).toBeLessThanOrEqual(20);
  });

  it("prioriza revisão vencida", () => {
    const d = decideNextBlock({
      blocks,
      overdueRevisions: 2,
      minutesAvailable: 60,
    });
    expect(d.block?.id).toBe("rev-1");
    expect(d.why).toContain("revisão");
  });

  it("não repete o tópico da última sessão", () => {
    const d = decideNextBlock({
      blocks,
      minutesAvailable: 60,
      lastTopicId: 1,
    });
    expect(d.block?.topicId).not.toBe(1);
  });

  it("avisa quando nada cabe no tempo", () => {
    const d = decideNextBlock({ blocks, minutesAvailable: 5 });
    expect(d.block).toBeNull();
    expect(d.why).toContain("Nenhum bloco");
  });

  it("cai no mesmo tema só quando é a única opção", () => {
    const d = decideNextBlock({
      blocks: [{ id: "a", kind: "estudo", minutes: 20, topicId: 7, score: 10 }],
      minutesAvailable: 30,
      lastTopicId: 7,
    });
    expect(d.block?.topicId).toBe(7);
    expect(d.why).toContain("mesmo tema");
  });
});
