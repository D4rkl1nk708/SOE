import { describe, it, expect, afterEach } from "vitest";
import {
  INJECTED_FILES,
  LONG_STATEMENT,
  STATEMENT_VARIANTS,
  loadInjectedTec,
  payloads,
  questionHtml,
} from "./_helpers/loadInjectedTec";
import type { LoadedTec } from "./_helpers/loadInjectedTec";
import {
  buildQuestionSignature,
  createCaptureEngine,
  extractAlternatives,
  extractAnswerResult,
  extractQuestionId,
  extractStatement,
  parseTecHeader,
  scrapeWrongQuestion,
} from "../shared/tecCaptureCore";
import type { CaptureSnapshot } from "../shared/tecCaptureCore";

/**
 * Captura do TEC: banner sem rede, 10 questões na mesma URL, re-render,
 * tempo (piso/teto/sem reset por URL), cabeçalho genérico e Caderno de Erros.
 *
 * A parte "arquivo real" executa os 4 scripts injetados no happy-dom, com
 * MutationObserver/poll/timers reais — nada é simulado no caminho de detecção.
 */

const BODY_WITH_QUESTION = [
  "Matéria: Direito Administrativo",
  "Assunto: Servidores Públicos",
  "#12345 CEBRASPE - 2024 - PC-DF",
  LONG_STATEMENT,
  "A) Alternativa A sobre estabilidade.",
  "B) Alternativa B sobre exoneração.",
].join("\n");

function snapshot(overrides: Partial<CaptureSnapshot> = {}): CaptureSnapshot {
  return {
    bodyText: BODY_WITH_QUESTION,
    doc: null,
    location: {
      pathname: "/cadernos/1",
      search: "",
      href: "https://www.tecconcursos.com.br/cadernos/1",
    },
    ...overrides,
  };
}

describe("núcleo: cabeçalho e identidade", () => {
  it("não trata 'Matéria: Desenvolvimento / Assunto: Blog' como disciplina", () => {
    const header = parseTecHeader(
      "Matéria: Desenvolvimento / Assunto: Blog\n#123 CEBRASPE - 2024 - X\n" +
        LONG_STATEMENT,
      null,
    );
    expect(header.disciplina).not.toMatch(/desenvolvimento/i);
    expect(header.assunto).not.toMatch(/blog/i);
  });

  it("lê disciplina e assunto reais do cabeçalho", () => {
    const header = parseTecHeader(BODY_WITH_QUESTION, null);
    expect(header.disciplina).toBe("Direito Administrativo");
    expect(header.assunto).toBe("Servidores Públicos");
  });

  it("identifica a questão pelo #id, depois pela URL", () => {
    expect(
      extractQuestionId(BODY_WITH_QUESTION, null, snapshot().location),
    ).toEqual({
      questionId: "12345",
      source: "header",
    });
    const noHeader = BODY_WITH_QUESTION.replace(
      "#12345 CEBRASPE - 2024 - PC-DF\n",
      "",
    );
    expect(
      extractQuestionId(noHeader, null, {
        pathname: "/questoes/98765",
        search: "",
        href: "https://tec/questoes/98765",
      }),
    ).toEqual({ questionId: "98765", source: "url" });
  });

  it("assinatura nunca é constante por URL e o fallback usa o contador", () => {
    const a = buildQuestionSignature({
      assunto: "Blog",
      transitionCount: 0,
      pathname: "/cadernos/1",
    });
    const b = buildQuestionSignature({
      assunto: "Blog",
      transitionCount: 1,
      pathname: "/cadernos/1",
    });
    expect(a.startsWith("ass:")).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/^url:/);
  });

  it("mesma questão = mesma assinatura mesmo com URL diferente", () => {
    const snippet = LONG_STATEMENT;
    const a = buildQuestionSignature({
      disciplina: "Direito Administrativo",
      assunto: "Servidores Públicos",
      snippet,
      pathname: "/cadernos/1",
    });
    const b = buildQuestionSignature({
      disciplina: "Direito Administrativo",
      assunto: "Servidores Públicos",
      snippet,
      pathname: "/cadernos/2/topico/3",
    });
    expect(a).toMatch(/^stmt:/);
    expect(a).toBe(b);
  });
});

