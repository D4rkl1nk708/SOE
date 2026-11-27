/**
 * Modelo de leitura do Caderno Vivo.
 *
 * O texto da seção vem do PDF como linhas separadas por "\n". Essas linhas são
 * a *quebra física* da página, não parágrafos: uma frase começa numa linha e
 * termina duas abaixo. Aqui as linhas são recombinadas em parágrafos de verdade
 * (a mesma regra que qualquer leitor de PDF usa) — nada de texto inventado, só
 * o reflow do que existe.
 *
 * Quando o documento foi importado na v6.9.6+, `pageSpans` diz de qual página
 * cada trecho veio — aí o leitor mostra o número na margem. PDF antigo não tem
 * esse metadado e NÃO se inventa número: o bloco fica sem página.
 */

export type ReadingPageSpan = { page: number; start: number; end: number };

export type ReadingSection = {
  title: string;
  startPage: number;
  endPage: number;
  text: string;
  pageSpans?: ReadingPageSpan[];
};

export type ReadingBlock = {
  /** Página do PDF, quando o metadado existe. */
  page?: number;
  paragraphs: string[];
};

type Line = { text: string; start: number };

const SENTENCE_END = /[.!?:;…]["')\]]?$/;
/** Linhas curtas e sem pontuação final são título, não prosa. */
const HEADING_MAX_LENGTH = 80;

function linesWithOffsets(text: string): Line[] {
  const lines: Line[] = [];
  let offset = 0;
  for (const raw of String(text || "").split("\n")) {
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) lines.push({ text: trimmed, start: offset + leading });
    offset += raw.length + 1; // +1 do "\n" consumido pelo split
  }
  return lines;
}

function pageForOffset(spans: ReadingPageSpan[] | undefined, offset: number) {
  if (!spans || spans.length === 0) return undefined;
  const found = spans.find((span) => offset >= span.start && offset < span.end);
  if (found) return found.page;
  let page: number | undefined;
  for (const span of spans) {
    if (span.start <= offset) page = span.page;
  }
  return page;
}

/** `1`, `1.2`, `1.2.3`, `Capítulo 3`, `Aula 4`... */
const NUMBERED_PREFIX = /^\d{1,3}(?:\.\d{1,3})*[).-]?\s/;
const KEYWORD_TITLE =
  /^(?:cap[íi]tulo|aula|t[óo]pico|se[çc][ãa]o|unidade|m[óo]dulo|parte)\s/i;

/**
 * Título de seção pelo formato: curto em palavras, sem pontuação de fim de
 * frase, com a linha seguinte começando maiúscula — ou caixa alta, ou prefixo
 * numerado/palavra-chave. Uma linha longa de prosa que por acaso termina numa
 * palavra curta NÃO pode ser confundida com título (era o bug que quebrava o
 * parágrafo no meio da frase).
 */
