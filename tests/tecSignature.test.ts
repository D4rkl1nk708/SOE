import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Regressão do bug "2 questões contaram 4".
 *
 * O script injetado no TEC é JS de navegador (não pode importar módulos), então
 * o teste extrai as funções de identidade da questão do próprio arquivo e
 * verifica o contrato: a assinatura NÃO pode depender da URL quando existe
 * enunciado — era justamente a URL que mudava depois de responder.
 */

function loadHelpers(filePath: string) {
  const source = fs.readFileSync(filePath, "utf8");
  const start = source.indexOf("function stableHash");
  if (start < 0) throw new Error("helpers não encontrados em " + filePath);
  const end = source.indexOf("function tryScrapeDOM", start);
  const code = source.slice(start, end);
  const factory = new Function(
    "document",
    "location",
    `${code}
     return { stableHash, normalizeSnippet, extractStatementSnippet, buildQuestionSignature };`,
  );
  return factory;
}

const files = ["electron/tec-content.js", "chrome-extension/src/content.js"];

describe("assinatura da questão no TEC", () => {
  for (const file of files) {
    it(`${file}: usa o id da questão quando existe`, () => {
      const doc = { querySelector: () => null, body: { innerText: "" } };
      const loc = {
        pathname: "/questoes/123",
        href: "https://tec/questoes/123",
      };
      const helpers = loadHelpers(path.resolve(process.cwd(), file))(doc, loc);
      expect(helpers.buildQuestionSignature("98765", "Penal", "Crimes")).toBe(
        "qid:98765",
      );
    });

    it(`${file}: mesma questão = mesma assinatura mesmo com URL diferente`, () => {
      const statement =
        "Sobre os principios das metodologias ageis, assinale a alternativa correta considerando o manifesto agil e seus valores.";
      const makeDoc = (pathname: string) => ({
        querySelector: (selector: string) =>
          selector.includes("enunciado") ? { innerText: statement } : null,
        body: { innerText: statement },
        __path: pathname,
      });

      const locA = {
        pathname: "/cadernos/1",
        href: "https://tec/cadernos/1?questao=1",
      };
      const locB = {
        pathname: "/cadernos/1",
        href: "https://tec/cadernos/1#comentario",
      };

      const helpers = loadHelpers(path.resolve(process.cwd(), file));
      const sigA = helpers(makeDoc("/cadernos/1"), locA).buildQuestionSignature(
        null,
        "Engenharia de Software",
        "Metodologias Ageis",
      );
      const sigB = helpers(makeDoc("/cadernos/1"), locB).buildQuestionSignature(
        null,
        "Engenharia de Software",
        "Metodologias Ageis",
      );

      expect(sigA).toMatch(/^stmt:/);
      expect(sigA).toBe(sigB);
    });

    it(`${file}: questões diferentes geram assinaturas diferentes`, () => {
      const loc = { pathname: "/cadernos/1", href: "https://tec/cadernos/1" };
      const helpers = loadHelpers(path.resolve(process.cwd(), file));

      const first = helpers(
        {
          querySelector: () => ({
            innerText:
              "Primeira questao sobre containers docker, camadas de imagem e reaproveitamento de cache em builds.",
          }),
          body: { innerText: "" },
        },
        loc,
      ).buildQuestionSignature(null, "Redes", "Docker");

      const second = helpers(
        {
          querySelector: () => ({
            innerText:
              "Segunda questao sobre prazos processuais, contagem em dias uteis e suspensao do expediente forense.",
          }),
          body: { innerText: "" },
        },
        loc,
      ).buildQuestionSignature(null, "Redes", "Docker");

      expect(first).not.toBe(second);
    });

    it(`${file}: sem id e sem enunciado, cai no caminho (sem query) e não na URL completa`, () => {
      const loc = {
        pathname: "/cadernos/42",
        href: "https://tec/cadernos/42?questao=9&pagina=2",
      };
      const doc = { querySelector: () => null, body: { innerText: "curto" } };
      const helpers = loadHelpers(path.resolve(process.cwd(), file))(doc, loc);
      expect(helpers.buildQuestionSignature(null, "", "")).toBe(
        "url:/cadernos/42",
      );
    });

    it(`${file}: não usa mais "questionId || location.href" como chave de contagem`, () => {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source).not.toContain(
        "const storageKey = 'soe_scored_' + dedupKey",
      );
      expect(source).toContain("buildQuestionSignature");
      expect(source).toContain("questionSignature: questionSignature");
    });
  }
});
