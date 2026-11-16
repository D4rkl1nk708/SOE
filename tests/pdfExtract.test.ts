// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractPdf, splitIntoSections } from "../server/pdfExtract";

describe("splitIntoSections", () => {
  it("divide por numeração (1, 1.1, 2...) com as páginas corretas", () => {
    const pages = [
      "1 Introdução\nTexto da introdução.\n1.1 Contexto\nContexto detalhado.",
      "Continuação do contexto.\n2 Desenvolvimento\nTexto do desenvolvimento.",
      "Mais desenvolvimento.\n2.1 Detalhe\nDetalhe final.\n3 Conclusão\nFim do documento.",
    ];

    const sections = splitIntoSections(pages);

    expect(sections.map((s) => s.title)).toEqual([
      "1 Introdução",
      "1.1 Contexto",
      "2 Desenvolvimento",
      "2.1 Detalhe",
      "3 Conclusão",
    ]);
    expect(sections.map((s) => [s.startPage, s.endPage])).toEqual([
      [1, 1],
      [1, 2],
      [2, 3],
      [3, 3],
      [3, 3],
    ]);

    // o texto de cada seção termina onde o próximo título começa
    expect(sections[1].text).toContain("Contexto detalhado.");
    expect(sections[1].text).toContain("Continuação do contexto.");
    expect(sections[1].text).not.toContain("Desenvolvimento");
    expect(sections[2].text).not.toContain("Continuação do contexto.");
  });

  it("reconhece títulos em MAIÚSCULAS", () => {
    const pages = [
      "DIREITO CONSTITUCIONAL APLICADO\nConteúdo sobre constitucional.",
      "Continua o conteúdo constitucional.\nPROCESSO CIVIL PRÁTICO\nConteúdo sobre processo civil.",
    ];

    const sections = splitIntoSections(pages);

    expect(sections.map((s) => s.title)).toEqual([
      "DIREITO CONSTITUCIONAL APLICADO",
      "PROCESSO CIVIL PRÁTICO",
    ]);
    // a primeira seção continua na página 2 até o título seguinte
    expect(sections.map((s) => [s.startPage, s.endPage])).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(sections[0].text).toContain("Continua o conteúdo constitucional.");
  });

  it("reconhece títulos por palavra-chave (Capítulo, Aula, Tópico)", () => {
    const pages = [
      "CAPÍTULO I\nTexto inicial.",
      "Capítulo 2\nTexto dois.\nAula 4\nTexto quatro.\nTópico 2.3\nTexto do tópico.",
    ];

    const sections = splitIntoSections(pages);

    expect(sections.map((s) => s.title)).toEqual([
      "CAPÍTULO I",
      "Capítulo 2",
      "Aula 4",
      "Tópico 2.3",
    ]);
    expect(sections[0].startPage).toBe(1);
    expect(sections[3].startPage).toBe(2);
  });

  it("cai em uma seção única quando não há nenhum título", () => {
    const pages = [
      "Texto corrido sem nenhum título reconhecível.\nOutra linha do mesmo parágrafo.",
      "Segunda página também sem título.",
    ];

    const sections = splitIntoSections(pages);

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Documento inteiro");
    expect(sections[0].startPage).toBe(1);
    expect(sections[0].endPage).toBe(2);
    expect(sections[0].text).toContain(
      "Texto corrido sem nenhum título reconhecível.",
    );
    expect(sections[0].text).toContain("Segunda página também sem título.");
  });

  it("não trata prosa numerada como título", () => {
    const pages = [
      "1. Assinale a alternativa correta sobre o tema apresentado.",
      "2. Ainda sobre o tema, assinale a opção correta.",
      "10 sprints de 20 m. Os sujeitos iniciaram o teste",
      "1 introdução em minúsculas não é cabeçalho",
    ];

    const sections = splitIntoSections(pages);

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Documento inteiro");
  });

  it("aceita numeração seguida de ponto ('1. Introdução')", () => {
    const pages = [
      "1. Introdução\nTexto.",
      "2. Referencial Teórico\nMais texto.",
    ];

    const sections = splitIntoSections(pages);

    expect(sections.map((s) => s.title)).toEqual([
      "1. Introdução",
      "2. Referencial Teórico",
    ]);
  });

  it("remove cabeçalho repetido em todas as páginas", () => {
    const header = "Curso SOE – Apostila 2024";
    const pages = [
      `${header}\n1 Primeira Parte\nConteúdo um.`,
      `${header}\nConteúdo dois.`,
      `${header}\n2 Segunda Parte\nConteúdo três.`,
    ];

    const sections = splitIntoSections(pages);

    expect(sections.map((s) => s.title)).toEqual([
      "1 Primeira Parte",
      "2 Segunda Parte",
    ]);
    expect(sections.map((s) => [s.startPage, s.endPage])).toEqual([
      [1, 2],
      [3, 3],
    ]);
    for (const section of sections) {
      expect(section.text).not.toContain(header);
    }
  });

  it("mantém linha repetida em menos de 60% das páginas", () => {
    const linha = "Página gerada pelo sistema";
    const pages = [`1 Um\nA.`, `B.\n${linha}`, `C.`, `${linha}\nD.`];

    const sections = splitIntoSections(pages);
    const texto = sections.map((s) => s.text).join("\n");

    expect(texto).toContain(linha);
    expect(sections[0].title).toBe("1 Um");
  });

  it("nunca retorna seção com texto vazio", () => {
    const pages = ["\n\n1 Título no fim\n\n", "   ", "\n"];
    const sections = splitIntoSections(pages);

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("1 Título no fim");
    expect(sections[0].startPage).toBe(1);
    expect(sections[0].endPage).toBe(1);
    for (const section of sections) {
      expect(section.text.length).toBeGreaterThan(0);
      expect(section.text).toBe(section.text.trim());
      expect(section.title).toBe(section.title.trim());
    }
  });

  it("devolve lista vazia para documento sem texto", () => {
    expect(splitIntoSections([])).toEqual([]);
    expect(splitIntoSections(["", "\n\n", "   "])).toEqual([]);
  });
});

describe("extractPdf", () => {
  it("rejeita buffer vazio", async () => {
    await expect(extractPdf(Buffer.alloc(0))).rejects.toThrow(/vazio/i);
  });
});
