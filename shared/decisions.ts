/**
 * Árvores de decisão do SOE.
 *
 * Cada função aqui é uma regra explícita, curta e testável do tipo
 * "se aconteceu X, o próximo passo é Y — e o motivo é Z". O objetivo é tirar
 * do usuário a decisão de "o que faço agora?" sem inventar pedagogia: as regras
 * seguem o que a literatura de aprendizagem sustenta (prática de recuperação,
 * autocorreção, calibração de confiança, espaçamento).
 *
 * Puro de propósito: nada de banco, nada de React — dá para testar tudo.
 */

export type NextAction =
  | "praticar"
  | "revisar_agora"
  | "explicar"
  | "flashcard"
  | "encerrar"
  | "reagendar";

export type Confidence = "chute" | "acho" | "certeza" | null;

export type AnswerSignal = {
  correct: boolean;
  confidence?: Confidence;
  /** Erros consecutivos no mesmo tema, incluindo este. */
  consecutiveErrors?: number;
  elapsedMinutes?: number;
  plannedMinutes?: number;
};

export type AnswerDecision = {
  action: NextAction;
  why: string;
};

/**
 * O que fazer logo depois de responder uma questão.
 *
 * Ordem das regras importa: platô vence tudo, erro com excesso de confiança
 * vence erro simples, e "acerto no chute" nunca conta como domínio.
 */
export function decideAfterAnswer(signal: AnswerSignal): AnswerDecision {
  const consecutive = signal.consecutiveErrors ?? 0;
  const elapsed = signal.elapsedMinutes ?? 0;
  const planned = signal.plannedMinutes ?? 0;

  if (consecutive >= 3) {
    return {
      action: "encerrar",
      why: "Três erros seguidos no mesmo tema: continuar agora rende pouco. Encerrar e reagendar é mais eficiente que insistir.",
    };
  }

  if (!signal.correct && signal.confidence === "certeza") {
    return {
      action: "explicar",
      why: "Erro em questão que você tinha como certa: o conceito está mal formado, não é falta de atenção. Explique com suas palavras antes de seguir.",
    };
  }

  if (!signal.correct) {
    return {
      action: "revisar_agora",
      why: "Erro numa questão já estudada: revisar o ponto agora (2 minutos) e responder uma questão parecida vale mais que seguir adiante.",
    };
  }

  if (signal.confidence === "chute") {
    return {
      action: "flashcard",
      why: "Acertou no chute: o acerto não é domínio. Transformar em flashcard é o caminho mais barato de fixar.",
    };
  }

  if (planned > 0 && elapsed >= planned) {
    return {
      action: "reagendar",
      why: "Tempo planejado cumprido com acerto: encerrar no ponto alto e agendar a revisão.",
    };
  }

  return {
    action: "praticar",
    why: "Acerto com confiança: seguir praticando.",
  };
}

export type StudyMode = "practice" | "feynman" | "flashcard" | "micro_world";

export type StudyModeInput = {
  /** O conteúdo é conceitual (princípios, interpretação) ou factual (prazos, listas)? */
  conceptual: boolean;
  /** O conteúdo tem um procedimento com estados (fluxo, ordem, ciclo)? */
  procedural?: boolean;
  /** Já errou esse tema mais de uma vez em janelas diferentes. */
  recurringErrors?: boolean;
  minutesAvailable?: number;
};

export type StudyModeDecision = {
  mode: StudyMode;
  why: string;
};

/**
 * Como atacar um tema novo ou fraco.
 *
 * Conceitual → explicação com as próprias palavras (autocorreção explícita).
 * Procedimental com tempo → micro-mundo manipulável (o ato de operar fixa).
 * Factual → flashcard; explicação não ajuda memória de fato isolado.
 */
export function decideStudyMode(input: StudyModeInput): StudyModeDecision {
  const minutes = input.minutesAvailable ?? 15;

  if (input.procedural && minutes >= 10) {
    return {
      mode: "micro_world",
      why: "O tema é um procedimento com estados: manipular um modelo pequeno ensina mais rápido que ler a descrição.",
    };
  }

  if (input.conceptual) {
    return {
      mode: "feynman",
      why: input.recurringErrors
        ? "Erro recorrente em tema conceitual: explicar com suas palavras revela onde a compreensão quebra."
        : "Tema conceitual: explicar com as próprias palavras e receber correção é a forma mais eficiente de fixar.",
    };
  }

  if (!input.conceptual && !input.procedural) {
    return {
      mode: "flashcard",
      why: "Conteúdo factual (prazo, lista, nomenclatura): repetição espaçada rende mais que explicação.",
    };
  }

  return {
    mode: "practice",
    why: "Praticar questões é o caminho mais curto para medir o que falta.",
  };
}

