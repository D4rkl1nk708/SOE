/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "../server/routers";
import * as storage from "../server/jsonStorage";
import { callAiProvider } from "../server/aiProviders";
import {
  __resetJobsForTests,
  startGenerationJob,
} from "../server/learningJobs";

vi.mock("../server/jsonStorage");
vi.mock("../server/aiProviders");
vi.mock("../server/tecImportService");

const ctx = {
  user: { id: 1 },
  req: { headers: { "x-forwarded-proto": "https", host: "localhost" } },
  res: { clearCookie: vi.fn() },
};

/** JSON de aula válido, do jeito que o modelo devolve. */
const LESSON_JSON = JSON.stringify({
  title: "Paginação de memória",
  html: `<!doctype html><html><head><style>body{background:#0b0f1a;color:#eee}@media (prefers-reduced-motion: reduce){*{animation:none}}</style></head><body><canvas id="c" width="600" height="300"></canvas><button id="p">Play</button><script>const el=document.getElementById("c");let t=0;function f(){t++;el.getContext("2d").fillRect(t%600,10,30,30);requestAnimationFrame(f)}requestAnimationFrame(f);</script></body></html>`,
  steps: [
    { title: "Endereço", text: "A CPU pede um endereço virtual." },
    { title: "Tradução", text: "A MMU traduz para o quadro físico." },
    { title: "Falta", text: "Sem quadro, ocorre page fault." },
  ],
  interaction: "arraste a página para um quadro livre",
  question: {
    prompt: "O que acontece na falta de página?",
    options: ["page fault", "nada"],
    correctIndex: 0,
    feedback: "Sem quadro livre, o SO trata a falta de página.",
  },
  limits: ["não modela TLB"],
});

beforeEach(() => {
  vi.resetAllMocks();
  __resetJobsForTests();
  vi.mocked(storage.getUserSettings).mockResolvedValue({
    aiApiKey: "chave-teste",
    exams: [],
    studySessionLog: [],
  } as any);
});

afterEach(() => {
  __resetJobsForTests();
});

async function waitForJob(
  caller: ReturnType<typeof appRouter.createCaller>,
  jobId: string,
) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const view = await caller.learning.generationStatus({ jobId });
    if (view.status !== "running") return view;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("job não terminou no tempo do teste");
}

describe("learning.startGeneration / generationStatus", () => {
  it("gera aula por job e termina em 100% com o artefato validado", async () => {
    vi.mocked(callAiProvider).mockResolvedValue(LESSON_JSON);
    const caller = appRouter.createCaller(ctx as any);

    const started = await caller.learning.startGeneration({
      kind: "lesson",
      topicName: "Paginação de memória",
      disciplineName: "Arquitetura",
      provider: "gemini",
    });
    expect(started.jobId).toMatch(/^job-/);

    const view = await waitForJob(caller, started.jobId);
    expect(view.status).toBe("done");
    expect(view.percent).toBe(100);
    expect(view.stage).toBe("pronto");
    const result = view.result as any;
    expect(result.steps).toHaveLength(3);
    expect(result.question.correctIndex).toBe(0);
    expect(result.topicName).toBe("Paginação de memória");
    // A chamada saiu com as opções que evitam o JSON truncado.
    const options = vi.mocked(callAiProvider).mock.calls[0][5];
    expect(options).toEqual({ noThinking: true, json: true });
  });

  it("transforma falha da IA em erro legível, sem stack trace", async () => {
    vi.mocked(callAiProvider).mockRejectedValue(
      new Error("QUOTA_EXCEEDED: todos os modelos esgotaram"),
    );
    const caller = appRouter.createCaller(ctx as any);

    const started = await caller.learning.startGeneration({
      kind: "lesson",
      topicName: "Licitação",
      provider: "gemini",
    });
    const view = await waitForJob(caller, started.jobId);
    expect(view.status).toBe("error");
    expect(view.error?.code).toBe("QUOTA_EXCEEDED");
    expect(view.message).toMatch(/Cota da IA esgotada/);
    expect(view.percent).toBeLessThan(100);
  });

  it("404 claro para job inexistente e para job de outro usuário", async () => {
    const caller = appRouter.createCaller(ctx as any);
    await expect(
      caller.learning.generationStatus({ jobId: "job-nao-existe" }),
    ).rejects.toThrow(/não encontrada ou expirada/i);

    const foreign = startGenerationJob(
      99,
      "lesson",
      () => new Promise(() => {}),
    );
    await expect(
      caller.learning.generationStatus({ jobId: foreign.id }),
    ).rejects.toThrow(/não encontrada ou expirada/i);
    await expect(
      caller.learning.cancelGeneration({ jobId: foreign.id }),
    ).rejects.toThrow(/não encontrada ou expirada/i);
    expect(foreign.status).toBe("running");
  });

  it("recusa sem chave e com 2 gerações já em andamento", async () => {
    const caller = appRouter.createCaller(ctx as any);

    vi.mocked(storage.getUserSettings).mockResolvedValueOnce({} as any);
    await expect(
      caller.learning.startGeneration({
        kind: "lesson",
        topicName: "Analogias",
        provider: "gemini",
      }),
    ).rejects.toThrow(/Nenhuma chave de IA configurada/i);

    startGenerationJob(1, "lesson", () => new Promise(() => {}));
    startGenerationJob(1, "microWorld", () => new Promise(() => {}));
    await expect(
      caller.learning.startGeneration({
        kind: "lesson",
        topicName: "Memória",
        provider: "gemini",
      }),
    ).rejects.toThrow(/2 gerações em andamento/i);
  });

  it("cancelar pelo router libera o slot", async () => {
    const caller = appRouter.createCaller(ctx as any);
    let release: (value: unknown) => void = () => {};
    vi.mocked(callAiProvider).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }) as any,
    );

    const started = await caller.learning.startGeneration({
      kind: "lesson",
      topicName: "Fila",
      provider: "gemini",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const cancelled = await caller.learning.cancelGeneration({
      jobId: started.jobId,
    });
    expect(cancelled.cancelled).toBe(true);

    release(LESSON_JSON);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const view = await caller.learning.generationStatus({
      jobId: started.jobId,
    });
    expect(view.status).toBe("cancelled");
    expect(view.result).toBeUndefined();

    // Slot livre: novo job é aceito.
    vi.mocked(callAiProvider).mockResolvedValue(LESSON_JSON);
    const again = await caller.learning.startGeneration({
      kind: "lesson",
      topicName: "Fila",
      provider: "gemini",
    });
    expect(again.jobId).toBeTruthy();
    await waitForJob(caller, again.jobId);
  });
});
