/**
 * Paginação do leitor (v6.9.13).
 *
 * Por que existe: com rolagem, papel vence a tela na compreensão (g 0,35–0,48);
 * sem rolagem, os dois empatam. Paginar é a intervenção com melhor relação
 * evidência/esforço no modo leitura — e segmentar reduz carga (Rey et al.,
 * 2019). Por isso a unidade de leitura aqui é a *página*, não o scroll.
 *
 * Regras:
 *  - um parágrafo nunca é cortado no meio; se um único parágrafo passa do
 *    orçamento (`maxWords`), ele é dividido por frase — e, se uma frase sozinha
 *    ainda estourar, por palavra, nunca no meio de uma palavra;
 *  - o texto é preservado: `pages.flatMap(p => p.blocks).join(" ")` reproduz
 *    `blocks.join(" ")` (parágrafos já normalizados pelo reflow do PDF);
 *  - `startsAt` é a âncora da página (primeiras palavras), estável o bastante
 *    para reencontrar a posição depois de repaginar com outro `maxWords`.
 */

export type Page = {
  blocks: string[];
  words: number;
  /** Primeiras palavras da página — âncora para restaurar a posição. */
  startsAt: string;
  /** A página termina no meio de um parágrafo (continua na próxima). */
  continues?: boolean;
};

export type PaginateOptions = {
  maxWords?: number;
  maxBlocks?: number;
};

/** 1–2 parágrafos: cabe na tela de um celular sem rolagem. */
export const DEFAULT_MAX_WORDS = 220;
/** Piso do repaginador: abaixo disso a página fica sem ideia completa. */
export const MIN_MAX_WORDS = 40;
/** Quantas palavras formam a âncora de uma página. */
const ANCHOR_WORDS = 8;

/** Conta palavras como o leitor conta: blocos de espaço não contam. */
export function countWords(text: string): number {
  const clean = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return 0;
  return clean.split(" ").length;
}

function normalize(text: string): string {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Início da página: as primeiras palavras, normalizadas. */
export function anchorOf(text: string): string {
  return normalize(text).split(" ").slice(0, ANCHOR_WORDS).join(" ");
}

/**
 * Divide um parágrafo grande em pedaços que cabem no orçamento, sempre
 * cortando depois de pontuação de fim de frase; uma frase sozinha maior que o
 * orçamento é cortada por palavra (nunca no meio de uma palavra).
 */
function splitOversized(text: string, maxWords: number): string[] {
  const sentences = normalize(text)
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean);
  const pieces: string[] = [];
  let current = "";

  const flush = () => {
    if (current) pieces.push(current);
    current = "";
  };

  for (const sentence of sentences) {
    const words = countWords(sentence);
    if (words === 0) continue;
    if (words > maxWords) {
      flush();
      const tokens = sentence.split(" ");
      for (let index = 0; index < tokens.length; index += maxWords) {
        const chunk = tokens.slice(index, index + maxWords).join(" ");
        if (chunk) pieces.push(chunk);
      }
      continue;
    }
    if (!current) {
      current = sentence;
      continue;
    }
    if (countWords(current) + words > maxWords) {
      flush();
      current = sentence;
    } else {
      current = `${current} ${sentence}`;
    }
  }
  flush();
  return pieces;
}

/**
 * Quebra os parágrafos em páginas. A ordem e o texto são preservados; nenhuma
 * página passa de `maxWords` palavras nem de `maxBlocks` blocos.
 */
export function paginateBlocks(
  blocks: string[],
  opts: PaginateOptions = {},
): Page[] {
  const maxWords = Math.max(1, Math.floor(opts.maxWords ?? DEFAULT_MAX_WORDS));
  const maxBlocks =
    opts.maxBlocks && opts.maxBlocks > 0
      ? Math.floor(opts.maxBlocks)
      : Number.POSITIVE_INFINITY;

  const pages: Page[] = [];
  let current: string[] = [];
  let currentWords = 0;

  const flush = () => {
    if (current.length === 0) return;
    pages.push({
      blocks: current,
      words: currentWords,
      startsAt: anchorOf(current[0]),
    });
    current = [];
    currentWords = 0;
  };

  for (const raw of Array.isArray(blocks) ? blocks : []) {
    const block = normalize(raw);
    if (!block) continue;
    const words = countWords(block);

    // Parágrafo que não cabe numa página: fecha a página em curso e divide.
    if (words > maxWords) {
      flush();
      const pieces = splitOversized(block, maxWords);
      pieces.forEach((piece, index) => {
        const isLast = index === pieces.length - 1;
        if (isLast) {
          current = [piece];
          currentWords = countWords(piece);
          return;
        }
        pages.push({
          blocks: [piece],
          words: countWords(piece),
          startsAt: anchorOf(piece),
          continues: true,
        });
      });
      continue;
    }

    if (
      current.length > 0 &&
      (currentWords + words > maxWords || current.length >= maxBlocks)
    ) {
      flush();
    }
    current.push(block);
    currentWords += words;
  }
  flush();

  return pages;
}

/**
 * Página que contém `offset`, onde offset é o índice do caractere no texto
 * concatenado com espaço (`blocks.join(" ")`). Além do fim devolve a última.
 */
export function pageForOffset(pages: Page[], offset: number): number {
  if (!Array.isArray(pages) || pages.length === 0) return 0;
  const target = Math.max(0, Math.floor(Number(offset) || 0));
  let cursor = 0;
  for (let index = 0; index < pages.length; index++) {
    const length = pages[index].blocks.join(" ").length;
    if (target < cursor + length) return index;
    cursor += length + 1; // +1 do espaço entre blocos
  }
  return pages.length - 1;
}
