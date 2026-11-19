import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Contrato de identidade da questão no TEC.
 *
 * O script injetado não pode mais carregar a própria implementação: ele usa o
 * núcleo comum. Aqui carregamos o bloco SOE_TEC_CORE do arquivo real e
 * verificamos as regras:
 *  - assinatura NUNCA constante por URL;
 *  - mesma questão = mesma assinatura (mesmo com URL diferente);
 *  - sem id/enunciado, o fallback depende do contador de transição.
 */

const BLOCK_START =
  "// >>> SOE_TEC_CORE (gerado de shared/tecCaptureCore.ts — não editar à mão)";
const BLOCK_END = "// <<< SOE_TEC_CORE";

const FILES = [
  "electron/tec-content.js",
  "electron/tec-preload.cjs",
  "android/app/src/main/assets/tec-content.js",
  "chrome-extension/src/content.js",
];

interface CoreApi {
  buildQuestionSignature: (input: {
    questionId?: string | null;
    disciplina?: string;
    assunto?: string;
    snippet?: string;
    transitionCount?: number;
    pathname?: string;
  }) => string;
}

function loadCore(file: string): CoreApi {
  const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
  const start = source.indexOf(BLOCK_START);
  const end = source.indexOf(BLOCK_END);
  if (start < 0 || end < 0)
    throw new Error(`bloco SOE_TEC_CORE ausente em ${file}`);
  const block = source.slice(start, end + BLOCK_END.length);

  return new Function(`${block}\n;return SOE_TEC_CORE;`)() as CoreApi;
}

const STATEMENT =
  "Sobre os principios das metodologias ageis, assinale a alternativa correta considerando o manifesto agil e seus valores.";

describe("assinatura da questão no TEC (núcleo comum)", () => {
  for (const file of FILES) {
    it(`${file}: usa o id da questão quando existe`, () => {
      const core = loadCore(file);
      expect(
        core.buildQuestionSignature({
          questionId: "98765",
          disciplina: "Penal",
          assunto: "Crimes",
        }),
      ).toBe("qid:98765");
    });

    it(`${file}: mesma questão = mesma assinatura mesmo com URL diferente`, () => {
      const core = loadCore(file);
      const sigA = core.buildQuestionSignature({
        disciplina: "Engenharia de Software",
        assunto: "Metodologias Ageis",
        snippet: STATEMENT,
        pathname: "/cadernos/1",
      });
      const sigB = core.buildQuestionSignature({
        disciplina: "Engenharia de Software",
        assunto: "Metodologias Ageis",
        snippet: STATEMENT,
        pathname: "/cadernos/1/topico/9",
      });
      expect(sigA).toMatch(/^stmt:/);
      expect(sigA).toBe(sigB);
    });

    it(`${file}: questões diferentes geram assinaturas diferentes`, () => {
      const core = loadCore(file);
      const first = core.buildQuestionSignature({
        assunto: "Redes",
        snippet:
          "Primeira questao sobre containers docker, camadas de imagem e reaproveitamento de cache em builds.",
        pathname: "/cadernos/1",
      });
      const second = core.buildQuestionSignature({
        assunto: "Redes",
        snippet:
          "Segunda questao sobre prazos processuais, contagem em dias uteis e suspensao do expediente forense.",
        pathname: "/cadernos/1",
      });
      expect(first).not.toBe(second);
    });

    it(`${file}: fallback nunca é constante por URL (usa o contador de transição)`, () => {
      const core = loadCore(file);
      const first = core.buildQuestionSignature({
        assunto: "",
        snippet: "curto",
        pathname: "/cadernos/42",
        transitionCount: 0,
      });
      const second = core.buildQuestionSignature({
        assunto: "",
        snippet: "curto",
        pathname: "/cadernos/42",
        transitionCount: 1,
      });
      expect(first.startsWith("ass:")).toBe(true);
      expect(first).not.toMatch(/^url:/);
      expect(first).not.toBe(second);
    });

    it(`${file}: delega identidade/tempo ao núcleo e não usa mais url:pathname`, () => {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source).toContain("SOE_TEC_CORE.installTecCapture(");
      expect(source).not.toContain("'url:' + location.pathname");
      expect(source).not.toContain('"url:" + location.pathname');
    });
  }
});
