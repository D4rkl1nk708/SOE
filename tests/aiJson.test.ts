/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { parseAiJson, salvageJson } from "../server/aiJson";

describe("parseAiJson — JSON de IA robusto", () => {
  it("lê JSON puro", () => {
    expect(parseAiJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("ignora cerca de markdown", () => {
    expect(parseAiJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it("ignora texto antes e depois do objeto", () => {
    expect(
      parseAiJson('Claro! Aqui está:\n{"a":3}\nEspero ter ajudado.'),
    ).toEqual({
      a: 3,
    });
  });

  it("quebra de linha crua dentro de string é corrigida", () => {
    const raw = '{"html":"<h1>titulo\nnovo</h1>"}';
    expect((parseAiJson(raw) as any).html).toContain("titulo");
  });

  it("JSON truncado no fim recupera os campos completos", () => {
    const raw =
      '{"title":"Regressão linear","html":"<!doctype html><html>...corte';
    const parsed = parseAiJson(raw) as any;
    expect(parsed.title).toBe("Regressão linear");
  });

  it("truncado no meio de um campo devolve o resto como texto (e diz que truncou)", () => {
    const raw =
      '{"title":"T","html":"<!doctype html><body><script>const a=1;</script><div class=\\"x\\">texto';
    const parsed = parseAiJson(raw) as any;
    expect(parsed.truncated).toBe(true);
    expect(parsed.html).toContain("<!doctype html>");
  });

  it("salvageJson extrai campo por regex com aspas escapadas", () => {
    const out = salvageJson('{"html":"a \\"b\\" c","limits":["x"]}');
    expect(out.html).toBe('a "b" c');
  });

  it("lixo total lança erro claro", () => {
    expect(() => parseAiJson("sem json nenhum aqui")).toThrow(/JSON/i);
  });
});
