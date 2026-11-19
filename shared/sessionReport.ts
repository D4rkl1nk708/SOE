/**
 * Relatório de fim de sessão.
 *
 * Compara o domínio por tópico antes e depois da sessão e traduz a diferença
 * em números conferíveis (questões, acertos, erros) e em frases de ponto forte
 * / ponto fraco. É puro de propósito: dá para testar sem banco e sem React.
 */

export type TopicSnapshot = {
  topicId: number;
  topicName: string;
  disciplineName: string;
  resolved: number;
  correct: number;
  readiness: number;
};

export type SessionTopicResult = {
  topicId: number;
  topicName: string;
  disciplineName: string;
  questions: number;
  correct: number;
  errors: number;
  /** Acurácia só das questões desta sessão (%). */
  accuracy: number;
  /** Acurácia acumulada do tópico antes da sessão (%). */
  accuracyBefore: number;
  readinessDelta: number;
};

export type SessionReport = {
  questions: number;
  correct: number;
  errors: number;
  /** Acurácia das questões respondidas nesta sessão (%). */
  accuracy: number;
  /** Acurácia acumulada global antes e depois (%). */
  accuracyBefore: number;
  accuracyAfter: number;
  topics: SessionTopicResult[];
  strengths: string[];
  weaknesses: string[];
  /** Nenhuma questão nova capturada na janela da sessão. */
  noData: boolean;
};

export type SessionReportInput = {
  before: TopicSnapshot[];
  after: TopicSnapshot[];
  /** Acurácias acumuladas globais (opcionais) para mostrar a variação. */
  globalBefore?: number;
  globalAfter?: number;
};

function pct(part: number, total: number, fallback = 0): number {
  if (total <= 0) return Math.round(fallback);
  return Math.round((part / total) * 100);
}

/**
 * Monta o relatório a partir do delta por tópico.
 *
 * `before` é o snapshot tirado quando a sessão começou; `after`, o snapshot
 * depois de encerrar. Tópicos sem questão nova na janela são ignorados — o
 * relatório fala só do que aconteceu nesta sessão.
 */
export function buildSessionReport({
  before,
  after,
  globalBefore = 0,
  globalAfter = 0,
}: SessionReportInput): SessionReport {
  const beforeById = new Map(before.map((item) => [item.topicId, item]));
  const topics: SessionTopicResult[] = [];

  for (const topic of after) {
    const previous = beforeById.get(topic.topicId);
    const questions = Math.max(0, topic.resolved - (previous?.resolved ?? 0));
    if (questions <= 0) continue;
    const correct = Math.min(
      questions,
      Math.max(0, topic.correct - (previous?.correct ?? 0)),
    );
    topics.push({
      topicId: topic.topicId,
      topicName: topic.topicName,
      disciplineName: topic.disciplineName,
      questions,
      correct,
      errors: questions - correct,
      accuracy: pct(correct, questions),
      accuracyBefore: pct(
        previous?.correct ?? 0,
        previous?.resolved ?? 0,
        previous?.correct ? 100 : 0,
      ),
      readinessDelta: Math.round(topic.readiness - (previous?.readiness ?? 0)),
    });
  }

  topics.sort((a, b) => b.questions - a.questions);

  const questions = topics.reduce((sum, item) => sum + item.questions, 0);
  const correct = topics.reduce((sum, item) => sum + item.correct, 0);

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  for (const topic of topics) {
    if (topic.questions >= 3 && topic.accuracy >= 70) {
      strengths.push(
        `${topic.topicName} — ${topic.accuracy}% em ${topic.questions} questões`,
      );
    } else if (topic.accuracy < 60) {
      weaknesses.push(
        `${topic.topicName} — ${topic.accuracy}% (${topic.errors} ${topic.errors === 1 ? "erro" : "erros"} em ${topic.questions})`,
      );
    }
  }

  if (strengths.length === 0 && topics.length > 0) {
    const best = [...topics].sort((a, b) => b.accuracy - a.accuracy)[0];
    if (best && best.accuracy >= 60) {
      strengths.push(
        `${best.topicName} — ${best.accuracy}% em ${best.questions} questões`,
      );
    }
  }

  if (weaknesses.length === 0 && topics.length > 0) {
    const worst = [...topics].sort((a, b) => a.accuracy - b.accuracy)[0];
    // Tudo acima de 80%: o recado deixa de ser "ponto fraco" e vira manutenção.
    if (worst && worst.accuracy < 80) {
      weaknesses.push(
        `${worst.topicName} — ${worst.accuracy}% em ${worst.questions} questões (abaixo de 80%)`,
      );
    }
  }

  return {
    questions,
    correct,
    errors: questions - correct,
    accuracy: pct(correct, questions),
    accuracyBefore: Math.round(globalBefore),
    accuracyAfter: Math.round(globalAfter),
    topics,
    strengths,
    weaknesses,
    noData: questions === 0,
  };
}