export type ReviewGapInput = {
  /** Acurácia desta sessão, 0–100. */
  accuracy: number;
  /** Houve erro nesta sessão? */
  hadErrors?: boolean;
  /** Prontidão do tópico, 0–100. */
  readiness?: number;
  /** Se já existe agenda FSRS, ela manda — aqui é só fallback. */
  hasFsrs?: boolean;
};

export type ReviewGapDecision = {
  days: number;
  why: string;
};

/**
 * Intervalo até a próxima revisão quando não há FSRS.
 *
 * Regra prática alinhada ao efeito de espaçamento: acerto alto → intervalos
 * maiores; erro → voltar rápido. O intervalo nunca é menor que 1 dia.
 */
export function decideReviewGap(input: ReviewGapInput): ReviewGapDecision {
  const accuracy = Math.max(0, Math.min(100, Math.round(input.accuracy)));
  const readiness = Math.round(input.readiness ?? accuracy);

  if (input.hasFsrs) {
    return {
      days: 0,
      why: "O FSRS já calcula a data: a sessão apenas registra o resultado.",
    };
  }

  if (accuracy < 50 || input.hadErrors) {
    if (accuracy < 50) {
      return {
        days: 1,
        why: `Acurácia de ${accuracy}%: revisar amanhã, antes de o erro virar hábito.`,
      };
    }
    return {
      days: 2,
      why: `Acerto de ${accuracy}% com erro no meio: revisão curta em 2 dias.`,
    };
  }

  if (accuracy < 70) {
    return {
      days: 3,
      why: `${accuracy}% de acerto: revisão em 3 dias consolida sem saturar.`,
    };
  }

  if (accuracy < 85 || readiness < 70) {
    return {
      days: 7,
      why: `${accuracy}% de acerto: uma semana é o intervalo em que ainda há esforço útil de recuperação.`,
    };
  }

  return {
    days: 16,
    why: `${accuracy}% de acerto com prontidão ${readiness}%: pode espaçar — revisar em ~16 dias (cerca de 10–20% do intervalo que você quer manter).`,
  };
}

export type PlanBlockLike = {
  id: string;
  kind: string;
  minutes: number;
  topicId?: number | null;
  score?: number;
  completed?: boolean;
  topicName?: string;
  disciplineName?: string;
  reason?: string;
};

export type NextBlockInput = {
  blocks: PlanBlockLike[];
  minutesAvailable?: number;
  lastTopicId?: number | null;
  overdueRevisions?: number;
};

export type NextBlockDecision = {
  block: PlanBlockLike | null;
  why: string;
};

/**
 * Qual bloco pegar agora.
 *
 * Regras: não repetir o tópico da última sessão; respeitar o tempo disponível;
 * dívida de revisão vence tópico novo; entre iguais, maior score.
 */
export function decideNextBlock(input: NextBlockInput): NextBlockDecision {
  const minutes = input.minutesAvailable ?? 240;
  const ordered = [...(input.blocks || [])].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0),
  );

  const fits = ordered.filter((block) => block.minutes <= minutes);
  if (fits.length === 0) {
    return {
      block: null,
      why: "Nenhum bloco cabe no tempo que sobrou hoje — encurte um bloco ou aumente o tempo disponível.",
    };
  }

  const notYesterday = fits.filter(
    (block) => !input.lastTopicId || block.topicId !== input.lastTopicId,
  );
  const pool = notYesterday.length > 0 ? notYesterday : fits;

  if ((input.overdueRevisions ?? 0) > 0) {
    const revision = pool.find((block) => block.kind === "revisao");
    if (revision) {
      return {
        block: revision,
        // v6.9.8 (item 1.1): sem o total absoluto de vencidas ("8.458") —
        // o aluno precisa do motivo útil deste bloco, não da dívida inteira.
        why: revision.reason
          ? `${revision.topicName || "Revisão"}: ${revision.reason}`
          : "revisão vencida vem antes de conteúdo novo — é a que mais pesa no seu plano hoje.",
      };
    }
  }

  const first = pool[0];
  return {
    block: first,
    why:
      notYesterday.length > 0
        ? "Maior prioridade que cabe no seu tempo, sem repetir o tema da última sessão."
        : "Só restou o mesmo tema da última sessão — revisar de novo é aceitável, mas troque de ângulo (questões em vez de leitura).",
  };
}
