/**
 * A1 — Política de tutoria do SOE (v6.9.12). Puro, sem IA, sem I/O.
 *
 * Base científica (ver TAREFA-6.9.12):
 *  - tutoria generativa sem salvaguarda prejudica (+48% com acesso e −17%
 *    depois que o acesso é removido) e o dano desaparece com salvaguarda
 *    (Bastani et al., 2025, PNAS 10.1073/pnas.2422633122);
 *  - tutor socrático supera resolvedor, inclusive no uso posterior sem tutor;
 *  - auto-explicação (g = 0,55) e julgamento atrasado (g = 0,93).
 *
 * A regra que o produto promete: o tutor NÃO entrega a resposta antes da
 * terceira tentativa do aluno. Aqui essa regra é código — `mayRevealAnswer`
 * só vira `true` com `studentAttempts >= 3`, e `server/tutorGuard.ts` remove o
 * gabarito do prompt enquanto for `false`.
 */

export type TutorIntent =
  | "answer_request"
  | "explain"
  | "hint"
  | "concept"
  | "motivation"
  | "other";

export type TutorMoveKind =
  | "refuse_and_hint"
  | "hint"
  | "socratic_question"
  | "principle"
  | "full_explanation";

export type TutorMove = {
  kind: TutorMoveKind;
  hintLevel: 0 | 1 | 2 | 3;
  /** SÓ true em full_explanation (3ª tentativa em diante). */
  mayRevealAnswer: boolean;
  mustAskBack: boolean;
  /** Instrução em PT-BR para o modelo. */
  instruction: string;
};

/**
 * Termos que não podem aparecer na instrução enquanto `mayRevealAnswer` for
 * false — e que `server/tutorGuard.ts` também remove do contexto da questão.
 */
export const TUTOR_FORBIDDEN_TERMS = [
  "gabarito",
  "alternativa correta é",
  "a resposta é",
] as const;

/** Minúsculas e sem acento: as frases do aluno chegam de qualquer jeito. */
function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pedido explícito da resposta. Tem prioridade sobre qualquer outro sinal. */
const ANSWER_REQUEST_PATTERNS: RegExp[] = [
  /\bqual\s+(?:e\s+)?(?:a\s+)?resposta\b/,
  /\bqual\s+(?:a\s+)?alternativa\b/,
  /\bqual\s+(?:a\s+)?(?:certa|correta)\b/,
  /\bresposta\s+(?:certa|correta)\b/,
  /gabarito/,
  /\bso\s+me\s+diz\b/,
  /\bletra\s*\?/,
  /\bme\s+(?:fala|diz|passa|da|entrega)\s+(?:a\s+|o\s+)?(?:resposta|letra|gabarito)\b/,
  /\be\s+[a-e]\s+ou\s+[a-e]\b/,
  /\bpode\s+(?:responder|resolver|dizer)\b[^.?!]*\bpor mim\b/,
  /\bso\s+a\s+resposta\b/,
];

const MOTIVATION_PATTERNS: RegExp[] = [
  /\bdesanimad/,
  /\bdesisti\b/,
  /\bdesistir\b/,
  /\bcansad/,
  /\bexaust/,
  /\bsem\s+vontade\b/,
  /\bnao\s+consigo\s+mais\b/,
  /\bme\s+motiva/,
  /\bmotivacao\b/,
  /\bansiedad/,
  /\bnervos/,
  /\bsem\s+forcas\b/,
  /\bburro\b/,
];

const HINT_PATTERNS: RegExp[] = [
  /\bdicas?\b/,
  /\bpista\b/,
  /\bpor\s+onde\s+come/,
  /\bprimeiro\s+passo\b/,
  /\bnao\s+sei\s+como\s+comecar\b/,
  /\bempurrao\b/,
  /\bsem\s+entregar\b/,
  /\bum\s+norte\b/,
];

const CONCEPT_PATTERNS: RegExp[] = [
  /\bo\s+que\s+(?:e|sao)\b/,
  /\bconceito\b/,
  /\bdiferenca\s+entre\b/,
  /\bcomo\s+funciona\b/,
  /\bexplique\s+o\s+tema\b/,
  /\bresum[oe]\b/,
  /\bdefinicao\b/,
];

