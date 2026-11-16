/**
 * Extração de PDF e divisão em seções.
 *
 * O objetivo é transformar um PDF de apostila/edital em uma lista de seções
 * com faixa de páginas, para que o conteúdo possa ser indexado por disciplina
 * ou tópico sem depender de um sumário explícito no arquivo.
 *
 * `splitIntoSections` é pura (recebe o texto já extraído por página) e é o que
 * a suíte de testes cobre; `extractPdf` apenas coleta o texto com o pdf-parse e
 * delega a divisão.
 */
// @ts-ignore - pdf-parse 1.1.1 não publica tipos para o entry interno; o entry
// público (`pdf-parse`) executa um bloco de debug quando `module.parent` não
// existe (caso do ESM), então importamos o módulo real.
import pdf from "pdf-parse/lib/pdf-parse.js";

export type PdfSection = {
  title: string;
  startPage: number; // 1-based
  endPage: number; // 1-based, inclusive
  text: string;
};

export type PdfDocument = {
  pages: number;
  title: string;
  sections: PdfSection[];
};

/** Título usado quando nenhuma linha do PDF parece um cabeçalho de seção. */
const FALLBACK_TITLE = "Documento inteiro";
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

type PdfPageProxy = {
  getTextContent: (options?: {
    normalizeWhitespace?: boolean;
    disableCombineTextItems?: boolean;
  }) => Promise<{ items?: Array<{ str?: string; transform?: number[] }> }>;
};

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
    const text = kept
      .map((line) => line.text)
      .join("\n")
      .trim();
    if (!text) return [];
    return [
      {
        title: FALLBACK_TITLE,
        startPage: 1,
        endPage: Math.max(pages.length, 1),
        text,
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
    const text = chunk
      .map((line) => line.text)
      .join("\n")
      .trim();
    if (!text) return;

    const startPage = chunk[0].page;
    const lastPage = chunk[chunk.length - 1].page;
    sections.push({
      title: chunk[0].text.trim(),
      startPage,
      endPage: Math.max(startPage, lastPage),
      text,
    });
  });

  return sections;
}

/** Nome do arquivo sem diretório e sem extensão. */
function titleFromFileName(fileName?: string): string | undefined {
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
export async function extractPdf(
  buffer: Buffer,
  fileName?: string,
): Promise<PdfDocument> {
  if (!buffer || buffer.length === 0) {
    throw new Error("Buffer de PDF vazio.");
  }

  const pages: string[] = [];
  const parsed = await pdf(buffer, {
    pagerender: async (pageData: PdfPageProxy) => {
      const content = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });

      let text = "";
      let lastY: number | undefined;
      for (const item of content.items ?? []) {
        const str = typeof item?.str === "string" ? item.str : "";
        const y = Array.isArray(item?.transform)
          ? item.transform[5]
          : undefined;
        if (text.length === 0) {
          text = str;
        } else if (y !== undefined && y === lastY) {
          text += str;
        } else {
          text += `\n${str}`;
        }
        if (y !== undefined) lastY = y;
      }

      pages.push(text);
      return text;
    },
  });

  const declaredPages = Number((parsed as { numpages?: number }).numpages) || 0;
  const totalPages = Math.max(declaredPages, pages.length);

  const sections = splitIntoSections(pages);
  const detectedTitle = sections.find(
    (section) => section.title !== FALLBACK_TITLE,
  )?.title;
  const title = (
    detectedTitle ??
    titleFromFileName(fileName) ??
    "Documento"
  ).trim();

  return { pages: totalPages, title, sections };
}
