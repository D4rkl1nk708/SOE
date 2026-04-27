/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "../server/routers";
import * as storage from "../server/jsonStorage";
import { callAiProvider } from "../server/aiProviders";
import * as pdfParseModule from "pdf-parse/lib/pdf-parse.js";

vi.mock("../server/jsonStorage");
vi.mock("../server/aiProviders");
vi.mock("pdf-parse/lib/pdf-parse.js", () => {
  return {
    default: vi.fn(async () => ({
      text: "Texto extraído do PDF com pelo menos 50 caracteres para passar na validacao do tamanho minimo exigido pelo editalRouter",
    })),
    __esModule: true,
  };
});

const ctx = { user: { id: 1 } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(storage.getUserSettings).mockResolvedValue({
    aiProvider: "gemini",
    aiApiKey: "key",
  } as any);
});

describe("editalRouter", () => {
  it("quickAddManual", async () => {
    const caller = appRouter.createCaller(ctx as any);
    const result = await caller.edital.quickAddManual({
      discipline: "Direito Administrativo",
      topicsText: "Atos Administrativos\nLicitações, Contratos",
    });

    expect(result).toHaveLength(3);
    expect(result[0].topic).toBe("Atos Administrativos");
    expect(result[1].topic).toBe("Licitações");
    expect(result[2].topic).toBe("Contratos");
    expect(result[0].discipline).toBe("Direito Administrativo");
  });

  it("parseEdital with text", async () => {
    const caller = appRouter.createCaller(ctx as any);

    vi.mocked(callAiProvider).mockResolvedValue(
      JSON.stringify([{ discipline: "Português", topic: "Crase" }]),
    );

    const result = await caller.edital.parseEdital({
      text: "Texto longo o suficiente para passar na validacao de tamanho minimo que exige 50 caracteres no editalRouter",
      role: "Auditor",
    });

    expect(result).toHaveLength(1);
    expect(result[0].discipline).toBe("Português");
    expect(result[0].topic).toBe("Crase");
  });

  it("parseEdital with PDF", async () => {
    const caller = appRouter.createCaller(ctx as any);

    vi.mocked(callAiProvider).mockResolvedValue(
      JSON.stringify([{ discipline: "Matemática", topic: "Frações" }]),
    );

    const pdfBase64 = Buffer.from("fake-pdf-content").toString("base64");

    const result = await caller.edital.parseEdital({
      pdfBase64,
      role: "Técnico",
    });

    expect(result).toHaveLength(1);
    expect(result[0].discipline).toBe("Matemática");
  });

  it("parseEdital error on short text", async () => {
    const caller = appRouter.createCaller(ctx as any);

    await expect(caller.edital.parseEdital({ text: "curto" })).rejects.toThrow(
      "Conteúdo insuficiente para análise",
    );
  });

  it("parseEdital error on invalid AI JSON", async () => {
    const caller = appRouter.createCaller(ctx as any);

    vi.mocked(callAiProvider).mockResolvedValue("Not a JSON array");

    await expect(
      caller.edital.parseEdital({
        text: "Texto longo o suficiente para passar na validacao de tamanho minimo que exige 50 caracteres no editalRouter",
      }),
    ).rejects.toThrow("Nenhum dado JSON");
  });

  it("optimizeCycle", async () => {
    const caller = appRouter.createCaller(ctx as any);

    vi.mocked(callAiProvider).mockResolvedValue(
      JSON.stringify([
        { slotIndex: 0, disciplineId: 1, reason: "Precisa melhorar" },
        { slotIndex: 1, disciplineId: 2, reason: "Manutenção" },
      ]),
    );

    const result = await caller.edital.optimizeCycle({
      disciplines: [
        {
          id: 1,
          name: "D1",
          accuracy: 40,
          questionsResolved: 100,
          studyTimeSeconds: 3600,
        },
        {
          id: 2,
          name: "D2",
          accuracy: 90,
          questionsResolved: 200,
          studyTimeSeconds: 7200,
        },
      ],
      cycleLength: 2,
    });

    expect(result).toHaveLength(2);
    expect(result[0].disciplineId).toBe(1);
    expect(result[1].disciplineId).toBe(2);
  });
});
