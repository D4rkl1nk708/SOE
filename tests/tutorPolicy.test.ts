/**
 * A1 — Política de tutoria (v6.9.12).
 *
 * Base: Bastani et al. (2025, PNAS) — tutoria generativa sem salvaguarda
 * prejudica (−17% depois que o acesso é removido); o tutor socrático vence o
 * resolvedor. Aqui a salvaguarda é código: `mayRevealAnswer` só vira true na
 * terceira tentativa do aluno.
 */
import { describe, it, expect } from "vitest";
import {
  classifyTutorIntent,
  decideTutorMove,
  TUTOR_FORBIDDEN_TERMS,
  type TutorIntent,
} from "../shared/tutorPolicy";

/** 12 frases PT-BR de pedido de resposta — todas devem ser recusadas. */
const ANSWER_REQUESTS = [
  "Qual é a resposta dessa questão?",
  "Qual a alternativa correta?",
  "Me dá o gabarito",
  "Só me diz a letra",
  "Letra?",
  "Me fala a resposta certa",
  "Qual a resposta?",
  "É A ou B?",
  "Pode responder por mim?",
  "Só a resposta, por favor",
  "Qual alternativa eu marco?",
  "Me passa o gabarito dessa questão",
];

const ALL_INTENTS: TutorIntent[] = [
  "answer_request",
  "explain",
  "hint",
  "concept",
  "motivation",
  "other",
];

describe("classifyTutorIntent", () => {
  it("reconhece as 12 frases de pedido de resposta como answer_request", () => {
    for (const phrase of ANSWER_REQUESTS) {
      expect(classifyTutorIntent(phrase), phrase).toBe("answer_request");
    }
    expect(ANSWER_REQUESTS).toHaveLength(12);
  });

  it("separa explicação, dica, conceito, motivação e conversa solta", () => {
    expect(
      classifyTutorIntent("Não entendi por que a questão fala de competência"),
    ).toBe("explain");
    expect(classifyTutorIntent("Por que eu errei essa?")).toBe("explain");
    expect(classifyTutorIntent("Me dá uma dica de por onde começar")).toBe(
      "hint",
    );
    expect(classifyTutorIntent("Uma pista só, sem entregar tudo")).toBe("hint");
    expect(classifyTutorIntent("O que é ato administrativo?")).toBe("concept");
    expect(
      classifyTutorIntent("Qual a diferença entre anulação e revogação?"),
    ).toBe("concept");
    expect(
      classifyTutorIntent("Estou desanimado, não consigo manter a rotina"),
    ).toBe("motivation");
    expect(classifyTutorIntent("Bom dia, mentor")).toBe("other");
    expect(classifyTutorIntent("")).toBe("other");
  });

  it("pedido de resposta tem prioridade sobre os outros sinais", () => {
    expect(
      classifyTutorIntent("Estou desanimado, mas qual é a resposta?"),
    ).toBe("answer_request");
    expect(classifyTutorIntent("Me explica e me dá o gabarito")).toBe(
      "answer_request",
    );
  });
});

describe("decideTutorMove — a coleira", () => {
  it("nunca revela no turno 1, para nenhuma intenção", () => {
    for (const intent of ALL_INTENTS) {
      const move = decideTutorMove({
        intent,
        studentAttempts: 0,
        alreadyExplained: false,
      });
      expect(move.mayRevealAnswer, intent).toBe(false);
      expect(move.hintLevel, intent).toBeLessThanOrEqual(2);
    }
  });

  it("0–1 tentativas devolve dica; 2 devolve princípio; 3+ libera a explicação completa", () => {
    const first = decideTutorMove({
      intent: "explain",
      studentAttempts: 0,
      alreadyExplained: false,
    });
    expect(first.kind).toBe("hint");
    expect(first.hintLevel).toBe(1);
    expect(first.mayRevealAnswer).toBe(false);

    const second = decideTutorMove({
      intent: "explain",
      studentAttempts: 1,
      alreadyExplained: false,
    });
    expect(second.kind).toBe("hint");
    expect(second.hintLevel).toBe(2);
    expect(second.mayRevealAnswer).toBe(false);

    const third = decideTutorMove({
      intent: "explain",
      studentAttempts: 2,
      alreadyExplained: false,
    });
    expect(third.kind).toBe("principle");
    expect(third.mayRevealAnswer).toBe(false);

    const fourth = decideTutorMove({
      intent: "explain",
      studentAttempts: 3,
      alreadyExplained: false,
    });
    expect(fourth.kind).toBe("full_explanation");
    expect(fourth.mayRevealAnswer).toBe(true);

    const later = decideTutorMove({
      intent: "explain",
      studentAttempts: 7,
      alreadyExplained: false,
    });
    expect(later.kind).toBe("full_explanation");
    expect(later.mayRevealAnswer).toBe(true);
  });

  it("pedido de resposta é recusado com pergunta de volta, mesmo com 2 tentativas", () => {
    for (const attempts of [0, 1, 2]) {
      const move = decideTutorMove({
        intent: "answer_request",
        studentAttempts: attempts,
        alreadyExplained: false,
      });
      expect(move.kind, `attempts=${attempts}`).toBe("refuse_and_hint");
      expect(move.mustAskBack).toBe(true);
      expect(move.mayRevealAnswer).toBe(false);
      expect(move.instruction.length).toBeGreaterThan(20);
      expect(move.instruction).toMatch(/pergunt/i);
    }
  });

  it("aluno que já explicou recebe pedido de autoexplicação (mustAskBack)", () => {
    for (const attempts of [0, 2, 3]) {
      const move = decideTutorMove({
        intent: "explain",
        studentAttempts: attempts,
        alreadyExplained: true,
      });
      expect(move.mustAskBack, `attempts=${attempts}`).toBe(true);
      expect(move.instruction).toMatch(/pr[oó]prias palavras/i);
    }
  });

  it("instrução sem mayRevealAnswer não contém termo que entrega a resposta", () => {
    for (const intent of ALL_INTENTS) {
      for (const attempts of [0, 1, 2]) {
        const move = decideTutorMove({
          intent,
          studentAttempts: attempts,
          alreadyExplained: false,
        });
        expect(move.mayRevealAnswer).toBe(false);
        for (const term of TUTOR_FORBIDDEN_TERMS) {
          expect(
            move.instruction.toLowerCase(),
            `${intent}/${attempts} contém "${term}"`,
          ).not.toContain(term);
        }
      }
    }
  });

  it("tentativas inválidas caem no caso mais restritivo", () => {
    const negative = decideTutorMove({
      intent: "answer_request",
      studentAttempts: -4,
      alreadyExplained: false,
    });
    expect(negative.kind).toBe("refuse_and_hint");
    expect(negative.mayRevealAnswer).toBe(false);

    const nan = decideTutorMove({
      intent: "explain",
      studentAttempts: Number.NaN,
      alreadyExplained: false,
    });
    expect(nan.kind).toBe("hint");
    expect(nan.mayRevealAnswer).toBe(false);
  });
});