// ─── v6.9.5: relatório a partir das tentativas (fonte da verdade) ───────────

export type SessionAttemptLite = {
  id: string;
  topicId: number | null;
  correct: boolean;
  createdAt: string;
  source?: string | null;
};

export type SessionTopicRef = {
  id: number;
  name: string;
  disciplineId: number;
};

export type SessionDisciplineRef = { id: number; name: string };

export type SessionReportFromAttemptsInput = {
  /** Tentativas capturadas na janela da sessão (já filtradas ou não). */
  attempts: SessionAttemptLite[];
  startedAt: string;
  endedAt: string;
  topics: SessionTopicRef[];
  disciplines: SessionDisciplineRef[];
  /** Domínio por tópico antes da sessão (só para "antes" e readiness). */
  before?: TopicSnapshot[];
  after?: TopicSnapshot[];
  globalBefore?: number;
  globalAfter?: number;
};

/**
 * Relatório da sessão calculado das `questionAttempts` com `createdAt` dentro de
 * [início, fim]. É a fonte da verdade: o delta de performance por tópico (que
 * depende de todos os contadores baterem) fica só como fallback em
 * `buildSessionReport`.
 *
 * Tentativas ainda sem tópico (classificação pendente) são contadas à parte em
 * `unclassified` — entram no total de questões, mas não em nenhum tópico.
 */
