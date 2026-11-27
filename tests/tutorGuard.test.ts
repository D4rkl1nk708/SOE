/**
 * A2 — Guarda do tutor (v6.9.12).
 *
 * A instrução no prompt não basta: enquanto o aluno não tem 3 tentativas, o
 * gabarito, a alternativa correta e a explicação oficial NÃO entram no prompt.
 * Estes testes provam isso na string que iria para o modelo.
 */
import { describe, it, expect } from "vitest";
import { buildTutorContext } from "../server/tutorGuard";
import { decideTutorMove } from "../shared/tutorPolicy";

const QUESTION = {
  id: "q-77",
  statement:
    "Sobre os atos administrativos, assinale a opção que descreve corretamente o desfazimento do ato por vício de legalidade.",
  alternatives: [
    {
      letter: "A",
      text: "Revogação, que retroage a seus efeitos de origem por conveniência.",
    },
    {
      letter: "B",
      text: "Anulação, que retroage a seus efeitos de origem por ilegalidade.",
    },
    {
      letter: "C",
      text: "Cassação, que preserva os efeitos produzidos enquanto vigente.",
    },
    {
      letter: "D",
      text: "Convalidação, que desfaz o ato praticado por autoridade incompetente.",
    },
  ],
  correctAnswer: "B",
  explanation:
    "A anulação desfaz o ato por ilegalidade e produz efeitos ex tunc, alcançando o ato desde a origem.",
  topicName: "Atos administrativos",
  disciplineName: "Direito Administrativo",
};

/** Strings que jamais podem vazar para o modelo antes da 3ª tentativa. */
const SECRETS = [
  QUESTION.explanation,
  QUESTION.alternatives[1].text,
  "Gabarito",
  `Gabarito: ${QUESTION.correctAnswer}`,
  "Explicação oficial",
];

function promptWith(attempts: number, text: string): string {
  const move = decideTutorMove({
    intent: "explain",
    studentAttempts: attempts,
    alreadyExplained: false,
  });
  return buildTutorContext({ question: QUESTION, move, studentText: text });
}

describe("buildTutorContext", () => {
  it("sem mayRevealAnswer, o prompt não contém gabarito, alternativa correta nem explicação oficial", () => {
    for (const attempts of [0, 1, 2]) {
      const prompt = promptWith(
        attempts,
        "Acho que é a C, mas não sei por quê.",
      );
      for (const secret of SECRETS) {
        expect(prompt, `tentativa ${attempts}`).not.toContain(secret);
      }
      // O enunciado e o que o aluno escreveu continuam lá — a guarda remove a
      // resposta, não o problema.
      expect(prompt).toContain("desfazimento do ato por vício de legalidade");
      expect(prompt).toContain("Acho que é a C");
    }
  });

  it("com mayRevealAnswer (3ª tentativa), gabarito e explicação oficial entram", () => {
    const prompt = promptWith(
      3,
      "Já tentei três vezes, quero entender a regra.",
    );
    expect(prompt).toContain("Gabarito: B");
    expect(prompt).toContain(QUESTION.explanation);
    expect(prompt).toContain(QUESTION.alternatives[1].text);
  });

  it("a instrução do move acompanha o contexto", () => {
    const move = decideTutorMove({
      intent: "answer_request",
      studentAttempts: 1,
      alreadyExplained: false,
    });
    const prompt = buildTutorContext({
      question: QUESTION,
      move,
      studentText: "Só me diz a letra, por favor.",
    });
    expect(prompt).toContain(move.instruction);
    expect(prompt).not.toContain(QUESTION.explanation);
  });

  it("aguenta questão ausente e texto vazio sem lançar", () => {
    const move = decideTutorMove({
      intent: "explain",
      studentAttempts: 0,
      alreadyExplained: false,
    });
    const prompt = buildTutorContext({
      question: null,
      move,
      studentText: "",
    });
    expect(prompt).toContain(move.instruction);
    expect(prompt).not.toContain("undefined");
    expect(prompt).not.toContain("null");
  });

  it("não deixa passar campos alternativos de gabarito vindos do cliente", () => {
    const move = decideTutorMove({
      intent: "explain",
      studentAttempts: 1,
      alreadyExplained: false,
    });
    const prompt = buildTutorContext({
      question: {
        ...QUESTION,
        // Campos comuns em payloads de questão; nenhum pode escapar.
        answer: "B",
        answerText: QUESTION.alternatives[1].text,
        officialExplanation: QUESTION.explanation,
      } as any,
      move,
      studentText: "Me ajuda a pensar.",
    });
    expect(prompt).not.toContain(QUESTION.alternatives[1].text);
    expect(prompt).not.toContain(QUESTION.explanation);
    expect(prompt).not.toContain("Gabarito");
  });
});
