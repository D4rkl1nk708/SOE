import { describe, expect, it } from "vitest";
import { bancaPaceSeconds, summarizePace } from "../shared/examPace";

describe("ritmo de prova (item 4)", () => {
  it("banca define o alvo por questão (Cebraspe 90s, FGV 120s, resto 90s)", () => {
    expect(bancaPaceSeconds("CEBRASPE (CESPE)")).toBe(90);
    expect(bancaPaceSeconds("FGV")).toBe(120);
    expect(bancaPaceSeconds("FCC")).toBe(90);
    expect(bancaPaceSeconds("Banca Desconhecida")).toBe(90);
    expect(bancaPaceSeconds(null)).toBe(90);
  });

  it("calcula média, mediana e percentual acima do alvo", () => {
    const answers = [
      { id: "q1", seconds: 60, answered: true },
      { id: "q2", seconds: 120, answered: true },
      { id: "q3", seconds: 180, answered: true },
      { id: "q4", seconds: 240, answered: true },
    ];
    const pace = summarizePace(answers, 90, 4);
    expect(pace.answered).toBe(4);
    expect(pace.totalSeconds).toBe(600);
    expect(pace.averageSeconds).toBe(150);
    expect(pace.medianSeconds).toBe(150);
    expect(pace.aboveTargetCount).toBe(3);
    expect(pace.pctAboveTarget).toBe(75);
    expect(pace.secondsOverTarget).toBe(30 + 90 + 150);
    expect(pace.slowestTopic).toBeNull();
  });

  it("sem respostas: tudo zero, sem NaN e com frase honesta", () => {
    const pace = summarizePace([], 90, 50);
    expect(pace.answered).toBe(0);
    expect(pace.blank).toBe(50);
    expect(pace.averageSeconds).toBe(0);
    expect(pace.medianSeconds).toBe(0);
    expect(pace.pctAboveTarget).toBe(0);
    expect(pace.secondsOverTarget).toBe(0);
    expect(pace.projectedQuestionsAtPace).toBe(0);
    expect(pace.blankAtTargetPace).toBe(50);
    expect(pace.conclusion).toMatch(/não guardou tempo por questão/);
  });

  it("tempo zero não divide por zero", () => {
    const pace = summarizePace(
      [
        { id: "q1", seconds: 0, answered: true },
        { id: "q2", seconds: 0, answered: true },
      ],
      90,
      2,
    );
    expect(pace.totalSeconds).toBe(0);
    expect(pace.averageSeconds).toBe(0);
    expect(Number.isFinite(pace.medianSeconds)).toBe(true);
    expect(pace.conclusion).toMatch(/não guardou tempo/);
  });

  it("projeta quantas questões faltariam no ritmo alvo (brancos)", () => {
    // 20 respostas em 1800s (90s de média) e prova de 50 questões.
    const answers = Array.from({ length: 20 }, (_, index) => ({
      id: `q${index}`,
      seconds: 90,
      answered: true,
    }));
    const pace = summarizePace(answers, 90, 50);
    expect(pace.projectedQuestionsAtPace).toBe(20);
    expect(pace.blankAtTargetPace).toBe(30);
    expect(pace.blank).toBe(30);
  });

  it("atraso vira questão perdida; entrar no ritmo não inventa perda", () => {
    const onPace = summarizePace(
      Array.from({ length: 4 }, (_, i) => ({ id: `q${i}`, seconds: 90 })),
      90,
      4,
    );
    expect(onPace.questionsLostToLateness).toBe(0);

    const late = summarizePace(
      [
        { id: "q1", seconds: 200 },
        { id: "q2", seconds: 200 },
      ],
      90,
      10,
    );
    // 2 × 110s acima do alvo = 220s = 2 questões de 90s que não couberam.
    expect(late.questionsLostToLateness).toBe(2);
  });

  it("aponta o tópico onde perdeu mais tempo e conclui com números", () => {
    const answers = [
      { id: "q1", seconds: 200, topicName: "CF/88 arts. 18 a 43" },
      { id: "q2", seconds: 210, topicName: "CF/88 arts. 18 a 43" },
      { id: "q3", seconds: 100, topicName: "Organização dos Poderes" },
      { id: "q4", seconds: 30, topicName: "Organização dos Poderes" },
    ];
    const pace = summarizePace(answers, 90, 4);
    expect(pace.slowestTopic?.name).toBe("CF/88 arts. 18 a 43");
    expect(pace.slowestTopic?.aboveTarget).toBe(2);
    expect(pace.slowestTopic?.secondsOver).toBe(110 + 120);
    expect(pace.conclusion).toMatch(/CF\/88 arts. 18 a 43/);
    expect(pace.conclusion).toMatch(/corte para 90s/);
  });

  it("distribuição (histograma) soma o total de tempos medidos", () => {
    const answers = [
      { id: "q1", seconds: 20 },
      { id: "q2", seconds: 45 },
      { id: "q3", seconds: 95 },
      { id: "q4", seconds: 400 },
    ];
    const pace = summarizePace(answers, 90, 4);
    const total = pace.histogram.reduce((sum, bucket) => sum + bucket.count, 0);
    expect(total).toBe(4);
    expect(pace.histogram.some((bucket) => bucket.to === null)).toBe(true);
  });

  it("aceita o mapa de respostas do simulado (questionId -> letra)", () => {
    const pace = summarizePace({ q1: "A", q2: "B", q3: "" }, 90, 3);
    expect(pace.answered).toBe(2);
    expect(pace.blank).toBe(1);
  });

  it("projeção de acerto só existe com acerto registrado", () => {
    const answers = [
      { id: "q1", seconds: 90, answered: true, correct: true },
      { id: "q2", seconds: 90, answered: true, correct: false },
    ];
    const pace = summarizePace(answers, 90, 4);
    // 2 questões em 180s a 90s = 2 alcançadas; acerto 50% → 1 acerto projetado.
    expect(pace.projectedQuestionsAtPace).toBe(2);
    expect(pace.projectedCorrect).toBe(1);
  });
});