const EXPLAIN_PATTERNS: RegExp[] = [
  /\bnao\s+entendi\b/,
  /\bpor\s+que\s+(?:eu\s+)?errei\b/,
  /\bonde\s+errei\b/,
  /\bme\s+explica\b/,
  /\bexplica\b/,
  /\bpor\s+que\s+(?:a|o|essa|isso)\b/,
  /\bcomo\s+resolvo\b/,
  /\bnao\s+faz\s+sentido\b/,
  /\btravei\b/,
];

function matches(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/** Intenção do turno do aluno. `answer_request` vence todas as outras. */
export function classifyTutorIntent(text: string): TutorIntent {
  const normalized = normalize(text);
  if (!normalized) return "other";
  if (matches(ANSWER_REQUEST_PATTERNS, normalized)) return "answer_request";
  if (matches(MOTIVATION_PATTERNS, normalized)) return "motivation";
  if (matches(HINT_PATTERNS, normalized)) return "hint";
  if (matches(CONCEPT_PATTERNS, normalized)) return "concept";
  if (matches(EXPLAIN_PATTERNS, normalized)) return "explain";
  return "other";
}

const BASE_INSTRUCTIONS: Record<TutorMoveKind, string> = {
  refuse_and_hint:
    "O aluno pediu a solução pronta. Recuse com gentileza, sem confirmar qual opção está certa, e ofereça uma dica curta do próximo passo. Termine com uma pergunta que devolva o raciocínio para o aluno.",
  hint: "Dê uma dica curta e concreta sobre o próximo passo do raciocínio. Não diga qual opção está certa e não resolva a questão por ele. Feche com uma pergunta que faça o aluno avançar sozinho.",
  socratic_question:
    "Responda apenas com uma pergunta socrática que obrigue o aluno a explicar o conceito com as próprias palavras, sem jargão.",
  principle:
    "O aluno já errou mais de uma vez. Explique o princípio que rege a questão e mostre o caminho de raciocínio, sem apontar qual opção está certa. Peça que ele aplique o princípio à opção que escolheu.",
  full_explanation:
    "O aluno já tentou três vezes ou mais nesta questão. Explique a solução completa, indique a alternativa correta e o porquê, e feche com uma pergunta de autoexplicação para fixar o raciocínio.",
};

const ASK_BACK_SUFFIX =
  " Antes de seguir, peça que o aluno explique com as próprias palavras o que já entendeu.";

/** Quantas tentativas o aluno fez, saneado (NaN/negativo → 0). */
function clampAttempts(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(99, Math.trunc(numeric)));
}

/**
 * Decide o movimento do tutor.
 *
 * Regras exatas:
 *  - `mayRevealAnswer` é false para `studentAttempts < 3` (turno 1 sempre false);
 *  - `answer_request` com menos de 3 tentativas → `refuse_and_hint` + pergunta;
 *  - 0–1 tentativas → `hint`; 2 → `principle`; 3+ → `full_explanation`
 *    (único caso que revela);
 *  - `alreadyExplained` → o modelo pede a explicação do aluno (`mustAskBack`).
 */
export function decideTutorMove(input: {
  intent: TutorIntent;
  studentAttempts: number;
  alreadyExplained: boolean;
}): TutorMove {
  const intent: TutorIntent = input.intent ?? "other";
  const attempts = clampAttempts(input.studentAttempts);
  const alreadyExplained = Boolean(input.alreadyExplained);
  const mayRevealAnswer = attempts >= 3;

  let kind: TutorMoveKind;
  if (mayRevealAnswer) {
    kind = "full_explanation";
  } else if (intent === "answer_request") {
    kind = "refuse_and_hint";
  } else if (attempts === 2) {
    kind = "principle";
  } else if (intent === "concept") {
    // Pergunta puramente conceitual (não é sobre uma questão concreta): a
    // resposta útil é uma pergunta socrática, nunca a definição pronta.
    kind = "socratic_question";
  } else {
    kind = "hint";
  }

  const hintLevel = (
    mayRevealAnswer
      ? 3
      : kind === "principle"
        ? 2
        : kind === "hint" && attempts >= 1
          ? 2
          : 1
  ) as 0 | 1 | 2 | 3;

  const mustAskBack =
    kind === "refuse_and_hint" ||
    kind === "hint" ||
    kind === "socratic_question" ||
    alreadyExplained;

  const askBack = alreadyExplained ? ASK_BACK_SUFFIX : "";

  return {
    kind,
    hintLevel,
    mayRevealAnswer,
    mustAskBack,
    instruction: `${BASE_INSTRUCTIONS[kind]}${askBack}`,
  };
}