function isHeading(line: Line, next: Line | undefined): boolean {
  if (!next) return false;
  if (line.text.length > HEADING_MAX_LENGTH) return false;
  if (SENTENCE_END.test(line.text)) return false;

  const words = line.text.split(/\s+/).filter(Boolean).length;
  const allCaps =
    line.text === line.text.toUpperCase() && /[A-ZÀ-Ý]/.test(line.text);
  const numbered =
    NUMBERED_PREFIX.test(line.text) || KEYWORD_TITLE.test(line.text);
  if (!(words <= 10 || allCaps || numbered)) return false;

  // Título seguido de prosa que começa com maiúscula: não é continuação.
  return /^[A-ZÀ-Ý0-9(]/.test(next.text);
}

/**
 * Quebra o texto da seção em blocos de página, recombinando as linhas em
 * parágrafos. Sem `pageSpans` devolve um único bloco sem página.
 */
export function splitSectionIntoBlocks(
  section: ReadingSection,
): ReadingBlock[] {
  const lines = linesWithOffsets(section.text);
  if (lines.length === 0) return [];

  const hasPages =
    Array.isArray(section.pageSpans) && section.pageSpans.length > 0;
  const blocks: ReadingBlock[] = [];
  let paragraph = "";
  let paragraphPage: number | undefined;
  let lastLineEndsParagraph = true;

  const flush = () => {
    if (!paragraph.trim()) return;
    const last = blocks[blocks.length - 1];
    if (last && last.page === paragraphPage)
      last.paragraphs.push(paragraph.trim());
    else blocks.push({ page: paragraphPage, paragraphs: [paragraph.trim()] });
    paragraph = "";
  };

  lines.forEach((line, index) => {
    const page = hasPages
      ? pageForOffset(section.pageSpans, line.start)
      : undefined;
    const next = lines[index + 1];
    // Título só começa parágrafo quando a frase anterior terminou: linha curta
    // no meio de uma frase é continuação (pdf-parse quebra a linha antes de uma
    // palavra maiúscula como "Constituição").
    const heading = lastLineEndsParagraph && isHeading(line, next);

    // Página nova fecha o parágrafo em curso (o número vai na margem).
    if (paragraph && page !== paragraphPage) flush();

    if (heading) {
      flush();
      blocks.push({ page, paragraphs: [line.text] });
      lastLineEndsParagraph = true;
      return;
    }

    if (!paragraph || lastLineEndsParagraph) {
      flush();
      paragraph = line.text;
      paragraphPage = page;
    } else {
      // Continuação da mesma frase: hífen no fim da linha não vira hífen solto.
      paragraph = paragraph.endsWith("-")
        ? `${paragraph.slice(0, -1)}${line.text}`
        : `${paragraph} ${line.text}`;
    }
    lastLineEndsParagraph = SENTENCE_END.test(line.text);
  });

  flush();

  // O primeiro parágrafo costuma ser o próprio título da seção, que já aparece
  // no cabeçalho do painel — repetir não ajuda a ler.
  const first = blocks[0]?.paragraphs[0];
  if (
    first &&
    first.trim().toLowerCase() ===
      String(section.title || "")
        .trim()
        .toLowerCase()
  ) {
    blocks[0].paragraphs.shift();
    if (blocks[0].paragraphs.length === 0) blocks.shift();
  }
  return blocks;
}

/** Rótulo do progresso: "4 de 55". */
export function sectionProgressLabel(index: number, total: number): string {
  const safeTotal = Math.max(0, Math.floor(total));
  if (safeTotal === 0) return "0 de 0";
  const current = Math.min(safeTotal, Math.max(1, Math.floor(index) + 1));
  return `${current} de ${safeTotal}`;
}

/** Faixa de páginas da seção, para o cabeçalho. */
export function sectionPagesLabel(section: ReadingSection): string {
  if (!section) return "";
  if (section.startPage === section.endPage)
    return `página ${section.startPage}`;
  return `páginas ${section.startPage}–${section.endPage}`;
}

/**
 * Trecho da seção que vai como contexto para a IA (≤ 600 caracteres, como o
 * contrato da aula interativa pede).
 */
export function contextSnippet(text: string, limit = 600): string {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * Rótulo da seção sem a numeração que veio do PDF (v6.9.15, C2).
 *
 * O título da 1ª seção costuma repetir o título do documento ("1 Introducao"),
 * e os dois seletores do leitor ficavam com o mesmo texto. Aqui a numeração do
 * PDF sai e a tela põe o papel de cada seletor: "Doc · …" e "Seção 1 · …".
 */
export function sectionLabel(title: string | undefined): string {
  const raw = String(title ?? "").trim();
  const clean = raw
    // Uma ou mais marcas de numeração ("1. ", "3.2.1 ", "2) ") na frente.
    .replace(/^(?:\s*\d+(?:\.\d+)*\s*[.):\-–—]?\s*)+/, "")
    .trim();
  return clean || raw;
}
