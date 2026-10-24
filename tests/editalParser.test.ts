// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  detectCargos,
  extractProgram,
  inspectEdital,
  parseEditalWithAi,
  selectProgramForRole,
} from "../server/editalParser";

const filler = "Conteúdo de estudo detalhado sobre o tema. ".repeat(120);

const edital = `
EDITAL Nº 1 – TESTE
15 DOS OBJETOS DE AVALIAÇÃO (HABILIDADES E CONHECIMENTOS)
15.1 HABILIDADES
15.2.2 CONHECIMENTOS BÁSICOS
LÍNGUA PORTUGUESA: 1 Interpretação de texto. 1.1 Coesão e coerência. ${filler}
15.2.3 CONHECIMENTOS COMPLEMENTARES
RACIOCÍNIO LÓGICO: 1 Proposições. 1.1 Conectivos lógicos. ${filler}
15.2.4 CONHECIMENTOS ESPECÍFICOS
CARGO 1: AUDITOR – ESPECIALIDADE AUDITORIA
AUDITORIA GOVERNAMENTAL: 1 Planejamento. 1.1 Matriz de risco. ${filler}
CARGO 2: AUDITOR – ESPECIALIDADE CIÊNCIA DE DADOS
CIÊNCIA DE DADOS: 1 Estatística. 1.1 Regressão. ${filler}
16 DAS DISPOSIÇÕES FINAIS
`;

describe("editalParser", () => {
  it("localiza o conteúdo programático e detecta cargos", async () => {
    const info = await inspectEdital({ text: edital });
    expect(info.hasProgram).toBe(true);
    expect(info.programChars).toBeGreaterThan(1000);
    expect(info.cargos).toHaveLength(2);
    expect(info.cargos.map((c) => c.id)).toEqual(["cargo-1", "cargo-2"]);
  });

  it("recorta o cargo escolhido sem perder básicos/complementares", () => {
    const { program } = extractProgram(edital);
    const auditoria = selectProgramForRole(program, "Auditoria");
    expect(auditoria).toContain("LÍNGUA PORTUGUESA");
    expect(auditoria).toContain("RACIOCÍNIO LÓGICO");
    expect(auditoria).toContain("AUDITORIA GOVERNAMENTAL");
    expect(auditoria).not.toContain("CIÊNCIA DE DADOS");

    const dados = selectProgramForRole(program, "Ciência de Dados");
    expect(dados).toContain("CIÊNCIA DE DADOS");
    expect(dados).not.toContain("AUDITORIA GOVERNAMENTAL");
  });

  it("divide o conteúdo em blocos e deduplica a resposta da IA", async () => {
    const callAi = vi.fn(async (_provider, _key, prompt: string) => {
      const cargo = prompt.includes("CIÊNCIA DE DADOS")
        ? "Ciência de Dados"
        : "Auditoria";
      return JSON.stringify([
        { discipline: cargo, topic: "Tópico A" },
        { discipline: cargo, topic: "Tópico B" },
      ]);
    });

    const topics = await parseEditalWithAi({
      text: edital,
      role: "Ciência de Dados",
      apiKey: "key",
      provider: "gemini",
      callAi,
    });

    expect(callAi).toHaveBeenCalled();
    expect(topics.length).toBeGreaterThan(0);
    expect(new Set(topics.map((t) => `${t.discipline}::${t.topic}`)).size).toBe(
      topics.length,
    );
  });

  it("detecta cargos diretamente no texto", () => {
    const { program } = extractProgram(edital);
    expect(detectCargos(program)).toHaveLength(2);
  });
});
