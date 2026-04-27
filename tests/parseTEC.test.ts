/** @vitest-environment node */
import { describe, expect, it } from "vitest";

// Copy of the function from QuestionSession.tsx since it's not exported
function parseTEC(raw: string) {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Cole uma questão primeiro." };

  const headerMatch = text.match(
    /^(#\d+)\s+(.+?)\s*-\s*(\d{4})\s*-\s*(.+?)[\n\r]/,
  );
  const questionId = headerMatch?.[1];
  const banca = headerMatch?.[2]?.trim();
  const year = headerMatch?.[3] ? parseInt(headerMatch[3]) : undefined;
  const contest = headerMatch?.[4]?.trim();

  const withoutHeader = headerMatch
    ? text.slice(text.indexOf("\n") + 1).trim()
    : text;

  const altStartMatch = withoutHeader.match(/(?:^|\n)(A\n|A\)|A\s*\n)/m);
  const altIdx = altStartMatch ? withoutHeader.indexOf(altStartMatch[0]) : -1;
  let statement =
    altIdx > 0 ? withoutHeader.slice(0, altIdx).trim() : withoutHeader;
  statement = statement
    .replace(/\n(No que se refere|Assinale|Julgue|Com base)[^\n]*$/i, "")
    .trim();

  const alternatives: { letter: string; text: string }[] = [];
  const altRegex = /\n([A-E])\n([\s\S]*?)(?=\n[A-E]\n|Você selecionou|$)/g;
  let m: RegExpExecArray | null;
  while ((m = altRegex.exec("\n" + withoutHeader)) !== null) {
    alternatives.push({ letter: m[1], text: m[2].trim() });
  }

  const userAnswer = text.match(/Você selecionou:\s*([A-E])/i)?.[1];
  const correctAnswer = text.match(/(?:Gabarito|a correta é):\s*([A-E])/i)?.[1];

  if (!statement)
    return {
      ok: false,
      error: "Não consegui identificar o enunciado. Verifique o formato.",
    };

  return {
    ok: true,
    q: {
      questionId,
      banca,
      year,
      contest,
      statement,
      alternatives,
      userAnswer,
      correctAnswer,
    },
  };
}

describe("QuestionSession - parseTEC", () => {
  it("should parse a standard TEC question", () => {
    const raw = `
#123456 FGV - 2024 - Senado Federal
No que se refere ao Direito Administrativo...
Assinale a alternativa correta.
A
Opção A
B
Opção B
C
Opção C
D
Opção D
E
Opção E
Você selecionou: B
Gabarito: C
`.trim();

    const result = parseTEC(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.q.questionId).toBe("#123456");
      expect(result.q.banca).toBe("FGV");
      expect(result.q.year).toBe(2024);
      expect(result.q.contest).toBe("Senado Federal");
      expect(result.q.alternatives).toHaveLength(5);
      expect(result.q.userAnswer).toBe("B");
      expect(result.q.correctAnswer).toBe("C");
    }
  });

  it("should handle questions without header", () => {
    const raw = `
Enunciado da questão sem cabeçalho.
A
Alt 1
B
Alt 2
`.trim();
    const result = parseTEC(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.q.statement).toContain("Enunciado");
      expect(result.q.alternatives).toHaveLength(2);
    }
  });

  it("should return error for empty input", () => {
    expect(parseTEC("").ok).toBe(false);
  });
});
