/**
 * Simulados: o que conta na estatística, nota líquida C/E e entrega em branco.
 *
 * Regra do item 4: um simulado entregue com zero respostas não pode entrar em
 * média/estatística — antes ele gravava `status: completed`, nota 0 e 50
 * brancos, e contaminava todo o histórico.
 */

export interface MockExamLike {
  id?: number;
  name?: string;
  date?: string;
  correct: number;
  wrong: number;
  blank?: number;
  totalQuestions?: number;
  score?: number;
  status?: "in_progress" | "completed";
  mode?: "cebraspe" | "multiple";
  completedAt?: string;
}

export interface SimuladoQuestionLike {
  id: string;
  correctAnswer: string;
}

export interface SimuladoEvaluation {
  correct: number;
  wrong: number;
  blank: number;
  answered: number;
  total: number;
  accuracy: number;
  /** CEBRASPE: acertos − erros (branco vale 0). */
  netScore: number;
  /** Questões erradas que teriam sido melhores em branco (em C/E valem 0). */
  betterBlankCount: number;
  /** Nota líquida se as erradas tivessem ficado em branco. */
  netIfWrongWereBlank: number;
}

export function answeredCount(exam: {
  correct: number;
  wrong: number;
}): number {
  return (
    Math.max(0, Number(exam?.correct) || 0) +
    Math.max(0, Number(exam?.wrong) || 0)
  );
}

/**
 * Só entra em média quem respondeu ao menos uma questão. Simulado salvo como
 * `in_progress` também não conta.
 */
export function isCountableMockExam(
  exam: MockExamLike | null | undefined,
): boolean {
  if (!exam) return false;
  if (exam.status && exam.status !== "completed") return false;
  return answeredCount(exam) > 0;
}

export function countableMockExams<T extends MockExamLike>(
  exams: T[] | null | undefined,
): T[] {
  return (exams || []).filter((exam) => isCountableMockExam(exam));
}

export function mockExamAccuracy(exam: MockExamLike): number | null {
  const answered = answeredCount(exam);
  if (answered === 0) return null;
  return Math.round((Number(exam.correct) / answered) * 100);
}

export interface MockExamSummary {
  total: number;
  countable: number;
  discarded: number;
  averageAccuracy: number | null;
  bestAccuracy: number | null;
  lastAccuracy: number | null;
  averageNetScore: number | null;
}

export function summarizeMockExams(
  exams: MockExamLike[] | null | undefined,
): MockExamSummary {
  const all = exams || [];
  const valid = countableMockExams(all);
  const accuracies = valid
    .map((exam) => mockExamAccuracy(exam))
    .filter((value): value is number => value !== null);
  const sorted = [...valid].sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || "")),
  );
  const last = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const totalCorrect = valid.reduce(
    (sum, exam) => sum + Number(exam.correct || 0),
    0,
  );
  const totalAnswered = valid.reduce(
    (sum, exam) => sum + answeredCount(exam),
    0,
  );
  const netScores = valid.map(
    (exam) => Number(exam.correct || 0) - Number(exam.wrong || 0),
  );

  return {
    total: all.length,
    countable: valid.length,
    discarded: all.length - valid.length,
    averageAccuracy:
      totalAnswered > 0
        ? Math.round((totalCorrect / totalAnswered) * 100)
        : null,
    bestAccuracy: accuracies.length > 0 ? Math.max(...accuracies) : null,
    lastAccuracy: last ? mockExamAccuracy(last) : null,
    averageNetScore:
      netScores.length > 0
        ? Math.round(
            (netScores.reduce((a, b) => a + b, 0) / netScores.length) * 100,
          ) / 100
        : null,
  };
}

export function evaluateSimulado(
  questions: SimuladoQuestionLike[],
  answers: Record<string, string>,
): SimuladoEvaluation {
  let correct = 0;
  let wrong = 0;
  for (const question of questions || []) {
    const selected = String(answers?.[question.id] || "").trim();
    if (!selected) continue;
    if (
      selected.toUpperCase() ===
      String(question.correctAnswer || "").toUpperCase()
    )
      correct++;
    else wrong++;
  }
  const total = (questions || []).length;
  const blank = Math.max(0, total - correct - wrong);
  return {
    correct,
    wrong,
    blank,
    answered: correct + wrong,
    total,
    accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    netScore: correct - wrong,
    betterBlankCount: wrong,
    netIfWrongWereBlank: correct,
  };
}

/** Entrega vazia: descartar em vez de gravar como concluído. */
export function isBlankSubmission(input: {
  correct: number;
  wrong: number;
}): boolean {
  return answeredCount(input) === 0;
}
