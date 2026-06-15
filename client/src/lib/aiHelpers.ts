/**
 * Helpers para chamadas a provedores de IA no modo Standalone.
 */

export type AiProvider = "gemini" | "openai" | "claude";

const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];

async function callGemini(
  apiKey: string,
  prompt: string,
  maxTokens = 1200,
  imageBase64?: string,
): Promise<string> {
  let lastError = "";
  for (const model of GEMINI_MODELS) {
    try {
      const parts: any[] = [{ text: prompt }];
      if (imageBase64) {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: "image/jpeg",
          },
        });
      }

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
          }),
        },
      );
      const d = await r.json();
      if (d.error) {
        const msg = d.error.message || "Erro Gemini";
        if (
          msg.toLowerCase().includes("quota") ||
          msg.toLowerCase().includes("not found") ||
          r.status === 429 ||
          r.status === 404
        ) {
          lastError = msg;
          continue;
        }
        throw new Error(msg);
      }
      return d.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (err: any) {
      if (
        !err.message?.toLowerCase().includes("quota") &&
        !err.message?.toLowerCase().includes("not found")
      )
        throw err;
      lastError = err.message;
    }
  }
  throw new Error(
    `Nenhum modelo Gemini disponível ou cota esgotada. Último erro: ${lastError}`,
  );
}

async function callOpenAI(
  apiKey: string,
  prompt: string,
  maxTokens = 1200,
  imageBase64?: string,
): Promise<string> {
  const messages: any[] = [];
  if (imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageBase64 } },
      ],
    });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: imageBase64 ? "gpt-4o" : "gpt-4o-mini",
      messages,
      max_tokens: maxTokens,
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "Erro OpenAI");
  return d.choices?.[0]?.message?.content || "";
}

async function callClaude(
  apiKey: string,
  prompt: string,
  maxTokens = 1200,
  imageBase64?: string,
): Promise<string> {
  const content: any[] = [];
  if (imageBase64) {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const mimeType =
      imageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || "image/jpeg";
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mimeType,
        data: base64Data,
      },
    });
  }
  content.push({ type: "text", text: prompt });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
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
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "Erro Claude");
  return d.content?.[0]?.text || "";
}

export async function callAiProvider(
  provider: AiProvider,
  apiKeyString: string,
  prompt: string,
  maxTokens = 1200,
  imageBase64?: string,
): Promise<string> {
  const apiKeys = apiKeyString.split(/[,\s;]+/).filter(Boolean);
  if (apiKeys.length === 0)
    throw new Error("Nenhuma API Key configurada no perfil.");

  let lastError = "";
  for (let i = 0; i < apiKeys.length; i++) {
    const key = apiKeys[i];
    try {
      if (provider === "gemini")
        return await callGemini(key, prompt, maxTokens, imageBase64);
      if (provider === "openai")
        return await callOpenAI(key, prompt, maxTokens, imageBase64);
      if (provider === "claude")
        return await callClaude(key, prompt, maxTokens, imageBase64);
      throw new Error(`Provider inválido: ${provider}`);
    } catch (err: any) {
      lastError = err.message;
      console.warn(
        `[AI Rotation] Falha com a chave ${key.substring(0, 6)}... : ${err.message}`,
      );

      const isQuota =
        err.message.toLowerCase().includes("quota") ||
        err.message.toLowerCase().includes("exceeded") ||
        err.message.includes("429");
      const isInvalid =
        err.message.toLowerCase().includes("invalid") ||
        err.message.toLowerCase().includes("key") ||
        err.message.includes("401");

      if (apiKeys.length > 1 && (isQuota || isInvalid)) {
        continue; // Tenta a próxima chave
      }
      throw err;
    }
  }
  throw new Error(
    `Todas as ${apiKeys.length} chaves falharam. Último erro: ${lastError}`,
  );
}

export function extractJSON(text: string): any {
  if (!text) throw new Error("Resposta vazia.");
  let cleaned = text
    .replace(/```json\s?([\s\S]*?)```/g, "$1")
    .replace(/```\s?([\s\S]*?)```/g, "$1")
    .trim();
  const start = cleaned.indexOf("{");
  const startArr = cleaned.indexOf("[");
  const first =
    start !== -1 && startArr !== -1
      ? Math.min(start, startArr)
      : start !== -1
        ? start
        : startArr;
  if (first === -1) throw new Error("JSON não encontrado.");
  let jsonStr = cleaned.substring(first).trim();
  try {
    return JSON.parse(jsonStr);
  } catch (e) {}

  // Basic recovery for truncated JSON (simplified version of the server one)
  let current = jsonStr.replace(/[,:\[\{\" \n\r\t]+$/, "");
  for (let i = 0; i < 20; i++) {
    try {
      let attempt = current;
      if ((attempt.match(/"/g) || []).length % 2 !== 0) attempt += '"';
      const ob = (attempt.match(/\{/g) || []).length,
        cb = (attempt.match(/\}/g) || []).length;
      const ok = (attempt.match(/\[/g) || []).length,
        ck = (attempt.match(/\]/g) || []).length;
      if (ok > ck) attempt += "]".repeat(ok - ck);
      if (ob > cb) attempt += "}".repeat(ob - cb);
      return JSON.parse(attempt);
    } catch (e) {
      const last = Math.max(
        current.lastIndexOf(","),
        current.lastIndexOf("["),
        current.lastIndexOf("{"),
        current.lastIndexOf(":"),
      );
      if (last <= 0) break;
      current = current
        .substring(0, last)
        .trim()
        .replace(/[,:]+$/, "")
        .trim();
    }
  }
  throw new Error("Falha ao parsear JSON da IA.");
}
