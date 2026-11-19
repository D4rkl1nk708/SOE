/**
 * Classificação de questões capturadas do TEC Concursos.
 *
 * Ordem de decisão (local primeiro, IA por último):
 *   1. rótulo genérico de navegação do TEC -> pendência, sem IA;
 *   2. alias do usuário para o rótulo (tópico) ou para a disciplina -> resolvido;
 *   3. match local (findBestDisciplineMatch + findBestTopicMatch) com confiança
 *      >= minConfidence -> resolvido;
 *   4. disciplina casada e tópico não -> pendência com sugestão de disciplina
 *      (o usuário escolhe o tópico; NADA é criado aqui);
 *   5. cache de IA por rótulo -> resolve (ou devolve sugestão fraca) sem nova
 *      chamada;
 *   6. IA, uma única vez por rótulo na vida, no máximo N chamadas por hora;
 *   7. qualquer falha de IA -> pendência com o melhor esforço local, sem throw.
 *
 * Este módulo é puro: recebe disciplinas/tópicos/settings já carregados e não
 * toca em storage. O `aiCall` é injetável para que os testes não façam rede.
 */
import { callAiProvider, type AiProvider } from "./aiProviders";
import {
  findBestDisciplineMatch,
  findBestTopicMatch,
  normalizeDisciplineKey,
} from "./tecDisciplineMatcher";
import { isGenericTecLabel, normalizeTecLabel } from "../shared/tecLabels";
import { normalizeString } from "../shared/utils";

export type TecClassificationSuggestion = {
  disciplineId?: number | null;
  topicId?: number | null;
  createDiscipline?: string;
  createTopic?: string;
  confidence: number;
  reason: string;
};

export type TecClassification = {
  disciplineId: number | null;
  topicId: number | null;
  confidence: number;
  source: "alias" | "local" | "ai" | "none";
  reason: string;
  /** caminho escolhido, ordem: alias do rótulo -> match local -> IA -> pendência */
  suggestion: TecClassificationSuggestion | null;
  usedAi: boolean;
  /** true => o chamador grava a tentativa como pendente (topicId null) e mostra a pergunta ao usuário */
  unresolved: boolean;
  /** entrada para persistir em settings.tecLabelAiCache quando usou IA */
  aiCacheEntry?: { key: string; value: TecClassificationSuggestion } | null;
};

const DEFAULT_MIN_CONFIDENCE = 0.75;
const DEFAULT_MAX_AI_CALLS_PER_HOUR = 10;
const AI_WINDOW_MS = 60 * 60 * 1000;
const AI_MAX_TOKENS = 400;
const STATEMENT_SNIPPET_LIMIT = 600;

/** userId -> timestamps (ms) das chamadas de IA já feitas. */
const aiCallsByUser = new Map<number, number[]>();
/**
 * Cache em memória por usuário+rótulo. Serve de rede de segurança caso o
 * chamador ainda não tenha persistido settings.tecLabelAiCache: a regra é UMA
 * chamada de IA por rótulo na vida, não uma por sessão.
 */
const aiLabelMemoryCache = new Map<string, TecClassificationSuggestion>();

/** reseta o limitador em memória (uso em testes) */
export function resetTecAiRateLimiter(): void {
  aiCallsByUser.clear();
  aiLabelMemoryCache.clear();
}

/** Chamadas de IA registradas para o usuário na última hora. */
export function getTecAiCallsThisHour(
  userId: number,
  now: number = Date.now(),
): number {
  const stamps = aiCallsByUser.get(userId);
  if (!stamps || stamps.length === 0) return 0;

  const cutoff = now - AI_WINDOW_MS;
  const recent = stamps.filter((stamp) => stamp > cutoff);
  if (recent.length === 0) {
    aiCallsByUser.delete(userId);
  } else {
    aiCallsByUser.set(userId, recent);
  }
  return recent.length;
}

function registerAiCall(userId: number, now: number): number {
  const cutoff = now - AI_WINDOW_MS;
  const stamps = (aiCallsByUser.get(userId) ?? []).filter(
    (stamp) => stamp > cutoff,
  );
  stamps.push(now);
  aiCallsByUser.set(userId, stamps);
  return stamps.length;
}

