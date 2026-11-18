/**
 * Edital do usuário → cobertura real.
 *
 * O edital é sempre o que o usuário escolhe/importa (nada de mapa fixo de
 * concurso). Aqui ficam duas funções puras:
 *
 *  - `suggestTopicLinks`: sugere tópicos do app para cada linha do edital por
 *    similaridade de nome (sempre ajustável à mão na UI).
 *  - `computeEditalCoverage`: cobertura por bloco/disciplina do edital —
 *    tópicos ligados, questões, acerto e os blocos sem nenhuma questão.
 */

import { normalizeString } from "./utils";

export interface EditalRowLike {
  id: string;
  discipline: string;
  topic: string;
  completed: boolean;
  isHeader?: boolean;
  topicIds?: number[];
}

export interface CoverageTopicLike {
  id: number;
  name: string;
  disciplineId: number;
  performance?: {
    correctCount?: number;
    errorCount?: number;
    questionsResolved?: number;
  } | null;
}

export interface CoverageDisciplineLike {
  id: number;
  name: string;
}

export interface TopicSuggestion {
  rowId: string;
  topicIds: number[];
  disciplineId: number | null;
  score: number;
  reason: string;
}

export interface CoverageBlock {
  discipline: string;
  disciplineId: number | null;
  rows: number;
  rowsCompleted: number;
  rowsLinked: number;
  linkedTopicIds: number[];
  questions: number;
  correct: number;
  errors: number;
  accuracy: number | null;
  covered: boolean;
}

export interface EditalCoverageResult {
  blocks: CoverageBlock[];
  totals: {
    rows: number;
    rowsLinked: number;
    linkedTopics: number;
    questions: number;
    correct: number;
    errors: number;
    accuracy: number | null;
    coveragePercent: number;
  };
  /** Blocos do edital sem nenhuma questão registrada. */
  emptyBlocks: string[];
}

const STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "no",
  "na",
  "nos",
  "nas",
  "em",
  "para",
  "com",
  "sobre",
  "a",
  "o",
  "as",
  "os",
  "um",
  "uma",
  "ao",
  "aos",
  "que",
]);

