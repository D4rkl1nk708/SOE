/**
 * Helpers para chamadas a provedores de IA (Gemini, OpenAI, Claude).
 * Centraliza a lógica de retry, fallback e tratamento de erros.
 */

export type AiProvider = "gemini" | "openai" | "claude";

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

interface GeminiErrorResponse {
  error?: { message?: string };
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
  maxOutputTokens = 1024
): Promise<string> {
  let lastError = "";
  for (const model of GEMINI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens, temperature: 0.7 },
        }),
      }
    );
    const data = (await res.json()) as GeminiErrorResponse;
    if (data.error) {
      const msg = data.error.message ?? "Erro Gemini";
      const isUnavailable =
        msg.toLowerCase().includes("quota") ||
        msg.toLowerCase().includes("exceeded") ||
        msg.toLowerCase().includes("not found") ||
        msg.toLowerCase().includes("not supported") ||
        res.status === 429 ||
        res.status === 404;
      if (isUnavailable) {
        lastError = `[${model}] ${msg}`;
        console.warn(`[Gemini] Modelo ${model} indisponível, tentando próximo...`);
        continue;
      }
      throw new Error(msg);
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
  throw new Error(`Nenhum modelo Gemini disponível. Último erro: ${lastError}`);
}

export async function callOpenAi(
  apiKey: string,
  prompt: string,
  maxTokens = 1024
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
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
  maxTokens = 1024
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = (await res.json()) as ClaudeResponse;
  if (data.error) throw new Error(data.error.message ?? "Erro na API Claude");
  return data.content?.[0]?.text ?? "";
}

/**
 * Chama o provedor de IA especificado e retorna o texto da resposta.
 */
export async function callAiProvider(
  provider: AiProvider,
  apiKey: string,
  prompt: string,
  maxTokens = 1024
): Promise<string> {
  switch (provider) {
    case "gemini":
      return callGeminiWithFallback(apiKey, prompt, maxTokens);
    case "openai":
      return callOpenAi(apiKey, prompt, maxTokens);
    case "claude":
      return callClaude(apiKey, prompt, maxTokens);
    default:
      throw new Error(`Provider não suportado: ${provider}`);
  }
}