export function buildSessionReportFromAttempts(
  input: SessionReportFromAttemptsInput,
): SessionReport & { unclassified: number } {
  const startMs = Date.parse(input.startedAt);
  const endMs = Date.parse(input.endedAt);
  const hasWindow = Number.isFinite(startMs) && Number.isFinite(endMs);

  const inWindow = hasWindow
    ? input.attempts.filter((attempt) => {
        const at = Date.parse(String(attempt.createdAt || ""));
        return Number.isFinite(at) && at >= startMs && at <= endMs;
      })
    : [];

  const topicById = new Map(input.topics.map((topic) => [topic.id, topic]));
  const disciplineById = new Map(
    input.disciplines.map((discipline) => [discipline.id, discipline]),
  );
  const beforeById = new Map(
    (input.before ?? []).map((item) => [item.topicId, item]),
  );
  const afterById = new Map(
    (input.after ?? []).map((item) => [item.topicId, item]),
  );

  const byTopic = new Map<
    number,
    {
      questions: number;
      correct: number;
      topicName: string;
      disciplineName: string;
    }
  >();
  let unclassified = 0;

  for (const attempt of inWindow) {
    if (attempt.topicId === null || attempt.topicId === undefined) {
      unclassified += 1;
      continue;
    }
    const topic = topicById.get(attempt.topicId);
    const discipline = topic
      ? disciplineById.get(topic.disciplineId)
      : undefined;
    const current = byTopic.get(attempt.topicId) ?? {
      questions: 0,
      correct: 0,
      topicName: topic?.name ?? `Tópico ${attempt.topicId}`,
      disciplineName: discipline?.name ?? "",
    };
    current.questions += 1;
    if (attempt.correct) current.correct += 1;
    byTopic.set(attempt.topicId, current);
  }

  const topics: SessionTopicResult[] = Array.from(byTopic.entries())
    .map(([topicId, row]) => {
      const previous = beforeById.get(topicId);
      const afterSnapshot = afterById.get(topicId);
      return {
        topicId,
        topicName: row.topicName,
        disciplineName: row.disciplineName,
        questions: row.questions,
        correct: row.correct,
        errors: row.questions - row.correct,
        accuracy: pct(row.correct, row.questions),
        accuracyBefore: pct(
          previous?.correct ?? 0,
          previous?.resolved ?? 0,
          previous?.correct ? 100 : 0,
        ),
        readinessDelta: Math.round(
          (afterSnapshot?.readiness ?? 0) - (previous?.readiness ?? 0),
        ),
      };
    })
    .sort((a, b) => b.questions - a.questions);

  const questions = topics.reduce((sum, item) => sum + item.questions, 0);
  const correct = topics.reduce((sum, item) => sum + item.correct, 0);

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  for (const topic of topics) {
    if (topic.questions >= 3 && topic.accuracy >= 70) {
      strengths.push(
        `${topic.topicName} — ${topic.accuracy}% em ${topic.questions} questões`,
      );
    } else if (topic.accuracy < 60) {
      weaknesses.push(
        `${topic.topicName} — ${topic.accuracy}% (${topic.errors} ${topic.errors === 1 ? "erro" : "erros"} em ${topic.questions})`,
      );
    }
  }
  if (strengths.length === 0 && topics.length > 0) {
    const best = [...topics].sort((a, b) => b.accuracy - a.accuracy)[0];
    if (best && best.accuracy >= 60) {
      strengths.push(
        `${best.topicName} — ${best.accuracy}% em ${best.questions} questões`,
      );
    }
  }
  if (weaknesses.length === 0 && topics.length > 0) {
    const worst = [...topics].sort((a, b) => a.accuracy - b.accuracy)[0];
    if (worst && worst.accuracy < 80) {
      weaknesses.push(
        `${worst.topicName} — ${worst.accuracy}% em ${worst.questions} questões (abaixo de 80%)`,
      );
    }
  }

  const totalQuestions = questions + unclassified;
  const totalCorrect = correct; // tentativas sem tópico não têm acerto contabilizado no tópico

  return {
    questions: totalQuestions,
    correct: totalCorrect,
    errors: totalQuestions - totalCorrect,
    accuracy: pct(totalCorrect, totalQuestions),
    accuracyBefore: Math.round(input.globalBefore ?? 0),
    accuracyAfter: Math.round(input.globalAfter ?? 0),
    topics,
    strengths,
    weaknesses,
    noData: totalQuestions === 0,
    unclassified,
  };
}

/**
 * Aviso discreto de "nenhuma resposta detectada há X min" durante a sessão.
 * Puro para poder testar a regra sem esperar 4 minutos na tela.
 */
export function shouldWarnNoCapture(
  minutesSinceLastCapture: number | null,
  thresholdMinutes = 4,
): boolean {
  if (minutesSinceLastCapture === null) return false;
  if (!Number.isFinite(minutesSinceLastCapture)) return false;
  return minutesSinceLastCapture >= Math.max(1, thresholdMinutes);
}

/** Minutos inteiros desde um instante ISO (null quando a data não é válida). */
export function minutesSinceIso(
  iso: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.floor((nowMs - at) / 60000));
}

/** Resumo de uma linha para o recibo salvo em localStorage. */
export function summarizeReport(report: SessionReport): string {
  if (report.noData) return "Nenhuma questão nova detectada nesta sessão.";
  const focus = report.weaknesses[0] || report.strengths[0] || "";
  const base = `${report.correct}/${report.questions} acertos (${report.accuracy}%)`;
  return focus ? `${base} · foco: ${focus}` : base;
}
