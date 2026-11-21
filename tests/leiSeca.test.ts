import { describe, expect, it } from "vitest";
import {
  LEI_SECA_DECK,
  buildCardsFromErrors,
  buildCardsFromTopicNotes,
  buildLeiSecaCards,
  detectLeiSecaCandidates,
  extractArticleMentions,
  resolveDailyCap,
  selectLeiSecaToday,
  summarizeLeiSecaDeck,
} from "../shared/leiSeca";

const disciplines = [
  { id: 1, name: "Direito Constitucional" },
  { id: 2, name: "Direito Administrativo" },
];

const topic = (
  id: number,
  name: string,
  questionsResolved: number,
  accuracy: number,
  extra: Record<string, unknown> = {},
) => ({
  id,
  name,
  disciplineId: 1,
  performance: { questionsResolved, accuracy },
  ...extra,
});

describe("lei seca (item 3)", () => {
  it("candidato exige volume >= 10 E acerto < 60", () => {
    const candidates = detectLeiSecaCandidates(disciplines, [
      topic(1, "CF/88 arts. 18 a 43", 20, 49),
      topic(2, "Pouca amostra", 9, 20),
      topic(3, "Acerto bom", 40, 70),
      topic(4, "CF/88 art. 37", 12, 33),
    ]);
    // art. 37 tem gap maior (33%) e vence o desempate por prioridade.
    expect(candidates.map((item) => item.topicId)).toEqual([4, 1]);
  });

  it("prioriza quem cita artigo de lei", () => {
    const candidates = detectLeiSecaCandidates(disciplines, [
      topic(1, "Organização dos Poderes", 30, 45),
      topic(2, "CF/88 arts. 18 a 43", 12, 55),
    ]);
    expect(candidates[0].topicId).toBe(2);
    expect(candidates[0].articleMentions[0]).toMatch(/art/i);
  });

  it("extrai as menções de artigo sem duplicar", () => {
    expect(extractArticleMentions("CF/88 arts. 18 a 43 e art. 37")).toEqual([
      "arts. 18 a 43",
      "art. 37",
    ]);
    expect(extractArticleMentions("Sem artigo")).toEqual([]);
  });

  it("cartão de erro usa enunciado + gabarito + resolução", () => {
    const cards = buildCardsFromErrors(
      [
        {
          id: 10,
          topicId: 1,
          disciplineId: 1,
          statement: "A União pode intervir nos Estados...",
          correctAnswer: "C",
          userAnswer: "E",
          resolution: "Art. 34 da CF.",
        },
      ],
      [1],
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].sourceErrorId).toBe(10);
    expect(cards[0].deck).toBe(LEI_SECA_DECK);
    expect(cards[0].back).toMatch(/Resposta correta: C/);
    expect(cards[0].back).toMatch(/Art. 34/);
  });

  it("erro sem enunciado ou sem gabarito/resolução não gera cartão", () => {
    const cards = buildCardsFromErrors(
      [
        { id: 11, topicId: 1, disciplineId: 1, statementPending: true },
        { id: 12, topicId: 1, disciplineId: 1, statement: "Assertiva" },
      ],
      [1],
    );
    expect(cards).toHaveLength(0);
  });

  it("enunciado placeholder do TEC não vira cartão (não é material do aluno)", () => {
    const cards = buildCardsFromErrors(
      [
        {
          id: 21,
          topicId: 1,
          disciplineId: 1,
          statement:
            "[Enunciado não capturado pelo TEC] #3944669 CEBRASPE (CESPE) - 2026",
          correctAnswer: "E",
        },
        {
          id: 22,
          topicId: 1,
          disciplineId: 1,
          statement: "#3944670",
          correctAnswer: "C",
        },
      ],
      [1],
    );
    expect(cards).toHaveLength(0);
  });

  it("notas do tópico viram cartão com origem sourceNoteKey", () => {
    const cards = buildCardsFromTopicNotes(
      [
        topic(1, "CF/88 art. 37", 12, 40, {
          topicNotes: [
            "Art. 37 — princípios da administração\nLIMPE: legalidade, impessoalidade...",
          ],
        }),
      ],
      [],
      [1],
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].sourceNoteKey).toBe("topic:1:0");
    expect(cards[0].front).toMatch(/Art. 37/);
    expect(cards[0].back).toMatch(/LIMPE/);
  });

  it("nota do banco vira cartão com noteId", () => {
    const cards = buildCardsFromTopicNotes(
      [topic(1, "CF/88 art. 37", 12, 40)],
      [
        {
          id: 77,
          disciplineId: 1,
          topicId: 1,
          title: "Art. 5º — direitos fundamentais",
          content: "Todos são iguais perante a lei.",
        },
      ],
      [1],
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].noteId).toBe(77);
  });

  it("sem origem não existe cartão e o lote não duplica por origem", () => {
    const built = buildLeiSecaCards({
      disciplines,
      topics: [topic(1, "CF/88 art. 37", 12, 40)],
      errors: [
        {
          id: 10,
          topicId: 1,
          disciplineId: 1,
          statement: "Assertiva",
          correctAnswer: "C",
        },
        {
          id: 10,
          topicId: 1,
          disciplineId: 1,
          statement: "Assertiva repetida",
          correctAnswer: "C",
        },
        { id: 13, topicId: 1, disciplineId: 1, statement: "" },
      ],
      notes: [],
    });
    expect(built.cards).toHaveLength(1);
    expect(built.cards[0].sourceErrorId).toBe(10);
  });

  it("meta diária padrão é 15 e limita o lote de hoje", () => {
    expect(resolveDailyCap(undefined)).toBe(15);
    expect(resolveDailyCap(0)).toBe(0);
    const cards = Array.from({ length: 20 }, (_, index) => ({
      id: index,
      deck: LEI_SECA_DECK,
      nextReviewDate: "2026-11-20",
    }));
    expect(selectLeiSecaToday(cards, "2026-11-21", undefined)).toHaveLength(15);
    expect(selectLeiSecaToday(cards, "2026-11-21", 3)).toHaveLength(3);
    expect(selectLeiSecaToday(cards, "2026-11-21", 0)).toHaveLength(0);
  });

  it("deck ignora outros cartões, arquivados e futuros", () => {
    const cards = [
      { deck: LEI_SECA_DECK, nextReviewDate: "2026-11-21" },
      { deck: LEI_SECA_DECK, nextReviewDate: "2026-12-01" },
      { deck: LEI_SECA_DECK, nextReviewDate: "2026-11-01", archived: true },
      { nextReviewDate: "2026-11-01" },
    ];
    const summary = summarizeLeiSecaDeck(cards, "2026-11-21", 15);
    expect(summary.total).toBe(2);
    expect(summary.dueToday).toBe(1);
    expect(summary.todayBatch).toBe(1);
  });
});
