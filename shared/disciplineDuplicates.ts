/**
 * Disciplinas duplicadas (v6.9.7, item 7).
 *
 * O TEC manda "Matéria: Direito Administrativo (Doutrina e Leis Federais)" e o
 * usuário já tem "Direito Administrativo": o matcher não reconhece e a base
 * fica com 24 disciplinas onde deveriam existir 12. Este módulo é puro: só
 * agrupa e calcula o impacto. Quem mescla é o storage, com backup.
 */
import { normalizeString } from "./utils";

export interface DisciplineLike {
  id: number;
  name: string;
  weight?: number;
  order?: number;
  studyTimeSeconds?: number;
  performance?: { questionsResolved?: number; accuracy?: number } | null;
}

export interface DuplicateDisciplineRef {
  id: number;
  name: string;
  questions: number;
}

export interface DuplicateGroup {
  /** Chave normalizada compartilhada por todas as disciplinas do grupo. */
  key: string;
  /** Destino sugerido: a disciplina com mais questões (empate → menor id). */
  suggestedTarget: DuplicateDisciplineRef;
  /** Origens: tudo que não é o destino. */
  sources: DuplicateDisciplineRef[];
  /** Todas as disciplinas do grupo, destino incluso. */
  disciplineIds: number[];
  /** Questões que passam a somar no destino. */
  impact: {
    questions: number;
    disciplines: number;
    /** 0 até o servidor contar os tópicos afetados. */
    topics: number;
  };
}

export interface DuplicateOverview {
  groups: DuplicateGroup[];
  disciplinesBefore: number;
  disciplinesAfter: number;
  questionsMoved: number;
}

/**
 * Chave de comparação de nome de disciplina.
 *
 * Limpa prefixo ("Matéria:", "TI -"), parênteses explicativos
 * ("(Doutrina e Leis Federais)") e cauda de fonte jurídica
 * ("- Doutrina e Leis", "- Jurisprudência"), depois normaliza acento/espaço.
 */
export function normalizeDisciplineKey(
  name: string | null | undefined,
): string {
  let value = String(name || "");
  // "Matéria:", "Disciplina -", "Assunto:"
  value = value.replace(
    /^\s*(mat[eé]ria|disciplina|assunto)\s*[:\-–—]\s*/i,
    "",
  );
  // "TI - X", "T.I. - X"
  value = value.replace(/^\s*t\.?\s*i\.?\s*[-–—]\s*/i, "");
  // Parênteses explicativos: "(Doutrina e Leis Federais)", "(Parte 1)"
  value = value.replace(/\([^)]*\)/g, " ");
  // Cauda de fonte jurídica: "- Doutrina e Leis", "- Jurisprudência"
  value = value.replace(
    /\s*[-–—]\s*(doutrina|leis?|jurisprud[eê]ncia|teoria|exerc[ií]cios?|quest[oõ]es)\b.*$/i,
    " ",
  );
  return normalizeString(value);
}

function questionsOf(discipline: DisciplineLike): number {
  return Math.max(
    0,
    Math.round(Number(discipline.performance?.questionsResolved) || 0),
  );
}

/**
 * Agrupa por chave normalizada. Um grupo só existe com 2+ disciplinas — e é
 * exatamente o que torna a consolidação idempotente: depois de mesclar, a
 * chave fica com uma disciplina só e some da lista.
 */
export function groupDisciplineDuplicates(
  disciplines: DisciplineLike[] | null | undefined,
): DuplicateGroup[] {
  const byKey = new Map<string, DisciplineLike[]>();
  for (const discipline of disciplines || []) {
    if (!discipline || typeof discipline.id !== "number") continue;
    const key = normalizeDisciplineKey(discipline.name);
    if (!key) continue;
    const list = byKey.get(key) || [];
    list.push(discipline);
    byKey.set(key, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => {
      const diff = questionsOf(b) - questionsOf(a);
      if (diff !== 0) return diff;
      return a.id - b.id;
    });
    const [target, ...rest] = sorted;
    groups.push({
      key,
      suggestedTarget: {
        id: target.id,
        name: target.name,
        questions: questionsOf(target),
      },
      sources: rest.map((discipline) => ({
        id: discipline.id,
        name: discipline.name,
        questions: questionsOf(discipline),
      })),
      disciplineIds: sorted.map((discipline) => discipline.id),
      impact: {
        questions: rest.reduce(
          (sum, discipline) => sum + questionsOf(discipline),
          0,
        ),
        disciplines: sorted.length,
        topics: 0,
      },
    });
  }

  return groups.sort(
    (a, b) =>
      b.impact.questions - a.impact.questions ||
      b.impact.disciplines - a.impact.disciplines ||
      a.key.localeCompare(b.key),
  );
}

/** Resumo para o cabeçalho do card: "3 grupos · 15 disciplinas → 12". */
export function summarizeDuplicates(
  disciplines: DisciplineLike[] | null | undefined,
): DuplicateOverview {
  const all = (disciplines || []).filter(
    (discipline) => discipline && typeof discipline.id === "number",
  );
  const groups = groupDisciplineDuplicates(all);
  const questionsMoved = groups.reduce(
    (sum, group) => sum + group.impact.questions,
    0,
  );
  const absorbed = groups.reduce((sum, group) => sum + group.sources.length, 0);
  return {
    groups,
    disciplinesBefore: all.length,
    disciplinesAfter: Math.max(0, all.length - absorbed),
    questionsMoved,
  };
}
