/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "../server/routers";
import * as storage from "../server/jsonStorage";

vi.mock("../server/jsonStorage");
vi.mock("../server/aiProviders");
vi.mock("../server/tecImportService");

const ctx = {
  user: { id: 1 },
  req: { headers: { "x-forwarded-proto": "https", host: "localhost" } },
  res: { clearCookie: vi.fn() },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(storage.getUserSettings).mockResolvedValue({
    aiApiKey: "chave-teste",
  } as any);
});

describe("learning.startGeneration — validação síncrona", () => {
  it("perguntas sem seção escolhida: erro claro antes de qualquer IA", async () => {
    const caller = appRouter.createCaller(ctx as any);
    await expect(
      caller.learning.startGeneration({
        kind: "questions",
        topicName: "COBIT",
        provider: "gemini",
      }),
    ).rejects.toThrow(/Escolha a seção do PDF/i);
  });

  it("documento inexistente: 404 em vez de gerar no vazio", async () => {
    const caller = appRouter.createCaller(ctx as any);
    await expect(
      caller.learning.startGeneration({
        kind: "questions",
        topicName: "COBIT",
        docId: "doc-que-nao-existe",
        sectionIndex: 0,
        provider: "gemini",
      }),
    ).rejects.toThrow(/Documento não encontrado/i);
  });
});
