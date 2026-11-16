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

/** Resumo de uma linha para o recibo salvo em localStorage. */
export function summarizeReport(report: SessionReport): string {
  if (report.noData) return "Nenhuma questão nova detectada nesta sessão.";
  const focus = report.weaknesses[0] || report.strengths[0] || "";
  const base = `${report.correct}/${report.questions} acertos (${report.accuracy}%)`;
  return focus ? `${base} · foco: ${focus}` : base;
}
