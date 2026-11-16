/**
 * Ligações entre o SOE e o TEC Concursos (cadernos).
 *
 * Módulo puro: sem I/O e sem dependências de DOM/Electron, para poder ser
 * reutilizado no servidor, no cliente e testado isoladamente.
 *
 * Regras de segurança:
 * - nunca inventa URL a partir do id do caderno;
 * - só devolve URLs do domínio do TEC, sempre em https;
 * - nunca lança: entrada estranha vira `null` / string vazia.
 */

export type CadernoRef = {
  cadernoId: string;
  cadernoUrl: string;
  disciplina: string;
};

const TEC_HOST = "www.tecconcursos.com.br";
const TEC_ROOT = "https://www.tecconcursos.com.br/";
const TEC_HOME = "https://www.tecconcursos.com.br/";

// Palavras que não ajudam a distinguir disciplinas ("Direito e Processo").
const STOP_WORDS = new Set([
  "a",
  "as",
  "ao",
  "aos",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "of",
  "para",
  "por",
  "the",
]);

/**
 * Normaliza texto para comparação: minúsculas, sem acento, sem pontuação,
 * espaços colapsados.
 */
export function normalize(value: string): string {
  if (typeof value !== "string" || !value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  const normalized = normalize(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

function commonTokenCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  let count = 0;
  for (const token of new Set(a)) {
    if (setB.has(token)) count += 1;
  }
  return count;
}

/**
 * Encontra o caderno do TEC correspondente a uma disciplina.
 *
 * 1. match exato (normalizado);
 * 2. senão, o caderno com mais palavras em comum (mínimo de 2);
 * 3. senão, `null`.
 */
export function matchCadernoForDiscipline(
  cadernos: CadernoRef[],
  disciplineName?: string,
): CadernoRef | null {
  try {
    if (!Array.isArray(cadernos) || cadernos.length === 0) return null;

    const target = normalize(disciplineName ?? "");
    if (!target) return null;

    const candidates = cadernos.filter(
      (caderno) =>
        caderno &&
        typeof caderno === "object" &&
        typeof caderno.disciplina === "string" &&
        caderno.disciplina.trim().length > 0,
    );
    if (candidates.length === 0) return null;

    for (const caderno of candidates) {
      if (normalize(caderno.disciplina) === target) return caderno;
    }

    const targetTokens = tokenize(target);
    if (targetTokens.length < 2) return null;

    let best: CadernoRef | null = null;
    let bestScore = 0;
    for (const caderno of candidates) {
      const score = commonTokenCount(
        targetTokens,
        tokenize(caderno.disciplina),
      );
      if (score >= 2 && score > bestScore) {
        best = caderno;
        bestScore = score;
      }
    }

    return best;
  } catch {
    return null;
  }
}

/**
 * URL utilizável na janela do TEC, ou `null` se a URL não for do TEC.
 * Aceita `http://www.tecconcursos.com.br/...` e normaliza para https.
 * Não monta URL a partir do `cadernoId`.
 */
export function cadernoUrlFor(caderno: CadernoRef): string | null {
  try {
    const raw =
      caderno && typeof caderno.cadernoUrl === "string"
        ? caderno.cadernoUrl.trim()
        : "";
    if (!raw) return null;
    // Rejeita quebras de linha/espaços que dariam margem a injeção de scheme.
    if (/\s/.test(raw)) return null;

    const withHttps = /^http:\/\//i.test(raw)
      ? `https://${raw.slice("http://".length)}`
      : raw;
    if (!/^https:\/\//i.test(withHttps)) return null;

    let parsed: URL;
    try {
      parsed = new URL(withHttps);
    } catch {
      return null;
    }

    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname.toLowerCase() !== TEC_HOST) return null;
    if (parsed.port) return null;
    if (parsed.username || parsed.password) return null;

    const url = parsed.toString();
    return url.startsWith(TEC_ROOT) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Frase curta para o usuário colar na busca do TEC.
 * Não é URL — evita abrir caderno errado quando o match falha.
 */
export function buildTecSearchHint(topicName?: string): string {
  const topic =
    typeof topicName === "string" ? topicName.replace(/\s+/g, " ").trim() : "";
  if (!topic) {
    return `Busque no TEC pelo nome do assunto. Home do TEC: ${TEC_HOME}`;
  }
  const safeTopic = topic.replace(/"/g, "");
  return `Busque no TEC: "${safeTopic}"`;
}
