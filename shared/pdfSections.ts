/**
 * Extração de PDF: tipos e a divisão em seções.
 *
 * Puro de propósito (sem pdf-parse, sem Node): o servidor usa com o texto
 * extraído pelo pdf-parse e o APK usa com o texto extraído pelo pdf.js dentro
 * do WebView. As duas pontas dividem as seções com a MESMA regra.
 */

/** Trecho de `text` que veio de uma página do PDF (offset real no texto). */
export type PdfPageSpan = {
  page: number; // 1-based
  start: number; // offset inclusive em `text`
  end: number; // offset exclusivo em `text`
};

export type PdfSection = {
  title: string;
  startPage: number; // 1-based
  endPage: number; // 1-based, inclusive
  text: string;
  /**
   * De onde cada trecho do texto veio, por página. Só existe para documentos
   * importados a partir da v6.9.6: PDFs antigos não têm esse metadado e o leitor
   * NÃO inventa número de página para eles.
   */
  pageSpans?: PdfPageSpan[];
};

export type PdfDocument = {
  pages: number;
  title: string;
  sections: PdfSection[];
};

/** Título usado quando nenhuma linha do PDF parece um cabeçalho de seção. */
export const FALLBACK_TITLE = "Documento inteiro";
/** Linhas mais longas que isso são prosa, não título. */
const MAX_TITLE_LENGTH = 90;
/** Proporção de páginas em que uma linha precisa aparecer para virar cabeçalho. */
const REPEATED_LINE_RATIO = 0.6;
/**
 * Abaixo deste número de páginas não há como distinguir cabeçalho repetido de
 * conteúdo: com 1 ou 2 páginas qualquer linha aparece em "60% dos casos".
 */
const MIN_PAGES_FOR_HEADER_DETECTION = 3;

