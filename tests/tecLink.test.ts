/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  buildTecSearchHint,
  cadernoUrlFor,
  matchCadernoForDiscipline,
  normalize,
  type CadernoRef,
} from "../server/tecLink";

const cadernos: CadernoRef[] = [
  {
    cadernoId: "111",
    cadernoUrl: "https://www.tecconcursos.com.br/cadernos/111",
    disciplina: "Direito Constitucional",
  },
  {
    cadernoId: "222",
    cadernoUrl: "https://www.tecconcursos.com.br/cadernos/222",
    disciplina: "Tecnologia da Informação",
  },
  {
    cadernoId: "333",
    cadernoUrl: "https://www.tecconcursos.com.br/cadernos/333",
    disciplina: "Língua Portuguesa",
  },
];

describe("normalize", () => {
  it("remove acento, caixa e pontuação", () => {
    expect(normalize("Língua Portuguesa — Teoria & Questões")).toBe(
      "lingua portuguesa teoria questoes",
    );
    expect(normalize("  TECNOLOGIA   DA INFORMAÇÃO ")).toBe(
      "tecnologia da informacao",
    );
  });

  it("tolera entrada vazia ou inválida sem lançar", () => {
    expect(normalize("")).toBe("");
    expect(normalize(undefined as unknown as string)).toBe("");
  });
});

describe("matchCadernoForDiscipline", () => {
  it("casa exato ignorando acento e caixa", () => {
    expect(
      matchCadernoForDiscipline(cadernos, "lingua portuguesa")?.cadernoId,
    ).toBe("333");
    expect(
      matchCadernoForDiscipline(cadernos, "DIREITO CONSTITUCIONAL")?.cadernoId,
    ).toBe("111");
    expect(
      matchCadernoForDiscipline(cadernos, "Tecnologia da Informação")
        ?.cadernoId,
    ).toBe("222");
  });

  it("casa por tokens quando não é exato (2+ palavras em comum)", () => {
    const ref = matchCadernoForDiscipline(
      cadernos,
      "Direito Constitucional - Teoria e Questões",
    );
    expect(ref?.cadernoId).toBe("111");

    const tech = matchCadernoForDiscipline(
      cadernos,
      "Informática e Tecnologia da Informação para Concursos",
    );
    expect(tech?.cadernoId).toBe("222");
  });

  it("devolve null quando não há disciplina suficiente para casar", () => {
    expect(
      matchCadernoForDiscipline(cadernos, "Contabilidade Geral"),
    ).toBeNull();
    expect(matchCadernoForDiscipline(cadernos, "")).toBeNull();
    expect(matchCadernoForDiscipline(cadernos, undefined)).toBeNull();
    expect(matchCadernoForDiscipline([], "Direito Constitucional")).toBeNull();
    expect(
      matchCadernoForDiscipline(null as unknown as CadernoRef[], "Qualquer"),
    ).toBeNull();
  });

  it("exige 2 palavras em comum (uma só não basta)", () => {
    // "Língua" sozinha (1 token) contra "Língua Portuguesa" não casa
    // porque o lado da busca precisa de pelo menos 2 tokens.
    expect(matchCadernoForDiscipline(cadernos, "Língua")).toBeNull();
    expect(
      matchCadernoForDiscipline(cadernos, "Português Avançado"),
    ).toBeNull();
  });

  it("não lança com cadernos malformados", () => {
    const dirty = [
      { cadernoId: "x" },
      null,
      { cadernoId: "444", cadernoUrl: "", disciplina: "Língua Portuguesa" },
    ] as unknown as CadernoRef[];
    expect(() =>
      matchCadernoForDiscipline(dirty, "Língua Portuguesa"),
    ).not.toThrow();
    expect(
      matchCadernoForDiscipline(dirty, "Língua Portuguesa")?.cadernoId,
    ).toBe("444");
  });
});

describe("cadernoUrlFor", () => {
  it("aceita https do TEC", () => {
    expect(
      cadernoUrlFor({
        cadernoId: "111",
        cadernoUrl: "https://www.tecconcursos.com.br/cadernos/111",
        disciplina: "Direito Constitucional",
      }),
    ).toBe("https://www.tecconcursos.com.br/cadernos/111");
  });

  it("aceita http do TEC e normaliza para https", () => {
    expect(
      cadernoUrlFor({
        cadernoId: "222",
        cadernoUrl: "http://www.tecconcursos.com.br/cadernos/222",
        disciplina: "Outra",
      }),
    ).toBe("https://www.tecconcursos.com.br/cadernos/222");
  });

  it("rejeita domínio estranho, scheme perigoso e id sem URL", () => {
    const base = { disciplina: "Qualquer" };
    expect(
      cadernoUrlFor({ ...base, cadernoId: "1", cadernoUrl: "" }),
    ).toBeNull();
    expect(
      cadernoUrlFor({
        ...base,
        cadernoId: "1",
        cadernoUrl: "https://www.tecconcursos.com.br.evil.com/cadernos/1",
      }),
    ).toBeNull();
    expect(
      cadernoUrlFor({
        ...base,
        cadernoId: "1",
        cadernoUrl: "https://tecconcursos.com.br/cadernos/1",
      }),
    ).toBeNull();
    expect(
      cadernoUrlFor({
        ...base,
        cadernoId: "1",
        cadernoUrl: "javascript:alert(1)//https://www.tecconcursos.com.br/",
      }),
    ).toBeNull();
    expect(
      cadernoUrlFor({
        ...base,
        cadernoId: "1",
        cadernoUrl: "file:///etc/passwd",
      }),
    ).toBeNull();
    expect(
      cadernoUrlFor({
        ...base,
        cadernoId: "1",
        cadernoUrl: "https://www.tecconcursos.com.br/\nfile:///etc/passwd",
      }),
    ).toBeNull();
    // Não inventa URL a partir do id.
    expect(
      cadernoUrlFor({ ...base, cadernoId: "999", cadernoUrl: "" }),
    ).toBeNull();
  });
});

describe("buildTecSearchHint", () => {
  it("monta frase com tema", () => {
    expect(buildTecSearchHint("Docker: camadas")).toBe(
      'Busque no TEC: "Docker: camadas"',
    );
    expect(buildTecSearchHint("  Lei   8.112/90  ")).toBe(
      'Busque no TEC: "Lei 8.112/90"',
    );
  });

  it("cai num texto genérico sem tema", () => {
    const semTema = buildTecSearchHint();
    expect(semTema).toContain("Busque no TEC");
    expect(semTema.startsWith("http")).toBe(false);
    expect(buildTecSearchHint("").startsWith("http")).toBe(false);
    expect(buildTecSearchHint("   ")).toBe(semTema);
  });

  it("não devolve URL", () => {
    expect(buildTecSearchHint("Tecnologia da Informação")).not.toMatch(
      /^https?:/,
    );
  });
});
