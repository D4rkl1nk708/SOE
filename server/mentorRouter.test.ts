import { describe, it, expect } from "vitest";
import { extractJSON } from "./mentorRouter";

describe("extractJSON", () => {
  it("should extract valid JSON cleanly", () => {
    const input = `{ "disciplineName": "Matemática", "diagnostic": "Tudo ok" }`;
    const result = extractJSON(input) as any;
    expect(result.disciplineName).toBe("Matemática");
    expect(result.diagnostic).toBe("Tudo ok");
  });

  it("should extract JSON embedded in markdown block", () => {
    const input = `
      Aqui está o seu JSON:
      \`\`\`json
      {
        "disciplineName": "Física",
        "diagnostic": "Precisa melhorar"
      }
      \`\`\`
      Boa sorte!
    `;
    const result = extractJSON(input) as any;
    expect(result.disciplineName).toBe("Física");
    expect(result.diagnostic).toBe("Precisa melhorar");
  });

  it("should strip block and line comments before parsing", () => {
    const input = `{
      // Nome da disciplina
      "disciplineName": "História",
      /*
        O diagnóstico completo
      */
      "diagnostic": "Falta leitura"
    }`;
    const result = extractJSON(input) as any;
    expect(result.disciplineName).toBe("História");
    expect(result.diagnostic).toBe("Falta leitura");
  });

  it("should handle literal unescaped newlines inside strings", () => {
    const input = `{
      "disciplineName": "Geografia",
      "diagnostic": "Você está indo bem.
      Mas precisa revisar mapas.
      
      E fuso horário."
    }`;
    // As novas linhas literais devem ser convertidas em espaços para o parse funcionar
    const result = extractJSON(input) as any;
    expect(result.disciplineName).toBe("Geografia");
    expect(result.diagnostic).toContain("Você está indo bem.");
    expect(result.diagnostic).toContain("Mas precisa revisar mapas.");
    expect(result.diagnostic).toContain("E fuso horário.");
  });

  it("should use regex fallback for truncated JSON with unescaped quotes", () => {
    // Simulando a IA gerando aspas não escapadas e sendo cortada (ou JSON mal formado que quebra parse)
    const input = `
    {
      "disciplineName": "Direito Penal",
      "diagnostic": "Sua base está \\"podre\\", melhore isso urgente",
      "actionPlan": "Fazer 50 questões agora",
      "prediction": "Vai reprovar",
      "priority": "alta"
    `;

    // O JSON.parse vai falhar devido à falta de fechamento
    const result = extractJSON(input) as any;
    expect(result.disciplineName).toBe("Direito Penal");
    expect(result.diagnostic).toBe(
      'Sua base está \\"podre\\", melhore isso urgente',
    );
    expect(result.actionPlan).toBe("Fazer 50 questões agora");
    expect(result.prediction).toBe("Vai reprovar");
  });

  it("should throw error if nothing can be extracted", () => {
    const input =
      "Apenas um texto qualquer sem nenhuma estrutura de JSON reconhecível";
    expect(() => extractJSON(input)).toThrow(
      "Nenhum dado JSON encontrado na resposta.",
    );
  });
});