describe("núcleo: motor de captura", () => {
  it("conta uma vez por questão e não conta re-render", () => {
    let now = 0;
    const engine = createCaptureEngine({ maxSeconds: 600, now: () => now });
    expect(engine.ingest(snapshot())).toBeNull(); // questão apareceu
    now = 30_000;
    const first = engine.ingest(
      snapshot({ bodyText: BODY_WITH_QUESTION + "\nVocê acertou!" }),
    );
    expect(first?.kind).toBe("correct");
    expect(first?.timeSpentSeconds).toBe(30);
    for (let i = 0; i < 4; i += 1) {
      now += 1000;
      expect(
        engine.ingest(
          snapshot({ bodyText: BODY_WITH_QUESTION + "\nVocê acertou!" }),
        ),
      ).toBeNull();
    }
  });

  it("nova questão na mesma URL gera assinatura nova", () => {
    let now = 0;
    const engine = createCaptureEngine({ now: () => now });
    engine.ingest(snapshot());
    now = 10_000;
    const first = engine.ingest(
      snapshot({ bodyText: BODY_WITH_QUESTION + "\nVocê acertou!" }),
    );
    const secondStatement = STATEMENT_VARIANTS[1];
    now = 12_000;
    engine.ingest(
      snapshot({
        bodyText: BODY_WITH_QUESTION.replace(
          LONG_STATEMENT,
          secondStatement,
        ).replace("#12345", "#54321"),
      }),
    );
    now = 22_000;
    const second = engine.ingest(
      snapshot({
        bodyText:
          BODY_WITH_QUESTION.replace(LONG_STATEMENT, secondStatement).replace(
            "#12345",
            "#54321",
          ) + "\nVocê errou!",
      }),
    );
    expect(first?.signature).not.toBe(second?.signature);
    expect(second?.timeSpentSeconds).toBe(10);
  });

  it("sem id e sem enunciado, o contador de transição separa as questões", () => {
    let now = 0;
    const engine = createCaptureEngine({ now: () => now });
    const bare = "Questão curta.\nA) sim\nB) não";
    const at = (text: string) => snapshot({ bodyText: `${bare}\n${text}` });
    const signatures: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      engine.ingest(at(""));
      now += 5_000;
      const event = engine.ingest(at("Você acertou!"));
      expect(event).not.toBeNull();
      if (event) signatures.push(event.signature);
      engine.ingest(at("")); // banner some = próxima questão carregou
      now += 500;
    }
    expect(signatures).toHaveLength(3);
    expect(signatures.every((signature) => signature.startsWith("ass:"))).toBe(
      true,
    );
    expect(new Set(signatures).size).toBe(3);
  });

  it("respeita piso de 1s e teto de 600s", () => {
    let now = 1000;
    const engine = createCaptureEngine({ maxSeconds: 600, now: () => now });
    engine.ingest(snapshot());
    const fast = engine.ingest(
      snapshot({ bodyText: BODY_WITH_QUESTION + "\nVocê errou!" }),
    );
    expect(fast?.timeSpentSeconds).toBe(1);

    now = 50_000;
    const slowEngine = createCaptureEngine({ maxSeconds: 600, now: () => now });
    slowEngine.ingest(
      snapshot({ bodyText: BODY_WITH_QUESTION.replace("#12345", "#33333") }),
    );
    now = 50_000 + 900_000;
    const slow = slowEngine.ingest(
      snapshot({
        bodyText:
          BODY_WITH_QUESTION.replace("#12345", "#33333") + "\nVocê acertou!",
      }),
    );
    expect(slow?.timeSpentSeconds).toBe(600);
  });
});

describe("núcleo: enunciado, alternativas e questão errada", () => {
  it("extrai enunciado e alternativas A-E do texto", () => {
    const statement = extractStatement(null, BODY_WITH_QUESTION);
    expect(statement).toContain("servidor público estável");
    const alternatives = extractAlternatives(null, BODY_WITH_QUESTION);
    expect(alternatives.map((a) => a.letter)).toEqual(["A", "B"]);
  });

  it("sem enunciado não inventa placeholder: marca statementPending", () => {
    const wrong = scrapeWrongQuestion({
      bodyText: "#12345 CEBRASPE - 2024 - PC-DF\nA) x\nB) y",
      questionId: "12345",
      disciplina: "Penal",
      assunto: "Crimes",
    });
    expect(wrong.statement).toBe("");
    expect(wrong.statementPending).toBe(true);
    expect(wrong.questionId).toBe("12345");
  });

  it("detecta acerto/erro só pelo texto do banner", () => {
    expect(extractAnswerResult("nada aqui").kind).toBeNull();
    expect(extractAnswerResult("Você acertou!").kind).toBe("correct");
    expect(extractAnswerResult("Você errou!\nGabarito: B").kind).toBe("wrong");
  });
});

// ─── scripts injetados reais ────────────────────────────────────────────────

const loaded: LoadedTec[] = [];

function boot(file: string, html: string): LoadedTec {
  const instance = loadInjectedTec(file, { html });
  loaded.push(instance);
  instance.advance(2100); // init do script (setTimeout de 2s no código original)
  return instance;
}

afterEach(() => {
  while (loaded.length > 0) loaded.pop()?.close();
});

