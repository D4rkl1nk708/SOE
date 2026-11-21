/**
 * Helpers para chamadas a provedores de IA (Gemini, OpenAI, Claude).
 * Centraliza a lógica de retry, fallback e tratamento de erros.
 */
import { retryWithBackoff } from "./retryWithBackoff";
export type AiProvider = "gemini" | "openai" | "claude";

/**
 * Chave de reserva: quando a chamada chega sem chave (cliente novo, outra
 * máquina, localStorage limpo), usamos a chave salva nas configurações do
 * usuário. Sem isso a IA falhava com "Nenhuma API Key configurada" mesmo com a
 * chave cadastrada em Ajustes.
 */
let fallbackApiKeyResolver: () => string | null = () => null;

export function setFallbackApiKeyResolver(fn: () => string | null): void {
  fallbackApiKeyResolver = fn;
}

/** Só para testes. */
export function __resetFallbackApiKeyForTests(): void {
  fallbackApiKeyResolver = () => null;
}

export function normalizeApiKeys(apiKeyString?: string | null): string[] {
  if (!apiKeyString) return [];

  return apiKeyString
    .split(/[\s,;]+/)
    .map((key) => key.trim())
    .filter(Boolean);
}

export function resolveLocalAiConfig(
  requestedProvider: AiProvider | string | undefined,
  userApiKeyString?: string | null,
  fallbackEnvValue?: string | null,
): { provider: AiProvider; apiKeys: string[]; isLocalOnly: boolean } {
  const normalizedProvider = (
    requestedProvider || "gemini"
  ).toLowerCase() as AiProvider;

  const userKeys = normalizeApiKeys(userApiKeyString);
  const fallbackKeys = normalizeApiKeys(fallbackEnvValue);
  const apiKeys = userKeys.length > 0 ? userKeys : fallbackKeys;

  return {
    provider: ["gemini", "openai", "claude"].includes(normalizedProvider)
      ? normalizedProvider
      : "gemini",
    apiKeys,
    isLocalOnly: userKeys.length > 0,
  };
}

/**
 * Ordem = confiabilidade medida (19/11/2026): o 2.5-flash responde em <1s; o
 * flash-lite-latest costuma ter cota própria; 3.x oscila (503) e o 3.5 chegou
 * a travar mais de 20s, por isso fica por último e toda chamada tem timeout.
 */
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
];

export interface AiCallOptions {
  /** Tarefas curtas e estruturadas (JSON): desliga o "thinking" do Gemini 2.5,
   * que consome o orçamento de saída e deixava o JSON truncado. */
  noThinking?: boolean;
  /** Pede resposta application/json ao Gemini. */
  json?: boolean;
}

let geminiTimeoutMs = 25_000;
/** Só para testes. */
export function __setGeminiTimeoutMsForTests(ms: number) {
  geminiTimeoutMs = ms;
}

/**
 * Memória de falhas: (chave, modelo) -> instante até o qual não vale tentar de
 * novo. Evita que toda chamada comece pela chave/modelo já esgotado (cada
 * tentativa queimava requisições e 500 ms de espera).
 */
const cooldownUntil = new Map<string, number>();
let nextKeyOffset = 0;
const QUOTA_COOLDOWN_MS = 5 * 60_000;
const OVERLOAD_COOLDOWN_MS = 30_000;
const INVALID_KEY_COOLDOWN_MS = 60 * 60_000;

function fingerprint(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i += 1) {
    h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function cooldownId(key: string, model: string): string {
  return `${fingerprint(key)}|${model}`;
}

function isCooling(key: string, model: string, now = Date.now()): boolean {
  const until = cooldownUntil.get(cooldownId(key, model));
  return typeof until === "number" && until > now;
}

function setCooldown(key: string, model: string, ms: number) {
  cooldownUntil.set(cooldownId(key, model), Date.now() + ms);
}

/** Só para testes. */
export function __resetAiCooldownsForTests() {
  cooldownUntil.clear();
  nextKeyOffset = 0;
}

/** Quantos segundos o Google pediu para esperar (RetryInfo), se vier. */
function parseRetryDelayMs(raw: unknown): number | null {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  const match = /"?retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i.exec(text);
  if (!match) return null;
  const ms = Math.round(Number(match[1]) * 1000);
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 1000), 15 * 60_000) : null;
}

interface GeminiErrorResponse {
  error?: { message?: string; code?: number; status?: string };
  candidates?: { content: { parts: { text: string }[] } }[];
}

interface OpenAiResponse {
  error?: { message?: string };
  choices?: { message: { content: string } }[];
}

interface ClaudeResponse {
  error?: { message?: string };
  content?: { text: string }[];
}