function tokens(value: string): string[] {
  return normalizeString(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/** Similaridade 0..1 entre dois nomes (Jaccard de tokens + bônus por contenção). */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeString(a);
  const nb = normalizeString(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const setA = new Set(ta);
  const setB = new Set(tb);
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  // "Crimes contra a administração" ⊂ "Crimes contra a Administração Pública"
  const contains = na.includes(nb) || nb.includes(na) ? 0.9 : 0;
  return Math.max(jaccard, contains);
}

/**
 * Sugere 1+ tópicos para cada linha do edital. Nunca grava: a UI mostra a
 * sugestão e o usuário confirma/edita. Linhas de cabeçalho são ignoradas.
 */
export function suggestTopicLinks(
  rows: EditalRowLike[],
  topics: CoverageTopicLike[],
  disciplines: CoverageDisciplineLike[],
  options: { threshold?: number; maxSuggestions?: number } = {},
): TopicSuggestion[] {
  const threshold = options.threshold ?? 0.45;
  const maxSuggestions = options.maxSuggestions ?? 3;
  const disciplineByName = new Map<string, number>();
  for (const discipline of disciplines || [])
    disciplineByName.set(normalizeString(discipline.name), discipline.id);

  const suggestions: TopicSuggestion[] = [];
  for (const row of rows || []) {
    if (!row || row.isHeader) continue;
    const rowDisciplineId = disciplineByName.get(
      normalizeString(row.discipline),
    );

    const scored = (topics || [])
      .map((topic) => {
        const rowText = `${row.discipline} ${row.topic}`;
        const topicText = `${
          disciplines.find((d) => d.id === topic.disciplineId)?.name || ""
        } ${topic.name}`;
        let score = nameSimilarity(row.topic, topic.name);
        // Reforça quando a disciplina bate (nome normalizado).
        if (rowDisciplineId && topic.disciplineId === rowDisciplineId)
          score = Math.min(1, score + 0.15);
        // Evita casar tópico de outra disciplina só pelo nome.
        else if (rowDisciplineId && topic.disciplineId !== rowDisciplineId)
          score = score * 0.8;
        // Comparação do texto completo como desempate suave.
        score = Math.max(score, nameSimilarity(rowText, topicText) * 0.85);
        return { topic, score };
      })
      .filter((item) => item.score >= threshold)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      suggestions.push({
        rowId: row.id,
        topicIds: [],
        disciplineId: rowDisciplineId ?? null,
        score: 0,
        reason: "Nenhum tópico parecido encontrado",
      });
      continue;
    }

    const chosen = scored.slice(0, maxSuggestions);
    suggestions.push({
      rowId: row.id,
      topicIds: chosen.map((item) => item.topic.id),
      disciplineId: rowDisciplineId ?? chosen[0].topic.disciplineId,
      score: Math.round(chosen[0].score * 100) / 100,
      reason: `Sugerido por similaridade de nome (${Math.round(
        chosen[0].score * 100,
      )}%)`,
    });
  }
  return suggestions;
}

export function computeEditalCoverage(
  rows: EditalRowLike[],
  topics: CoverageTopicLike[],
  disciplines: CoverageDisciplineLike[],
): EditalCoverageResult {
  const topicById = new Map<number, CoverageTopicLike>();
  for (const topic of topics || []) topicById.set(topic.id, topic);
  const disciplineByName = new Map<string, number>();
  for (const discipline of disciplines || [])
    disciplineByName.set(normalizeString(discipline.name), discipline.id);

  const blocks = new Map<string, CoverageBlock>();
  const questionTotals = (topic: CoverageTopicLike) => {
    const perf = topic.performance || {};
    const correct = Number(perf.correctCount) || 0;
    const errors = Number(perf.errorCount) || 0;
    const resolved = Math.max(
      Number(perf.questionsResolved) || 0,
      correct + errors,
    );
    return { correct, errors, resolved };
  };

  for (const row of rows || []) {
    if (!row || row.isHeader) continue;
    const blockName = row.discipline || "Sem disciplina";
    let block = blocks.get(blockName);
    if (!block) {
      block = {
        discipline: blockName,
        disciplineId: disciplineByName.get(normalizeString(blockName)) ?? null,
        rows: 0,
        rowsCompleted: 0,
        rowsLinked: 0,
        linkedTopicIds: [],
        questions: 0,
        correct: 0,
        errors: 0,
        accuracy: null,
        covered: false,
      };
      blocks.set(blockName, block);
    }
    block.rows += 1;
    if (row.completed) block.rowsCompleted += 1;
    const linked = Array.isArray(row.topicIds) ? row.topicIds : [];
    if (linked.length > 0) block.rowsLinked += 1;
    for (const topicId of linked) {
      if (block.linkedTopicIds.includes(topicId)) continue;
      block.linkedTopicIds.push(topicId);
      const topic = topicById.get(topicId);
      if (!topic) continue;
      const totals = questionTotals(topic);
      block.questions += totals.resolved;
      block.correct += totals.correct;
      block.errors += totals.errors;
    }
  }

  const result: CoverageBlock[] = [];
  for (const block of blocks.values()) {
    const answered = block.correct + block.errors;
    block.accuracy =
      answered > 0 ? Math.round((block.correct / answered) * 100) : null;
    block.covered = block.linkedTopicIds.length > 0;
    result.push(block);
  }
  result.sort((a, b) => {
    if (a.questions !== b.questions) return b.questions - a.questions;
    return a.discipline.localeCompare(b.discipline, "pt-BR");
  });

  const totalsRows = result.reduce((sum, block) => sum + block.rows, 0);
  const rowsLinked = result.reduce((sum, block) => sum + block.rowsLinked, 0);
  const linkedTopics = new Set<number>();
  for (const block of result)
    for (const id of block.linkedTopicIds) linkedTopics.add(id);
  const questions = result.reduce((sum, block) => sum + block.questions, 0);
  const correct = result.reduce((sum, block) => sum + block.correct, 0);
  const errors = result.reduce((sum, block) => sum + block.errors, 0);
  const answered = correct + errors;

  return {
    blocks: result,
    totals: {
      rows: totalsRows,
      rowsLinked,
      linkedTopics: linkedTopics.size,
      questions,
      correct,
      errors,
      accuracy: answered > 0 ? Math.round((correct / answered) * 100) : null,
      coveragePercent:
        totalsRows > 0 ? Math.round((rowsLinked / totalsRows) * 100) : 0,
    },
    emptyBlocks: result
      .filter((block) => block.questions === 0)
      .map((b) => b.discipline),
  };
}

/** Converte o edital antigo (settings.editalRows) para o concurso escolhido. */
export function buildExamEditalMigration(
  exams: Array<{
    id: string;
    name: string;
    date: string;
    editalRows?: EditalRowLike[];
  }>,
  legacyRows: EditalRowLike[] | undefined,
  activeExamId?: string,
) {
  const rows = Array.isArray(legacyRows) ? legacyRows : [];
  if (rows.length === 0) return null;
  if (
    exams.some(
      (exam) => Array.isArray(exam.editalRows) && exam.editalRows.length > 0,
    )
  )
    return null;
  const target =
    exams.find((exam) => exam.id === activeExamId) || exams[0] || null;
  if (!target) return null;
  return {
    activeExamId: target.id,
    examId: target.id,
    warning:
      `O edital existente (${rows.length} linhas) foi vinculado ao concurso "${target.name}". ` +
      "Você pode trocar de concurso ou mover o edital em Edital > Concurso ativo.",
    rows,
  };
}

/**
 * Preserva os vínculos (linha → tópicos) quando a tela salva o edital inteiro.
 * A tela de Edital não conhece `topicIds`; sem isto cada gravação apagaria os
 * vínculos feitos pelo painel de cobertura.
 */
export function preserveRowLinks(
  incoming: EditalRowLike[],
  previous: EditalRowLike[],
): EditalRowLike[] {
  const previousLinks = new Map<string, number[]>();
  for (const row of previous || []) {
    if (Array.isArray(row?.topicIds) && row.topicIds.length > 0) {
      previousLinks.set(row.id, row.topicIds);
    }
  }
  return (incoming || []).map((row) => {
    if (Array.isArray(row.topicIds) && row.topicIds.length > 0) return row;
    const kept = previousLinks.get(row.id);
    return kept ? { ...row, topicIds: kept } : row;
  });
}
