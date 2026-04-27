/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { extractJSON } from "../server/mentorRouter";

describe("Mentor Router - extractJSON", () => {
  it("should parse valid JSON", () => {
    const text = '{"test": 123}';
    expect(extractJSON(text)).toEqual({ test: 123 });
  });

  it("should extract JSON from markdown blocks", () => {
    const text =
      'Aqui está o resultado:\n```json\n{"success": true}\n```\nEspero que ajude.';
    expect(extractJSON(text)).toEqual({ success: true });
  });

  it("should handle JSON with extra text before and after", () => {
    const text = 'Some text before {"id": 1} some text after';
    expect(extractJSON(text)).toEqual({ id: 1 });
  });

  it("should throw error if no JSON is found", () => {
    const text = "No json here";
    expect(() => extractJSON(text)).toThrow(
      "Nenhum dado JSON encontrado na resposta.",
    );
  });
});