describe.each([...INJECTED_FILES])("%s", (file) => {
  it("1. banner aparece sem rede e é contabilizado", async () => {
    const tec = boot(file, questionHtml());

    tec.addBanner("correct");
    await tec.settle();
    // 450ms: só o debounce do MutationObserver (~400ms) vence — o poll de
    // 1500ms ainda não rodou, provando que a transição foi observada no DOM.
    tec.advance(450);

    const increments = payloads(tec, "SOE_TEC_INCREMENT_STATS");
    expect(increments).toHaveLength(1);
    expect(increments[0].correctAdd).toBe(1);
    expect(increments[0].errorAdd).toBe(0);
    expect(increments[0].timeSpentSeconds).toBeGreaterThanOrEqual(1);
    expect(increments[0].questionStatement).toContain(
      "servidor público estável",
    );
    expect(String(increments[0].questionStatement).length).toBeLessThanOrEqual(
      600,
    );
    expect(increments[0].questionLabel).toBe("Servidores Públicos");
    expect(increments[0].questionId).toBe("12345");
    expect(increments[0].dedupKey).toBe("12345");
    expect(increments[0].questionSignature).toBe("qid:12345");
    expect(String(increments[0].cadernoUrl)).toContain("/cadernos/1");
  });

  it("2. 10 questões na mesma URL (sem #id) = 10 assinaturas distintas", async () => {
    const tec = boot(
      file,
      questionHtml({ id: null, statement: STATEMENT_VARIANTS[0] }),
    );

    for (let i = 0; i < STATEMENT_VARIANTS.length; i += 1) {
      tec.setStatement(STATEMENT_VARIANTS[i]);
      await tec.settle();
      tec.advance(500); // a questão aparece sem resultado

      tec.addBanner(i % 2 === 0 ? "correct" : "wrong");
      await tec.settle();
      tec.click();
      tec.advance(3000);

      tec.removeBanner();
      await tec.settle();
      tec.advance(500);
    }

    const increments = payloads(tec, "SOE_TEC_INCREMENT_STATS");
    expect(increments).toHaveLength(10);
    const signatures = increments.map((p) => p.questionSignature);
    expect(new Set(signatures).size).toBe(10);
    // Sem "#id" a identidade vem do enunciado — nunca da URL.
    expect(signatures.every((s) => s.startsWith("stmt:"))).toBe(true);
  });

  it("3. mesma questão re-renderizada 5x conta uma única vez", async () => {
    const tec = boot(file, questionHtml());

    for (let i = 0; i < 5; i += 1) {
      tec.addBanner("correct");
      await tec.settle();
      tec.click();
      tec.advance(1600);
      tec.removeBanner();
      await tec.settle();
      tec.advance(400);
    }

    expect(payloads(tec, "SOE_TEC_INCREMENT_STATS")).toHaveLength(1);
  });

  it("4. seconds >= 1, <= 600 e não zera em mudança de URL", async () => {
    const tec = boot(file, questionHtml());
    tec.advance(1000); // o núcleo observa a questão

    tec.clock.now += 118_000;
    tec.runDue();

    tec.navigate(
      "https://www.tecconcursos.com.br/cadernos/1?pagina=2#comentario",
    );
    tec.advance(1200);

    tec.addBanner("correct");
    await tec.settle();
    tec.click();
    tec.advance(3000);

    const increments = payloads(tec, "SOE_TEC_INCREMENT_STATS");
    expect(increments).toHaveLength(1);
    expect(increments[0].timeSpentSeconds).toBeGreaterThanOrEqual(60);
    expect(increments[0].timeSpentSeconds).toBeLessThanOrEqual(600);
  });

  it("5. cabeçalho genérico (Desenvolvimento/Blog) não vira disciplina", async () => {
    const tec = boot(
      file,
      questionHtml({ materia: "Desenvolvimento", assunto: "Blog" }),
    );

    tec.addBanner("correct");
    await tec.settle();
    tec.advance(1600);

    const increments = payloads(tec, "SOE_TEC_INCREMENT_STATS");
    expect(increments).toHaveLength(1);
    expect(String(increments[0].disciplina || "")).not.toMatch(
      /desenvolvimento/i,
    );
    expect(String(increments[0].assunto || "")).not.toMatch(/^blog$/i);
  });

  it("6. erro vira questão do Caderno de Erros com enunciado e alternativas", async () => {
    const tec = boot(file, questionHtml());

    tec.addBanner("wrong");
    await tec.settle();
    tec.advance(1600);

    const wrongQuestions = payloads(tec, "SOE_TEC_WRONG_QUESTION");
    expect(wrongQuestions).toHaveLength(1);
    const wq = wrongQuestions[0];
    expect(wq.questionId).toBe("12345");
    expect(wq.statement).toContain("servidor público estável");
    expect(wq.statement).not.toContain("Alternativa A");
    expect(wq.alternatives.map((a: any) => a.letter)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
    expect(wq.alternatives[0].text).toContain("alternativa A sobre");
    expect(wq.timeSpentSeconds).toBeGreaterThanOrEqual(1);
    expect(wq.statementPending).toBeUndefined();
  });
});
