import { describe, expect, it } from "vitest";
import {
  contextSnippet,
  sectionPagesLabel,
  sectionProgressLabel,
  splitSectionIntoBlocks,
} from "@/components/learning/readingModel";

describe("leitura em blocos de página", () => {
  it("sem metadado de página devolve um bloco só, sem inventar número", () => {
    const blocks = splitSectionIntoBlocks({
      title: "Seção",
      startPage: 3,
      endPage: 5,
      text: "Primeiro parágrafo.\nSegundo parágrafo.\n\nTerceiro.",
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].page).toBeUndefined();
    expect(blocks[0].paragraphs).toEqual([
      "Primeiro parágrafo.",
      "Segundo parágrafo.",
      "Terceiro.",
    ]);
  });

  it("recombina as quebras do PDF em parágrafos e separa título de prosa", () => {
    const text = [
      "GLOSSÁRIO DE TERMOS",
      "Área de foco: descreve um determinado tópico de governança, domínio ou problema que",
      "pode ser tratado por uma coleção de objetivos de governança e seus componentes.",
      "Cascata de objetivos: mecanismo de tradução das necessidades das partes interessadas em",
      "objetivos corporativos específicos.",
    ].join("\n");

    const blocks = splitSectionIntoBlocks({
      title: "Seção",
      startPage: 4,
      endPage: 4,
      text,
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0].paragraphs).toEqual([
      "GLOSSÁRIO DE TERMOS",
      "Área de foco: descreve um determinado tópico de governança, domínio ou problema que pode ser tratado por uma coleção de objetivos de governança e seus componentes.",
      "Cascata de objetivos: mecanismo de tradução das necessidades das partes interessadas em objetivos corporativos específicos.",
    ]);
  });

  it("junta palavra hifenizada no fim da linha sem deixar hífen solto", () => {
    const blocks = splitSectionIntoBlocks({
      title: "Seção",
      startPage: 1,
      endPage: 1,
      text: "O princípio da lexicograph-\nnia normativa",
    });
    expect(blocks[0].paragraphs).toEqual([
      "O princípio da lexicographnia normativa",
    ]);
  });

  it("com pageSpans quebra por página e mantém o texto exato", () => {
    const text = "Linha da página 7.\nOutra linha da 7.\nLinha da página 8.";
    const startEight = text.indexOf("Linha da página 8");
    const blocks = splitSectionIntoBlocks({
      title: "Seção",
      startPage: 7,
      endPage: 8,
      text,
      pageSpans: [
        { page: 7, start: 0, end: startEight },
        { page: 8, start: startEight, end: text.length },
      ],
    });

    expect(blocks.map((block) => block.page)).toEqual([7, 8]);
    expect(blocks[0].paragraphs).toEqual([
      "Linha da página 7.",
      "Outra linha da 7.",
    ]);
    expect(blocks[1].paragraphs).toEqual(["Linha da página 8."]);
  });

  it("rótulos de progresso e páginas", () => {
    expect(sectionProgressLabel(0, 55)).toBe("1 de 55");
    expect(sectionProgressLabel(3, 55)).toBe("4 de 55");
    expect(sectionProgressLabel(0, 0)).toBe("0 de 0");
    expect(sectionProgressLabel(99, 55)).toBe("55 de 55");

    expect(
      sectionPagesLabel({
        title: "x",
        startPage: 4,
        endPage: 4,
        text: "",
      }),
    ).toBe("página 4");
    expect(
      sectionPagesLabel({ title: "x", startPage: 4, endPage: 9, text: "" }),
    ).toBe("páginas 4–9");
  });

  it("contexto para a IA respeita 600 caracteres", () => {
    const long = "palavra ".repeat(200);
    const snippet = contextSnippet(long);
    expect(snippet.length).toBeLessThanOrEqual(600);
    expect(snippet.endsWith("…")).toBe(true);
    expect(contextSnippet("curto")).toBe("curto");
    expect(contextSnippet("  muito   espaçado  ")).toBe("muito espaçado");
  });
});