function uniqueKeys(...values: Array<string | null | undefined>): string[] {
  const keys: string[] = [];
  for (const value of values) {
    const key = String(value ?? "").trim();
    if (!key) continue;
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

function lookupAliasId(
  aliases: Record<string, number> | undefined,
  keys: string[],
): number | null {
  if (!aliases) return null;
  for (const key of keys) {
    const value = aliases[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }
  }
  return null;
}

function toOptionalId(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return null;
  const int = Math.trunc(numeric);
  return int > 0 ? int : null;
}

function clampConfidence(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

/**
 * Descarta ids que não existem no acervo do usuário e, quando o tópico existe,
 * alinha a disciplina à disciplina real do tópico. Nunca inventa id.
 */
function sanitizeSuggestion(
  input: unknown,
  disciplines: Array<{ id: number; name: string }>,
  topics: Array<{ id: number; name: string; disciplineId: number }>,
): TecClassificationSuggestion {
  const obj =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};

  const rawTopicId = toOptionalId(obj.topicId);
  const topic =
    rawTopicId === null
      ? null
      : (topics.find((item) => item.id === rawTopicId) ?? null);

  let disciplineId: number | null = null;
  if (topic) {
    disciplineId =
      disciplines.find((item) => item.id === topic.disciplineId)?.id ??
      topic.disciplineId;
  } else {
    const rawDisciplineId = toOptionalId(obj.disciplineId);
    disciplineId =
      rawDisciplineId === null
        ? null
        : (disciplines.find((item) => item.id === rawDisciplineId)?.id ?? null);
  }

  const reason =
    typeof obj.reason === "string" && obj.reason.trim()
      ? obj.reason.trim().slice(0, 240)
      : "Sugestão de classificação";

  const createTopic =
    typeof obj.createTopic === "string" && obj.createTopic.trim()
      ? obj.createTopic.trim().slice(0, 120)
      : undefined;
  const createDiscipline =
    typeof obj.createDiscipline === "string" && obj.createDiscipline.trim()
      ? obj.createDiscipline.trim().slice(0, 120)
      : undefined;

  return {
    disciplineId,
    topicId: topic ? topic.id : null,
    createDiscipline,
    createTopic,
    confidence: clampConfidence(obj.confidence),
    reason,
  };
}

/** Extrai o primeiro objeto JSON balanceado (aceita ```json e texto em volta). */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

/** Parse tolerante: ```json, texto antes/depois, objeto aninhado. */
function parseAiSuggestion(
  raw: string,
  disciplines: Array<{ id: number; name: string }>,
  topics: Array<{ id: number; name: string; disciplineId: number }>,
): TecClassificationSuggestion | null {
  if (typeof raw !== "string" || !raw.trim()) return null;

  const cleaned = raw
    .replace(/```(?:json)?/gi, " ")
    .replace(/```/g, " ")
    .trim();

  const candidates = uniqueKeys(cleaned, extractFirstJsonObject(cleaned));
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      continue;
    const record = parsed as Record<string, unknown>;
    const hasKnownField = [
      "disciplineId",
      "topicId",
      "confidence",
      "reason",
      "createTopic",
      "createDiscipline",
    ].some((field) => field in record);
    if (!hasKnownField) continue;
    return sanitizeSuggestion(record, disciplines, topics);
  }
  return null;
}

function buildAiPrompt(input: {
  tecDiscipline: string;
  tecLabel: string;
  statementSnippet?: string;
  disciplines: Array<{ id: number; name: string }>;
  topics: Array<{ id: number; name: string; disciplineId: number }>;
}): string {
  const disciplineList =
    input.disciplines
      .slice(0, 80)
      .map((discipline) => `${discipline.id}="${discipline.name}"`)
      .join("; ") || "(nenhuma)";
  const topicList =
    input.topics
      .slice(0, 250)
      .map(
        (topic) =>
          `${topic.id}="${topic.name}" (disciplina ${topic.disciplineId})`,
      )
      .join("; ") || "(nenhum)";
  const snippet = String(input.statementSnippet ?? "")
    .trim()
    .slice(0, STATEMENT_SNIPPET_LIMIT);

  return [
    "Você classifica questões de concurso capturadas do TEC Concursos dentro do acervo de estudo do usuário.",
    "Responda APENAS com um objeto JSON válido, sem comentários e sem markdown.",
    "",
    "Dados da questão capturada:",
    `- Disciplina informada pelo TEC: "${input.tecDiscipline}"`,
    `- Rótulo/assunto informado pelo TEC: "${input.tecLabel}"`,
    snippet
      ? `- Trecho do enunciado: "${snippet}"`
      : "- Trecho do enunciado: (não disponível)",
    "",
    "Disciplinas já existentes do usuário (use apenas estes IDs):",
    disciplineList,
    "",
    "Tópicos já existentes do usuário (use apenas estes IDs):",
    topicList,
    "",
    "Formato de resposta:",
    '{"disciplineId": number ou null, "topicId": number ou null, "confidence": número de 0 a 1, "reason": "frase curta em português", "createTopic": "nome do tópico novo (opcional)", "createDiscipline": "nome da disciplina nova (opcional)"}',
    "",
    "Regras:",
    "1. Só devolva IDs que apareçam nas listas acima; se não houver correspondência, use null.",
    "2. Prefira reutilizar disciplina e tópico existentes em vez de criar novos.",
    "3. Use createTopic/createDiscipline apenas quando nenhum item existente servir.",
    "4. Use confidence abaixo de 0.75 quando não tiver certeza.",
  ].join("\n");
}

function normalizeAiProvider(provider: string | undefined): AiProvider {
  const normalized = String(provider ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "openai" || normalized === "claude") return normalized;
  return "gemini";
}

function describeAiFailure(message: string): string {
  const lower = String(message ?? "").toLowerCase();
  if (
    lower.includes("quota_exceeded") ||
    lower.includes("quota") ||
    lower.includes("exceeded") ||
    lower.includes("429")
  ) {
    return "IA indisponível: cota excedida (quota/429). Classificação pendente.";
  }
  if (lower.includes("api key") || lower.includes("nenhuma chave")) {
    return "IA indisponível: nenhuma API Key configurada. Classificação pendente.";
  }
  if (
    lower.includes("401") ||
    lower.includes("invalid") ||
    lower.includes("key")
  ) {
    return "IA indisponível: chave inválida. Classificação pendente.";
  }
  const short = String(message ?? "")
    .trim()
    .slice(0, 120);
  return short
    ? `IA indisponível: ${short}. Classificação pendente.`
    : "IA indisponível. Classificação pendente.";
}

function pendingClassification(input: {
  reason: string;
  suggestion: TecClassificationSuggestion | null;
  usedAi?: boolean;
  aiCacheEntry?: { key: string; value: TecClassificationSuggestion } | null;
}): TecClassification {
  const suggestion = input.suggestion;
  return {
    disciplineId: suggestion?.disciplineId ?? null,
    topicId: null,
    confidence: suggestion?.confidence ?? 0,
    source: "none",
    reason: input.reason,
    suggestion,
    usedAi: input.usedAi === true,
    unresolved: true,
    aiCacheEntry: input.aiCacheEntry ?? null,
  };
}

export async function classifyTecQuestion(params: {
  userId: number;
  tecDiscipline: string;
  tecLabel: string;
  statementSnippet?: string;
  disciplines: Array<{ id: number; name: string }>;
  topics: Array<{ id: number; name: string; disciplineId: number }>;
  settings?: {
    tecDisciplineAliases?: Record<string, number>;
    tecTopicAliases?: Record<string, number>;
    tecLabelAiCache?: Record<string, TecClassificationSuggestion>;
    aiProvider?: string;
    aiApiKey?: string;
    tecAiClassifyPerHour?: number;
  };
  /** injetável nos testes; default chama callAiProvider com provider/chave do usuário */
  aiCall?: (prompt: string) => Promise<string>;
  now?: () => number;
  minConfidence?: number;
}): Promise<TecClassification> {
  const disciplines = Array.isArray(params.disciplines)
    ? params.disciplines
    : [];
  const topics = Array.isArray(params.topics) ? params.topics : [];
  const settings = params.settings ?? {};
  const minConfidence =
    typeof params.minConfidence === "number" &&
    Number.isFinite(params.minConfidence)
      ? params.minConfidence
      : DEFAULT_MIN_CONFIDENCE;
  const nowFn = params.now ?? (() => Date.now());

  const label = String(params.tecLabel ?? "").trim();
  const disciplineName = String(params.tecDiscipline ?? "").trim();
  const genericLabel = isGenericTecLabel(label);
  const genericDiscipline = isGenericTecLabel(disciplineName);

  // (a) nada de conteúdo para classificar.
  if (genericLabel && genericDiscipline) {
    return pendingClassification({
      reason:
        "Rótulo e disciplina genéricos do TEC: não há conteúdo para classificar.",
      suggestion: null,
    });
  }

  const labelKeys = uniqueKeys(
    normalizeTecLabel(label),
    normalizeString(label),
    normalizeDisciplineKey(label),
  );
  const disciplineKeys = uniqueKeys(
    normalizeTecLabel(disciplineName),
    normalizeString(disciplineName),
    normalizeDisciplineKey(disciplineName),
  );

  // (b) alias de rótulo configurado pelo usuário -> tópico exato.
  const topicAliasId = lookupAliasId(settings.tecTopicAliases, labelKeys);
  if (topicAliasId !== null) {
    const aliasTopic = topics.find((topic) => topic.id === topicAliasId);
    if (aliasTopic) {
      const suggestion: TecClassificationSuggestion = {
        disciplineId: aliasTopic.disciplineId,
        topicId: aliasTopic.id,
        confidence: 1,
        reason: "Alias de rótulo TEC configurado pelo usuário",
      };
      return {
        disciplineId: aliasTopic.disciplineId,
        topicId: aliasTopic.id,
        confidence: 1,
        source: "alias",
        reason: `Alias do rótulo "${label}" aponta para o tópico "${aliasTopic.name}".`,
        suggestion,
        usedAi: false,
        unresolved: false,
        aiCacheEntry: null,
      };
    }
  }

  // (b) alias de disciplina configurado pelo usuário.
  const disciplineAliasId = lookupAliasId(settings.tecDisciplineAliases, [
    ...labelKeys,
    ...disciplineKeys,
  ]);
  if (disciplineAliasId !== null) {
    const aliasDiscipline = disciplines.find(
      (discipline) => discipline.id === disciplineAliasId,
    );
    if (aliasDiscipline) {
      const aliasTopicMatch = genericLabel
        ? null
        : findBestTopicMatch(topics, label, aliasDiscipline.id);
      if (
        aliasTopicMatch?.topic &&
        aliasTopicMatch.confidence >= minConfidence
      ) {
        const suggestion: TecClassificationSuggestion = {
          disciplineId: aliasDiscipline.id,
          topicId: aliasTopicMatch.topic.id,
          confidence: 1,
          reason: "Alias de disciplina do usuário + tópico reconhecido",
        };
        return {
          disciplineId: aliasDiscipline.id,
          topicId: aliasTopicMatch.topic.id,
          confidence: 1,
          source: "alias",
          reason: `Alias de disciplina aponta para "${aliasDiscipline.name}" e o tópico foi reconhecido.`,
          suggestion,
          usedAi: false,
          unresolved: false,
          aiCacheEntry: null,
        };
      }
      return pendingClassification({
        reason: `Alias de disciplina aponta para "${aliasDiscipline.name}", mas o tópico não foi reconhecido.`,
        suggestion: {
          disciplineId: aliasDiscipline.id,
          topicId: null,
          confidence: 1,
          reason: "Alias de disciplina do usuário; falta escolher o tópico",
        },
      });
    }
  }

  // (c) match local.
  let localSuggestion: TecClassificationSuggestion | null = null;
  if (!genericDiscipline) {
    const disciplineMatch = findBestDisciplineMatch(
      disciplines,
      disciplineName,
      label,
      settings.tecDisciplineAliases,
      topics,
    );

    if (
      disciplineMatch.discipline &&
      disciplineMatch.confidence >= minConfidence
    ) {
      const topicMatch = genericLabel
        ? null
        : findBestTopicMatch(topics, label, disciplineMatch.discipline.id);

      if (topicMatch?.topic && topicMatch.confidence >= minConfidence) {
        const confidence = Math.min(
          disciplineMatch.confidence,
          topicMatch.confidence,
        );
        return {
          disciplineId: disciplineMatch.discipline.id,
          topicId: topicMatch.topic.id,
          confidence,
          source: "local",
          reason: `Disciplina e tópico reconhecidos localmente (${
            topicMatch.reason ?? "match local"
          }).`,
          suggestion: {
            disciplineId: disciplineMatch.discipline.id,
            topicId: topicMatch.topic.id,
            confidence,
            reason: topicMatch.reason ?? "Match local",
          },
          usedAi: false,
          unresolved: false,
          aiCacheEntry: null,
        };
      }

      // (d) disciplina sim, tópico não: pendência para o usuário escolher o
      // tópico. A IA não é consultada aqui: a disciplina já está decidida e
      // deixar a IA "adivinhar" o tópico criaria classificação errada.
      localSuggestion = {
        disciplineId: disciplineMatch.discipline.id,
        topicId: null,
        confidence: disciplineMatch.confidence,
        reason:
          disciplineMatch.reason ??
          "Disciplina reconhecida; tópico precisa ser escolhido",
      };
      return pendingClassification({
        reason: `Disciplina reconhecida ("${disciplineMatch.discipline.name}"), mas o tópico não; o usuário deve escolher o tópico.`,
        suggestion: localSuggestion,
      });
    }
  }

  // (g) cache de IA do rótulo: resolve sem chamar IA de novo.
  const cacheKey = normalizeTecLabel(label) || normalizeString(label);
  const memoryKey = `${params.userId}:${cacheKey}`;
  const cachedSuggestion =
    (cacheKey ? settings.tecLabelAiCache?.[cacheKey] : undefined) ??
    (settings.tecLabelAiCache?.[normalizeString(label)] || undefined) ??
    aiLabelMemoryCache.get(memoryKey) ??
    null;

  if (cachedSuggestion) {
    const cached = sanitizeSuggestion(cachedSuggestion, disciplines, topics);
    if (cached.topicId !== null && cached.confidence >= minConfidence) {
      const cachedTopic =
        topics.find((topic) => topic.id === cached.topicId) ?? null;
      if (cachedTopic) {
        return {
          disciplineId: cachedTopic.disciplineId,
          topicId: cachedTopic.id,
          confidence: cached.confidence,
          source: "ai",
          reason: cached.reason || "Classificação de IA em cache",
          suggestion: cached,
          usedAi: false,
          unresolved: false,
          aiCacheEntry: null,
        };
      }
    }
    return pendingClassification({
      reason:
        "Sugestão de IA em cache não conclui a classificação (tópico ausente ou confiança baixa); confirme com o usuário.",
      suggestion: cached,
    });
  }

  // Rótulo genérico com disciplina real: não vale gastar IA.
  if (genericLabel) {
    return pendingClassification({
      reason:
        "Rótulo genérico do TEC: a disciplina foi reconhecida, mas o tópico precisa ser escolhido.",
      suggestion: localSuggestion,
    });
  }

  // (e) IA é o último recurso: precisa de chave, de folga no limite e de rótulo.
  const apiKey =
    typeof settings.aiApiKey === "string" ? settings.aiApiKey.trim() : "";
  if (!apiKey) {
    return pendingClassification({
      reason: "IA indisponível: nenhuma API Key configurada.",
      suggestion: localSuggestion,
    });
  }

  const maxPerHour =
    typeof settings.tecAiClassifyPerHour === "number" &&
    Number.isFinite(settings.tecAiClassifyPerHour)
      ? Math.max(0, Math.trunc(settings.tecAiClassifyPerHour))
      : DEFAULT_MAX_AI_CALLS_PER_HOUR;
  const nowValue = nowFn();
  const callsThisHour = getTecAiCallsThisHour(params.userId, nowValue);
  if (callsThisHour >= maxPerHour) {
    return pendingClassification({
      reason: `Limite de ${maxPerHour} chamada(s) de IA por hora atingido; classificação pendente.`,
      suggestion: localSuggestion,
    });
  }

  const provider = normalizeAiProvider(settings.aiProvider);
  const prompt = buildAiPrompt({
    tecDiscipline: disciplineName,
    tecLabel: label,
    statementSnippet: params.statementSnippet,
    disciplines,
    topics,
  });
  const aiCall =
    params.aiCall ??
    ((text: string) => callAiProvider(provider, apiKey, text, AI_MAX_TOKENS));

  registerAiCall(params.userId, nowValue);

  let raw: string;
  try {
    raw = await aiCall(prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return pendingClassification({
      reason: describeAiFailure(message),
      suggestion: localSuggestion,
    });
  }

  const parsedSuggestion = parseAiSuggestion(raw, disciplines, topics);
  if (!parsedSuggestion) {
    return pendingClassification({
      reason:
        "A IA respondeu em formato inválido (JSON); classificação pendente.",
      suggestion: localSuggestion,
    });
  }

  aiLabelMemoryCache.set(memoryKey, parsedSuggestion);
  const aiCacheEntry = { key: cacheKey, value: parsedSuggestion };
  const aiTopic =
    parsedSuggestion.topicId === null || parsedSuggestion.topicId === undefined
      ? null
      : (topics.find((topic) => topic.id === parsedSuggestion.topicId) ?? null);

  if (aiTopic && parsedSuggestion.confidence >= minConfidence) {
    return {
      disciplineId: aiTopic.disciplineId,
      topicId: aiTopic.id,
      confidence: parsedSuggestion.confidence,
      source: "ai",
      reason: parsedSuggestion.reason || "Classificado pela IA",
      suggestion: parsedSuggestion,
      usedAi: true,
      unresolved: false,
      aiCacheEntry,
    };
  }

  return pendingClassification({
    reason:
      parsedSuggestion.disciplineId !== null
        ? "A IA identificou a disciplina, mas não o tópico (ou com confiança baixa); confirme o tópico."
        : "A IA não teve confiança suficiente para concluir; confirme a classificação.",
    suggestion: parsedSuggestion,
    usedAi: true,
    aiCacheEntry,
  });
}
