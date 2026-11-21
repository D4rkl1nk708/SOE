import { describe, expect, it } from "vitest";
import { splitSectionIntoBlocks } from "@/components/learning/readingModel";

/**
 * Texto real de um PDF de 2 páginas importado pelo app (pdf-parse quebra a
 * linha física no meio da frase). O primeiro parágrafo tem 78 caracteres e
 * termina em "com a" — já foi classificado como título e partia a frase no
 * meio; este teste trava a regressão.
 */
const TEXT = [
  "Controle de Constitucionalidade",
  "O controle de constitucionalidade verifica a compatibilidade de uma norma com a",
  "Constituição. No Brasil convivem o controle difuso, exercido por qualquer juiz no",
  "caso concreto, e o controle concentrado, exercido pelo Supremo Tribunal Federal",
  "em ações próprias.",
  "A ação direta de inconstitucionalidade tem por objeto lei ou ato normativo federal",
  "ou estadual. A legitimidade ativa é restrita aos órgãos e entidades previstos no",
  "artigo 103 da Constituição, e não se admite desistência após o ajuizamento.",
].join("\n");

describe("reflow de texto real de PDF", () => {
  it("não parte a frase quando a linha termina numa palavra curta", () => {
    const blocks = splitSectionIntoBlocks({
      title: "Documento inteiro",
      startPage: 1,
      endPage: 2,
      text: TEXT,
    });
    const paragraphs = blocks.flatMap((block) => block.paragraphs);

    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toBe("Controle de Constitucionalidade");
    expect(paragraphs[1]).toBe(
      "O controle de constitucionalidade verifica a compatibilidade de uma norma com a Constituição. No Brasil convivem o controle difuso, exercido por qualquer juiz no caso concreto, e o controle concentrado, exercido pelo Supremo Tribunal Federal em ações próprias.",
    );
    expect(paragraphs[2]).toContain(
      "A ação direta de inconstitucionalidade tem por objeto lei ou ato normativo federal ou estadual.",
    );
  });
});