/** `1`, `1.2`, `1.2.3` no começo da linha. */
const NUMBERED_PREFIX = /^\d{1,3}(?:\.\d{1,3})*[).-]?\s*/;
/** Número seguido de termo capitalizado: "1 Introdução" sim, "10 sprints" não. */
const NUMBERED_TITLE = /^\d{1,3}(?:\.\d{1,3})*[).-]?\s+[A-ZÀ-Þ0-9(]/;
/** `Capítulo 3`, `CAPÍTULO III`, `Aula 4`, `Tópico 2`, `Unidade 1`... */
const KEYWORD_TITLE =
  /^(?:cap[íi]tulo|aula|t[óo]pico|se[çc][ãa]o|unidade|m[óo]dulo|parte|item)\s+(?:\d{1,3}(?:\.\d{1,3})*|[ivxlcdm]+)\b/i;
/** Pontuação de fim de frase: título não termina assim. */
const SENTENCE_END = /[.;,]$/;
/**
 * Pontuação de fim de frase no meio da linha: linha quebrada de parágrafo
 * ("10 sprints de 20 m. Os sujeitos...") não é título.
 */
const INNER_SENTENCE_END = /[.!?;]\s/;

type KeptLine = {
  text: string;
  page: number; // 1-based
  isTitle: boolean;
};

/** Quebra a página em linhas não vazias, preservando o conteúdo (só trim). */
function linesOf(page: string): string[] {
  return page
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Chave de comparação de linhas repetidas: sem espaços duplicados/caixa. */
function lineKey(line: string): string {
  return line.replace(/\s+/g, " ").trim().toLowerCase();
}

function isNumberedTitle(text: string): boolean {
  if (!NUMBERED_TITLE.test(text)) return false;
  return !INNER_SENTENCE_END.test(text.replace(NUMBERED_PREFIX, ""));
}

function isUpperTitle(line: string): boolean {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  if (SENTENCE_END.test(line)) return false;
  const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 3) return false;
  return letters === letters.toUpperCase();
}

/** Uma linha curta que parece título de seção. */
export function isSectionTitle(line: string): boolean {
  const text = line.trim();
  if (!text || text.length > MAX_TITLE_LENGTH) return false;
  if (SENTENCE_END.test(text)) return false;
  if (KEYWORD_TITLE.test(text)) return true;
  if (isNumberedTitle(text)) return true;
  return isUpperTitle(text);
}

/**
 * Linhas que aparecem em pelo menos 60% das páginas: cabeçalho/rodapé de PDF.
 * Contamos no máximo uma ocorrência por página.
 */
function repeatedLines(pages: string[]): Set<string> {
  const repeated = new Set<string>();
  if (pages.length < MIN_PAGES_FOR_HEADER_DETECTION) return repeated;

  const counts = new Map<string, number>();
  for (const page of pages) {
    const seen = new Set<string>();
    for (const line of linesOf(page)) {
      const key = lineKey(line);
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const threshold = Math.ceil(pages.length * REPEATED_LINE_RATIO);
  for (const [key, count] of counts) {
    if (count >= threshold) repeated.add(key);
  }
  return repeated;
}

/**
 * Divide o texto de cada página em seções.
 *
 * Regras:
 *  - linhas vazias e cabeçalhos repetidos (>=60% das páginas) são descartados;
 *  - um título abre uma seção que vai até o próximo título;
 *  - `startPage`/`endPage` são as páginas da primeira e da última linha da
 *    seção (duas seções podem compartilhar a página em que a segunda começa);
 *  - sem nenhum título, o documento inteiro vira uma seção única;
 *  - nunca retorna seção com texto vazio.
 *
 * Conteúdo anterior ao primeiro título (capa, sumário) não pertence a
 * nenhuma seção e é descartado.
 */
/**
 * Junta as linhas preservando o mapa de páginas. Cada linha continua sendo um
 * parágrafo (o texto do PDF quebra assim), e o offset de cada página fica
 * registrado para o leitor mostrar o número na margem.
 */
function joinWithPageSpans(lines: KeptLine[]): {
  text: string;
  pageSpans: PdfPageSpan[];
} {
  let text = "";
  const pageSpans: PdfPageSpan[] = [];
  lines.forEach((line, index) => {
    if (index > 0) text += "\n";
    const start = text.length;
    text += line.text;
    const last = pageSpans[pageSpans.length - 1];
    if (last && last.page === line.page) last.end = text.length;
    else pageSpans.push({ page: line.page, start, end: text.length });
  });
  return { text, pageSpans };
}

export function splitIntoSections(pages: string[]): PdfSection[] {
  const repeated = repeatedLines(pages);

  const kept: KeptLine[] = [];
  pages.forEach((page, pageIndex) => {
    for (const line of linesOf(page)) {
      if (repeated.has(lineKey(line))) continue;
      kept.push({
        text: line,
        page: pageIndex + 1,
        isTitle: isSectionTitle(line),
      });
    }
  });

  const titleIndexes: number[] = [];
  kept.forEach((line, index) => {
    if (line.isTitle) titleIndexes.push(index);
  });

  if (titleIndexes.length === 0) {
    const joined = joinWithPageSpans(kept);
    const text = joined.text.trim();
    if (!text) return [];
    return [
      {
        title: FALLBACK_TITLE,
        startPage: 1,
        endPage: Math.max(pages.length, 1),
        text,
        pageSpans: joined.pageSpans,
      },
    ];
  }

  const sections: PdfSection[] = [];
  titleIndexes.forEach((startIndex, position) => {
    const endIndex =
      position + 1 < titleIndexes.length
        ? titleIndexes[position + 1]
        : kept.length;
    const chunk = kept.slice(startIndex, endIndex);
    const joined = joinWithPageSpans(chunk);
    const text = joined.text.trim();
    if (!text) return;

    const startPage = chunk[0].page;
    const lastPage = chunk[chunk.length - 1].page;
    sections.push({
      title: chunk[0].text.trim(),
      startPage,
      endPage: Math.max(startPage, lastPage),
      text,
      pageSpans: joined.pageSpans,
    });
  });

  return sections;
}

/** Nome do arquivo sem diretório e sem extensão. */
export function titleFromFileName(fileName?: string): string | undefined {
  if (!fileName) return undefined;
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const withoutExtension = base.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || undefined;
}

/**
 * Texto por página de um PDF, na ordem do documento.
 *
 * Usamos `pagerender` para capturar cada página individualmente (o texto
 * agregado do pdf-parse perde a noção de página). Itens na mesma coordenada
 * vertical são unidos na mesma linha, como no renderizador padrão da lib.
 */
