/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callAiProvider,
  callGeminiWithFallback,
  __resetAiCooldownsForTests,
  __setGeminiTimeoutMsForTests,
} from "../server/aiProviders";

type Plan = (url: string, body: any) => Response | Promise<Response>;

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ok = (text: string) =>
  jsonResponse(200, { candidates: [{ content: { parts: [{ text }] } }] });
const quota = (retry?: string) =>
  jsonResponse(429, {
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      message: "You exceeded your current quota.",
      details: retry ? [{ retryDelay: retry }] : [],
    },
  });

function install(plan: Plan) {
  const calls: Array<{ key: string; model: string; body: any }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init: any) => {
      const url = String(input);
      const model = /models\/([^:]+):/.exec(url)![1];
      const key = /key=([^&]+)/.exec(url)![1];
      const body = JSON.parse(init.body);
      calls.push({ key, model, body });
      return plan(url, body);
    }),
  );
  return calls;
}

beforeEach(() => {
  __resetAiCooldownsForTests();
  __setGeminiTimeoutMsForTests(25_000);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Gemini: cota por modelo e memória de falhas", () => {
  it("429 no 2.5-flash tenta o próximo modelo da MESMA chave antes de desistir", async () => {
    const calls = install((url) =>
      url.includes("gemini-2.5-flash:") ? quota() : ok("veio do lite"),
    );
    const out = await callGeminiWithFallback("KEY_A", "oi");
    expect(out).toBe("veio do lite");
    expect(calls.map((c) => c.model)).toEqual([
      "gemini-2.5-flash",
      "gemini-flash-lite-latest",
    ]);
  });

  it("lembra o que esgotou: a segunda chamada pula o modelo sem gastar rede", async () => {
    const calls = install((url) =>
      url.includes("gemini-2.5-flash:") ? quota() : ok("ok"),
    );
    await callGeminiWithFallback("KEY_A", "um");
    calls.length = 0;
    await callGeminiWithFallback("KEY_A", "dois");
    expect(calls.map((c) => c.model)).toEqual(["gemini-flash-lite-latest"]);
  });

  it("todos os modelos esgotados lança QUOTA_EXCEEDED e, em seguida, falha sem rede", async () => {
    const calls = install(() => quota());
    await expect(callGeminiWithFallback("KEY_A", "x")).rejects.toThrow(
      /QUOTA_EXCEEDED/,
    );
    const used = calls.length;
    expect(used).toBeGreaterThan(1);
    await expect(callGeminiWithFallback("KEY_A", "y")).rejects.toThrow(
      /QUOTA_EXCEEDED/,
    );
    expect(calls.length).toBe(used);
  });

  it("503 (alta demanda) passa para o próximo modelo", async () => {
    const calls = install((url) =>
      url.includes("gemini-2.5-flash:")
        ? jsonResponse(503, { error: { code: 503, message: "high demand" } })
        : ok("fallback"),
    );
    expect(await callGeminiWithFallback("KEY_A", "x")).toBe("fallback");
    expect(calls[0].model).toBe("gemini-2.5-flash");
  });

  it("modelo que trava é abortado pelo timeout e o próximo responde", async () => {
    __setGeminiTimeoutMsForTests(40);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: any, init: any) => {
        if (String(input).includes("gemini-2.5-flash:")) {
          return new Promise<Response>((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          });
        }
        return ok("depois do timeout");
      }),
    );
    expect(await callGeminiWithFallback("KEY_A", "x")).toBe(
      "depois do timeout",
    );
  });

  it("chave inválida não tenta os outros modelos", async () => {
    const calls = install(() =>
      jsonResponse(400, {
        error: {
          code: 400,
          message: "API key not valid.",
          status: "INVALID_ARGUMENT",
        },
      }),
    );
    await expect(callGeminiWithFallback("KEY_BAD", "x")).rejects.toThrow(
      /inválida/,
    );
    expect(calls).toHaveLength(1);
  });

  it("noThinking/json só mexem em modelos 2.5 e pedem JSON", async () => {
    const calls = install(() => ok("{}"));
    await callGeminiWithFallback("KEY_A", "x", 600, undefined, {
      noThinking: true,
      json: true,
    });
    const cfg = calls[0].body.generationConfig;
    expect(cfg.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(cfg.responseMimeType).toBe("application/json");
    expect(cfg.maxOutputTokens).toBe(600);
  });

  it("sem opções o corpo não muda (sem thinkingConfig)", async () => {
    const calls = install(() => ok("texto"));
    await callGeminiWithFallback("KEY_A", "x");
    expect(calls[0].body.generationConfig.thinkingConfig).toBeUndefined();
    expect(calls[0].body.generationConfig.responseMimeType).toBeUndefined();
  });
});

describe("rodízio de chaves", () => {
  it("chave esgotada em todos os modelos: usa a próxima e depois nem tenta a esgotada", async () => {
    const calls = install((url) =>
      url.includes("key=K1") ? quota() : ok("pela K2"),
    );
    const keys = "K1 K2 K3";
    // primeira chamada começa na K1 (offset 0): falha, cai na K2
    expect(await callAiProvider("gemini", keys, "a")).toBe("pela K2");
    const k1Calls = calls.filter((c) => c.key === "K1").length;
    expect(k1Calls).toBeGreaterThan(0);

    // chamadas seguintes: K1 está em cooldown, não gasta rede com ela
    for (let i = 0; i < 4; i++) {
      expect(await callAiProvider("gemini", keys, "b")).toBe("pela K2");
    }
    expect(calls.filter((c) => c.key === "K1").length).toBe(k1Calls);
  });

  it("espalha a carga: chamadas consecutivas começam em chaves diferentes", async () => {
    const calls = install(() => ok("ok"));
    for (let i = 0; i < 3; i++) await callAiProvider("gemini", "K1 K2 K3", "x");
    expect(calls.map((c) => c.key)).toEqual(["K1", "K2", "K3"]);
  });

  it("todas as chaves esgotadas: erro claro com a contagem", async () => {
    install(() => quota());
    await expect(callAiProvider("gemini", "K1 K2", "x")).rejects.toThrow(
      /Todas as 2 chaves falharam/,
    );
  });

  it("uma chave só e erro de cota propaga QUOTA_EXCEEDED", async () => {
    install(() => quota());
    await expect(callAiProvider("gemini", "K1", "x")).rejects.toThrow(
      /QUOTA_EXCEEDED/,
    );
  });
});
