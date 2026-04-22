/**
 * Helpers para chamadas a provedores de IA (Gemini, OpenAI, Claude).
 * Centraliza a lógica de retry, fallback e tratamento de erros.
 */

export type AiProvider = "gemini" | "openai" | "claude";

const GEMINI_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro",
  "gemini-2.0-flash-exp",
  "gemini-2.0-flash",
];

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
  imageBase64?: string
): Promise<string> {
  const parts: any[] = [{ text: prompt }];
  if (imageBase64) {
    const [mime, data] = imageBase64.includes(",") ? imageBase64.split(",") : ["image/jpeg", imageBase64];
    const actualMime = mime.includes(":") ? mime.split(":")[1].split(";")[0] : "image/jpeg";
    parts.push({ inlineData: { mimeType: actualMime, data: data } });
  }

  let lastError = "";
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { maxOutputTokens, temperature: 0.7 },
          }),
        }
      );
      
      const data = (await res.json()) as GeminiErrorResponse;
      
      if (data.error) {
        const msg = data.error.message ?? "Erro Gemini";
        const status = data.error.status || "";
        
        // Se for erro de COTA (429), lançamos um erro específico para trocar de CHAVE no callAiProvider
        if (res.status === 429 || status.includes("RESOURCE_EXHAUSTED") || msg.toLowerCase().includes("quota")) {
          throw new Error(`QUOTA_EXCEEDED: ${msg}`);
        }

        // Se o modelo não existe ou não é suportado, tentamos o próximo modelo da mesma chave
        const isUnavailable =
          msg.toLowerCase().includes("not found") ||
          msg.toLowerCase().includes("not supported") ||
          res.status === 404;
          
        if (isUnavailable) {
          lastError = `[${model}] ${msg}`;
          continue;
        }
        
        throw new Error(msg);
      }
      
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } catch (e: any) {
      // Se for erro de cota vindo do fetch ou do throw acima, repassa para trocar de chave
      if (e.message.includes("QUOTA_EXCEEDED") || e.message.toLowerCase().includes("quota") || e.message.toLowerCase().includes("exceeded")) {
        throw e; 
      }
      // Outros erros (ex: rede), tenta o próximo modelo
      lastError = e.message;
      continue;
    }
  }
  throw new Error(`Nenhum modelo Gemini disponível para esta chave. Último erro: ${lastError}`);
}

export async function callOpenAi(
  apiKey: string,
  prompt: string,
  maxTokens = 1024,
  imageBase64?: string
): Promise<string> {
  const content: any[] = [{ type: "text", text: prompt }];
  if (imageBase64) {
    content.push({
      type: "image_url",
      image_url: { url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` },
    });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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
  imageBase64?: string
): Promise<string> {
  const content: any[] = [{ type: "text", text: prompt }];
  if (imageBase64) {
    const [mime, data] = imageBase64.includes(",") ? imageBase64.split(",") : ["image/jpeg", imageBase64];
    const actualMime = mime.includes(":") ? mime.split(":")[1].split(";")[0] : "image/jpeg";
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
 */
export async function callAiProvider(
  provider: AiProvider,
  apiKeyString: string,
  prompt: string,
  maxTokens = 1024,
  imageBase64?: string
): Promise<string> {
  const apiKeys = apiKeyString.split(/[,\s;]+/).filter(Boolean);
  if (apiKeys.length === 0) throw new Error("Nenhuma API Key configurada.");

  let lastError = "";
  for (const key of apiKeys) {
    try {
      switch (provider) {
        case "gemini":
          return await callGeminiWithFallback(key, prompt, maxTokens, imageBase64);
        case "openai":
          return await callOpenAi(key, prompt, maxTokens, imageBase64);
        case "claude":
          return await callClaude(key, prompt, maxTokens, imageBase64);
        default:
          throw new Error(`Provider não suportado: ${provider}`);
      }
    } catch (err: any) {
      lastError = err.message;
      console.warn(`[AI Rotation] Falha com a chave ${key.substring(0, 6)}... : ${err.message}`);
      
      const isQuota = err.message.toLowerCase().includes("quota") || err.message.toLowerCase().includes("exceeded") || err.message.includes("429");
      const isInvalid = err.message.toLowerCase().includes("invalid") || err.message.toLowerCase().includes("key") || err.message.includes("401");
      const isNotFound = err.message.toLowerCase().includes("not found") || err.message.toLowerCase().includes("not supported");
      
      if (apiKeys.length > 1 && (isQuota || isInvalid || isNotFound)) {
        continue; // Tenta a próxima chave
      }
      throw err; // Propaga o erro se for fatal ou única chave
    }
  }
  throw new Error(`Todas as ${apiKeys.length} chaves falharam. Último erro: ${lastError}`);
}
