import { describe, expect, it } from "vitest";
import { countWords, pageForOffset, paginateBlocks } from "@shared/pagination";

/** Parágrafo previsível com `n` palavras. */
function paragraph(label: string, n: number): string {
  const words = Array.from({ length: n - 1 }, (_, i) => `${label}${i + 1}`);
  return `${label} completo ${words.join(" ")}.`;
}

/** Parágrafo com frases de exatamente `wordsEach` palavras. */
function sentences(count: number, wordsEach = 8): string {
  return Array.from({ length: count }, (_, i) => {
    const words = Array.from({ length: wordsEach }, (_, w) =>
      w === wordsEach - 1 ? `f${i + 1}${w + 1}.` : `f${i + 1}${w + 1}`,
    );
    return `Frase${i + 1} ${words.join(" ")}`;
  }).join(" ");
}

describe("paginateBlocks", () => {
  it("preserva o texto integral e a ordem original", () => {
    const blocks = [
      paragraph("um", 40),
      paragraph("dois", 55),
      paragraph("tres", 30),
      paragraph("quatro", 70),
    ];
    const pages = paginateBlocks(blocks, { maxWords: 120 });

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((page) => page.blocks).join(" ")).toBe(
      blocks.join(" "),
    );
    for (const page of pages) {
      expect(page.blocks.length).toBeGreaterThan(0);
      expect(page.words).toBe(
        page.blocks.reduce((sum, block) => sum + countWords(block), 0),
      );
    }
  });

  it("nunca quebra um parágrafo que cabe no orçamento", () => {
    const blocks = [
      paragraph("a", 60),
      paragraph("b", 60),
      paragraph("c", 60),
      paragraph("d", 60),
      paragraph("e", 60),
      paragraph("f", 60),
    ];
    const pages = paginateBlocks(blocks);

    // Cada bloco de página é exatamente um parágrafo de entrada.
    for (const page of pages) {
      for (const block of page.blocks) {
        expect(blocks).toContain(block);
      }
    }
    // E nenhuma página passa do orçamento padrão.
    for (const page of pages) expect(page.words).toBeLessThanOrEqual(220);
  });

  it("parágrafo gigante é dividido por frase e sinaliza continuação", () => {
    const giant = sentences(20, 15); // ~300 palavras
    const pages = paginateBlocks([giant], { maxWords: 100 });

    expect(pages.length).toBeGreaterThan(2);
    for (const page of pages) {
      expect(page.words).toBeLessThanOrEqual(100);
    }
    // Todo corte acontece depois de pontuação de fim de frase.
    pages.slice(0, -1).forEach((page) => {
      const last = page.blocks[page.blocks.length - 1];
      expect(last.endsWith(".")).toBe(true);
      expect(page.continues).toBe(true);
    });
    expect(pages[pages.length - 1].continues).toBeFalsy();
    expect(pages.flatMap((page) => page.blocks).join(" ")).toBe(giant);
  });

  it("nunca corta no meio de uma palavra (parágrafo sem pontuação)", () => {
    const words = Array.from({ length: 180 }, (_, i) => `termo${i + 1}`);
    const block = words.join(" ");
    const pages = paginateBlocks([block], { maxWords: 50 });

    for (const page of pages) expect(page.words).toBeLessThanOrEqual(50);
    expect(pages.flatMap((page) => page.blocks).join(" ")).toBe(block);
    for (const page of pages) {
      for (const word of page.blocks.join(" ").split(" ")) {
        expect(words).toContain(word);
      }
    }
  });

  it("respeita maxWords e maxBlocks", () => {
    const blocks = [paragraph("x", 30), paragraph("y", 30), paragraph("z", 30)];
    const byWords = paginateBlocks(blocks, { maxWords: 45 });
    for (const page of byWords) expect(page.words).toBeLessThanOrEqual(45);

    const byBlocks = paginateBlocks(blocks, { maxBlocks: 1 });
    expect(byBlocks).toHaveLength(3);
    for (const page of byBlocks) expect(page.blocks).toHaveLength(1);
  });

  it("dá a cada página uma âncora estável (startsAt)", () => {
    const blocks = [paragraph("alfa", 20), paragraph("beta", 20)];
    const pages = paginateBlocks(blocks, { maxWords: 25 });
    expect(pages).toHaveLength(2);
    expect(pages[0].startsAt.startsWith("alfa")).toBe(true);
    expect(pages[1].startsAt.startsWith("beta")).toBe(true);
    expect(pages[0].startsAt).not.toBe(pages[1].startsAt);
  });

  it("devolve lista vazia sem texto", () => {
    expect(paginateBlocks([])).toEqual([]);
    expect(paginateBlocks(["", "   "])).toEqual([]);
  });
});

describe("pageForOffset", () => {
  it("acha a página do deslocamento no texto concatenado", () => {
    const blocks = [
      paragraph("um", 20),
      paragraph("dois", 20),
      paragraph("tres", 20),
    ];
    const pages = paginateBlocks(blocks, { maxWords: 25 });
    expect(pages).toHaveLength(3);

    const joined = pages.flatMap((page) => page.blocks).join(" ");
    expect(joined).toBe(blocks.join(" "));

    expect(pageForOffset(pages, 0)).toBe(0);
    expect(pageForOffset(pages, joined.indexOf(blocks[1]))).toBe(1);
    expect(pageForOffset(pages, joined.indexOf(blocks[2]))).toBe(2);
    // Além do fim: continua na última página.
    expect(pageForOffset(pages, joined.length + 500)).toBe(2);
    // Negativo cai na primeira.
    expect(pageForOffset(pages, -10)).toBe(0);
    // Sem páginas: 0.
    expect(pageForOffset([], 42)).toBe(0);
  });
});
