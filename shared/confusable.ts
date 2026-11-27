/**
 * Intercalação por contraste (v6.9.11, item A3 / 4.3).
 *
 * Evidência: intercalar só ajuda quando os materiais são confundíveis
 * (Brunmair & Richter, 2019); com material dissimilar o efeito desaparece.
 * Em matemática o ganho aparece no teste de 30 dias (Rohrer et al., 2015).
 *
 * Portanto: nunca embaralhar "para variar". Só pares da MESMA disciplina,
 * com similaridade real de nome (Jaccard de tokens normalizados) e um bônus
 * quando ambos tocam o mesmo termo jurídico/técnico que a banca troca.
 */

const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "para",
  "por",
  "com",
  "sem",
  "ao",
  "aos",
  "um",
  "uma",
  "sobre",
  "entre",
  "seu",
  "sua",
  "seus",
  "suas",
  "que",
]);

/** Termos que a banca troca entre si (bônus de contraste). */
const LEGAL_TERMS = [
  "anulacao",
  "revogacao",
  "competencia",
  "atribuicao",
  "principio",
  "prazo",
  "crime",
  "licitacao",
  "contrato",
  "controle",
  "orcamento",
  "conceito",
  "requisito",
  "efeito",
  "prescricao",
  "decadencia",
];

export function normalizeTerm(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokensOf(value: string): string[] {
  return (
    normalizeTerm(value)
      .split(" ")
      .filter((token) => token.length > 2 && !STOPWORDS.has(token))
      // Radical leve: plural não pode separar "ato" de "atos" nem
      // "administrativo" de "administrativos".
      .map((token) =>
        token.length > 3 && token.endsWith("s") && !token.endsWith("ss")
          ? token.slice(0, -1)
          : token,
      )
  );
}

/** Similaridade 0..1 entre dois nomes de tópico. */
export function topicSimilarity(a: string, b: string): number {
  const left = new Set(tokensOf(a));
  const right = new Set(tokensOf(b));
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = left.size + right.size - intersection;
  if (union <= 0) return 0;

  let score = intersection / union;
  const sharesLegalTerm = LEGAL_TERMS.some(
    (term) => left.has(term) && right.has(term),
  );
  if (sharesLegalTerm) score += 0.15;
  return Math.min(1, Math.round(score * 1000) / 1000);
}

export interface ContrastTopic {
  id: number;
  name: string;
  disciplineId: number;
}

export interface ContrastPair {
  a: number;
  b: number;
  score: number;
}

export interface ContrastOptions {
  /** Similaridade mínima (padrão 0.34, conforme a tarefa). */
  minScore?: number;
  /** Máximo de pares por disciplina (padrão 3). */
  perDiscipline?: number;
}

/**
 * Pares confundíveis por disciplina. Guloso: ordena por score desc e só usa
 * cada tópico uma vez, para o bloco de contraste não repetir tema.
 */
export function buildContrastPairs(
  topics: ContrastTopic[],
  opts: ContrastOptions = {},
): ContrastPair[] {
  const minScore = Number.isFinite(opts.minScore as number)
    ? (opts.minScore as number)
    : 0.34;
  const perDiscipline = Math.max(
    1,
    Math.trunc(
      Number.isFinite(opts.perDiscipline as number)
        ? (opts.perDiscipline as number)
        : 3,
    ),
  );

  const byDiscipline = new Map<number, ContrastTopic[]>();
  for (const topic of topics) {
    if (!topic || !Number.isFinite(topic.id)) continue;
    const list = byDiscipline.get(topic.disciplineId) || [];
    list.push(topic);
    byDiscipline.set(topic.disciplineId, list);
  }

  const pairs: ContrastPair[] = [];

  for (const list of byDiscipline.values()) {
    const candidates: ContrastPair[] = [];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const score = topicSimilarity(list[i].name, list[j].name);
        if (score >= minScore) {
          candidates.push({ a: list[i].id, b: list[j].id, score });
        }
      }
    }
    candidates.sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      return x.a - y.a || x.b - y.b;
    });

    const used = new Set<number>();
    let taken = 0;
    for (const pair of candidates) {
      if (taken >= perDiscipline) break;
      if (used.has(pair.a) || used.has(pair.b)) continue;
      used.add(pair.a);
      used.add(pair.b);
      pairs.push(pair);
      taken += 1;
    }
  }

  return pairs.sort((x, y) => y.score - x.score);
}