export async function callGeminiWithFallback(
  apiKey: string,
  prompt: string,
  maxOutputTokens = 1024,
  imageBase64?: string,
  options: AiCallOptions = {},
): Promise<string> {
  const parts: any[] = [{ text: prompt }];
  if (imageBase64) {
    const [mime, data] = imageBase64.includes(",")
      ? imageBase64.split(",")
      : ["image/jpeg", imageBase64];
    const actualMime = mime.includes(":")
      ? mime.split(":")[1].split(";")[0]
      : "image/jpeg";
    parts.push({ inlineData: { mimeType: actualMime, data: data } });
  }

  let lastError = "";
  let sawQuota = false;
  let triedNetwork = false;

  for (const model of GEMINI_MODELS) {
    // Esta chave já falhou neste modelo há pouco: pula sem gastar rede.
    if (isCooling(apiKey, model)) {
      continue;
    }

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens,
      temperature: options.json ? 0.2 : 0.7,
    };
    if (options.json) generationConfig.responseMimeType = "application/json";
    if (options.noThinking && model.startsWith("gemini-2.5-flash")) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), geminiTimeoutMs);
    try {
      triedNetwork = true;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig,
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
              {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_NONE",
              },
              {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_NONE",
              },
              {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_NONE",
              },
            ],
          }),
        },
      );

      const data = (await res.json()) as GeminiErrorResponse;

      if (data.error) {
        let msg = data.error.message ?? "Erro Gemini";
        const invalidKey =
          msg.includes("API key not valid") ||
          msg.includes("expired") ||
          data.error.status === "UNAUTHENTICATED";
        if (invalidKey) {
          msg =
            "Chave API Gemini expirada ou inválida. Por favor, renove-a nas configurações.";
          // chave ruim: não adianta tentar outros modelos com ela
          for (const m of GEMINI_MODELS)
            setCooldown(apiKey, m, INVALID_KEY_COOLDOWN_MS);
          throw new Error(msg);
        }

        const isLimitZero =
          msg.toLowerCase().includes("limit: 0") ||
          msg.toLowerCase().includes("not found") ||
          msg.toLowerCase().includes("not supported") ||
          msg.toLowerCase().includes("no longer available");

        if (res.status === 429 && !isLimitZero) {
          // Cota é POR MODELO: esgotou este, tente o próximo antes de trocar de chave.
          sawQuota = true;
          lastError = `[${model}] ${msg}`;
          const wait =
            parseRetryDelayMs((data.error as any).details) ??
            parseRetryDelayMs(msg) ??
            QUOTA_COOLDOWN_MS;
          setCooldown(apiKey, model, wait);
          continue;
        }

        if (res.status === 503 || res.status === 500) {
          lastError = `[${model}] ${msg}`;
          setCooldown(apiKey, model, OVERLOAD_COOLDOWN_MS);
          continue;
        }

        if (isLimitZero || res.status === 404 || res.status === 403) {
          lastError = `[${model}] ${msg}`;
          setCooldown(apiKey, model, QUOTA_COOLDOWN_MS);
          continue;
        }

        throw new Error(msg);
      }

      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } catch (e: any) {
      if (e?.name === "AbortError") {
        lastError = `[${model}] sem resposta em ${Math.round(geminiTimeoutMs / 1000)}s`;
        setCooldown(apiKey, model, OVERLOAD_COOLDOWN_MS);
        continue;
      }
      if (String(e?.message).includes("expirada ou inválida")) throw e;
      lastError = e?.message ?? String(e);
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  if (sawQuota || (!triedNetwork && lastError === "")) {
    throw new Error(
      `QUOTA_EXCEEDED: todos os modelos Gemini esgotaram a cota desta chave. ${lastError}`.trim(),
    );
  }
  throw new Error(
    `Nenhum modelo Gemini disponível para esta chave. Último erro: ${lastError}`,
  );
}

export async function callOpenAi(
  apiKey: string,
  prompt: string,
  maxTokens = 1024,
  imageBase64?: string,
): Promise<string> {
  const content: any[] = [{ type: "text", text: prompt }];
  if (imageBase64) {
    content.push({
      type: "image_url",
      image_url: {
        url: imageBase64.startsWith("data:")
          ? imageBase64
          : `data:image/jpeg;base64,${imageBase64}`,
      },
    });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content }],
      max_tokens: maxTokens,
    }),
  });
  const data = (await res.json()) as OpenAiResponse;
  if (data.error) throw new Error(data.error.message ?? "Erro na API OpenAI");
  return data.choices?.[0]?.message?.content ?? "";
}

