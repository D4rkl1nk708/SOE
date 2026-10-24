/** @vitest-environment node */
import { describe, test, expect } from "vitest";
import { normalizeString, isFuzzyMatch } from "../shared/utils";
import {
  areDisciplineSynonyms,
  findBestDisciplineMatch,
} from "../server/tecDisciplineMatcher";

describe("TEC Matching Logic", () => {
  describe("normalizeString", () => {
    test("removes accents and converts to lowercase", () => {
      expect(normalizeString("Acentuação")).toBe("acentuacao");
    });

    test("removes special characters except spaces", () => {
      expect(normalizeString("Direito (Administrativo) - Parte 1")).toBe(
        "direito administrativo parte 1",
      );
    });

    test("collapses multiple spaces", () => {
      expect(normalizeString("  Direito    Civil  ")).toBe("direito civil");
    });

    test("handles null/undefined/empty", () => {
      expect(normalizeString(null)).toBe("");
      expect(normalizeString(undefined)).toBe("");
      expect(normalizeString("")).toBe("");
    });
  });

  describe("isFuzzyMatch", () => {
    test("matches identical strings after normalization", () => {
      expect(
        isFuzzyMatch("Direito Administrativo", "direito administrativo"),
      ).toBe(true);
      expect(isFuzzyMatch("Acentuação", "acentuacao")).toBe(true);
    });

    test("matches partial strings if long enough", () => {
      expect(
        isFuzzyMatch(
          "Direito Administrativo",
          "Direito Administrativo e Constitucional",
        ),
      ).toBe(true);
      expect(
        isFuzzyMatch("Raciocínio Lógico", "Raciocínio Lógico-Matemático"),
      ).toBe(true);
    });

    test("does not match short partial strings", () => {
      // "Dir" is only 3 chars, shouldn't match "Direito" unless we want very aggressive matching
      // My implementation requires length > 5
      expect(isFuzzyMatch("Dir", "Direito")).toBe(false);
    });

    test("handles complex TEC strings", () => {
      const dbTopic =
        "Equivalências Lógicas (Inclui Negação de Proposições Compostas)";
      const tecTopic =
        "Equivalências Lógicas (Inclui Negação de Proposições Compostas)";
      expect(isFuzzyMatch(dbTopic, tecTopic)).toBe(true);
    });

    test("matches strings with extra symbols in TEC", () => {
      const dbTopic = "Atos Administrativos";
      const tecTopic = "Atos Administrativos [CEBRASPE]";
      expect(isFuzzyMatch(dbTopic, tecTopic)).toBe(true);
    });
  });

  describe("findBestDisciplineMatch", () => {
    const disciplines = [
      { id: 1, name: "Direito Civil" },
      { id: 2, name: "Direito Processual Civil" },
      { id: 3, name: "Inteligência Artificial" },
      { id: 4, name: "Direito" },
      { id: 5, name: "Tecnologia da Informação" },
    ];

    test("não confunde ramos distintos do Direito Civil", () => {
      expect(
        areDisciplineSynonyms("Direito Civil", "Direito Processual Civil"),
      ).toBe(false);
      expect(
        findBestDisciplineMatch(disciplines, "Direito Processual Civil")
          .discipline?.id,
      ).toBe(2);
    });

    test("não usa 'ia'/'ti' como substring de outra palavra", () => {
      expect(
        findBestDisciplineMatch(disciplines, "Ciência de Dados").discipline,
      ).toBeNull();
    });

    test("não funde disciplina genérica de uma palavra por subconjunto", () => {
      expect(
        findBestDisciplineMatch(disciplines, "Direito Ambiental").discipline,
      ).toBeNull();
    });

    test("reconhece sigla e nome exato", () => {
      expect(findBestDisciplineMatch(disciplines, "TI").discipline?.id).toBe(5);
      expect(
        findBestDisciplineMatch(disciplines, "inteligencia artificial")
          .discipline?.id,
      ).toBe(3);
    });
  });
});
