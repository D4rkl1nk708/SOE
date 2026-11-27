/** @vitest-environment node */
/**
 * A2/A4 — Fluxo do tutor com o router real e a IA mockada (v6.9.12).
 *
 * Prova três coisas que a instrução sozinha não garante:
 *  1. três turnos do aluno produzem três moves diferentes (dica → princípio →
 *     explicação completa);
 *  2. cada turno é registrado em `settings.tutorTurns`;
 *  3. sem chave de IA não lança erro — devolve o move + a pergunta padrão;
 *  4. com chave, o prompt enviado ao modelo NÃO contém o gabarito antes da 3ª
 *     tentativa (o gabarito sai do prompt, não só da instrução).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mentorRouter } from "../server/mentorRouter";
import * as storage from "../server/jsonStorage";
import * as ai from "../server/aiProviders";

vi.mock("../server/jsonStorage");
vi.mock("../server/aiProviders");

const ctx = { user: { id: 1 } } as any;

const QUESTION = {
  id: "q-77",
  statement: "Sobre os atos administrativos, assinale a opção correta.",
  alternatives: [
    { letter: "A", text: "Revogação retroage por conveniência." },
    { letter: "B", text: "Anulação retroage por ilegalidade." },
    { letter: "C", text: "Cassação preserva os efeitos." },
    { letter: "D", text: "Convalidação desfaz ato de incompetente." },
  ],
  correctAnswer: "B",
  explanation:
    "A anulação desfaz o ato por ilegalidade e produz efeitos ex tunc desde a origem.",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(storage.recordTutorTurn).mockResolvedValue(undefined as any);
  vi.mocked(storage.getQuestionErrorsByUser).mockResolvedValue({
    items: [],
    total: 0,
  } as any);
  vi.mocked(ai.callAiProvider).mockResolvedValue("Resposta do tutor.");
});

describe("mentor.tutorTurn", () => {
  it("três turnos do aluno produzem três moves diferentes", async () => {
    const caller = mentorRouter.createCaller(ctx);
    const first = await caller.tutorTurn({
      text: "Não entendi essa questão.",
      studentAttempts: 0,
      question: QUESTION,
    });
    const second = await caller.tutorTurn({
      text: "Ainda não entendi, errei de novo.",
      studentAttempts: 2,
      question: QUESTION,
    });
    const third = await caller.tutorTurn({
      text: "Já tentei três vezes, quero entender a regra.",
      studentAttempts: 3,
      question: QUESTION,
    });

    expect(first.move.kind).toBe("hint");
    expect(second.move.kind).toBe("principle");
    expect(third.move.kind).toBe("full_explanation");
    expect(first.move.mayRevealAnswer).toBe(false);
    expect(second.move.mayRevealAnswer).toBe(false);
    expect(third.move.mayRevealAnswer).toBe(true);
    expect(
      new Set([first.move.kind, second.move.kind, third.move.kind]).size,
    ).toBe(3);
  });

  it("grava tutorTurns com intent, kind, hintLevel, mayRevealAnswer e createdAt", async () => {
    const caller = mentorRouter.createCaller(ctx);
    await caller.tutorTurn({
      text: "Me dá uma dica de por onde começar.",
      studentAttempts: 1,
      question: QUESTION,
    });

    expect(storage.recordTutorTurn).toHaveBeenCalledTimes(1);
    const [userId, turn] = vi.mocked(storage.recordTutorTurn).mock.calls[0];
    expect(userId).toBe(1);
    expect(turn).toMatchObject({
      intent: "hint",
      kind: "hint",
      hintLevel: 2,
      mayRevealAnswer: false,
      questionId: "q-77",
    });
    expect(typeof turn.createdAt).toBe("string");
    expect(turn.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sem chave de IA não lança: devolve move + pergunta padrão", async () => {
    const caller = mentorRouter.createCaller(ctx);
    const result = await caller.tutorTurn({
      text: "Qual é a resposta?",
      studentAttempts: 0,
      question: QUESTION,
    });

    expect(result.move.kind).toBe("refuse_and_hint");
    expect(result.reply.length).toBeGreaterThan(20);
    expect(result.reply).toMatch(/pergunt|\?/);
    expect(ai.callAiProvider).not.toHaveBeenCalled();
    expect(result.reply).not.toContain("Anulação retroage por ilegalidade");
  });

  it("com chave, o prompt não leva o gabarito antes da 3ª tentativa", async () => {
    const caller = mentorRouter.createCaller(ctx);
    await caller.tutorTurn({
      text: "Acho que é a C, mas não sei por quê.",
      studentAttempts: 1,
      question: QUESTION,
      apiKey: "chave-falsa",
    });

    expect(ai.callAiProvider).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(ai.callAiProvider).mock.calls[0][2] as string;
    expect(prompt).not.toContain(QUESTION.explanation);
    expect(prompt).not.toContain("Anulação retroage por ilegalidade");
    expect(prompt).not.toContain("Gabarito");
    expect(prompt).toContain("Acho que é a C");
  });

  it("com chave e três tentativas, o prompt leva o gabarito", async () => {
    const caller = mentorRouter.createCaller(ctx);
    await caller.tutorTurn({
      text: "Já tentei três vezes.",
      studentAttempts: 3,
      question: QUESTION,
      apiKey: "chave-falsa",
    });

    const prompt = vi.mocked(ai.callAiProvider).mock.calls[0][2] as string;
    expect(prompt).toContain("Gabarito: B");
    expect(prompt).toContain(QUESTION.explanation);
  });

  it("busca a questão pelos erros registrados quando só vem o questionId", async () => {
    vi.mocked(storage.getQuestionErrorsByUser).mockResolvedValue({
      items: [{ ...QUESTION, id: 42, disciplineId: 3 }],
      total: 1,
    } as any);
    const caller = mentorRouter.createCaller(ctx);
    const result = await caller.tutorTurn({
      questionId: "42",
      text: "Onde eu errei?",
      studentAttempts: 0,
      apiKey: "chave-falsa",
    });

    expect(result.move.kind).toBe("hint");
    const prompt = vi.mocked(ai.callAiProvider).mock.calls[0][2] as string;
    expect(prompt).toContain("assinale a opção correta");
    expect(prompt).not.toContain(QUESTION.explanation);
    expect(vi.mocked(storage.recordTutorTurn).mock.calls[0][1]).toMatchObject({
      questionId: "42",
    });
  });
});
