/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  countTopicAnswersOnDate,
  pickTestRevisionToAutoComplete,
  pickTheoryRevisionSuggestion,
  type TecCalendarRevision,
} from "../server/tecStudyCalendar";

function revision(
  overrides: Partial<TecCalendarRevision> & { id: number; topicId: number },
): TecCalendarRevision {
  return {
    scheduledDate: "2026-11-19",
    type: "test",
    completed: false,
    ...overrides,
  };
}

/** Timestamp local -> ISO (evita depender do fuso da máquina do CI). */
function localIso(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

describe("countTopicAnswersOnDate", () => {
  it("conta só as tentativas do tópico que caem no dia local", () => {
    const attempts = [
      { topicId: 1, correct: true, createdAt: localIso(2026, 11, 19, 8) },
      { topicId: 1, correct: false, createdAt: localIso(2026, 11, 19, 23, 59) },
      { topicId: 1, correct: true, createdAt: localIso(2026, 11, 18, 23, 59) },
      { topicId: 1, correct: true, createdAt: localIso(2026, 11, 20, 0, 1) },
    ];

    expect(countTopicAnswersOnDate(attempts, 1, "2026-11-19")).toEqual({
      total: 2,
      correct: 1,
    });
  });

  it("ignora tópico errado, topicId nulo e data inválida", () => {
    const attempts = [
      { topicId: 2, correct: true, createdAt: localIso(2026, 11, 19, 9) },
      { topicId: null, correct: true, createdAt: localIso(2026, 11, 19, 9) },
      { topicId: 1, correct: true, createdAt: "data-quebrada" },
    ];

    expect(countTopicAnswersOnDate(attempts, 1, "2026-11-19")).toEqual({
      total: 0,
      correct: 0,
    });
    expect(countTopicAnswersOnDate(attempts, 1, "19/11/2026")).toEqual({
      total: 0,
      correct: 0,
    });
  });

  it("aceita createdAt que já é YYYY-MM-DD sem deslocar o dia", () => {
    const attempts = [{ topicId: 1, correct: true, createdAt: "2026-11-19" }];
    expect(countTopicAnswersOnDate(attempts, 1, "2026-11-19")).toEqual({
      total: 1,
      correct: 1,
    });
  });
});

describe("pickTestRevisionToAutoComplete", () => {
  const today = "2026-11-19";

  it("só conclui revisão de teste vencida ou de hoje (nunca futura)", () => {
    const revisions = [
      revision({ id: 1, topicId: 7, scheduledDate: "2026-11-20" }),
    ];
    expect(
      pickTestRevisionToAutoComplete({
        revisions,
        topicId: 7,
        today,
        answersToday: 50,
        threshold: 10,
      }),
    ).toBeNull();

    const dueToday = revision({ id: 2, topicId: 7, scheduledDate: today });
    expect(
      pickTestRevisionToAutoComplete({
        revisions: [dueToday],
        topicId: 7,
        today,
        answersToday: 10,
        threshold: 10,
      }),
    ).toEqual(dueToday);

    const overdue = revision({
      id: 3,
      topicId: 7,
      scheduledDate: "2026-11-01",
    });
    expect(
      pickTestRevisionToAutoComplete({
        revisions: [overdue],
        topicId: 7,
        today,
        answersToday: 10,
        threshold: 10,
      }),
    ).toEqual(overdue);
  });

  it("threshold 0 desliga a automação mesmo com muitas respostas", () => {
    const revisions = [
      revision({ id: 1, topicId: 7, scheduledDate: today, revisionNumber: 1 }),
    ];
    expect(
      pickTestRevisionToAutoComplete({
        revisions,
        topicId: 7,
        today,
        answersToday: 999,
        threshold: 0,
      }),
    ).toBeNull();
  });

  it("não conclui antes de atingir o threshold", () => {
    const revisions = [revision({ id: 1, topicId: 7 })];
    expect(
      pickTestRevisionToAutoComplete({
        revisions,
        topicId: 7,
        today,
        answersToday: 9,
        threshold: 10,
      }),
    ).toBeNull();
    expect(
      pickTestRevisionToAutoComplete({
        revisions,
        topicId: 7,
        today,
        answersToday: 10,
        threshold: 10,
      }),
    ).not.toBeNull();
  });

  it("ignora revisão de teoria, concluídas e ignoradas", () => {
    const revisions = [
      revision({ id: 1, topicId: 7, type: "revision" }),
      revision({ id: 2, topicId: 7, completed: true }),
      revision({ id: 3, topicId: 7, ignored: true }),
    ];
    expect(
      pickTestRevisionToAutoComplete({
        revisions,
        topicId: 7,
        today,
        answersToday: 30,
        threshold: 10,
      }),
    ).toBeNull();
  });

  it("devolve a mais antiga entre as vencidas", () => {
    const revisions = [
      revision({ id: 1, topicId: 7, scheduledDate: "2026-11-10" }),
      revision({ id: 2, topicId: 7, scheduledDate: "2026-11-01" }),
      revision({ id: 3, topicId: 7, scheduledDate: today }),
    ];
    expect(
      pickTestRevisionToAutoComplete({
        revisions,
        topicId: 7,
        today,
        answersToday: 20,
        threshold: 10,
      })?.id,
    ).toBe(2);
  });

  it("desempata por revisionNumber e depois por id", () => {
    const byNumber = [
      revision({
        id: 5,
        topicId: 7,
        scheduledDate: "2026-11-02",
        revisionNumber: 3,
      }),
      revision({
        id: 4,
        topicId: 7,
        scheduledDate: "2026-11-02",
        revisionNumber: 2,
      }),
    ];
    expect(
      pickTestRevisionToAutoComplete({
        revisions: byNumber,
        topicId: 7,
        today,
        answersToday: 20,
        threshold: 10,
      })?.id,
    ).toBe(4);

    const byId = [
      revision({
        id: 9,
        topicId: 7,
        scheduledDate: "2026-11-02",
        revisionNumber: 2,
      }),
      revision({
        id: 8,
        topicId: 7,
        scheduledDate: "2026-11-02",
        revisionNumber: 2,
      }),
    ];
    expect(
      pickTestRevisionToAutoComplete({
        revisions: byId,
        topicId: 7,
        today,
        answersToday: 20,
        threshold: 10,
      })?.id,
    ).toBe(8);
  });

  it("não conclui revisão de outro tópico", () => {
    const revisions = [
      revision({ id: 1, topicId: 8, scheduledDate: "2026-11-01" }),
    ];
    expect(
      pickTestRevisionToAutoComplete({
        revisions,
        topicId: 7,
        today,
        answersToday: 50,
        threshold: 10,
      }),
    ).toBeNull();
  });

  it("ordem lexicográfica basta para comparar datas (vencida x futura)", () => {
    const revisions = [
      revision({ id: 1, topicId: 7, scheduledDate: "2026-12-01" }),
      revision({ id: 2, topicId: 7, scheduledDate: "2026-10-31" }),
    ];
    expect(
      pickTestRevisionToAutoComplete({
        revisions,
        topicId: 7,
        today,
        answersToday: 12,
        threshold: 10,
      })?.scheduledDate,
    ).toBe("2026-10-31");
  });
});

describe("pickTheoryRevisionSuggestion", () => {
  const today = "2026-11-19";

  it("sugere a revisão de teoria pendente mais antiga (vencida ou de hoje)", () => {
    const revisions = [
      revision({ id: 1, topicId: 7, type: "revision", scheduledDate: today }),
      revision({
        id: 2,
        topicId: 7,
        type: "revision",
        scheduledDate: "2026-11-05",
      }),
      revision({
        id: 3,
        topicId: 7,
        type: "revision",
        scheduledDate: "2026-12-01",
      }),
    ];
    expect(
      pickTheoryRevisionSuggestion({ revisions, topicId: 7, today })?.id,
    ).toBe(2);
  });

  it("não sugere teste, concluída, ignorada nem de outro tópico", () => {
    const revisions = [
      revision({ id: 1, topicId: 7, type: "test", scheduledDate: today }),
      revision({
        id: 2,
        topicId: 7,
        type: "revision",
        scheduledDate: today,
        completed: true,
      }),
      revision({
        id: 3,
        topicId: 7,
        type: "revision",
        scheduledDate: today,
        ignored: true,
      }),
      revision({ id: 4, topicId: 8, type: "revision", scheduledDate: today }),
    ];
    expect(
      pickTheoryRevisionSuggestion({ revisions, topicId: 7, today }),
    ).toBeNull();
  });
});
