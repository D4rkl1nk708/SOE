/** @vitest-environment node */
/**
 * Jornada 8 (v6.9.13): o leitor paginado.
 *
 * - abre o documento e o texto da seção vira páginas;
 * - avança duas páginas e a posição é gravada por documento + seção;
 * - fecha e reabre na mesma página;
 * - a recuperação da seção já respondida não se perde com a leitura.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { appRouter } from "../../server/routers";
import { bootstrapJourney, JOURNEY_USER_ID, type JourneyMeta } from "./setup";
import { setUploadsDir } from "../../server/mediaStorage";
import { splitSectionIntoBlocks } from "@/components/learning/readingModel";
import { paginateBlocks } from "@shared/pagination";

const TODAY = "2026-11-21";
const DOC_ID = "leitorjornada01";

type Storage = typeof import("../../server/jsonStorage");
type Caller = ReturnType<typeof appRouter.createCaller>;

function sectionText(label: string, paragraphs: number): string {
  return Array.from({ length: paragraphs }, (_, index) => {
    const words = Array.from(
      { length: 45 },
      (_, word) => `${label}${index + 1}w${word + 1}`,
    );
    return `Paragrafo ${index + 1} de ${label} comecando aqui. ${words.join(" ")}.`;
  }).join("\n");
}

interface Ctx {
  meta: JourneyMeta;
  storage: Storage;
  caller: Caller;
  cleanup: () => void;
}

async function makeContext(): Promise<Ctx> {
  const boot = await bootstrapJourney(TODAY);
  const caller = appRouter.createCaller({
    user: { id: JOURNEY_USER_ID },
    req: {},
    res: {},
  } as never);

  // Documento de leitura real (mesmo formato do importador), em DATA_DIR temporário.
  setUploadsDir(boot.dir);
  const dir = path.join(boot.dir, "uploads", "learning");
  fs.mkdirSync(dir, { recursive: true });
  const sections = [0, 1, 2].map((index) => ({
    title: `Secao ${index + 1}`,
    startPage: index + 1,
    endPage: index + 1,
    text: sectionText(`s${index + 1}`, 6),
    pageSpans: [{ page: index + 1, start: 0, end: 100000 }],
  }));
  fs.writeFileSync(
    path.join(dir, `${DOC_ID}.json`),
    JSON.stringify({
      id: DOC_ID,
      title: "Apostila de teste",
      pages: sections.length,
      sections: sections.length,
      createdAt: new Date().toISOString(),
      sectionsData: sections,
    }),
    "utf8",
  );
  await boot.storage.updateUserSettings(JOURNEY_USER_ID, {
    learningDocs: [
      {
        id: DOC_ID,
        title: "Apostila de teste",
        pages: sections.length,
        sections: sections.length,
        createdAt: new Date().toISOString(),
      },
    ],
  } as never);

  return {
    meta: boot.meta,
    storage: boot.storage,
    caller,
    cleanup: () => {
      boot.cleanup();
    },
  };
}

describe("Jornada 8 — leitor paginado", () => {
  let ctx: Ctx;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 21, 9, 0, 0));
    ctx = await makeContext();
  });

  afterEach(() => {
    ctx.cleanup();
    vi.useRealTimers();
  });

  it("abre o documento, avança duas páginas e reabre na mesma página", async () => {
    const doc = await ctx.caller.learning.get({ docId: DOC_ID });
    expect(doc.sectionsData).toHaveLength(3);

    const paragraphs = splitSectionIntoBlocks(doc.sectionsData[0]).flatMap(
      (block) => block.paragraphs,
    );
    const pages = paginateBlocks(paragraphs, { maxWords: 60 });
    expect(pages.length).toBeGreaterThanOrEqual(3);

    const key = `${DOC_ID}::0`;
    const position = { [key]: 0 };

    // Lê a página 1, avança duas páginas.
    position[key] = 1;
    await ctx.caller.v10.updateV10Settings({ readingPosition: position });
    position[key] = 2;
    await ctx.caller.v10.updateV10Settings({ readingPosition: position });

    // Fecha o app e reabre: a posição vem das settings (é o que a tela lê).
    const stats = await ctx.caller.dashboard.getStats();
    expect((stats.settings as any).readingPosition[key]).toBe(2);

    // A outra seção começa do começo: a posição é por documento + seção.
    expect(
      (stats.settings as any).readingPosition[`${DOC_ID}::1`],
    ).toBeUndefined();
  });

  it("a recuperação da seção não se perde ao salvar a posição de leitura", async () => {
    await ctx.caller.learning.saveSectionRecall({
      docId: DOC_ID,
      sectionIndex: 0,
      sectionTitle: "Secao 1",
      question: "O que esta seção afirma sobre Secao 1?",
      answer: "Afirma os quatro pontos principais.",
      selfRated: "acertei",
    });

    await ctx.caller.v10.updateV10Settings({
      readingPosition: { [`${DOC_ID}::0`]: 2 },
    });

    const recalls = await ctx.caller.learning.sectionRecalls({ docId: DOC_ID });
    const saved = recalls.find((item: any) => item.sectionIndex === 0);
    expect(saved).toBeTruthy();
    // `saved` é opcional para o TypeScript: o teste já falhou acima se faltar.
    expect(saved?.selfRated).toBe("acertei");

    // Reabrir o documento não apaga nem a recuperação nem a página.
    const doc = await ctx.caller.learning.get({ docId: DOC_ID });
    expect(doc.sectionsData).toHaveLength(3);
    const stats = await ctx.caller.dashboard.getStats();
    expect((stats.settings as any).readingPosition[`${DOC_ID}::0`]).toBe(2);
    const again = await ctx.caller.learning.sectionRecalls({ docId: DOC_ID });
    expect(again.some((item: any) => item.sectionIndex === 0)).toBe(true);
  });
});
