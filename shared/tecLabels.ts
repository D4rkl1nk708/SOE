/**
 * Rótulos do TEC que NÃO são disciplina nem assunto de estudo.
 *
 * A página do TEC tem trechos de navegação/rodapé que também usam os rótulos
 * "Matéria:" e "Assunto:" (ex.: "Matéria: Desenvolvimento / Assunto: Blog" na
 * área de conteúdo do site). Sem este filtro o app criava disciplinas como
 * "Desenvolvimento" e assuntos como "Blog" e jogava o acerto no tópico errado.
 */

export const GENERIC_TEC_LABELS: readonly string[] = [
  // navegação / site
  "blog",
  "desenvolvimento",
  "geral",
  "general",
  "outros",
  "outras",
  "home",
  "inicio",
  "principal",
  "painel",
  "dashboard",
  "tec concursos",
  "tecconcursos",
  "concursos",
  "questoes",
  "questao",
  "questão",
  "simulados",
  "simulado",
  "aulas",
  "videoaulas",
  "materiais",
  "ferramentas",
  "cadernos",
  "caderno",
  "estatisticas",
  "estatísticas",
  "desempenho",
  "ranking",
  "noticias",
  "notícias",
  "novidades",
  "guias",
  "guia",
  "artigos",
  "artigo",
  "comunidade",
  "forum",
  "fórum",
  "suporte",
  "contato",
  "planos",
  "assine",
  // os próprios rótulos, quando capturados por engano
  "materia",
  "matéria",
  "disciplina",
  "assunto",
  "topico",
  "tópico",
  "conteudo",
  "conteúdo",
  "questao tec",
  "questão tec",
  "nao informado",
  "não informado",
  "sem assunto",
  "sem disciplina",
];

const GENERIC_SET = new Set(GENERIC_TEC_LABELS.map(normalizeLabel));

/** Minúsculo, sem acento, sem pontuação nas pontas e com espaços colapsados. */
export function normalizeLabel(value: unknown): string {
  return (
    String(value ?? "")
      .replace(/\u00a0/g, " ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      // "TEC - Direito Constitucional" -> "direito constitucional"
      .replace(/^tec(?:\s+concursos)?\s*[-–—:]\s*/, "")
      .replace(/[×✕✖⨯]/g, " ")
      .replace(/[.,;:!?]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Remove prefixos ("Matéria:", "Assunto:") e sobras de layout. */
export function cleanLabel(value: unknown): string {
  let text = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[×✕✖⨯]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // "TEC - Direito Constitucional" -> "Direito Constitucional"
  text = text.replace(/^tec(?:\s+concursos)?\s*[-–—:]\s+/i, "");

  // "Matéria: X" / "Disciplina: X" / "Assunto: X" / "Tópico: X"
  text = text.replace(
    /^(?:mat[eé]ria|disciplina|assunto|t[oó]pico|conte[uú]do)\s*:\s*/i,
    "",
  );

  // "X / Assunto: Y" — fica só com X (o assunto é lido separadamente)
  text = text.replace(
    /\s*\/\s*(?:mat[eé]ria|disciplina|assunto|t[oó]pico|conte[uú]do)\s*:.*$/i,
    "",
  );
  text = text.replace(
    /\s+(?:mat[eé]ria|disciplina|assunto|t[oó]pico|conte[uú]do)\s*:.*$/i,
    "",
  );

  text = text.replace(/^[-–—•·\s]+/, "").replace(/[-–—•·\s/]+$/, "");
  text = text.replace(/\s+/g, " ").trim();

  return text.slice(0, 120);
}

/** true quando o valor é rótulo de navegação, vazio ou numérico. */
export function isGenericLabel(value: unknown): boolean {
  const normalized = normalizeLabel(value);
  if (!normalized) return true;
  if (normalized.length < 3) return true;
  if (/^\d+$/.test(normalized)) return true;
  if (GENERIC_SET.has(normalized)) return true;
  return false;
}

/**
 * Nomes usados pelo servidor (server/tecQuestionClassifier.ts). Mantidos como
 * aliases para que a captura e a classificação usem exatamente a mesma lista.
 */
export const normalizeTecLabel = normalizeLabel;
export const isGenericTecLabel = isGenericLabel;