export async function callClaude(
  apiKey: string,
  prompt: string,
  maxTokens = 1024,
  imageBase64?: string,
): Promise<string> {
  const content: any[] = [{ type: "text", text: prompt }];
  if (imageBase64) {
    const [mime, data] = imageBase64.includes(",")
      ? imageBase64.split(",")
      : ["image/jpeg", imageBase64];
    const actualMime = mime.includes(":")
      ? mime.split(":")[1].split(";")[0]
      : "image/jpeg";
    content.unshift({
      type: "image",
      source: { type: "base64", media_type: actualMime, data: data },
    });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });
  const data = (await res.json()) as ClaudeResponse;
  if (data.error) throw new Error(data.error.message ?? "Erro na API Claude");
  return data.content?.[0]?.text ?? "";
}

/**
 * Chama o provedor de IA especificado com suporte a múltiplas chaves (rotação) e imagens.
 * Mantém as chaves configuradas pelo usuário locais e nunca as expira automaticamente.
 */
export async function callAiProvider(
  provider: AiProvider,
  apiKeyString: string,
  prompt: string,
  maxTokens = 1024,
  imageBase64?: string,
  options: AiCallOptions = {},
): Promise<string> {
  let apiKeys = normalizeApiKeys(apiKeyString);
  if (apiKeys.length === 0) {
    try {
      apiKeys = normalizeApiKeys(fallbackApiKeyResolver());
    } catch {
      apiKeys = [];
    }
  }
  if (apiKeys.length === 0) {
    throw new Error(
      "Nenhuma API Key configurada. Cadastre a chave em Ajustes para usar os recursos de IA.",
    );
  }

  // Rodízio: cada chamada começa numa chave diferente, espalhando a cota e o
  // limite por minuto em vez de martelar sempre a chave 1.
  const start = provider === "gemini" ? nextKeyOffset++ % apiKeys.length : 0;

  let lastError = "";
  for (let n = 0; n < apiKeys.length; n++) {
    const key = apiKeys[(start + n) % apiKeys.length];
    try {
      switch (provider) {
        case "gemini":
          return await callGeminiWithFallback(
            key,
            prompt,
            maxTokens,
            imageBase64,
            options,
          );
        case "openai":
          return await callOpenAi(key, prompt, maxTokens, imageBase64);
        case "claude":
          return await callClaude(key, prompt, maxTokens, imageBase64);
        default:
          throw new Error(`Provider não suportado: ${provider}`);
      }
    } catch (err: any) {
      lastError = err.message;
      console.warn(
        `[AI Rotation] Falha com a chave #${((start + n) % apiKeys.length) + 1} (${fingerprint(key)}): ${err.message}`,
      );

      const lower = String(err.message).toLowerCase();
      const isQuota =
        lower.includes("quota") ||
        lower.includes("exceeded") ||
        err.message.includes("429");
      const isInvalid =
        lower.includes("invalid") ||
        lower.includes("inválida") ||
        lower.includes("key") ||
        err.message.includes("401");
      const isNotFound =
        lower.includes("not found") ||
        lower.includes("not supported") ||
        lower.includes("nenhum modelo");

      if (apiKeys.length > 1 && (isQuota || isInvalid || isNotFound)) {
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Todas as ${apiKeys.length} chaves falharam. Último erro: ${lastError}`,
  );
}

/**
 * Testa as chaves fornecidas e retorna um relatório de quais modelos estão funcionando.
 */
export async function testAiKey(
  provider: AiProvider,
  apiKeyString: string,
): Promise<{
  success: boolean;
  details: {
    keyPrefix: string;
    status: "ok" | "error";
    models: string[];
    error?: string;
  }[];
}> {
  const apiKeys = normalizeApiKeys(apiKeyString);
  const details: any[] = [];
  let totalSuccess = false;

  for (const key of apiKeys) {
    const keyPrefix = `${key.substring(0, 6)}...`;
    const workingModels: string[] = [];
    let firstError = "";

    if (provider === "gemini") {
      for (const model of GEMINI_MODELS) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: "health check" }] }],
                generationConfig: { maxOutputTokens: 1 },
              }),
            },
          );
          const data = (await res.json()) as GeminiErrorResponse;
          if (!data.error) {
            workingModels.push(model);
            totalSuccess = true;
          } else if (!firstError) {
            firstError = data.error.message || "Erro desconhecido";
          }
        } catch (e: any) {
          if (!firstError) firstError = e.message;
        }
      }
    } else {
      workingModels.push("Standard Model");
      totalSuccess = true;
    }

    details.push({
      keyPrefix,
      status: workingModels.length > 0 ? "ok" : "error",
      models: workingModels,
      error: workingModels.length === 0 ? firstError : undefined,
    });
  }

  return { success: totalSuccess, details };
}
